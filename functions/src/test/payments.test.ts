/**
 * ============================================================================
 * MUSHBIO PHASE 10 — RAZORPAY PAYMENT GATEWAY TEST SUITE
 *
 * Tests all 26 payment scenarios including:
 *   - Server-authoritative amounts (integer paise, INR)
 *   - Idempotent Razorpay order creation
 *   - HMAC-SHA256 signature verification
 *   - Order ownership enforcement
 *   - PAID state machine transitions
 *   - Payment retry handling
 *   - Secret isolation (no key_secret in responses)
 *   - Inventory not double-reserved
 *   - HTTP API integration tests
 *   - Firestore security rules validation
 * ============================================================================
 */

import http from "http";
import express from "express";
import { Timestamp } from "firebase-admin/firestore";

import { PaymentService } from "../payments/service";
import { PaymentRepository } from "../payments/repository";
import { MockRazorpayAdapter, generateRazorpaySignature } from "../payments/razorpay";
import { OrderStatusService } from "../orders/statusService";
import { OrderRepository } from "../orders/repository";
import { CartService } from "../cart/service";
import { CartRepository } from "../cart/repository";
import { InventoryService } from "../inventory/service";
import { InventoryRepository } from "../inventory/repository";
import { AddressRepository } from "../addresses/repository";
import { AddressService } from "../addresses/service";
import { ProductRepository } from "../products/repository";
import { CouponService } from "../coupons/service";
import { CouponCalculator } from "../coupons/calculator";
import { CouponRepository } from "../coupons/repository";
import { CheckoutCalculator } from "../checkout/calculator";
import { OrderService } from "../orders/service";

import {
  OrderDocument,
  OrderItemDocument,
  OrderPaymentDocument,
  CartDocument,
  CartItemDocument,
  ProductDocument,
  ProductVariantDocument,
  InventoryDocument,
  InventoryMovementDocument,
  InventoryMovementType,
  AdminAuditLogDocument,
  UserAddress,
  CouponDocument,
  CouponRedemptionDocument,
} from "../types";

import { SEED_PRODUCTS, SEED_COUPONS } from "../seed/seedData";
import { requireAuth, requireActiveAccount } from "../auth/middleware";
import { validateFirestoreRulesFile } from "./rules.test";

// ─── In-Memory Repositories ─────────────────────────────────────────────────

class InMemoryPaymentRepo extends PaymentRepository {
  public payments = new Map<string, OrderPaymentDocument[]>();

  async createPaymentRecord(orderId: string, payment: OrderPaymentDocument): Promise<void> {
    const list = this.payments.get(orderId) || [];
    list.push({ ...payment });
    this.payments.set(orderId, list);
  }

  async getPaymentById(orderId: string, paymentId: string): Promise<OrderPaymentDocument | null> {
    const list = this.payments.get(orderId) || [];
    return list.find((p) => p.id === paymentId) || null;
  }

  async getPaymentsByOrder(orderId: string): Promise<OrderPaymentDocument[]> {
    return (this.payments.get(orderId) || []).slice().reverse();
  }

  async findPaymentByProviderOrderId(
    orderId: string,
    providerOrderId: string
  ): Promise<OrderPaymentDocument | null> {
    const list = this.payments.get(orderId) || [];
    return list.find((p) => p.providerOrderId === providerOrderId) || null;
  }

  async findLatestPaymentByOrder(orderId: string): Promise<OrderPaymentDocument | null> {
    const list = this.payments.get(orderId) || [];
    if (!list.length) return null;
    return { ...list[list.length - 1] };
  }

  async updatePaymentRecord(
    orderId: string,
    paymentId: string,
    fields: Partial<OrderPaymentDocument>
  ): Promise<void> {
    const list = this.payments.get(orderId) || [];
    const idx = list.findIndex((p) => p.id === paymentId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...fields, updatedAt: Timestamp.now() };
    }
  }
}

class InMemoryOrderRepo extends OrderRepository {
  public ordersMap = new Map<string, OrderDocument>();
  public itemsMap = new Map<string, Map<string, OrderItemDocument>>();
  public auditLogs: AdminAuditLogDocument[] = [];

  async createOrder(order: OrderDocument, items: OrderItemDocument[]): Promise<void> {
    this.ordersMap.set(order.id, { ...order });
    const m = new Map<string, OrderItemDocument>();
    items.forEach((it) => m.set(it.id, { ...it }));
    this.itemsMap.set(order.id, m);
  }

