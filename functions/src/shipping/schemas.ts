/**
 * ============================================================================
 * MUSHBIO SHIPPING ENGINE ZOD SCHEMAS (PHASE 09)
 * ============================================================================
 */

import { z } from "zod";

export const ShippingMethodSchema = z.enum(["STANDARD", "EXPRESS"]).default("STANDARD");

export const CalculateShippingSchema = z.object({
  subtotalAfterDiscount: z.number().nonnegative(),
  shippingMethod: ShippingMethodSchema,
});

export type CalculateShippingInput = z.input<typeof CalculateShippingSchema>;
