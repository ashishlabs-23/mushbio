/**
 * ============================================================================
 * MUSHBIO INVENTORY DOMAIN SERVICE (PHASE 04)
 *
 * Implements real-time inventory counter mutations, concurrency protection,
 * atomic transactions, and idempotency guarantees.
 * ============================================================================
 */

import {
  inventoryRepository,
  InventoryRepository,
} from "./repository";
import {
  InitializeInventorySchema,
  ReceiveStockSchema,
  AdjustStockSchema,
  ReserveStockSchema,
  ReleaseReservationSchema,
  CommitSaleSchema,
  ProcessReturnSchema,
  MarkDamagedSchema,
  InitializeInventoryInput,
  ReceiveStockInput,
  AdjustStockInput,
  ReserveStockInput,
  ReleaseReservationInput,
  CommitSaleInput,
  ProcessReturnInput,
  MarkDamagedInput,
} from "./schemas";
import {
  InventoryDto,
  InventoryMovementDto,
  StockReservationResultDto,
  StockReleaseResultDto,
  SaleCommitResultDto,
  StockAvailabilityStatus,
} from "./dto";
import {
  toInventoryDto,
  toInventoryMovementDto,
  getStockState,
} from "./mapper";
import {
  InventoryDocument,
} from "../types";
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
} from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

export class InventoryService {
  constructor(private repo: InventoryRepository = inventoryRepository) {}

