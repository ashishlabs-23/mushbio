/**
 * ============================================================================
 * MUSHBIO SHIPPING ENGINE DTOs (PHASE 09)
 * ============================================================================
 */

import { Currency } from "../types";

export type ShippingMethod = "STANDARD" | "EXPRESS";

export interface ShippingCalculationDto {
  method: ShippingMethod;
  amount: number;
  currency: Currency;
  freeShippingApplied: boolean;
  freeShippingThreshold: number;
  estimatedDeliveryDays: number;
  label: string;
}

export interface ShippingTierConfig {
  method: ShippingMethod;
  basePrice: number;
  freeShippingThreshold?: number;
  estimatedDays: number;
  label: string;
}
