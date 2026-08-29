/**
 * ============================================================================
 * MUSHBIO PHASE 07 — SERVER-VALIDATED CART ENGINE TEST SUITE
 *
 * Validates cart operations, guest vs authenticated sessions, authoritative
 * price recalculations, real-time availability, limits, merge, and rules.
 * Usage: npm --prefix functions test
 * ============================================================================
 */

import http from "http";
import express from "express";
import { CartService } from "../cart/service";
import { CartRepository } from "../cart/repository";
import { ProductRepository } from "../products/repository";
import { InventoryService } from "../inventory/service";
import { InventoryRepository } from "../inventory/repository";
import { SEED_PRODUCTS } from "../seed/seedData";
import {
  CartDocument,
  CartItemDocument,
  ProductDocument,
  ProductVariantDocument,
  InventoryDocument,
} from "../types";
import { Timestamp } from "firebase-admin/firestore";
import { optionalAuth, requireAuth } from "../auth/middleware";
import { validateFirestoreRulesFile } from "./rules.test";

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

  async getActiveCartByGuest(guestId: string): Promise<CartDocument | null> {
    for (const cart of this.cartsMap.values()) {
      if (cart.guestId === guestId && cart.status === "ACTIVE") {
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

  constructor() {
    super();
    for (const p of SEED_PRODUCTS) {
      for (const inv of p.inventory) {
        this.inventoryMap.set(inv.variantId, { ...inv });
      }
    }
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
}

export async function runCartTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 07 — SERVER-VALIDATED CART ENGINE TEST SUITE");
  console.log("================================================================================");

  const cartRepo = new InMemoryCartRepo();
  const prodRepo = new InMemoryProductRepo();
  const invRepo = new InMemoryInventoryRepo();
  const invService = new InventoryService(invRepo);
  const cartService = new CartService(cartRepo, prodRepo, invService);

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

  // --- 1. GUEST & AUTHENTICATED CART CREATION ---
  console.log("\n--- CART IDENTITY & CREATION ---");

  // Test 1: Get or create empty guest cart
  const guestCart = await cartService.getCart({ guestId: "guest_session_1" });
  assert(
    "Test #01: Guest cart initialized with ACTIVE status and 0 items",
    guestCart.status === "ACTIVE" && guestCart.items.length === 0 && guestCart.subtotal === 0
  );

  // Test 2: Add valid product variant to guest cart (Oyster 250g, Price: ₹80 / 8000 paise)
  const cartWith1 = await cartService.addItem(
    { guestId: "guest_session_1" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 2 }
  );
  assert(
    "Test #02: Add item to cart sets currentUnitPrice=8000, quantity=2, subtotal=16000",
    cartWith1.items.length === 1 && cartWith1.subtotal === 16000 && cartWith1.items[0].currentUnitPrice === 8000
  );

  // Test 3: Adding duplicate variant increments quantity instead of duplicating item
  const cartWithIncrement = await cartService.addItem(
    { guestId: "guest_session_1" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 3 }
  );
  assert(
    "Test #03: Duplicate variant increments quantity (2 + 3 = 5, subtotal = 40000)",
    cartWithIncrement.items.length === 1 && cartWithIncrement.items[0].quantity === 5 && cartWithIncrement.subtotal === 40000
  );

  // Test 4: Reject non-existent product
  let invalidProdCaught = false;
  try {
    await cartService.addItem(
      { guestId: "guest_session_1" },
      { productId: "prod_non_existent", variantId: "var_oyster_250g", quantity: 1 }
    );
  } catch (err: any) {
    invalidProdCaught = err.statusCode === 400 && err.errorCode === "INVALID_CART_ITEM";
  }
  assert("Test #04: Non-existent product rejected with 400 INVALID_CART_ITEM", invalidProdCaught);

  // Test 5: Reject variant belonging to another product
  let mismatchCaught = false;
  try {
    await cartService.addItem(
      { guestId: "guest_session_1" },
      { productId: "prod_oyster_pearl", variantId: "var_shi_250g", quantity: 1 }
    );
  } catch (err: any) {
    mismatchCaught = err.statusCode === 400 && err.errorCode === "INVALID_CART_ITEM";
  }
  assert("Test #05: Variant-Product mismatch rejected with 400 INVALID_CART_ITEM", mismatchCaught);

  // Test 6: Exceeding 20 units limit rejected
  let limitCaught = false;
  try {
    await cartService.addItem(
      { guestId: "guest_session_1" },
      { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 18 } // 5 + 18 = 23 > 20
    );
  } catch (err: any) {
    limitCaught = err.statusCode === 400 && err.errorCode === "QUANTITY_LIMIT_EXCEEDED";
  }
  assert("Test #06: Adding units exceeding 20 units cap rejected with 400", limitCaught);

  // --- 2. UPDATING & REMOVING ITEMS ---
  console.log("\n--- ITEM MUTATIONS & TOTALS ---");

  const itemId = cartWithIncrement.items[0].id;

  // Test 7: Update item quantity
  const updatedCart = await cartService.updateItem({ guestId: "guest_session_1" }, itemId, { quantity: 4 });
  assert(
    "Test #07: Update quantity to 4 updates subtotal (4 * 8000 = 32000)",
    updatedCart.items[0].quantity === 4 && updatedCart.subtotal === 32000
  );

  // Test 8: Adding second item (Shiitake 250g @ ₹180 / 18000 paise)
  const cartWith2 = await cartService.addItem(
    { guestId: "guest_session_1" },
    { productId: "prod_shiitake_fresh", variantId: "var_shi_250g", quantity: 1 }
  );
  assert(
    "Test #08: Multiple distinct variants calculate combined subtotal (32000 + 18000 = 50000)",
    cartWith2.items.length === 2 && cartWith2.subtotal === 50000
  );

  // Test 9: Remove specific item
  const cartAfterRemove = await cartService.removeItem({ guestId: "guest_session_1" }, itemId);
  assert(
    "Test #09: Remove item leaves remaining item (Shiitake @ 18000)",
    cartAfterRemove.items.length === 1 && cartAfterRemove.subtotal === 18000
  );

  // Test 10: Clear cart
  const emptyCart = await cartService.clearCart({ guestId: "guest_session_1" });
  assert("Test #10: Clear cart leaves 0 items and 0 subtotal", emptyCart.items.length === 0 && emptyCart.subtotal === 0);

  // --- 3. SERVER VALIDATION & STALENESS DETECTION ---
  console.log("\n--- SERVER VALIDATION & LIVE DATA ENRICHMENT ---");

  // Setup cart with Oyster 250g
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_oyster_pearl", variantId: "var_oyster_250g", quantity: 2 }
  );

  // Test 11: Validation pass on healthy cart
  const validPass1 = await cartService.validateCart({ userId: "user_alice" });
  assert("Test #11: Fresh cart validates with valid: true and 0 issues", validPass1.valid === true && validPass1.issues.length === 0);

  // Test 12: Price change detection (Simulate warehouse price update in DB: ₹80 -> ₹95 / 8000 -> 9500 paise)
  const oysterVar = prodRepo.variants.get("prod_oyster_pearl_var_oyster_250g");
  if (oysterVar) oysterVar.price = 9500;

  const validPass2 = await cartService.validateCart({ userId: "user_alice" });
  assert(
    "Test #12: Price change detected -> reports PRICE_CHANGED warning and updates live subtotal (2 * 9500 = 19000)",
    validPass2.issues.some((iss) => iss.code === "PRICE_CHANGED" && iss.severity === "WARNING") && validPass2.subtotal === 19000
  );

  // Reset price
  if (oysterVar) oysterVar.price = 8000;

  // Test 13: Out-of-stock detection
  const oysterInv = invRepo.inventoryMap.get("var_oyster_250g");
  if (oysterInv) oysterInv.availableQuantity = 0; // Simulate 0 stock

  const validPass3 = await cartService.validateCart({ userId: "user_alice" });
  assert(
    "Test #13: Out-of-stock product detected -> reports OUT_OF_STOCK blocker and valid: false",
    validPass3.valid === false && validPass3.issues.some((iss) => iss.code === "OUT_OF_STOCK" && iss.severity === "BLOCKER")
  );

  // Reset inventory
  if (oysterInv) oysterInv.availableQuantity = 50;

  // Test 14: Adding to cart DOES NOT reserve or decrement inventory
  const invBefore = await invService.getInventoryDetail("var_shi_250g");
  await cartService.addItem(
    { userId: "user_alice" },
    { productId: "prod_shiitake_fresh", variantId: "var_shi_250g", quantity: 3 }
  );
  const invAfter = await invService.getInventoryDetail("var_shi_250g");
  assert(
    "Test #14: Adding item to cart does NOT reserve inventory (Available and Reserved remain untouched)",
    invBefore.availableQuantity === invAfter.availableQuantity && invBefore.reservedQuantity === invAfter.reservedQuantity
  );

  // --- 4. GUEST TO AUTHENTICATED CART MERGE ---
  console.log("\n--- GUEST TO AUTHENTICATED MERGE ---");

  // Create guest cart with Shiitake 250g (Qty: 2) & Button 250g (Qty: 1)
  await cartService.addItem(
    { guestId: "guest_checkout_merge" },
    { productId: "prod_shiitake_fresh", variantId: "var_shi_250g", quantity: 2 }
  );
  await cartService.addItem(
    { guestId: "guest_checkout_merge" },
    { productId: "prod_button_white", variantId: "var_btn_250g", quantity: 1 }
  );

  // Merge into Alice's account (Alice already has Shiitake Qty: 3)
  const mergedCart = await cartService.mergeGuestCart("user_alice", "guest_checkout_merge");
  const shiitakeItem = mergedCart.items.find((it) => it.variantId === "var_shi_250g");
  const buttonItem = mergedCart.items.find((it) => it.variantId === "var_btn_250g");

  assert(
    "Test #15: Guest cart merged into user cart: Shiitake combined (3 + 2 = 5) and Button added (1)",
    shiitakeItem?.quantity === 5 && buttonItem?.quantity === 1
  );

  // Test 16: Guest cart is marked CONVERTED
  const guestCartDoc = await cartRepo.getActiveCartByGuest("guest_checkout_merge");
  assert("Test #16: Guest cart marked CONVERTED after merge", guestCartDoc === null);

  // --- 5. HTTP API INTEGRATION TESTS ---
  console.log("\n--- HTTP API /api/v1/cart INTEGRATION TESTS ---");

  const testApp = express();
  testApp.use(express.json());

  // Mock testRepo for token verification in auth middleware
  const testAuthRepo: any = {
    verifyIdToken: async (token: string) => {
      if (token === "token_alice_valid") return { uid: "user_alice", email: "alice@example.com", role: "CUSTOMER" };
      throw new Error("Invalid token");
    },
    getUserById: async (uid: string) => ({ uid, status: "ACTIVE", role: "CUSTOMER" }),
  };

  const router = express.Router();
  router.get("/cart", optionalAuth(testAuthRepo), async (r, s) => {
    const ident = r.auth?.uid ? { userId: r.auth.uid } : { guestId: (r.headers["x-guest-cart-id"] as string) || "guest_default" };
    const c = await cartService.getCart(ident);
    s.status(200).json({ data: c });
  });
  router.post("/cart/items", optionalAuth(testAuthRepo), async (r, s) => {
    try {
      const ident = r.auth?.uid ? { userId: r.auth.uid } : { guestId: (r.headers["x-guest-cart-id"] as string) || "guest_default" };
      const c = await cartService.addItem(ident, r.body);
      s.status(201).json({ data: c });
    } catch (e: any) {
      s.status(e.statusCode || 500).json({ error: e.errorCode, message: e.message });
    }
  });
  router.post("/cart/validate", optionalAuth(testAuthRepo), async (r, s) => {
    const ident = r.auth?.uid ? { userId: r.auth.uid } : { guestId: (r.headers["x-guest-cart-id"] as string) || "guest_default" };
    const val = await cartService.validateCart(ident);
    s.status(200).json({ data: val });
  });
  router.post("/cart/merge", requireAuth(testAuthRepo), async (r, s) => {
    try {
      const c = await cartService.mergeGuestCart(r.auth!.uid, r.body.guestCartId);
      s.status(200).json({ data: c });
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
    // Test 17: GET /api/v1/cart for guest
    const guestRes = await apiRequest("GET", "/api/v1/cart", { "x-guest-cart-id": "guest_http_test" });
    assert("Test #17: GET /api/v1/cart for guest returns 200 with guestId", guestRes.status === 200 && guestRes.body.data.guestId === "guest_http_test");

    // Test 18: POST /api/v1/cart/items for guest
    const addRes = await apiRequest("POST", "/api/v1/cart/items", { "x-guest-cart-id": "guest_http_test" }, {
      productId: "prod_oyster_pearl",
      variantId: "var_oyster_250g",
      quantity: 2,
    });
    assert("Test #18: POST /api/v1/cart/items returns 201 with updated cart subtotal (16000)", addRes.status === 201 && addRes.body.data.subtotal === 16000);

    // Test 19: POST /api/v1/cart/validate
    const valRes = await apiRequest("POST", "/api/v1/cart/validate", { "x-guest-cart-id": "guest_http_test" });
    assert("Test #19: POST /api/v1/cart/validate returns 200 with valid: true", valRes.status === 200 && valRes.body.data.valid === true);

    // Test 20: POST /api/v1/cart/merge requires auth
    const unauthMerge = await apiRequest("POST", "/api/v1/cart/merge", {}, { guestCartId: "guest_http_test" });
    assert("Test #20: Unauthenticated merge request rejected with 401 AUTH_REQUIRED", unauthMerge.status === 401);

    // Test 21: Authenticated merge works
    const authMerge = await apiRequest("POST", "/api/v1/cart/merge", { Authorization: "Bearer token_alice_valid" }, { guestCartId: "guest_http_test" });
    assert("Test #21: Authenticated merge combines items into user cart", authMerge.status === 200 && Array.isArray(authMerge.body.data.items));

    // --- 6. SECURITY RULES ---
    console.log("\n--- FIRESTORE CARTS SECURITY RULES ---");

    // Test 22: Security rules validation
    const rulesValidation = validateFirestoreRulesFile();
    assert("Test #22: Security rules maintain carts ownership protection resource.data.userId == request.auth.uid", rulesValidation.passed);

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/22 Phase 07 Server-Validated Cart Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runCartTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test suite failed:", err);
      process.exit(1);
    });
}
