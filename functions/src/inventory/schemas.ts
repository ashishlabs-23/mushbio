/**
 * ============================================================================
 * MUSHBIO INVENTORY VALIDATION SCHEMAS (PHASE 04)
 * ============================================================================
 */

import { z } from "zod";

export const InitializeInventorySchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  productId: z.string().trim().min(1, "productId is required"),
  sku: z.string().trim().min(1, "sku is required"),
  initialQuantity: z.number().int().min(0, "initialQuantity must be a non-negative integer"),
  lowStockThreshold: z.number().int().min(1, "lowStockThreshold must be at least 1").default(10),
});

export const ReceiveStockSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  quantity: z.number().int().min(1, "quantity must be greater than 0"),
  reason: z.string().trim().min(1, "reason is required"),
  referenceType: z.enum(["PURCHASE_RECEIPT", "ORDER", "MANUAL_ADJUSTMENT", "RETURN_REQUEST"]).default("PURCHASE_RECEIPT"),
  referenceId: z.string().trim().optional(),
  actorUid: z.string().trim().default("SYSTEM"),
});

export const AdjustStockSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  newQuantity: z.number().int().min(0, "newQuantity must be a non-negative integer"),
  reason: z.string().trim().min(1, "reason is required"),
  referenceId: z.string().trim().optional(),
  actorUid: z.string().trim().default("SYSTEM"),
});

export const ReserveStockSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  quantity: z.number().int().min(1, "quantity must be at least 1"),
  referenceId: z.string().trim().min(1, "referenceId is required for idempotency"),
  actorUid: z.string().trim().default("SYSTEM"),
});

export const ReleaseReservationSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  quantity: z.number().int().min(1, "quantity must be at least 1"),
  referenceId: z.string().trim().min(1, "referenceId is required for idempotency"),
  actorUid: z.string().trim().default("SYSTEM"),
});

export const CommitSaleSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  quantity: z.number().int().min(1, "quantity must be at least 1"),
  referenceId: z.string().trim().min(1, "referenceId is required for idempotency"),
  actorUid: z.string().trim().default("SYSTEM"),
});

export const ProcessReturnSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  quantity: z.number().int().min(1, "quantity must be at least 1"),
  reason: z.string().trim().min(1, "reason is required"),
  referenceId: z.string().trim().min(1, "referenceId is required for idempotency"),
  actorUid: z.string().trim().default("SYSTEM"),
});

export const MarkDamagedSchema = z.object({
  variantId: z.string().trim().min(1, "variantId is required"),
  quantity: z.number().int().min(1, "quantity must be at least 1"),
  reason: z.string().trim().min(1, "reason is required"),
  referenceId: z.string().trim().optional(),
  actorUid: z.string().trim().default("SYSTEM"),
});

export type InitializeInventoryInput = z.input<typeof InitializeInventorySchema>;
export type ReceiveStockInput = z.input<typeof ReceiveStockSchema>;
export type AdjustStockInput = z.input<typeof AdjustStockSchema>;
export type ReserveStockInput = z.input<typeof ReserveStockSchema>;
export type ReleaseReservationInput = z.input<typeof ReleaseReservationSchema>;
export type CommitSaleInput = z.input<typeof CommitSaleSchema>;
export type ProcessReturnInput = z.input<typeof ProcessReturnSchema>;
export type MarkDamagedInput = z.input<typeof MarkDamagedSchema>;
