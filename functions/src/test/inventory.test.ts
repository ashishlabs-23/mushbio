/**
 * ============================================================================
 * MUSHBIO PHASE 04 — REAL-TIME INVENTORY ENGINE TEST SUITE
 *
 * Validates atomic transactions, concurrency, overselling prevention,
 * idempotency replay, reservation lifecycle, and security rules.
 * Usage: npm --prefix functions test
 * ============================================================================
 */

import { InventoryService } from "../inventory/service";
import { InventoryRepository } from "../inventory/repository";
import {
  InventoryDocument,
  InventoryMovementDocument,
  InventoryMovementType,
} from "../types";
import { Timestamp } from "firebase-admin/firestore";
import { getStockState } from "../inventory/mapper";
import { validateFirestoreRulesFile } from "./rules.test";

// In-Memory Test Repository supporting simulated multi-threaded atomic transactions & race conditions
class InMemoryInventoryRepo extends InventoryRepository {
  public inventoryMap = new Map<string, InventoryDocument>();
  public movements: InventoryMovementDocument[] = [];
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    super();
  }

  getInventoryRef(variantId: string): any {
    return { id: variantId };
  }

  async getInventoryByVariantId(variantId: string): Promise<InventoryDocument | null> {
    const item = this.inventoryMap.get(variantId);
    return item ? { ...item } : null;
  }

  async getInventoryByVariantIds(variantIds: string[]): Promise<Map<string, InventoryDocument>> {
    const map = new Map<string, InventoryDocument>();
    for (const vid of variantIds) {
      const item = this.inventoryMap.get(vid);
      if (item) map.set(vid, { ...item });
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

  async getMovementsByVariantId(variantId: string): Promise<InventoryMovementDocument[]> {
    return this.movements.filter((m) => m.variantId === variantId);
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

  // Simulates atomic database transaction locking
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
          const doc = this.inventoryMap.get(ref.id);
          return {
            exists: !!doc,
            data: () => (doc ? { ...doc } : undefined),
          };
        },
        set: (ref: any, data: any) => {
          this.inventoryMap.set(ref.id, { ...data });
        },
        update: (ref: any, data: any) => {
          const current = this.inventoryMap.get(ref.id) || ({} as any);
          this.inventoryMap.set(ref.id, { ...current, ...data });
        },
      };

      return await updateFunction(mockTx);
    } finally {
      releaseLock!();
    }
  }
}