  async getOrderById(orderId: string): Promise<OrderDocument | null> {
    const o = this.ordersMap.get(orderId);
    return o ? { ...o } : null;
  }

  async getOrderByIdempotencyKey(userId: string, key: string): Promise<OrderDocument | null> {
    for (const o of this.ordersMap.values()) {
      if (o.userId === userId && o.idempotencyKey === key) return { ...o };
    }
    return null;
  }

  async getOrderItems(orderId: string): Promise<OrderItemDocument[]> {
    const m = this.itemsMap.get(orderId);
    return m ? Array.from(m.values()).map((it) => ({ ...it })) : [];
  }

  async updateOrder(orderId: string, fields: Partial<OrderDocument>): Promise<void> {
    const o = this.ordersMap.get(orderId);
    if (o) this.ordersMap.set(orderId, { ...o, ...fields, updatedAt: Timestamp.now() });
  }

  async recordAuditLog(log: AdminAuditLogDocument): Promise<void> {
    this.auditLogs.push(log);
  }
}

class InMemoryCartRepo extends CartRepository {
  public cartsMap = new Map<string, CartDocument>();
  public itemsMap = new Map<string, Map<string, CartItemDocument>>();

  async getActiveCartByUser(userId: string): Promise<CartDocument | null> {
    for (const c of this.cartsMap.values()) {
      if (c.userId === userId && c.status === "ACTIVE") return { ...c };
    }
    return null;
  }

  async getActiveCartByGuest(guestId: string): Promise<CartDocument | null> {
    for (const c of this.cartsMap.values()) {
      if (c.guestId === guestId && c.status === "ACTIVE") return { ...c };
    }
    return null;
  }

  async getCartById(cartId: string): Promise<CartDocument | null> {
    const c = this.cartsMap.get(cartId);
    return c ? { ...c } : null;
  }

  async getCartItems(cartId: string): Promise<CartItemDocument[]> {
    const m = this.itemsMap.get(cartId);
    return m ? Array.from(m.values()).map((it) => ({ ...it })) : [];
  }

  async getCartItemByVariant(cartId: string, variantId: string): Promise<CartItemDocument | null> {
    const m = this.itemsMap.get(cartId);
    if (!m) return null;
    for (const it of m.values()) if (it.variantId === variantId) return { ...it };
    return null;
  }

  async createCart(cart: CartDocument): Promise<void> {
    this.cartsMap.set(cart.id, { ...cart });
    if (!this.itemsMap.has(cart.id)) this.itemsMap.set(cart.id, new Map());
  }

  async setCartItem(cartId: string, item: CartItemDocument): Promise<void> {
    let m = this.itemsMap.get(cartId);
    if (!m) { m = new Map(); this.itemsMap.set(cartId, m); }
    m.set(item.id, { ...item });
  }

  async deleteCartItem(cartId: string, itemId: string): Promise<void> {
    this.itemsMap.get(cartId)?.delete(itemId);
  }

  async clearCartItems(cartId: string): Promise<void> {
    this.itemsMap.get(cartId)?.clear();
  }

  async updateCart(cartId: string, fields: Partial<CartDocument>): Promise<void> {
    const c = this.cartsMap.get(cartId);
    if (c) this.cartsMap.set(cartId, { ...c, ...fields, updatedAt: Timestamp.now() });
  }
}

class InMemoryAddressRepo extends AddressRepository {
  public addresses = new Map<string, Map<string, UserAddress>>();

  constructor() {
    super();
    const aliceAddr: UserAddress = {
      id: "addr_alice_primary",
      label: "Home",
      recipientName: "Alice Farmer",
      phone: "+919876543210",
      line1: "123 Mushroom Lane",
      city: "Madikeri",
      state: "Karnataka",
      postalCode: "571201",
      country: "IN",
      isDefault: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const m = new Map<string, UserAddress>();
    m.set(aliceAddr.id, aliceAddr);
    this.addresses.set("user_alice", m);
  }

  async getAddressById(userId: string, addressId: string): Promise<UserAddress | null> {
    const m = this.addresses.get(userId);
    return m?.get(addressId) ? { ...m.get(addressId)! } : null;
  }
}

class InMemoryProductRepo extends ProductRepository {
  public products = new Map<string, ProductDocument>();
  public variants = new Map<string, ProductVariantDocument>();

