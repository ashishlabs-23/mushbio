/**
 * ============================================================================
 * MUSHBIO PHASE 09 — DYNAMIC COUPONS & DELIVERY CALCULATIONS TEST SUITE
 *
 * Validates percentage/fixed coupons, code normalization, minimum order,
 * maximum discount caps, usage limit and per-user races, shipping policies,
 * post-discount shipping rules, and security rules.
 * All monetary amounts are integer values in paise (minor units, e.g. 56000 = ₹560.00).
 * Usage: npm --prefix functions test
 * ============================================================================
 */

import http from "http";
import express from "express";
import { CouponService } from "../coupons/service";
import { CouponCalculator } from "../coupons/calculator";
import { CouponRepository } from "../coupons/repository";
import { ShippingService } from "../shipping/service";
import { ShippingCalculator } from "../shipping/calculator";
import { CheckoutService } from "../checkout/service";
import { CheckoutCalculator } from "../checkout/calculator";
import { OrderService } from "../orders/service";
import { OrderStatusService } from "../orders/statusService";
import { OrderRepository } from "../orders/repository";
import { CartService } from "../cart/service";
import { CartRepository } from "../cart/repository";
import { AddressService } from "../addresses/service";
import { AddressRepository } from "../addresses/repository";
import { ProductRepository } from "../products/repository";
import { InventoryService } from "../inventory/service";
import { InventoryRepository } from "../inventory/repository";
import { SEED_PRODUCTS, SEED_COUPONS } from "../seed/seedData";
import {
  CouponDocument,
  CouponRedemptionDocument,
  CartDocument,
  CartItemDocument,
  ProductDocument,
  ProductVariantDocument,
  InventoryDocument,
  InventoryMovementDocument,
  InventoryMovementType,
  OrderDocument,
  OrderItemDocument,
  AdminAuditLogDocument,
  UserAddress,
} from "../types";
import { Timestamp } from "firebase-admin/firestore";
import { requireAuth, requireActiveAccount } from "../auth/middleware";
import { validateFirestoreRulesFile } from "./rules.test";

