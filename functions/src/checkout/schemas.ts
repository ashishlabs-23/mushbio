/**
 * ============================================================================
 * MUSHBIO CHECKOUT VALIDATION SCHEMAS (PHASE 08 / PHASE 09)
 * ============================================================================
 */

import { z } from "zod";

export const CheckoutPreviewSchema = z
  .object({
    addressId: z.string().trim().min(1, "addressId is required"),
    shippingMethod: z.enum(["STANDARD", "EXPRESS"]).default("STANDARD"),
    couponCode: z.string().trim().max(30).optional(),
  })
  .strict();

export type CheckoutPreviewInput = z.input<typeof CheckoutPreviewSchema>;