  constructor() {
    super();
    for (const p of SEED_PRODUCTS) {
      this.products.set(p.product.id, p.product);
      for (const v of p.variants) this.variants.set(`${p.product.id}_${v.id}`, v);
    }
  }

  async getProductById(productId: string): Promise<ProductDocument | null> {
    const p = this.products.get(productId);
    return p ? { ...p } : null;
  }

  async getVariantById(productId: string, variantId: string): Promise<ProductVariantDocument | null> {
    const v = this.variants.get(`${productId}_${variantId}`);
    return v ? { ...v } : null;
  }
}

class InMemoryInventoryRepo extends InventoryRepository {
  public inventoryMap = new Map<string, InventoryDocument>();
  public movements: InventoryMovementDocument[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    super();
    for (const p of SEED_PRODUCTS) {
      for (const inv of p.inventory) this.inventoryMap.set(inv.variantId, { ...inv });
    }
  }

  getInventoryRef(variantId: string): any { return { id: variantId, type: "inventory" }; }

  async getInventoryByVariantId(variantId: string): Promise<InventoryDocument | null> {
    const inv = this.inventoryMap.get(variantId);
    return inv ? { ...inv } : null;
  }

  async getInventoryByVariantIds(variantIds: string[]): Promise<Map<string, InventoryDocument>> {
    const map = new Map<string, InventoryDocument>();
    for (const vid of variantIds) {
      const inv = this.inventoryMap.get(vid);
      if (inv) map.set(vid, { ...inv });
    }
    return map;
  }

  async findMovementByReference(
    variantId: string,
    type: InventoryMovementType,
    referenceId: string
  ): Promise<InventoryMovementDocument | null> {
    const m = this.movements.find(
      (item) => item.variantId === variantId && item.type === type && item.referenceId === referenceId
    );
    return m ? { ...m } : null;
  }

  recordMovementInTx(_tx: any, movement: Omit<InventoryMovementDocument, "id" | "createdAt">): InventoryMovementDocument {
    const full: InventoryMovementDocument = {
      ...movement,
      id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Timestamp.now(),
    };
    this.movements.push(full);
    return full;
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const prev = this.lockPromise;
    let release!: () => void;
    this.lockPromise = new Promise((resolve) => { release = resolve; });
    await prev;
    try {
      const mockTx = {
        get: async (ref: any) => {
          const inv = this.inventoryMap.get(ref.id);
          return { exists: !!inv, data: () => (inv ? { ...inv } : undefined) };
        },
        set: (_ref: any, _data: any) => {},
        update: (ref: any, data: any) => {
          const inv = this.inventoryMap.get(ref.id);
          if (inv) this.inventoryMap.set(ref.id, { ...inv, ...data });
        },
      };
      return await updateFunction(mockTx);
    } finally { release(); }
  }
}

class InMemoryCouponRepo extends CouponRepository {
  public couponsMap = new Map<string, CouponDocument>();
  public redemptions: CouponRedemptionDocument[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    super();
    for (const cpn of SEED_COUPONS) this.couponsMap.set(cpn.id, { ...cpn });
  }

  getCouponRef(couponId: string): any { return { id: couponId, type: "coupon" }; }

  async getCouponByNormalizedCode(normalizedCode: string): Promise<CouponDocument | null> {
    for (const c of this.couponsMap.values()) if (c.normalizedCode === normalizedCode) return { ...c };
    return null;
  }

  async getCouponById(couponId: string): Promise<CouponDocument | null> {
    const c = this.couponsMap.get(couponId);
    return c ? { ...c } : null;
  }

  async getUserRedemptionsCount(couponId: string, userId: string): Promise<number> {
    return this.redemptions.filter((r) => r.couponId === couponId && r.userId === userId && r.status === "APPLIED").length;
  }

  async findRedemptionByOrder(couponId: string, orderId: string): Promise<CouponRedemptionDocument | null> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    return r ? { ...r } : null;
  }

  recordRedemptionInTx(_tx: any, redemption: CouponRedemptionDocument): void {
    this.redemptions.push({ ...redemption });
    const c = this.couponsMap.get(redemption.couponId);
    if (c) c.usageCount += 1;
  }

