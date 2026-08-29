/**
 * ============================================================================
 * MUSHBIO ORDER VALIDATION SCHEMAS (PHASE 08)
 * ============================================================================
 */

import { z } from "zod";

export const CreateOrderSchema = z
  .object({
    addressId: z.string().trim().min(1, "addressId is required"),
    shippingMethod: z.enum(["STANDARD", "EXPRESS"]).default("STANDARD"),
    couponCode: z.string().trim().max(30).optional(),
    notes: z.string().trim().max(500, "Notes cannot exceed 500 characters").optional(),
    // Phase 10A: delivery instructions from address/GPS flow
    deliveryInstructions: z
      .string()
      .trim()
      .max(500, "Delivery instructions cannot exceed 500 characters")
      .optional(),
  })
  .strict();


export const OrderQuerySchema = z
  .object({
    pageSize: z
      .preprocess((val) => (val !== undefined ? Number(val) : 10), z.number().int().min(1).max(50))
      .default(10),
    cursor: z.string().optional(),
  })
  .strict();

export const UpdateOrderStatusSchema = z
  .object({
    status: z.enum([
      "PENDING",
      "PAYMENT_PENDING",
      "PAID",
      "CONFIRMED",
      "PROCESSING",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
    ]),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export type CreateOrderInput = z.input<typeof CreateOrderSchema>;
export type OrderQueryParams = z.input<typeof OrderQuerySchema>;
export type UpdateOrderStatusInput = z.input<typeof UpdateOrderStatusSchema>;
