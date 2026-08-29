/**
 * ============================================================================
 * MUSHBIO COUPON ENGINE ZOD SCHEMAS (PHASE 09)
 * ============================================================================
 */

import { z } from "zod";

export const ValidateCouponSchema = z.object({
  code: z
    .string()
    .min(1, "Coupon code cannot be empty")
    .max(30, "Coupon code is too long")
    .trim(),
});

export type ValidateCouponInput = z.input<typeof ValidateCouponSchema>;
