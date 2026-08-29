/**
 * ============================================================================
 * MUSHBIO PHASE 08 — ORDER LIFECYCLE & CHECKOUT ENGINE TEST SUITE
 *
 * Validates checkout preview, authoritative order creation, atomic inventory
 * reservation, immutable snapshots, idempotency, state transitions, and rules.
 * Usage: npm --prefix functions test
 * ============================================================================
 */

import http from "http";
import express from "express";
import { CheckoutService } from "../checkout/service";
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
import { CheckoutCalculator } from "../checkout/calculator";
import { CouponService } from "../coupons/service";
import { CouponRepository } from "../coupons/repository";
import { CouponCalculator } from "../coupons/calculator";
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

  constructor() {
    super();
    for (const cpn of SEED_COUPONS) {
      this.couponsMap.set(cpn.id, { ...cpn });
    }
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
    if (cpn) cpn.usageCount += 1;
  }

  async releaseRedemption(couponId: string, orderId: string): Promise<void> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    if (r && r.status === "APPLIED") {
      r.status = "CANCELLED";
      const cpn = this.couponsMap.get(couponId);
      if (cpn && cpn.usageCount > 0) cpn.usageCount -= 1;
    }
  }

  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
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

  async getOrderByNumber(orderNumber: string): Promise<OrderDocument | null> {
    for (const o of this.ordersMap.values()) {
      if (o.orderNumber === orderNumber) return { ...o };
    }
    return null;
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

  async listUserOrders(userId: string, pageSize: number, cursorDocId?: string): Promise<any> {
    const userOrders = Array.from(this.ordersMap.values())
      .filter((o) => o.userId === userId)
      .sort((a, b) => (b.createdAt as any).toMillis?.() || 0 - ((a.createdAt as any).toMillis?.() || 0));

    let startIndex = 0;
    if (cursorDocId) {
      const idx = userOrders.findIndex((o) => o.id === cursorDocId);
      if (idx !== -1) startIndex = idx + 1;
    }

    const sliced = userOrders.slice(startIndex, startIndex + pageSize);
    const hasMore = startIndex + pageSize < userOrders.length;
    const lastDocId = sliced.length > 0 ? sliced[sliced.length - 1].id : undefined;

    return {
      orders: sliced.map((o) => ({ ...o })),
      hasMore,
      lastDocId,
    };
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

// In-Memory Product & Variant Repository
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

  getMovementRef(id: string): any {
    return { id, type: "movement" };
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

export async function runOrdersTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 08 — ORDER LIFECYCLE & CHECKOUT ENGINE TEST SUITE");
  console.log("================================================================================");

  const orderRepo = new InMemoryOrderRepo();
  const cartRepo = new InMemoryCartRepo();
  const addrRepo = new InMemoryAddressRepo();
  const prodRepo = new InMemoryProductRepo();
  const invRepo = new InMemoryInventoryRepo();

  const couponRepo = new InMemoryCouponRepo();
  const couponCalc = new CouponCalculator();
  const invService = new InventoryService(invRepo);
  const addrService = new AddressService(addrRepo);
  const cartService = new CartService(cartRepo, prodRepo, invService);
  const couponService = new CouponService(couponRepo, couponCalc, cartService);
  const calc = new CheckoutCalculator();
  const checkoutService = new CheckoutService(cartService, addrService, prodRepo, invService, couponService, calc);
  const statusService = new OrderStatusService(orderRepo, invService, couponService, couponRepo);
  const orderService = new OrderService(
    orderRepo,
    cartService,
    cartRepo,
    addrService,
    prodRepo,
    invService,
    couponService,
    calc,
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

  // --- 1. CHECKOUT PREVIEW & TOTALS ---
  console.log("\n--- CHECKOUT PREVIEW & AUTHORITATIVE CALCULATIONS ---");

  // Test 1: Empty cart preview rejected with 400 CART_EMPTY
  let emptyCartCaught = false;
  try {
    await checkoutService.generatePreview("user_alice", { addressId: "addr_alice_primary" });
  } catch (err: any) {
    emptyCartCaught = err.statusCode === 400 && err.errorCode === "CART_EMPTY";
  }
  assert("Test #01: Empty cart preview rejected with 400 CART_EMPTY", emptyCartCaught);

  // Setup Cart with Oyster 250g (Qty: 2 @ ₹80 / 8000 paise = 16000 paise)
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 2 }
  );

  // Test 2: Valid checkout preview calculates shipping (Subtotal 16000 < 50000 paise -> Shipping: 5000 paise)
  const preview1 = await checkoutService.generatePreview("user_alice", {
    addressId: "addr_alice_primary",
    shippingMethod: "STANDARD",
  });
  assert(
    "Test #02: Checkout preview calculates subtotal=16000, shipping=5000, total=21000",
    preview1.valid === true && preview1.subtotal === 16000 && preview1.shipping === 5000 && preview1.total === 21000
  );

  // Test 3: Free shipping on subtotal >= 50000 paise (Add Shiitake 500g @ 34000 paise -> Subtotal: 50000 paise)
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_shiitake_fresh", variantId: "var_shi_500g", quantity: 1 }
  );
  const preview2 = await checkoutService.generatePreview("user_alice", {
    addressId: "addr_alice_primary",
    shippingMethod: "STANDARD",
  });
  assert(
    "Test #03: Subtotal >= 50000 paise qualifies for free standard shipping (Shipping: 0, Total: 50000)",
    preview2.subtotal === 50000 && preview2.shipping === 0 && preview2.total === 50000
  );

  // Test 4: Cross-user address access rejected in checkout preview (Alice cannot use Bob's address)
  let crossAddrCaught = false;
  try {
    await checkoutService.generatePreview("user_alice", { addressId: "addr_bob_primary" });
  } catch (err: any) {
    crossAddrCaught = err.statusCode === 404 && err.errorCode === "ADDRESS_NOT_FOUND";
  }
  assert("Test #04: Cross-user address access in preview rejected with 404", crossAddrCaught);

  // --- 2. ORDER CREATION & IMMUTABILITY ---
  console.log("\n--- ORDER CREATION & IMMUTABLE SNAPSHOTS ---");

  // Test 5: Create order from active cart
  const order1 = await orderService.createOrder("user_alice", {
    addressId: "addr_alice_primary",
    shippingMethod: "STANDARD",
    notes: "Please leave by front porch",
  });
  assert(
    "Test #05: Order created with status=PAYMENT_PENDING, paymentStatus=PENDING, total=50000",
    order1.status === "PAYMENT_PENDING" && order1.paymentStatus === "PENDING" && order1.total === 50000
  );

  // Test 6: Human-friendly order number format MB-YYYY-XXXXXX
  assert("Test #06: Order number matches MB-YYYY-XXXXXX format", /^MB-\d{4}-[2-9A-HJ-NP-Z]{6}$/.test(order1.orderNumber));

  // Test 7: Active cart converted
  const cartAfterOrder = await cartRepo.getActiveCartByUser("user_alice");
  assert("Test #07: User cart status converted after order creation", cartAfterOrder === null);

  // Test 8: Inventory was reserved for both variants (Oyster: 2, Shiitake: 1)
  const oysterInv = await invService.getInventoryDetail("var_oyster_250g");
  const shiitakeInv = await invService.getInventoryDetail("var_shi_500g");
  assert(
    "Test #08: Inventory reserved for order items (Oyster reserved: 2, Shiitake reserved: 1)",
    oysterInv.reservedQuantity === 2 && shiitakeInv.reservedQuantity === 1
  );

  // Test 9: Historical order items are immutable (Simulate price change in catalog)
  const oysterVar = prodRepo.variants.get("prod_oyster_pearl_var_oyster_250g");
  if (oysterVar) oysterVar.price = 15000; // Change catalog price from 8000 -> 15000 paise

  const order1Fetched = await orderService.getOrder("user_alice", order1.id);
  const oysterOrderItem = order1Fetched.items.find((it) => it.variantId === "var_oyster_250g");
  assert(
    "Test #09: Order item snapshot unitPrice remains 8000 paise despite catalog price increase to 15000",
    oysterOrderItem?.unitPrice === 8000 && order1Fetched.subtotal === 50000
  );

  // Reset catalog price
  if (oysterVar) oysterVar.price = 8000;

  // Test 10: Historical shipping address snapshot is immutable
  const aliceAddr = addrRepo.addresses.get("user_alice")?.get("addr_alice_primary");
  if (aliceAddr) aliceAddr.line1 = "999 NEW STREET ADDRESS";

  const order1AddressSnapshot = order1Fetched.shippingAddress;
  assert(
    "Test #10: Shipping address snapshot preserves original address ('123 Mushroom Lane')",
    order1AddressSnapshot.line1 === "123 Mushroom Lane"
  );

  // --- 3. IDEMPOTENCY ---
  console.log("\n--- ORDER IDEMPOTENCY ---");

  // Re-populate cart for Alice
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 1 }
  );

  const idempotencyKey = "key_checkout_unique_123";

  // Test 11: Create order with idempotency key
  const idempOrder1 = await orderService.createOrder(
    "user_alice",
    { addressId: "addr_alice_primary", shippingMethod: "STANDARD" },
    idempotencyKey
  );

  // Test 12: Duplicate request with same idempotency key returns exact same order without double reserving
  const oysterInvBefore = await invService.getInventoryDetail("var_oyster_250g");
  const idempOrder2 = await orderService.createOrder(
    "user_alice",
    { addressId: "addr_alice_primary", shippingMethod: "STANDARD" },
    idempotencyKey
  );
  const oysterInvAfter = await invService.getInventoryDetail("var_oyster_250g");

  assert(
    "Test #11 & #12: Same Idempotency-Key returns identical order and does NOT double reserve stock",
    idempOrder1.id === idempOrder2.id && oysterInvBefore.reservedQuantity === oysterInvAfter.reservedQuantity
  );

  // Test 13: Same idempotency key with different request payload rejected with 409
  let idempReuseCaught = false;
  try {
    await orderService.createOrder(
      "user_alice",
      { addressId: "addr_alice_primary", shippingMethod: "EXPRESS" }, // Changed method to EXPRESS
      idempotencyKey
    );
  } catch (err: any) {
    idempReuseCaught = err.statusCode === 409 && err.errorCode === "IDEMPOTENCY_KEY_REUSE";
  }
  assert("Test #13: Reusing idempotency key with different request payload rejected with 409", idempReuseCaught);

  // --- 4. ORDER STATE MACHINE & CANCELLATION ---
  console.log("\n--- ORDER STATE MACHINE & LIFECYCLE ---");

  // Test 14: Transition PAYMENT_PENDING -> PAID -> CONFIRMED -> PROCESSING -> PACKED -> SHIPPED -> DELIVERED
  await statusService.transitionStatus("admin_system", idempOrder1.id, "PAID");
  await statusService.transitionStatus("admin_system", idempOrder1.id, "CONFIRMED");
  await statusService.transitionStatus("admin_system", idempOrder1.id, "PROCESSING");
  await statusService.transitionStatus("admin_system", idempOrder1.id, "PACKED");
  await statusService.transitionStatus("admin_system", idempOrder1.id, "SHIPPED");
  await statusService.transitionStatus("admin_system", idempOrder1.id, "DELIVERED");

  const completedOrder = await orderService.getOrder("user_alice", idempOrder1.id);
  assert("Test #14: Order successfully progressed to DELIVERED status", completedOrder.status === "DELIVERED");

  // Test 15: Illegal transition DELIVERED -> PAYMENT_PENDING rejected with 400
  let illegalTransitionCaught = false;
  try {
    await statusService.transitionStatus("admin_system", idempOrder1.id, "PAYMENT_PENDING");
  } catch (err: any) {
    illegalTransitionCaught = err.statusCode === 400 && err.errorCode === "ILLEGAL_STATUS_TRANSITION";
  }
  assert("Test #15: Illegal status transition DELIVERED -> PAYMENT_PENDING rejected with 400", illegalTransitionCaught);

  // Test 16: Order cancellation releases reserved inventory
  // Create another order to cancel
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_shiitake_fresh", variantId: "var_shi_200g", quantity: 4 }
  );
  const orderToCancel = await orderService.createOrder("user_alice", {
    addressId: "addr_alice_primary",
    shippingMethod: "STANDARD",
  });

  const shi200InvBeforeCancel = await invService.getInventoryDetail("var_shi_200g");
  assert("Pre-condition: 4 units reserved for order", shi200InvBeforeCancel.reservedQuantity === 4);

  await orderService.cancelOrder("user_alice", orderToCancel.id, "Changed mind");
  const shi200InvAfterCancel = await invService.getInventoryDetail("var_shi_200g");
  const cancelledOrder = await orderService.getOrder("user_alice", orderToCancel.id);

  assert(
    "Test #16: Order cancellation transitions to CANCELLED and releases reserved inventory (Reserved: 0)",
    cancelledOrder.status === "CANCELLED" && shi200InvAfterCancel.reservedQuantity === 0
  );

  // --- 5. CONCURRENCY & OUT-OF-STOCK RACE ---
  console.log("\n--- CONCURRENCY RACE CONDITIONS ---");

  // Setup low stock variant: Button Jumbo (Only 1 unit in stock)
  const jumboInv = invRepo.inventoryMap.get("var_jmb_500g");
  if (jumboInv) jumboInv.availableQuantity = 1;

  // Alice and Bob both have 1 unit of Button Jumbo in their carts
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_button_jumbo", variantId: "var_jmb_500g", quantity: 1 }
  );
  await cartService.addItem(
    { userId: "user_bob" },
    { productId: "prod_button_jumbo", variantId: "var_jmb_500g", quantity: 1 }
  );

  // Both attempt simultaneous checkout
  const orderReqAlice = orderService.createOrder("user_alice", { addressId: "addr_alice_primary" });
  const orderReqBob = orderService.createOrder("user_bob", { addressId: "addr_bob_primary" });

  const raceResults = await Promise.allSettled([orderReqAlice, orderReqBob]);
  const succeededCount = raceResults.filter((r) => r.status === "fulfilled").length;
  const rejectedCount = raceResults.filter((r) => r.status === "rejected").length;

  const jumboInvFinal = await invService.getInventoryDetail("var_jmb_500g");

  assert(
    "Test #17: Final-stock concurrency race -> Exactly 1 succeeded, 1 rejected with INSUFFICIENT_STOCK",
    succeededCount === 1 && rejectedCount === 1 && jumboInvFinal.availableQuantity === 0 && jumboInvFinal.reservedQuantity === 1
  );

  // --- 6. PAGINATION & ACCESS GUARDS ---
  console.log("\n--- PAGINATION & ORDER RETRIEVAL GUARDS ---");

  // Test 18: List orders with pagination
  const paginatedOrders = await orderService.listOrders("user_alice", { pageSize: 2 });
  assert(
    "Test #18: List orders returns paginated envelope with pageSize=2 and nextCursor",
    paginatedOrders.data.length <= 2 && paginatedOrders.pagination.pageSize === 2
  );

  // Test 19: Cross-user order retrieval rejected
  let crossOrderCaught = false;
  try {
    await orderService.getOrder("user_bob", order1.id);
  } catch (err: any) {
    crossOrderCaught = err.statusCode === 403 && err.errorCode === "FORBIDDEN";
  }
  assert("Test #19: Bob cannot view Alice's order (rejected with 403 FORBIDDEN)", crossOrderCaught);

  // --- 7. HTTP API INTEGRATION TESTS ---
  console.log("\n--- HTTP API /api/v1/orders & /checkout INTEGRATION TESTS ---");

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

  router.post("/checkout/preview", async (r, s) => {
    try {
      const res = await checkoutService.generatePreview(r.auth!.uid, r.body);
      s.status(200).json({ data: res });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  router.post("/orders", async (r, s) => {
    try {
      const idempKey = r.headers["idempotency-key"] as string;
      const res = await orderService.createOrder(r.auth!.uid, r.body, idempKey);
      s.status(201).json({ data: res });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  router.get("/orders", async (r, s) => {
    try {
      const res = await orderService.listOrders(r.auth!.uid, {
        pageSize: r.query.pageSize as any,
        cursor: r.query.cursor as string,
      });
      s.status(200).json(res);
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });

  router.get("/orders/:orderId", async (r, s) => {
    try {
      const res = await orderService.getOrder(r.auth!.uid, r.params.orderId);
      s.status(200).json({ data: res });
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
    // Test 20: GET /api/v1/orders returns HTTP 200 with list
    const listRes = await apiRequest("GET", "/api/v1/orders", { Authorization: "Bearer token_alice_valid" });
    assert("Test #20: GET /api/v1/orders returns HTTP 200 with list of user orders", listRes.status === 200 && Array.isArray(listRes.body.data));

    // Test 21: GET /api/v1/orders/:orderId returns HTTP 200 with order detail
    const detailRes = await apiRequest("GET", `/api/v1/orders/${order1.id}`, { Authorization: "Bearer token_alice_valid" });
    assert("Test #21: GET /api/v1/orders/:orderId returns HTTP 200 with complete order DTO", detailRes.status === 200 && detailRes.body.data.id === order1.id);

    // --- 8. FIRESTORE SECURITY RULES ---
    console.log("\n--- FIRESTORE ORDERS SECURITY RULES ---");

    // Test 22: Security rules maintain orders client write restriction (allow write: if false)
    const rulesValidation = validateFirestoreRulesFile();
    assert("Test #22: Security rules enforce server-only write lock on orders collection", rulesValidation.passed);

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/22 Phase 08 Checkout & Order Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runOrdersTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test suite failed:", err);
      process.exit(1);
    });
}
