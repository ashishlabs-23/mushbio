/**
 * ============================================================================
 * MUSHBIO CHECKOUT FINANCIAL & SHIPPING CALCULATOR (PHASE 08 / PHASE 09)
 *
 * Configurable business rules for shipping fees and tax calculations.
 * Integrates with ShippingEngine (Phase 09).
 * ============================================================================
 */

import { shippingCalculator, ShippingCalculator } from "../shipping/calculator";
import { ShippingMethod } from "../shipping/dto";

export { ShippingMethod };

export class CheckoutCalculator {
  constructor(private shippingCalc: ShippingCalculator = shippingCalculator) {}

  /**
   * Calculate shipping fee based on post-discount subtotal and chosen method
   */
  calculateShipping(subtotalAfterDiscount: number, method: ShippingMethod = "STANDARD"): number {
    return this.shippingCalc.calculate(subtotalAfterDiscount, method).amount;
  }

  /**
   * Calculate configurable tax (default 0% unless legally configured)
   */
  calculateTax(_subtotal: number): number {
    return 0;
  }

  /**
   * Authoritative calculation of full checkout totals
   * Calculation Order:
   * 1. Subtotal
   * 2. Discount (Coupon)
   * 3. Subtotal After Discount = max(0, Subtotal - Discount)
   * 4. Shipping based on Subtotal After Discount
   * 5. Tax
   * 6. Total = Subtotal After Discount + Shipping + Tax
   */
  calculateTotals(
    subtotal: number,
    shippingMethod: ShippingMethod = "STANDARD",
    discount = 0
  ): {
    subtotal: number;
    discount: number;
    subtotalAfterDiscount: number;
    shipping: number;
    tax: number;
    total: number;
  } {
    const safeDiscount = Math.max(0, Math.min(discount, subtotal));
    const subtotalAfterDiscount = Math.max(0, subtotal - safeDiscount);
    const shipping = this.calculateShipping(subtotalAfterDiscount, shippingMethod);
    const tax = this.calculateTax(subtotalAfterDiscount);
    const total = subtotalAfterDiscount + shipping + tax;

    return {
      subtotal,
      discount: safeDiscount,
      subtotalAfterDiscount,
      shipping,
      tax,
      total,
    };
  }
}

export const checkoutCalculator = new CheckoutCalculator();
