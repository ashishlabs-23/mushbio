/**
 * ============================================================================
 * MUSHBIO INVENTORY API & DOMAIN DTOs (PHASE 04)
 * ============================================================================
 */

import {
  InventoryMovementType,
  InventoryReferenceType,
  FirestoreTimestamp,
} from "../types";

export type StockAvailabilityStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface InventoryDto {
  variantId: string;
  productId: string;
  sku: string;
  availableQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  availability: StockAvailabilityStatus;
  updatedAt?: FirestoreTimestamp;
}

export interface InventoryMovementDto {
  id: string;
  variantId: string;
  productId: string;
  type: InventoryMovementType;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: string;
  referenceType?: InventoryReferenceType;
  referenceId?: string;
  actorUid: string;
  createdAt?: FirestoreTimestamp;
}

export interface StockReservationResultDto {
  success: boolean;
  variantId: string;
  quantity: number;
  referenceId: string;
  remainingAvailable: number;
  isIdempotentReplay?: boolean;
}

export interface StockReleaseResultDto {
  success: boolean;
  variantId: string;
  quantity: number;
  referenceId: string;
  remainingReserved: number;
  isIdempotentReplay?: boolean;
}

export interface SaleCommitResultDto {
  success: boolean;
  variantId: string;
  quantity: number;
  referenceId: string;
  remainingReserved: number;
  isIdempotentReplay?: boolean;
}