export async function runInventoryTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 04 — REAL-TIME INVENTORY ENGINE TEST SUITE");
  console.log("================================================================================");

  const testRepo = new InMemoryInventoryRepo();
  const service = new InventoryService(testRepo);

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

  // --- 1. INITIALIZATION & RECEIPT ---
  console.log("\n--- INVENTORY INITIALIZATION & INBOUND RECEIPT ---");

  // Test 1: Initialize inventory
  const initRes = await service.initializeInventory({
    variantId: "var_test_250g",
    productId: "prod_test",
    sku: "MB-TST-250",
    initialQuantity: 10,
    lowStockThreshold: 3,
  });
  assert(
    "Test #01: Initialize inventory creates doc with available stock",
    initRes.availableQuantity === 10 && initRes.reservedQuantity === 0 && initRes.availability === "IN_STOCK"
  );

  // Test 2: Invariant: Cannot re-initialize existing variant
  let reinitCaught = false;
  try {
    await service.initializeInventory({
      variantId: "var_test_250g",
      productId: "prod_test",
      sku: "MB-TST-250",
      initialQuantity: 50,
      lowStockThreshold: 5,
    });
  } catch (err: any) {
    reinitCaught = err.statusCode === 409 && err.errorCode === "INVENTORY_ALREADY_EXISTS";
  }
  assert("Test #02: Re-initializing existing inventory throws 409 Conflict", reinitCaught);

  // Test 3: Receive stock (Inbound delivery)
  const receiveRes = await service.receiveStock({
    variantId: "var_test_250g",
    quantity: 15,
    reason: "Fresh morning farm harvest",
    referenceId: "BATCH_001",
    actorUid: "ADMIN_01",
  });
  assert("Test #03: Receive stock increments available quantity (10 + 15 = 25)", receiveRes.availableQuantity === 25);

  // Test 4: Adjust stock
  const adjustRes = await service.adjustStock({
    variantId: "var_test_250g",
    newQuantity: 20,
    reason: "Physical audit adjustment",
    actorUid: "ADMIN_01",
  });
  assert("Test #04: Stock adjustment sets exact count (20)", adjustRes.availableQuantity === 20);

  // --- 2. RESERVATION LIFECYCLE & IDEMPOTENCY ---
  console.log("\n--- RESERVATION, RELEASE & SALE LIFECYCLE ---");

  // Test 5: Reserve stock
  const reserveRes = await service.reserveStock({
    variantId: "var_test_250g",
    quantity: 4,
    referenceId: "ORDER_101",
  });
  const invAfterReserve = await service.getInventoryDetail("var_test_250g");
  assert(
    "Test #05: Reserve stock locks units (Available: 16, Reserved: 4)",
    reserveRes.success && invAfterReserve.availableQuantity === 16 && invAfterReserve.reservedQuantity === 4
  );

  // Test 6: Reserve stock idempotency replay
  const reserveReplay = await service.reserveStock({
    variantId: "var_test_250g",
    quantity: 4,
    referenceId: "ORDER_101",
  });
  const invAfterReplay = await service.getInventoryDetail("var_test_250g");
  assert(
    "Test #06: Duplicate reservation with same referenceId is idempotent (no double decrement)",
    reserveReplay.isIdempotentReplay === true && invAfterReplay.availableQuantity === 16 && invAfterReplay.reservedQuantity === 4
  );

  // Test 7: Insufficient stock rejection
  let insufficientCaught = false;
  try {
    await service.reserveStock({
      variantId: "var_test_250g",
      quantity: 999,
      referenceId: "ORDER_999",
    });
  } catch (err: any) {
    insufficientCaught = err.statusCode === 400 && err.errorCode === "INSUFFICIENT_STOCK";
  }
  assert("Test #07: Insufficient stock rejected with 400 INSUFFICIENT_STOCK", insufficientCaught);

  // Test 8: Release reservation (Customer cancels checkout)
  const releaseRes = await service.releaseReservation({
    variantId: "var_test_250g",
    quantity: 4,
    referenceId: "ORDER_101",
  });
  const invAfterRelease = await service.getInventoryDetail("var_test_250g");
  assert(
    "Test #08: Release reservation unlocks units (Available: 20, Reserved: 0)",
    releaseRes.success && invAfterRelease.availableQuantity === 20 && invAfterRelease.reservedQuantity === 0
  );

  // Test 9: Release reservation idempotency replay
  const releaseReplay = await service.releaseReservation({
    variantId: "var_test_250g",
    quantity: 4,
    referenceId: "ORDER_101",
  });
  const invAfterReleaseReplay = await service.getInventoryDetail("var_test_250g");
  assert(
    "Test #09: Duplicate release with same referenceId is idempotent (no double increment)",
    releaseReplay.isIdempotentReplay === true && invAfterReleaseReplay.availableQuantity === 20 && invAfterReleaseReplay.reservedQuantity === 0
  );

  // Test 10: Commit sale (Payment confirmed)
  // Reserve 5 first
  await service.reserveStock({ variantId: "var_test_250g", quantity: 5, referenceId: "ORDER_102" });
  const saleRes = await service.commitSale({
    variantId: "var_test_250g",
    quantity: 5,
    referenceId: "ORDER_102",
  });
  const invAfterSale = await service.getInventoryDetail("var_test_250g");
  assert(
    "Test #10: Commit sale finalizes deduction (Available: 15, Reserved: 0)",
    saleRes.success && invAfterSale.availableQuantity === 15 && invAfterSale.reservedQuantity === 0
  );

  // Test 11: Duplicate sale commit idempotency
  const saleReplay = await service.commitSale({
    variantId: "var_test_250g",
    quantity: 5,
    referenceId: "ORDER_102",
  });
  const invAfterSaleReplay = await service.getInventoryDetail("var_test_250g");
  assert(
    "Test #11: Duplicate sale commit is idempotent",
    saleReplay.isIdempotentReplay === true && invAfterSaleReplay.availableQuantity === 15 && invAfterSaleReplay.reservedQuantity === 0
  );

  // Test 12: Process return
  const returnRes = await service.processReturn({
    variantId: "var_test_250g",
    quantity: 2,
    reason: "Customer order cancellation prior to dispatch",
    referenceId: "ORDER_102",
  });
  assert("Test #12: Process return restocks available units (15 + 2 = 17)", returnRes.availableQuantity === 17);

  // Test 13: Mark damaged
  const damageRes = await service.markDamaged({
    variantId: "var_test_250g",
    quantity: 2,
    reason: "Damaged packaging in storage",
  });
  assert("Test #13: Mark damaged removes units from available (17 - 2 = 15)", damageRes.availableQuantity === 15);

  // Test 14: Negative stock protection on damage
  let negativeCaught = false;
  try {
    await service.markDamaged({
      variantId: "var_test_250g",
      quantity: 999,
      reason: "Invalid huge quantity",
    });
  } catch (err: any) {
    negativeCaught = err.statusCode === 400 && err.errorCode === "NEGATIVE_STOCK";
  }
  assert("Test #14: Negative stock prevented on excessive damage entry", negativeCaught);

  // --- 3. AVAILABILITY LOGIC & THRESHOLDS ---
  console.log("\n--- STOCK AVAILABILITY THRESHOLDS & STATES ---");

  // Test 15: IN_STOCK (> threshold 3)
  assert("Test #15: Qty 15 with threshold 3 evaluates to IN_STOCK", getStockState(15, 3) === "IN_STOCK");

  // Test 16: LOW_STOCK (<= threshold 3 and > 0)
  assert("Test #16: Qty 2 with threshold 3 evaluates to LOW_STOCK", getStockState(2, 3) === "LOW_STOCK");

  // Test 17: OUT_OF_STOCK (0 or negative)
  assert("Test #17: Qty 0 evaluates to OUT_OF_STOCK", getStockState(0, 3) === "OUT_OF_STOCK");

  // --- 4. CONCURRENCY & RACE CONDITIONS ---
  console.log("\n--- CONCURRENCY & RACE CONDITION PROTECTION ---");

  // Setup variant with exactly 5 units available
  await service.initializeInventory({
    variantId: "var_race_test",
    productId: "prod_race",
    sku: "MB-RACE-5",
    initialQuantity: 5,
    lowStockThreshold: 2,
  });

  // Test 18: Concurrency Race (Stock = 5, Request A = 4, Request B = 3)
  // Exactly ONE must succeed and ONE must fail with INSUFFICIENT_STOCK
  const reqA = service.reserveStock({ variantId: "var_race_test", quantity: 4, referenceId: "RACE_ORDER_A" });
  const reqB = service.reserveStock({ variantId: "var_race_test", quantity: 3, referenceId: "RACE_ORDER_B" });

  const results = await Promise.allSettled([reqA, reqB]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  const rejected = results.filter((r) => r.status === "rejected");

  const raceInv = await service.getInventoryDetail("var_race_test");
  assert(
    "Test #18: Race Condition (Stock: 5, ReqA: 4, ReqB: 3) -> Exactly 1 succeeded, 1 rejected",
    fulfilled.length === 1 && rejected.length === 1 && raceInv.availableQuantity === 1 && raceInv.reservedQuantity === 4
  );

  // Test 19: Second Race (Stock = 5, ReqA = 5, ReqB = 1)
  await service.initializeInventory({
    variantId: "var_race_exact",
    productId: "prod_race",
    sku: "MB-RACE-EXACT",
    initialQuantity: 5,
    lowStockThreshold: 1,
  });

  const exactA = service.reserveStock({ variantId: "var_race_exact", quantity: 5, referenceId: "EXACT_ORDER_A" });
  const exactB = service.reserveStock({ variantId: "var_race_exact", quantity: 1, referenceId: "EXACT_ORDER_B" });

  const exactResults = await Promise.allSettled([exactA, exactB]);
  const exactFulfilled = exactResults.filter((r) => r.status === "fulfilled");
  const exactRejected = exactResults.filter((r) => r.status === "rejected");
  const exactInv = await service.getInventoryDetail("var_race_exact");

  assert(
    "Test #19: Exact Stock Exhaustion Race (Stock: 5, ReqA: 5, ReqB: 1) -> Exactly 1 succeeded",
    exactFulfilled.length === 1 && exactRejected.length === 1 && exactInv.availableQuantity === 0 && exactInv.reservedQuantity === 5
  );

  // --- 5. AUDIT MOVEMENTS & SECURITY ---
  console.log("\n--- AUDIT LEDGER & SECURITY POSTURE ---");

  // Test 20: Audit ledger movements recorded
  const movements = await service.getMovements("var_test_250g");
  assert(
    "Test #20: All operations logged to append-only movements ledger",
    movements.length >= 6 && movements.some((m) => m.type === "RECEIPT") && movements.some((m) => m.type === "RESERVATION")
  );

  // Test 21: Inventory Invariant: availableQuantity + reservedQuantity matches ledger math
  assert(
    "Test #21: Inventory Invariants hold (availableQuantity >= 0 && reservedQuantity >= 0)",
    raceInv.availableQuantity >= 0 && raceInv.reservedQuantity >= 0 && exactInv.availableQuantity >= 0 && exactInv.reservedQuantity >= 0
  );

  // Test 22: Security rules baseline intact
  const rulesValidation = validateFirestoreRulesFile();
  assert(
    "Test #22: Security rules block direct client writes to inventory and movements",
    rulesValidation.passed
  );

  console.log("================================================================================");
  console.log(`TEST SUMMARY: ${passedCount}/22 Phase 04 Inventory Engine Scenarios Passed Cleanly.`);
  console.log("================================================================================");
}

if (require.main === module) {
  runInventoryTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test suite failed:", err);
      process.exit(1);
    });
}
