/**
 * ============================================================================
 * MUSHBIO CART VALIDATION SCHEMAS (PHASE 07)
 * ============================================================================
 */

import { z } from "zod";

export const MAX_CART_ITEM_QUANTITY = 20;

export const AddCartItemSchema = z
  .object({
    productId: z.string().trim().min(1, "productId is required"),
    variantId: z.string().trim().min(1, "variantId is required"),
    quantity: z
      .number({ message: "quantity is required" })
      .int("quantity must be an integer")
      .min(1, "quantity must be at least 1")
      .max(MAX_CART_ITEM_QUANTITY, `quantity cannot exceed ${MAX_CART_ITEM_QUANTITY} units`),
  })
  .strict();

export const UpdateCartItemSchema = z
  .object({
    quantity: z
      .number({ message: "quantity is required" })
      .int("quantity must be an integer")
      .min(1, "quantity must be at least 1")
      .max(MAX_CART_ITEM_QUANTITY, `quantity cannot exceed ${MAX_CART_ITEM_QUANTITY} units`),
  })
  .strict();

export const MergeCartSchema = z
  .object({
    guestCartId: z.string().trim().min(1, "guestCartId is required"),
  })
  .strict();

export type AddCartItemInput = z.infer<typeof AddCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof UpdateCartItemSchema>;
export type MergeCartInput = z.infer<typeof MergeCartSchema>;
