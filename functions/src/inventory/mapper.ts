/**
 * ============================================================================
 * MUSHBIO INVENTORY MAPPER & AVAILABILITY LOGIC (PHASE 04)
 * ============================================================================
 */

import { InventoryDocument, InventoryMovementDocument } from "../types";
import {
  InventoryDto,
  InventoryMovementDto,
  StockAvailabilityStatus,
} from "./dto";

/**
 * Derives public stock availability status from raw inventory counters.
 *
 * Rules:
 *   availableQuantity <= 0                   -> OUT_OF_STOCK
 *   availableQuantity <= lowStockThreshold  -> LOW_STOCK
 *   availableQuantity > lowStockThreshold   -> IN_STOCK
 */
export function getStockState(
  availableQuantity: number,
  lowStockThreshold: number = 10
): StockAvailabilityStatus {
  if (availableQuantity <= 0) {
    return "OUT_OF_STOCK";
  }
  if (availableQuantity <= lowStockThreshold) {
    return "LOW_STOCK";
  }
  return "IN_STOCK";
}

export function toInventoryDto(doc: InventoryDocument): InventoryDto {
  return {
    variantId: doc.variantId,
    productId: doc.productId,
    sku: doc.sku,
    availableQuantity: doc.availableQuantity,
    reservedQuantity: doc.reservedQuantity,
    lowStockThreshold: doc.lowStockThreshold,
    availability: getStockState(doc.availableQuantity, doc.lowStockThreshold),
    updatedAt: doc.updatedAt,
  };
}

export function toInventoryMovementDto(
  doc: InventoryMovementDocument
): InventoryMovementDto {
  return {
    id: doc.id,
    variantId: doc.variantId,
    productId: doc.productId,
    type: doc.type,
    quantity: doc.quantity,
    previousQuantity: doc.previousQuantity,
    newQuantity: doc.newQuantity,
    reason: doc.reason,
    referenceType: doc.referenceType,
    referenceId: doc.referenceId,
    actorUid: doc.actorUid,
    createdAt: doc.createdAt,
  };
}