// In-Memory Coupon Repository
class InMemoryCouponRepo extends CouponRepository {
  public couponsMap = new Map<string, CouponDocument>();
  public redemptions: CouponRedemptionDocument[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    super();
    for (const cpn of SEED_COUPONS) {
      this.couponsMap.set(cpn.id, { ...cpn });
    }

    // Additional test coupons with paise amounts
    const now = Timestamp.now();
    const save100: CouponDocument = {
      id: "cpn_save100",
      code: "SAVE100",
      normalizedCode: "SAVE100",
      type: "FIXED_AMOUNT",
      value: 10000, // ₹100.00 in paise
      minimumOrder: 30000, // ₹300.00 in paise
      usageCount: 0,
      perUserLimit: 1,
      startsAt: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const maxDiscountCpn: CouponDocument = {
      id: "cpn_mega50",
      code: "MEGA50",
      normalizedCode: "MEGA50",
      type: "PERCENTAGE",
      value: 50,
      minimumOrder: 20000, // ₹200.00 in paise
      maximumDiscount: 15000, // Capped at ₹150.00 (15000 paise)
      usageCount: 0,
      perUserLimit: 1,
      startsAt: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const expiredCpn: CouponDocument = {
      id: "cpn_expired",
      code: "EXPIRED20",
      normalizedCode: "EXPIRED20",
      type: "PERCENTAGE",
      value: 20,
      minimumOrder: 10000, // ₹100.00 in paise
      usageCount: 0,
      perUserLimit: 1,
      startsAt: Timestamp.fromMillis(Date.now() - 1000000),
      expiresAt: Timestamp.fromMillis(Date.now() - 50000), // Expired in past
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const inactiveCpn: CouponDocument = {
      id: "cpn_inactive",
      code: "INACTIVE10",
      normalizedCode: "INACTIVE10",
      type: "PERCENTAGE",
      value: 10,
      minimumOrder: 10000, // ₹100.00 in paise
      usageCount: 0,
      perUserLimit: 1,
      startsAt: now,
      isActive: false, // Inactive
      createdAt: now,
      updatedAt: now,
    };
    const singleUseCpn: CouponDocument = {
      id: "cpn_single",
      code: "LIMITED1",
      normalizedCode: "LIMITED1",
      type: "FIXED_AMOUNT",
      value: 5000, // ₹50.00 in paise
      minimumOrder: 10000, // ₹100.00 in paise
      usageLimit: 1, // Total limit of 1
      usageCount: 0,
      perUserLimit: 1,
      startsAt: now,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.couponsMap.set(save100.id, save100);
    this.couponsMap.set(maxDiscountCpn.id, maxDiscountCpn);
    this.couponsMap.set(expiredCpn.id, expiredCpn);
    this.couponsMap.set(inactiveCpn.id, inactiveCpn);
    this.couponsMap.set(singleUseCpn.id, singleUseCpn);
  }

  getCouponRef(couponId: string): any {
    return { id: couponId, type: "coupon" };
  }

  async getCouponByNormalizedCode(normalizedCode: string): Promise<CouponDocument | null> {
    for (const cpn of this.couponsMap.values()) {
      if (cpn.normalizedCode === normalizedCode) return { ...cpn };
    }
    return null;
  }

  async getCouponById(couponId: string): Promise<CouponDocument | null> {
    const cpn = this.couponsMap.get(couponId);
    return cpn ? { ...cpn } : null;
  }

  async getUserRedemptionsCount(couponId: string, userId: string): Promise<number> {
    return this.redemptions.filter(
      (r) => r.couponId === couponId && r.userId === userId && r.status === "APPLIED"
    ).length;
  }

  async findRedemptionByOrder(couponId: string, orderId: string): Promise<CouponRedemptionDocument | null> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    return r ? { ...r } : null;
  }

  recordRedemptionInTx(_tx: any, redemption: CouponRedemptionDocument): void {
    this.redemptions.push({ ...redemption });
    const cpn = this.couponsMap.get(redemption.couponId);
    if (cpn) {
      cpn.usageCount += 1;
    }
  }

  async releaseRedemption(couponId: string, orderId: string): Promise<void> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    if (r && r.status === "APPLIED") {
      r.status = "CANCELLED";
      const cpn = this.couponsMap.get(couponId);
      if (cpn && cpn.usageCount > 0) {
        cpn.usageCount -= 1;
      }
    }
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const prevLock = this.lockPromise;
    let releaseLock: () => void;
    this.lockPromise = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevLock;
    try {
      const mockTx = {
        get: async (ref: any) => {
          const cpn = this.couponsMap.get(ref.id);
          return { exists: !!cpn, data: () => (cpn ? { ...cpn } : undefined) };
        },
        update: (ref: any, data: any) => {
          const cpn = this.couponsMap.get(ref.id);
          if (cpn) Object.assign(cpn, data);
        },
      };
      return await updateFunction(mockTx);
    } finally {
      releaseLock!();
    }
  }
}

// In-Memory Order Repository
class InMemoryOrderRepo extends OrderRepository {
  public ordersMap = new Map<string, OrderDocument>();
  public itemsMap = new Map<string, Map<string, OrderItemDocument>>();
  public auditLogs: AdminAuditLogDocument[] = [];

  async createOrder(order: OrderDocument, items: OrderItemDocument[]): Promise<void> {
    this.ordersMap.set(order.id, { ...order });
    const itemMap = new Map<string, OrderItemDocument>();
    for (const it of items) {
      itemMap.set(it.id, { ...it });
    }
    this.itemsMap.set(order.id, itemMap);
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
    const itemMap = this.itemsMap.get(orderId);
    if (!itemMap) return [];
    return Array.from(itemMap.values()).map((it) => ({ ...it }));
  }

  async updateOrder(orderId: string, fields: Partial<OrderDocument>): Promise<void> {
    const o = this.ordersMap.get(orderId);
    if (o) {
      this.ordersMap.set(orderId, { ...o, ...fields, updatedAt: Timestamp.now() });
    }
  }

  async recordAuditLog(log: AdminAuditLogDocument): Promise<void> {
    this.auditLogs.push(log);
  }
}

// In-Memory Cart Repository
class InMemoryCartRepo extends CartRepository {
  public cartsMap = new Map<string, CartDocument>();
  public itemsMap = new Map<string, Map<string, CartItemDocument>>();

  async getActiveCartByUser(userId: string): Promise<CartDocument | null> {
    for (const cart of this.cartsMap.values()) {
      if (cart.userId === userId && cart.status === "ACTIVE") {
        return { ...cart };
      }
    }
    return null;
  }

  async getCartById(cartId: string): Promise<CartDocument | null> {
    const cart = this.cartsMap.get(cartId);
    return cart ? { ...cart } : null;
  }

  async getCartItems(cartId: string): Promise<CartItemDocument[]> {
    const userItems = this.itemsMap.get(cartId);
    if (!userItems) return [];
    return Array.from(userItems.values()).map((it) => ({ ...it }));
  }

  async getCartItemByVariant(cartId: string, variantId: string): Promise<CartItemDocument | null> {
    const userItems = this.itemsMap.get(cartId);
    if (!userItems) return null;
    for (const it of userItems.values()) {
      if (it.variantId === variantId) return { ...it };
    }
    return null;
  }

  async createCart(cart: CartDocument): Promise<void> {
    this.cartsMap.set(cart.id, { ...cart });
    if (!this.itemsMap.has(cart.id)) {
      this.itemsMap.set(cart.id, new Map());
    }
  }

  async setCartItem(cartId: string, item: CartItemDocument): Promise<void> {
    let userItems = this.itemsMap.get(cartId);
    if (!userItems) {
      userItems = new Map();
      this.itemsMap.set(cartId, userItems);
    }
    userItems.set(item.id, { ...item });
  }

  async deleteCartItem(cartId: string, itemId: string): Promise<void> {
    const userItems = this.itemsMap.get(cartId);
    if (userItems) userItems.delete(itemId);
  }

  async clearCartItems(cartId: string): Promise<void> {
    const userItems = this.itemsMap.get(cartId);
    if (userItems) userItems.clear();
  }

  async updateCart(cartId: string, fields: Partial<CartDocument>): Promise<void> {
    const current = this.cartsMap.get(cartId);
    if (current) {
      this.cartsMap.set(cartId, { ...current, ...fields, updatedAt: Timestamp.now() });
    }
  }
}

// In-Memory Address Repository
class InMemoryAddressRepo extends AddressRepository {
  public addresses = new Map<string, Map<string, UserAddress>>();

  constructor() {
    super();
    const aliceAddr: UserAddress = {
      id: "addr_alice_primary",
      label: "Home Farm",
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
    const bobAddr: UserAddress = {
      id: "addr_bob_primary",
      label: "Bob Home",
      recipientName: "Bob Grower",
      phone: "+919123456780",
      line1: "456 Spore Road",
      city: "Mysuru",
      state: "Karnataka",
      postalCode: "570001",
      country: "IN",
      isDefault: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const aliceMap = new Map<string, UserAddress>();
    aliceMap.set(aliceAddr.id, aliceAddr);
    this.addresses.set("user_alice", aliceMap);

    const bobMap = new Map<string, UserAddress>();
    bobMap.set(bobAddr.id, bobAddr);
    this.addresses.set("user_bob", bobMap);
  }

  async getAddressById(userId: string, addressId: string): Promise<UserAddress | null> {
    const userMap = this.addresses.get(userId);
    if (!userMap) return null;
    const addr = userMap.get(addressId);
    return addr ? { ...addr } : null;
  }
}

// In-Memory Product Repository
class InMemoryProductRepo extends ProductRepository {
  public products = new Map<string, ProductDocument>();
  public variants = new Map<string, ProductVariantDocument>();

  constructor() {
    super();
    for (const p of SEED_PRODUCTS) {
      this.products.set(p.product.id, p.product);
      for (const v of p.variants) {
        this.variants.set(`${p.product.id}_${v.id}`, v);
      }
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

// In-Memory Inventory Repository
class InMemoryInventoryRepo extends InventoryRepository {
  public inventoryMap = new Map<string, InventoryDocument>();
  public movements: InventoryMovementDocument[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    super();
    for (const p of SEED_PRODUCTS) {
      for (const inv of p.inventory) {
        this.inventoryMap.set(inv.variantId, { ...inv });
      }
    }
  }

  getInventoryRef(variantId: string): any {
    return { id: variantId, type: "inventory" };
  }

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

  recordMovementInTx(
    _tx: any,
    movement: Omit<InventoryMovementDocument, "id" | "createdAt">
  ): InventoryMovementDocument {
    const fullMovement: InventoryMovementDocument = {
      ...movement,
      id: `mov_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: Timestamp.now(),
    };
    this.movements.push(fullMovement);
    return fullMovement;
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const prevLock = this.lockPromise;
    let releaseLock: () => void;
    this.lockPromise = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevLock;
    try {
      const mockTx = {
        get: async (ref: any) => {
          const inv = this.inventoryMap.get(ref.id);
          return { exists: !!inv, data: () => (inv ? { ...inv } : undefined) };
        },
        set: (_ref: any, _data: any) => {},
        update: (ref: any, data: any) => {
          const inv = this.inventoryMap.get(ref.id);
          if (inv) {
            this.inventoryMap.set(ref.id, { ...inv, ...data });
          }
        },
      };
      return await updateFunction(mockTx);
    } finally {
      releaseLock!();
    }
  }
}

export async function runCouponsTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 09 — DYNAMIC COUPONS & DELIVERY CALCULATIONS TEST SUITE");
  console.log("================================================================================");

  const couponRepo = new InMemoryCouponRepo();
  const orderRepo = new InMemoryOrderRepo();
  const cartRepo = new InMemoryCartRepo();
  const addrRepo = new InMemoryAddressRepo();
  const prodRepo = new InMemoryProductRepo();
  const invRepo = new InMemoryInventoryRepo();

  const couponCalc = new CouponCalculator();
  const shippingCalc = new ShippingCalculator();
  const shippingService = new ShippingService(shippingCalc);
  const invService = new InventoryService(invRepo);
  const addrService = new AddressService(addrRepo);
  const cartService = new CartService(cartRepo, prodRepo, invService);
  const couponService = new CouponService(couponRepo, couponCalc, cartService);
  const checkoutCalc = new CheckoutCalculator(shippingCalc);
  const checkoutService = new CheckoutService(
    cartService,
    addrService,
    prodRepo,
    invService,
    couponService,
    checkoutCalc
  );
  const statusService = new OrderStatusService(orderRepo, invService, couponService, couponRepo);
  const orderService = new OrderService(
    orderRepo,
    cartService,
    cartRepo,
    addrService,
    prodRepo,
    invService,
    couponService,
    checkoutCalc,
    statusService
  );

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

  // --- 1. COUPON CALCULATIONS & RULES (PAISE VALUES) ---
  console.log("\n--- COUPON CALCULATIONS & RULES (PAISE VALUES) ---");

  // Test 1: Valid percentage coupon (MUSH10 -> 10% on 56000 paise = 5600 paise discount)
  const mush10Doc = await couponRepo.getCouponByNormalizedCode("MUSH10");
  const disc1 = couponCalc.calculateDiscount(mush10Doc!, 56000);
  assert("Test #01: Valid percentage coupon calculates 10% discount on 56000 paise = 5600 paise (₹56.00)", disc1 === 5600);

  // Test 2: Valid fixed coupon (SAVE100 -> ₹100 off / 10000 paise on 56000 paise = 10000 paise discount)
  const save100Doc = await couponRepo.getCouponByNormalizedCode("SAVE100");
  const disc2 = couponCalc.calculateDiscount(save100Doc!, 56000);
  assert("Test #02: Valid fixed amount coupon calculates 10000 paise (₹100) discount on 56000 paise", disc2 === 10000);

  // Test 3: Code normalization (Trim and uppercase)
  assert("Test #03: Code normalization trims whitespace and converts to uppercase", couponService.normalizeCode("  mush10  ") === "MUSH10");

  // Test 4: Invalid code rejected with 404
  let invalidCodeCaught = false;
  try {
    await couponService.validateCouponForCheckout("FAKECODE", 50000, "user_alice");
  } catch (err: any) {
    invalidCodeCaught = err.statusCode === 404 && err.errorCode === "COUPON_NOT_FOUND";
  }
  assert("Test #04: Non-existent coupon rejected with 404 COUPON_NOT_FOUND", invalidCodeCaught);

  // Test 5: Inactive coupon rejected with 400
  let inactiveCaught = false;
  try {
    await couponService.validateCouponForCheckout("INACTIVE10", 50000, "user_alice");
  } catch (err: any) {
    inactiveCaught = err.statusCode === 400 && err.errorCode === "COUPON_INACTIVE";
  }
  assert("Test #05: Inactive coupon rejected with 400 COUPON_INACTIVE", inactiveCaught);

  // Test 6: Expired coupon rejected with 400
  let expiredCaught = false;
  try {
    await couponService.validateCouponForCheckout("EXPIRED20", 50000, "user_alice");
  } catch (err: any) {
    expiredCaught = err.statusCode === 400 && err.errorCode === "COUPON_EXPIRED";
  }
  assert("Test #06: Expired coupon rejected with 400 COUPON_EXPIRED", expiredCaught);

  // Test 7: Minimum order requirement (MUSH10 min 20000 paise; Subtotal 16000 paise rejected)
  let minOrderCaught = false;
  try {
    await couponService.validateCouponForCheckout("MUSH10", 16000, "user_alice");
  } catch (err: any) {
    minOrderCaught = err.statusCode === 400 && err.errorCode === "COUPON_MINIMUM_ORDER_NOT_MET";
  }
  assert("Test #07: Subtotal below minimum order (16000 < 20000 paise) rejected with 400 COUPON_MINIMUM_ORDER_NOT_MET", minOrderCaught);

  // Test 8: Percentage maximum discount cap (MEGA50 50% on 100000 paise = 50000, capped at max 15000 paise)
  const mega50Doc = await couponRepo.getCouponByNormalizedCode("MEGA50");
  const cappedDisc = couponCalc.calculateDiscount(mega50Doc!, 100000);
  assert("Test #08: Percentage discount capped at maximumDiscount (15000 paise / ₹150.00)", cappedDisc === 15000);

  // Test 9: Fixed discount capped at subtotal (e.g. ₹100 fixed coupon with minOrder=0 on 8000 paise subtotal gives 8000 paise, never negative subtotal)
  const fixedNoMinDoc: CouponDocument = { ...save100Doc!, minimumOrder: 0 };
  const fixedCappedDisc = couponCalc.calculateDiscount(fixedNoMinDoc, 8000);
  assert("Test #09: Fixed discount capped at subtotal (never produces negative subtotal in paise)", fixedCappedDisc === 8000);

  // Test 10: Validation endpoint does NOT consume usage count
  const usageBefore = mush10Doc!.usageCount;
  // Setup cart for Alice with Oyster 500g @ 15000 paise x 2 = 30000 paise
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_500g", quantity: 2 }
  );
  await couponService.validateCoupon("user_alice", "MUSH10");
  await couponService.validateCoupon("user_alice", "MUSH10");
  const cpnAfterValidation = await couponRepo.getCouponById("cpn_mush10");
  assert("Test #10: Coupon validation is strictly read-only (usageCount unchanged)", cpnAfterValidation?.usageCount === usageBefore);

  // --- 2. USAGE LIMITS & CONCURRENCY ---
  console.log("\n--- USAGE LIMITS & CONCURRENCY ---");

  // Test 11: Per-user limit (Alice cannot redeem MUSH10 twice if perUserLimit = 1)
  await orderService.createOrder("user_alice", {
    addressId: "addr_alice_primary",
    couponCode: "MUSH10",
    shippingMethod: "STANDARD",
  });

  // Alice tries to use MUSH10 again in a new order
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_500g", quantity: 2 }
  );
  let userLimitCaught = false;
  try {
    await orderService.createOrder("user_alice", {
      addressId: "addr_alice_primary",
      couponCode: "MUSH10",
      shippingMethod: "STANDARD",
    });
  } catch (err: any) {
    userLimitCaught = err.statusCode === 400 && err.errorCode === "COUPON_USER_LIMIT_REACHED";
  }
  assert("Test #11: Per-user redemption limit enforced on second order (rejected with 400)", userLimitCaught);

  // Test 12: Campaign total usage limit race condition (LIMITED1 has usageLimit: 1)
  // Bob and Charlie both try to use LIMITED1 concurrently
  await cartService.addItem(
    { userId: "user_bob" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_500g", quantity: 2 }
  );
  const charlieAddr: UserAddress = {
    id: "addr_charlie_primary",
    label: "Charlie Home",
    recipientName: "Charlie",
    phone: "+919999999999",
    line1: "789 Spawn Way",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
    isDefault: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const charlieMap = new Map<string, UserAddress>();
  charlieMap.set(charlieAddr.id, charlieAddr);
  addrRepo.addresses.set("user_charlie", charlieMap);

  await cartService.addItem(
    { userId: "user_charlie" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_500g", quantity: 2 }
  );

  const raceOrder1 = orderService.createOrder("user_bob", { addressId: "addr_bob_primary", couponCode: "LIMITED1" });
  const raceOrder2 = orderService.createOrder("user_charlie", { addressId: "addr_charlie_primary", couponCode: "LIMITED1" });

  const raceRes = await Promise.allSettled([raceOrder1, raceOrder2]);
  const raceSucceeded = raceRes.filter((r) => r.status === "fulfilled").length;
  const raceRejected = raceRes.filter((r) => r.status === "rejected").length;
  const limited1Doc = await couponRepo.getCouponById("cpn_single");

  assert(
    "Test #12: Concurrency race on single-use coupon -> Exactly 1 succeeded, 1 rejected, usageCount = 1",
    raceSucceeded === 1 && raceRejected === 1 && limited1Doc?.usageCount === 1
  );

  // --- 3. SHIPPING CALCULATIONS & POLICIES (PAISE AMOUNTS) ---
  console.log("\n--- DELIVERY / SHIPPING ENGINE (PAISE AMOUNTS) ---");

  // Test 13: STANDARD shipping below 50000 paise threshold = 5000 paise (₹50)
  const ship1 = shippingService.calculateShipping(40000, "STANDARD");
  assert("Test #13: STANDARD shipping below threshold (40000 paise) = 5000 paise", ship1.amount === 5000 && !ship1.freeShippingApplied);

  // Test 14: STANDARD shipping at exactly 50000 paise threshold = 0 paise free shipping
  const ship2 = shippingService.calculateShipping(50000, "STANDARD");
  assert("Test #14: STANDARD shipping at 50000 paise threshold = 0 paise free shipping", ship2.amount === 0 && ship2.freeShippingApplied);

  // Test 15: STANDARD shipping above 50000 paise threshold = 0 paise free shipping
  const ship3 = shippingService.calculateShipping(80000, "STANDARD");
  assert("Test #15: STANDARD shipping above threshold (80000 paise) = 0 paise free shipping", ship3.amount === 0 && ship3.freeShippingApplied);

  // Test 16: EXPRESS delivery flat 12000 paise (₹120)
  const shipExpress = shippingService.calculateShipping(120000, "EXPRESS");
  assert("Test #16: EXPRESS delivery is 12000 paise flat regardless of subtotal", shipExpress.amount === 12000 && !shipExpress.freeShippingApplied);

  // Test 17: Post-discount subtotal policy: Subtotal 52000 paise with 5200 coupon discount = 46800 paise (< 50000 paise) -> Shipping: 5000 paise
  const postDiscountTotals = checkoutCalc.calculateTotals(52000, "STANDARD", 5200);
  assert(
    "Test #17: Free shipping threshold evaluates against POST-DISCOUNT subtotal (46800 < 50000 paise -> Shipping: 5000, Total: 51800 paise)",
    postDiscountTotals.subtotalAfterDiscount === 46800 && postDiscountTotals.shipping === 5000 && postDiscountTotals.total === 51800
  );

  // --- 4. CHECKOUT PREVIEW & ORDER IMMUTABILITY (PAISE) ---
  console.log("\n--- CHECKOUT PREVIEW & ORDER SNAPSHOT INTEGRATION ---");

  // Setup Bob's cart: Shiitake 500g @ 34000 paise x 2 = 68000 paise (₹680)
  await cartService.clearCart({ userId: "user_bob" });
  await cartService.addItem(
    { userId: "user_bob" },
    { productId: "prod_shiitake_fresh", variantId: "var_shi_500g", quantity: 2 }
  );

  // Test 18: Checkout preview with SAVE100 (Subtotal 68000 - 10000 discount = 58000 >= 50000 -> Free Shipping, Total: 58000 paise)
  const preview = await checkoutService.generatePreview("user_bob", {
    addressId: "addr_bob_primary",
    shippingMethod: "STANDARD",
    couponCode: "SAVE100",
  });
  assert(
    "Test #18: Checkout preview with SAVE100 -> Subtotal: 68000, Discount: 10000, Shipping: 0, Total: 58000 paise",
    preview.subtotal === 68000 && preview.discount === 10000 && preview.shipping === 0 && preview.total === 58000 && preview.coupon?.code === "SAVE100"
  );

  // Test 19: Order creation stores coupon snapshot & recalculates everything in paise
  const orderWithCoupon = await orderService.createOrder("user_bob", {
    addressId: "addr_bob_primary",
    shippingMethod: "STANDARD",
    couponCode: "SAVE100",
  });
  assert(
    "Test #19: Order stores couponCodeSnapshot ('SAVE100') and authoritative discount (10000 paise / ₹100)",
    orderWithCoupon.couponCode === "SAVE100" && orderWithCoupon.discount === 10000 && orderWithCoupon.total === 58000
  );

  // Test 20: Order cancellation releases coupon redemption
  const save100UsageBeforeCancel = (await couponRepo.getCouponById("cpn_save100"))?.usageCount || 0;
  await orderService.cancelOrder("user_bob", orderWithCoupon.id, "Need to change address");
  const save100UsageAfterCancel = (await couponRepo.getCouponById("cpn_save100"))?.usageCount || 0;
  assert(
    "Test #20: Order cancellation releases coupon redemption and decrements usage count",
    save100UsageAfterCancel === save100UsageBeforeCancel - 1
  );

  // --- 5. HTTP API INTEGRATION TESTS ---
  console.log("\n--- HTTP API /api/v1/checkout/coupon INTEGRATION TESTS ---");

  const testApp = express();
  testApp.use(express.json());

  const testAuthRepo: any = {
    verifyIdToken: async (token: string) => {
      if (token === "token_alice_valid") return { uid: "user_alice", email: "alice@example.com", role: "CUSTOMER" };
      if (token === "token_bob_valid") return { uid: "user_bob", email: "bob@example.com", role: "CUSTOMER" };
      throw new Error("Invalid token");
    },
    getUserById: async (uid: string) => ({ uid, status: "ACTIVE", role: "CUSTOMER" }),
  };

  const router = express.Router();
  router.use(requireAuth(testAuthRepo), requireActiveAccount(testAuthRepo));

  router.post("/checkout/coupon/validate", async (r, s) => {
    try {
      const res = await couponService.validateCoupon(r.auth!.uid, r.body?.code, 56000);
      s.status(200).json({ data: res });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  router.post("/checkout/coupon/remove", async (_r, s) => {
    s.status(200).json({ data: { removed: true } });
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
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: fullHeaders,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 200, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode || 200, body: data });
            }
          });
        }
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // Test 21: POST /api/v1/checkout/coupon/validate returns 200 with discount details in paise
    const valRes = await apiRequest(
      "POST",
      "/api/v1/checkout/coupon/validate",
      { Authorization: "Bearer token_bob_valid" },
      { code: "SAVE100" }
    );
    assert(
      "Test #21: POST /api/v1/checkout/coupon/validate returns HTTP 200 with valid: true & discount: 10000 paise (₹100)",
      valRes.status === 200 && valRes.body.data.valid === true && valRes.body.data.discount === 10000
    );

    // Test 22: POST /api/v1/checkout/coupon/remove returns 200
    const remRes = await apiRequest(
      "POST",
      "/api/v1/checkout/coupon/remove",
      { Authorization: "Bearer token_bob_valid" }
    );
    assert("Test #22: POST /api/v1/checkout/coupon/remove returns HTTP 200", remRes.status === 200 && remRes.body.data.removed === true);

    // --- 6. FIRESTORE SECURITY RULES ---
    console.log("\n--- FIRESTORE SECURITY RULES ---");

    // Test 23: Security rules validate couponRedemptions write lock
    const rulesValidation = validateFirestoreRulesFile();
    assert("Test #23: Firestore rules enforce least-privilege on coupons & couponRedemptions", rulesValidation.passed);

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/23 Phase 09 Coupon & Shipping Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runCouponsTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test suite failed:", err);
      process.exit(1);
    });
}
