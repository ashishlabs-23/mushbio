/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — INVENTORY & MOVEMENTS (PHASE 02)
 *
 * Collections:
 *   - inventory/{variantId}
 *   - inventoryMovements/{movementId}
 * ============================================================================
 */

import { FirestoreTimestamp } from "./common";

export type InventoryMovementType =
  | "RECEIPT"
  | "SALE"
  | "RETURN"
  | "DAMAGE"
  | "ADJUSTMENT"
  | "RESERVATION"
  | "RELEASE";

export type InventoryReferenceType = "ORDER" | "PURCHASE_RECEIPT" | "MANUAL_ADJUSTMENT" | "RETURN_REQUEST";

export interface InventoryDocument {
  variantId: string;
  productId: string;
  sku: string;
  availableQuantity: number; // Stock ready for sale
  reservedQuantity: number; // Temporarily locked during active checkout
  lowStockThreshold: number; // e.g. 10 units
  updatedAt: FirestoreTimestamp;
}

export interface InventoryMovementDocument {
  id: string;
  variantId: string;
  productId: string;
  type: InventoryMovementType;
  quantity: number; // Signed delta (e.g. +50 for RECEIPT, -2 for SALE)
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  referenceType?: InventoryReferenceType;
  referenceId?: string; // e.g. orderId or batchId
  actorUid: string; // Admin UID or "SYSTEM"
  createdAt: FirestoreTimestamp;
}
