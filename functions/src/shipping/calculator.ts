/**
 * ============================================================================
 * MUSHBIO SHIPPING ENGINE CALCULATOR (PHASE 09 / MONETARY MINOR UNITS)
 *
 * Authoritative single source of truth for delivery pricing policies.
 * All monetary amounts are integer values in paise (minor units, e.g. 5000 = ₹50.00).
 * ============================================================================
 */

import { ShippingMethod, ShippingCalculationDto, ShippingTierConfig } from "./dto";
import { UserAddress } from "../types";

export const SHIPPING_TIERS: Record<ShippingMethod, ShippingTierConfig> = {
  STANDARD: {
    method: "STANDARD",
    basePrice: 5000, // ₹50.00 in paise
    freeShippingThreshold: 50000, // ₹500.00 in paise
    estimatedDays: 3,
    label: "Standard Farm Delivery",
  },
  EXPRESS: {
    method: "EXPRESS",
    basePrice: 12000, // ₹120.00 in paise
    freeShippingThreshold: undefined, // Express delivery is never free
    estimatedDays: 1,
    label: "Express Same-Day Farm Delivery",
  },
};

export class ShippingCalculator {
  /**
   * Calculate shipping amount in paise based on post-discount subtotal and shipping tier
   */
  calculate(
    subtotalAfterDiscount: number,
    method: ShippingMethod = "STANDARD",
    _address?: UserAddress
  ): ShippingCalculationDto {
    const tier = SHIPPING_TIERS[method] || SHIPPING_TIERS.STANDARD;

    let amount = tier.basePrice;
    let freeShippingApplied = false;

    // Free shipping policy: Applies ONLY to STANDARD if post-discount subtotal >= threshold
    if (tier.freeShippingThreshold !== undefined && subtotalAfterDiscount >= tier.freeShippingThreshold) {
      amount = 0;
      freeShippingApplied = true;
    }

    return {
      method: tier.method,
      amount,
      currency: "INR",
      freeShippingApplied,
      freeShippingThreshold: tier.freeShippingThreshold ?? 0,
      estimatedDeliveryDays: tier.estimatedDays,
      label: tier.label,
    };
  }
}

export const shippingCalculator = new ShippingCalculator();