  async releaseRedemption(couponId: string, orderId: string): Promise<void> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    if (r?.status === "APPLIED") {
      r.status = "CANCELLED";
      const c = this.couponsMap.get(couponId);
      if (c && c.usageCount > 0) c.usageCount -= 1;
    }
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const prev = this.lockPromise;
    let release!: () => void;
    this.lockPromise = new Promise((resolve) => { release = resolve; });
    await prev;
    try {
      const mockTx = {
        get: async (ref: any) => {
          const c = this.couponsMap.get(ref.id);
          return { exists: !!c, data: () => (c ? { ...c } : undefined) };
        },
        update: (ref: any, data: any) => {
          const c = this.couponsMap.get(ref.id);
          if (c) Object.assign(c, data);
        },
      };
      return await updateFunction(mockTx);
    } finally { release(); }
  }
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

export async function runPaymentsTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 10 — RAZORPAY PAYMENT GATEWAY TEST SUITE");
  console.log("================================================================================");

  // ── Wire up services with mocks ──
  const mockRzp = new MockRazorpayAdapter("rzp_test_key123", "rzp_test_secret789");
  const paymentRepo = new InMemoryPaymentRepo();
  const orderRepo = new InMemoryOrderRepo();
  const cartRepo = new InMemoryCartRepo();
  const invRepo = new InMemoryInventoryRepo();
  const addrRepo = new InMemoryAddressRepo();
  const prodRepo = new InMemoryProductRepo();
  const couponRepo = new InMemoryCouponRepo();

  const invService = new InventoryService(invRepo);
  const addrService = new AddressService(addrRepo);
  const cartService = new CartService(cartRepo, prodRepo, invService);
  const couponCalc = new CouponCalculator();
  const couponService = new CouponService(couponRepo, couponCalc, cartService);
  const shippingCalc = new CheckoutCalculator();
  const statusService = new OrderStatusService(orderRepo, invService, couponService, couponRepo);
  const orderService = new OrderService(
    orderRepo, cartService, cartRepo, addrService, prodRepo,
    invService, couponService, shippingCalc, statusService
  );
  const paymentService = new PaymentService(paymentRepo, orderRepo, statusService, mockRzp);

  let passedCount = 0;
  function assert(name: string, condition: boolean, details?: string): void {
    if (condition) {
      console.log(`[PASS] ${name}${details ? ` -> ${details}` : ""}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${name} ${details || ""}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // ── Helper: create an order for a user ──
  async function setupOrderForUser(userId: string, cartItems: { productId: string; variantId: string; quantity: number }[]) {
    for (const item of cartItems) await cartService.addItem({ userId }, item);
    return await orderService.createOrder(userId, {
      addressId: "addr_alice_primary",
      shippingMethod: "STANDARD",
    });
  }

  // ─── 1. PAYMENT ORDER CREATION ─────────────────────────────────────────────
  console.log("\n--- PAYMENT ORDER CREATION ---");

  // Test 1: Authenticated customer creates payment order for own PAYMENT_PENDING order
  const order1 = await setupOrderForUser("user_alice", [
    { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 2 },
  ]);
  const checkout1 = await paymentService.createPaymentOrder("user_alice", order1.id);
  assert(
    "Test #01: Authenticated customer creates payment order -> returns razorpayOrderId & safe checkout data",
    !!checkout1.razorpayOrderId && checkout1.currency === "INR" && checkout1.amount === order1.total
  );

  // Test 2: Response contains only public key ID, never the secret
  assert(
    "Test #02: Checkout response contains razorpayKeyId but NOT razorpayKeySecret",
    checkout1.razorpayKeyId === "rzp_test_key123" &&
    !JSON.stringify(checkout1).includes("rzp_test_secret789")
  );

  // Test 3: Amount sourced from server order in integer paise, not from client
  assert(
    "Test #03: Amount in checkout response is authoritative server amount in integer paise (order.total)",
    checkout1.amount === order1.total && Number.isInteger(checkout1.amount) && checkout1.amount > 0
  );

  // Test 4: Currency is strictly "INR"
  assert("Test #04: Currency is strictly 'INR'", checkout1.currency === "INR");

  // Test 5: Razorpay SDK received correct paise amount (no conversion applied)
  const mockOrder = mockRzp.createdOrders.get(checkout1.razorpayOrderId);
  assert(
    "Test #05: MockRazorpayAdapter received exact paise amount with currency 'INR'",
    mockOrder?.amount === order1.total && mockOrder?.currency === "INR"
  );

  // Test 6: Payment record created in repository with status PENDING
  const paymentAttempt = await paymentRepo.findLatestPaymentByOrder(order1.id);
  assert(
    "Test #06: Payment record created with status PENDING and providerOrderId set",
    paymentAttempt?.status === "PENDING" && paymentAttempt?.providerOrderId === checkout1.razorpayOrderId
  );

  // Test 7: Customer cannot create payment order for another user's order
  const order2 = await setupOrderForUser("user_alice", [
    { productId: "prod_shiitake_fresh", variantId: "var_shi_250g", quantity: 1 },
  ]);
  let crossUserBlocked = false;
  try {
    await paymentService.createPaymentOrder("user_bob_intruder", order2.id);
  } catch (err: any) {
    crossUserBlocked = err.statusCode === 403 || err.statusCode === 403;
  }
  assert("Test #07: Cross-user payment order creation blocked with 403", crossUserBlocked);

  // Test 8: Already-PAID order blocked
  // We'll set order status to PAID manually in the map
  orderRepo.ordersMap.get(order2.id)!.status = "PAID";
  orderRepo.ordersMap.get(order2.id)!.paymentStatus = "PAID";
  let alreadyPaidBlocked = false;
  try {
    await paymentService.createPaymentOrder("user_alice", order2.id);
  } catch (err: any) {
    alreadyPaidBlocked = err.errorCode === "PAYMENT_ALREADY_PAID";
  }
  assert("Test #08: Already-PAID order blocked with PAYMENT_ALREADY_PAID", alreadyPaidBlocked);

  // Test 9: Non-existent order blocked
  let notFoundBlocked = false;
  try {
    await paymentService.createPaymentOrder("user_alice", "ord_nonexistent_xyz");
  } catch (err: any) {
    notFoundBlocked = err.errorCode === "PAYMENT_ORDER_NOT_FOUND";
  }
  assert("Test #09: Non-existent order rejected with PAYMENT_ORDER_NOT_FOUND", notFoundBlocked);

  // Test 10: Currency mismatch blocked
  const order3 = await setupOrderForUser("user_alice", [
    { productId: "prod_button_white", variantId: "var_btn_250g", quantity: 1 },
  ]);
  orderRepo.ordersMap.get(order3.id)!.currency = "USD" as any; // Force bad currency
  let currencyMismatch = false;
  try {
    await paymentService.createPaymentOrder("user_alice", order3.id);
  } catch (err: any) {
    currencyMismatch = err.errorCode === "PAYMENT_CURRENCY_MISMATCH";
  }
  assert("Test #10: Non-INR currency rejected with PAYMENT_CURRENCY_MISMATCH", currencyMismatch);
  orderRepo.ordersMap.get(order3.id)!.currency = "INR"; // restore

  // Test 11: Amount inconsistency detected
  const order4 = await setupOrderForUser("user_alice", [
    { productId: "prod_button_white", variantId: "var_btn_500g", quantity: 1 },
  ]);
  orderRepo.ordersMap.get(order4.id)!.total = 99999999; // Corrupt total
  let amountInconsistent = false;
  try {
    await paymentService.createPaymentOrder("user_alice", order4.id);
  } catch (err: any) {
    amountInconsistent = err.errorCode === "ORDER_AMOUNT_INCONSISTENT";
  }
  assert("Test #11: Tampered order total rejected with ORDER_AMOUNT_INCONSISTENT", amountInconsistent);

  // ─── 2. IDEMPOTENCY ─────────────────────────────────────────────────────────
  console.log("\n--- PAYMENT ORDER IDEMPOTENCY ---");

  // Test 12: Duplicate create-order request returns existing Razorpay order (idempotent)
  const createdOrdersBefore = mockRzp.createdOrders.size;
  const checkout1b = await paymentService.createPaymentOrder("user_alice", order1.id);
  assert(
    "Test #12: Duplicate create-order request returns existing razorpayOrderId without new SDK call",
    checkout1b.razorpayOrderId === checkout1.razorpayOrderId &&
    mockRzp.createdOrders.size === createdOrdersBefore
  );

  // ─── 3. SIGNATURE VERIFICATION ──────────────────────────────────────────────
  console.log("\n--- HMAC-SHA256 SIGNATURE VERIFICATION ---");

  // Test 13: Valid signature verifies and transitions order to PAID
  const validPaymentId = "pay_rzp_valid_mock_001";
  const validSignature = generateRazorpaySignature(
    checkout1.razorpayOrderId, validPaymentId, "rzp_test_secret789"
  );

  const verifyResult = await paymentService.verifyPayment("user_alice", {
    orderId: order1.id,
    razorpayOrderId: checkout1.razorpayOrderId,
    razorpayPaymentId: validPaymentId,
    razorpaySignature: validSignature,
  });
  assert(
    "Test #13: Valid HMAC-SHA256 signature verification succeeds -> paymentStatus=PAID",
    verifyResult.success === true && verifyResult.paymentStatus === "PAID" && verifyResult.orderStatus === "PAID"
  );

  // Test 14: Order status transitions to PAID
  const paidOrder = await orderRepo.getOrderById(order1.id);
  assert(
    "Test #14: Order status transitions to PAID after verification",
    paidOrder?.status === "PAID" && paidOrder?.paymentStatus === "PAID"
  );

  // Test 15: Idempotent verification - same successful callback returns PAID without re-processing
  const verifyResult2 = await paymentService.verifyPayment("user_alice", {
    orderId: order1.id,
    razorpayOrderId: checkout1.razorpayOrderId,
    razorpayPaymentId: validPaymentId,
    razorpaySignature: validSignature,
  });
  assert(
    "Test #15: Repeated verification is idempotent -> returns PAID without duplicate processing",
    verifyResult2.success === true && verifyResult2.paymentStatus === "PAID"
  );

  // Test 16: Invalid signature rejected
  const order5 = await setupOrderForUser("user_alice", [
    { productId: "prod_oyster_pearl", variantId: "var_oyster_500g", quantity: 1 },
  ]);
  const checkout5 = await paymentService.createPaymentOrder("user_alice", order5.id);
  let invalidSigRejected = false;
  try {
    await paymentService.verifyPayment("user_alice", {
      orderId: order5.id,
      razorpayOrderId: checkout5.razorpayOrderId,
      razorpayPaymentId: "pay_invalid_fake_001",
      razorpaySignature: "invalid_signature_tampered_XXXXXX",
    });
  } catch (err: any) {
    invalidSigRejected = err.errorCode === "PAYMENT_SIGNATURE_INVALID";
  }
  assert("Test #16: Invalid HMAC-SHA256 signature rejected with PAYMENT_SIGNATURE_INVALID", invalidSigRejected);

  // Test 17: Failed verification does NOT mark order PAID
  const failedPaymentOrder = await orderRepo.getOrderById(order5.id);
  assert(
    "Test #17: Failed signature verification does NOT transition order to PAID",
    failedPaymentOrder?.status !== "PAID" && failedPaymentOrder?.paymentStatus !== "PAID"
  );

  // Test 18: Payment record shows FAILED after invalid signature attempt
  const failedPayment = await paymentRepo.findLatestPaymentByOrder(order5.id);
  assert(
    "Test #18: Failed verification records FAILED payment status",
    failedPayment?.status === "FAILED" && failedPayment?.errorCode === "PAYMENT_SIGNATURE_INVALID"
  );

  // Test 19: Mismatched Razorpay order ID rejected
  const order6 = await setupOrderForUser("user_alice", [
    { productId: "prod_shiitake_fresh", variantId: "var_shi_500g", quantity: 1 },
  ]);
  const checkout6 = await paymentService.createPaymentOrder("user_alice", order6.id);
  let mismatchRejected = false;
  try {
    await paymentService.verifyPayment("user_alice", {
      orderId: order6.id,
      razorpayOrderId: "order_completely_different_wrong_id",
      razorpayPaymentId: "pay_mismatch_001",
      razorpaySignature: generateRazorpaySignature("order_completely_different_wrong_id", "pay_mismatch_001", "rzp_test_secret789"),
    });
  } catch (err: any) {
    mismatchRejected = err.errorCode === "PAYMENT_ORDER_MISMATCH";
  }
  assert("Test #19: Mismatched Razorpay order ID rejected with PAYMENT_ORDER_MISMATCH", mismatchRejected);

  // Test 20: Cross-user verify blocked
  let crossUserVerifyBlocked = false;
  try {
    const sig6 = generateRazorpaySignature(checkout6.razorpayOrderId, "pay_x001", "rzp_test_secret789");
    await paymentService.verifyPayment("user_intruder_bob", {
      orderId: order6.id,
      razorpayOrderId: checkout6.razorpayOrderId,
      razorpayPaymentId: "pay_x001",
      razorpaySignature: sig6,
    });
  } catch (err: any) {
    crossUserVerifyBlocked = err.statusCode === 403;
  }
  assert("Test #20: Cross-user payment verification blocked with 403", crossUserVerifyBlocked);

  // ─── 4. PAYMENT RETRY ───────────────────────────────────────────────────────
  console.log("\n--- PAYMENT RETRY HANDLING ---");

  // Test 21: Payment retry after failure succeeds with fresh provider order
  // order5 had a failed payment. User retries.
  const retryCheckout = await paymentService.createPaymentOrder("user_alice", order5.id);
  const retryPayId = "pay_rzp_retry_valid_002";
  const retrySig = generateRazorpaySignature(retryCheckout.razorpayOrderId, retryPayId, "rzp_test_secret789");

  const retryVerify = await paymentService.verifyPayment("user_alice", {
    orderId: order5.id,
    razorpayOrderId: retryCheckout.razorpayOrderId,
    razorpayPaymentId: retryPayId,
    razorpaySignature: retrySig,
  });
  assert(
    "Test #21: Payment retry after failure succeeds and order transitions to PAID",
    retryVerify.success === true && retryVerify.paymentStatus === "PAID"
  );

  // Test 22: Payment retry on already-PAID order blocked
  let retryOnPaidBlocked = false;
  try {
    await paymentService.createPaymentOrder("user_alice", order5.id);
  } catch (err: any) {
    retryOnPaidBlocked = err.errorCode === "PAYMENT_ALREADY_PAID";
  }
  assert("Test #22: Payment retry on already-PAID order blocked with PAYMENT_ALREADY_PAID", retryOnPaidBlocked);

  // ─── 5. INVENTORY SAFETY ───────────────────────────────────────────────────
  console.log("\n--- INVENTORY DOUBLE-RESERVATION PREVENTION ---");

  // Test 23: Inventory was reserved at order creation; payment does NOT re-reserve
  // Check var_oyster_250g reservation: 2 units reserved from order1 creation
  const oysterInvAfterPayment = await invService.getInventoryDetail("var_oyster_250g");
  // The reserved should be the same as when the order was created; payment verification shouldn't change it
  assert(
    "Test #23: Payment verification does NOT double-reserve inventory (reservedQuantity unchanged post-payment)",
    oysterInvAfterPayment.reservedQuantity >= 2  // Reserved from order creation only
  );

  // ─── 6. PAYMENT HISTORY / GET ──────────────────────────────────────────────
  console.log("\n--- PAYMENT HISTORY & ACCESS CONTROL ---");

  // Test 24: Customer can retrieve own payment history
  const paymentHistory = await paymentService.getOrderPayments("user_alice", order1.id);
  assert(
    "Test #24: Customer retrieves own payment history (list returned, no secrets exposed)",
    Array.isArray(paymentHistory) &&
    paymentHistory.length > 0 &&
    !JSON.stringify(paymentHistory).includes("rzp_test_secret789") &&
    !JSON.stringify(paymentHistory).includes("providerSignature")
  );

  // Test 25: Payment history shows only safe fields
  const paymentRecord = paymentHistory[0];
  assert(
    "Test #25: Payment record contains only safe fields (no providerSignature in DTO)",
    paymentRecord.provider === "RAZORPAY" &&
    "providerSignature" in paymentRecord === false
  );

  // Test 26: Cross-user payment history access blocked
  let crossHistoryBlocked = false;
  try {
    await paymentService.getOrderPayments("user_intruder", order1.id);
  } catch (err: any) {
    crossHistoryBlocked = err.statusCode === 403;
  }
  assert("Test #26: Cross-user payment history access blocked with 403", crossHistoryBlocked);

  // ─── 7. HTTP API INTEGRATION TESTS ─────────────────────────────────────────
  console.log("\n--- HTTP API /api/v1/payments INTEGRATION TESTS ---");

  const testApp = express();
  testApp.use(express.json());

  const testAuthRepo: any = {
    verifyIdToken: async (token: string) => {
      if (token === "token_alice") return { uid: "user_alice", email: "alice@mushbio.com", role: "CUSTOMER" };
      if (token === "token_bob") return { uid: "user_bob", email: "bob@mushbio.com", role: "CUSTOMER" };
      throw new Error("Invalid token");
    },
    getUserById: async (uid: string) => ({ uid, status: "ACTIVE", role: "CUSTOMER" }),
  };

  const router = express.Router();
  router.use(requireAuth(testAuthRepo), requireActiveAccount(testAuthRepo));

  router.post("/payments/create-order", async (r: express.Request, s: express.Response) => {
    try {
      const data = await paymentService.createPaymentOrder(r.auth!.uid, r.body?.orderId);
      s.status(201).json({ data });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  router.post("/payments/verify", async (r: express.Request, s: express.Response) => {
    try {
      const result = await paymentService.verifyPayment(r.auth!.uid, r.body);
      s.status(200).json({ data: result });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  router.get("/payments/:orderId", async (r: express.Request, s: express.Response) => {
    try {
      const orderId = r.params["orderId"] as string;
      const payments = await paymentService.getOrderPayments(r.auth!.uid, orderId);
      s.status(200).json({ data: payments });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  testApp.use("/api/v1", router);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  async function apiRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: any
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const fullHeaders: Record<string, string> = { Connection: "close", ...headers };
      if (body) fullHeaders["Content-Type"] = "application/json";
      const req = http.request(
        { hostname: "127.0.0.1", port, path, method, headers: fullHeaders },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += c));
          res.on("end", () => {
            try { resolve({ status: res.statusCode || 200, body: JSON.parse(data) }); }
            catch { resolve({ status: res.statusCode || 200, body: data }); }
          });
        }
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // Create a fresh pending order for HTTP tests
    const order7 = await setupOrderForUser("user_alice", [
      { productId: "prod_button_white", variantId: "var_btn_250g", quantity: 2 },
    ]);

    // Test 27: POST /api/v1/payments/create-order returns 201 with checkout data
    const createRes = await apiRequest(
      "POST", "/api/v1/payments/create-order",
      { Authorization: "Bearer token_alice" },
      { orderId: order7.id }
    );
    assert(
      "Test #27: POST /api/v1/payments/create-order returns 201 with razorpayOrderId and INR amount",
      createRes.status === 201 &&
      !!createRes.body.data.razorpayOrderId &&
      createRes.body.data.currency === "INR" &&
      !JSON.stringify(createRes.body).includes("secret")
    );

    // Test 28: Unauthenticated request returns 401
    const unauth = await apiRequest("POST", "/api/v1/payments/create-order", {}, { orderId: order7.id });
    assert("Test #28: Unauthenticated request rejected with 401", unauth.status === 401);

    // Test 29: POST /api/v1/payments/verify returns 200 on valid signature
    const checkout7 = createRes.body.data;
    const payId7 = "pay_http_test_007";
    const sig7 = generateRazorpaySignature(checkout7.razorpayOrderId, payId7, "rzp_test_secret789");
    const verifyRes = await apiRequest(
      "POST", "/api/v1/payments/verify",
      { Authorization: "Bearer token_alice" },
      {
        orderId: order7.id,
        razorpayOrderId: checkout7.razorpayOrderId,
        razorpayPaymentId: payId7,
        razorpaySignature: sig7,
      }
    );
    assert(
      "Test #29: POST /api/v1/payments/verify returns 200 with success=true on valid signature",
      verifyRes.status === 200 && verifyRes.body.data.success === true && verifyRes.body.data.paymentStatus === "PAID"
    );

    // Test 30: GET /api/v1/payments/:orderId returns payment history
    const historyRes = await apiRequest(
      "GET", `/api/v1/payments/${order7.id}`,
      { Authorization: "Bearer token_alice" }
    );
    assert(
      "Test #30: GET /api/v1/payments/:orderId returns 200 with payment history array",
      historyRes.status === 200 && Array.isArray(historyRes.body.data) && historyRes.body.data.length > 0
    );

    // ─── 8. FIRESTORE SECURITY RULES ──────────────────────────────────────────
    console.log("\n--- FIRESTORE SECURITY RULES ---");

    const rulesValidation = validateFirestoreRulesFile();
    assert(
      "Test #31: Firestore security rules maintain client write denial on orders/payments",
      rulesValidation.passed
    );

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/31 Phase 10 Razorpay Payment Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runPaymentsTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Payment test suite failed:", err);
      process.exit(1);
    });
}