  /**
   * 1. Initialize Inventory
   */
  async initializeInventory(rawInput: InitializeInventoryInput): Promise<InventoryDto> {
    const input = InitializeInventorySchema.parse(rawInput);
    const existing = await this.repo.getInventoryByVariantId(input.variantId);
    if (existing) {
      throw new ConflictError(
        `Inventory for variant '${input.variantId}' already exists`,
        "INVENTORY_ALREADY_EXISTS"
      );
    }

    const doc: InventoryDocument = {
      variantId: input.variantId,
      productId: input.productId,
      sku: input.sku,
      availableQuantity: input.initialQuantity,
      reservedQuantity: 0,
      lowStockThreshold: input.lowStockThreshold,
      updatedAt: Timestamp.now(),
    };

    await this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      tx.set(invRef, doc);

      if (input.initialQuantity > 0) {
        this.repo.recordMovementInTx(tx, {
          variantId: input.variantId,
          productId: input.productId,
          type: "RECEIPT",
          quantity: input.initialQuantity,
          previousQuantity: 0,
          newQuantity: input.initialQuantity,
          reason: "Initial inventory setup",
          referenceType: "PURCHASE_RECEIPT",
          referenceId: "INIT",
          actorUid: "SYSTEM",
        });
      }
    });

    return toInventoryDto(doc);
  }

  /**
   * 2. Receive Stock (Inbound Shipment)
   */
  async receiveStock(rawInput: ReceiveStockInput): Promise<InventoryDto> {
    const input = ReceiveStockSchema.parse(rawInput);
    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;
      const prevQty = current.availableQuantity;
      const newQty = prevQty + input.quantity;

      const updated: Partial<InventoryDocument> = {
        availableQuantity: newQty,
        updatedAt: Timestamp.now(),
      };

      tx.update(invRef, updated);

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "RECEIPT",
        quantity: input.quantity,
        previousQuantity: prevQty,
        newQuantity: newQty,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return toInventoryDto({ ...current, ...updated } as InventoryDocument);
    });
  }

  /**
   * 3. Stock Adjustment (Manual Warehouse Count)
   */
  async adjustStock(rawInput: AdjustStockInput): Promise<InventoryDto> {
    const input = AdjustStockSchema.parse(rawInput);
    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;
      const prevQty = current.availableQuantity;
      const delta = input.newQuantity - prevQty;

      const updated: Partial<InventoryDocument> = {
        availableQuantity: input.newQuantity,
        updatedAt: Timestamp.now(),
      };

      tx.update(invRef, updated);

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "ADJUSTMENT",
        quantity: delta,
        previousQuantity: prevQty,
        newQuantity: input.newQuantity,
        reason: input.reason,
        referenceType: "MANUAL_ADJUSTMENT",
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return toInventoryDto({ ...current, ...updated } as InventoryDocument);
    });
  }

  /**
   * 4. Real-time Stock Reservation (Atomic Firestore Transaction + Idempotency)
   */
  async reserveStock(rawInput: ReserveStockInput): Promise<StockReservationResultDto> {
    const input = ReserveStockSchema.parse(rawInput);

    // Idempotency check: Has this reservation already been executed for this referenceId?
    const existingMovement = await this.repo.findMovementByReference(
      input.variantId,
      "RESERVATION",
      input.referenceId
    );

    if (existingMovement) {
      const current = await this.repo.getInventoryByVariantId(input.variantId);
      return {
        success: true,
        variantId: input.variantId,
        quantity: input.quantity,
        referenceId: input.referenceId,
        remainingAvailable: current?.availableQuantity ?? 0,
        isIdempotentReplay: true,
      };
    }

    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;

      // Invariant Check: Verify available stock
      if (current.availableQuantity < input.quantity) {
        throw new BadRequestError(
          `Insufficient stock for variant '${input.variantId}'. Available: ${current.availableQuantity}, Requested: ${input.quantity}`,
          "INSUFFICIENT_STOCK"
        );
      }

      const prevAvailable = current.availableQuantity;
      const newAvailable = prevAvailable - input.quantity;
      const prevReserved = current.reservedQuantity;
      const newReserved = prevReserved + input.quantity;

      tx.update(invRef, {
        availableQuantity: newAvailable,
        reservedQuantity: newReserved,
        updatedAt: Timestamp.now(),
      });

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "RESERVATION",
        quantity: -input.quantity,
        previousQuantity: prevAvailable,
        newQuantity: newAvailable,
        reason: `Checkout reservation for reference ${input.referenceId}`,
        referenceType: "ORDER",
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return {
        success: true,
        variantId: input.variantId,
        quantity: input.quantity,
        referenceId: input.referenceId,
        remainingAvailable: newAvailable,
        isIdempotentReplay: false,
      };
    });
  }

  /**
   * 5. Release Stock Reservation (Checkout Cancelled / Expired)
   */
  async releaseReservation(rawInput: ReleaseReservationInput): Promise<StockReleaseResultDto> {
    const input = ReleaseReservationSchema.parse(rawInput);

    // Idempotency check: Has this release already been processed?
    const existingRelease = await this.repo.findMovementByReference(
      input.variantId,
      "RELEASE",
      input.referenceId
    );

    if (existingRelease) {
      const current = await this.repo.getInventoryByVariantId(input.variantId);
      return {
        success: true,
        variantId: input.variantId,
        quantity: input.quantity,
        referenceId: input.referenceId,
        remainingReserved: current?.reservedQuantity ?? 0,
        isIdempotentReplay: true,
      };
    }

    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;

      // Invariant: Do not allow negative reserved stock
      if (current.reservedQuantity < input.quantity) {
        throw new BadRequestError(
          `Cannot release ${input.quantity} units; only ${current.reservedQuantity} currently reserved`,
          "INVALID_QUANTITY"
        );
      }

      const prevAvailable = current.availableQuantity;
      const newAvailable = prevAvailable + input.quantity;
      const prevReserved = current.reservedQuantity;
      const newReserved = prevReserved - input.quantity;

      tx.update(invRef, {
        availableQuantity: newAvailable,
        reservedQuantity: newReserved,
        updatedAt: Timestamp.now(),
      });

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "RELEASE",
        quantity: input.quantity,
        previousQuantity: prevAvailable,
        newQuantity: newAvailable,
        reason: `Reservation released for reference ${input.referenceId}`,
        referenceType: "ORDER",
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return {
        success: true,
        variantId: input.variantId,
        quantity: input.quantity,
        referenceId: input.referenceId,
        remainingReserved: newReserved,
        isIdempotentReplay: false,
      };
    });
  }

  /**
   * 6. Commit Sale (Payment Confirmed)
   */
  async commitSale(rawInput: CommitSaleInput): Promise<SaleCommitResultDto> {
    const input = CommitSaleSchema.parse(rawInput);

    // Idempotency check: Has this sale already been committed?
    const existingSale = await this.repo.findMovementByReference(
      input.variantId,
      "SALE",
      input.referenceId
    );

    if (existingSale) {
      const current = await this.repo.getInventoryByVariantId(input.variantId);
      return {
        success: true,
        variantId: input.variantId,
        quantity: input.quantity,
        referenceId: input.referenceId,
        remainingReserved: current?.reservedQuantity ?? 0,
        isIdempotentReplay: true,
      };
    }

    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;

      // Invariant: Verify reserved stock was locked
      if (current.reservedQuantity < input.quantity) {
        throw new BadRequestError(
          `Cannot commit sale of ${input.quantity} units; only ${current.reservedQuantity} currently reserved`,
          "INVALID_QUANTITY"
        );
      }

      const prevReserved = current.reservedQuantity;
      const newReserved = prevReserved - input.quantity;

      // Available quantity was already decremented during reservation!
      tx.update(invRef, {
        reservedQuantity: newReserved,
        updatedAt: Timestamp.now(),
      });

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "SALE",
        quantity: -input.quantity,
        previousQuantity: current.availableQuantity,
        newQuantity: current.availableQuantity,
        reason: `Sale confirmed for reference ${input.referenceId}`,
        referenceType: "ORDER",
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return {
        success: true,
        variantId: input.variantId,
        quantity: input.quantity,
        referenceId: input.referenceId,
        remainingReserved: newReserved,
        isIdempotentReplay: false,
      };
    });
  }

  /**
   * 7. Process Return
   */
  async processReturn(rawInput: ProcessReturnInput): Promise<InventoryDto> {
    const input = ProcessReturnSchema.parse(rawInput);
    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;
      const prevQty = current.availableQuantity;
      const newQty = prevQty + input.quantity;

      const updated: Partial<InventoryDocument> = {
        availableQuantity: newQty,
        updatedAt: Timestamp.now(),
      };

      tx.update(invRef, updated);

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "RETURN",
        quantity: input.quantity,
        previousQuantity: prevQty,
        newQuantity: newQty,
        reason: input.reason,
        referenceType: "RETURN_REQUEST",
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return toInventoryDto({ ...current, ...updated } as InventoryDocument);
    });
  }

  /**
   * 8. Mark Damaged
   */
  async markDamaged(rawInput: MarkDamagedInput): Promise<InventoryDto> {
    const input = MarkDamagedSchema.parse(rawInput);
    return this.repo.runTransaction(async (tx) => {
      const invRef = this.repo.getInventoryRef(input.variantId);
      const snap = await tx.get(invRef);

      if (!snap.exists) {
        throw new NotFoundError(
          `Inventory record for variant '${input.variantId}' not found`,
          "INVENTORY_NOT_FOUND"
        );
      }

      const current = snap.data() as InventoryDocument;
      if (current.availableQuantity < input.quantity) {
        throw new BadRequestError(
          `Cannot mark ${input.quantity} damaged; only ${current.availableQuantity} available`,
          "NEGATIVE_STOCK"
        );
      }

      const prevQty = current.availableQuantity;
      const newQty = prevQty - input.quantity;

      const updated: Partial<InventoryDocument> = {
        availableQuantity: newQty,
        updatedAt: Timestamp.now(),
      };

      tx.update(invRef, updated);

      this.repo.recordMovementInTx(tx, {
        variantId: input.variantId,
        productId: current.productId,
        type: "DAMAGE",
        quantity: -input.quantity,
        previousQuantity: prevQty,
        newQuantity: newQty,
        reason: input.reason,
        referenceType: "MANUAL_ADJUSTMENT",
        referenceId: input.referenceId,
        actorUid: input.actorUid,
      });

      return toInventoryDto({ ...current, ...updated } as InventoryDocument);
    });
  }

  /**
   * 9. Safe Public Variant Availability Query
   */
  async getVariantAvailability(variantId: string): Promise<StockAvailabilityStatus> {
    const inv = await this.repo.getInventoryByVariantId(variantId);
    if (!inv) return "OUT_OF_STOCK";
    return getStockState(inv.availableQuantity, inv.lowStockThreshold);
  }

  /**
   * 10. Safe Batch Variant Availability Query
   */
  async getBatchAvailability(variantIds: string[]): Promise<Map<string, StockAvailabilityStatus>> {
    const map = new Map<string, StockAvailabilityStatus>();
    const invMap = await this.repo.getInventoryByVariantIds(variantIds);

    for (const vid of variantIds) {
      const inv = invMap.get(vid);
      if (!inv) {
        map.set(vid, "OUT_OF_STOCK");
      } else {
        map.set(vid, getStockState(inv.availableQuantity, inv.lowStockThreshold));
      }
    }
    return map;
  }

  /**
   * 11. Trusted Internal Inventory Query (Staff/Admin only)
   */
  async getInventoryDetail(variantId: string): Promise<InventoryDto> {
    const doc = await this.repo.getInventoryByVariantId(variantId);
    if (!doc) {
      throw new NotFoundError(
        `Inventory record for variant '${variantId}' not found`,
        "INVENTORY_NOT_FOUND"
      );
    }
    return toInventoryDto(doc);
  }

  /**
   * 12. Trusted Internal Movement History (Staff/Admin only)
   */
  async getMovements(variantId: string): Promise<InventoryMovementDto[]> {
    const docs = await this.repo.getMovementsByVariantId(variantId);
    return docs.map(toInventoryMovementDto);
  }
}

export const inventoryService = new InventoryService();
