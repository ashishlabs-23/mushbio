/**
 * ============================================================================
 * MUSHBIO COUPON ENGINE CALCULATOR (PHASE 09)
 *
 * Implements mathematical discount calculations with ceiling and bounds guards.
 * ============================================================================
 */

import { CouponDocument } from "../types";

export class CouponCalculator {
  /**
   * Calculate exact rupee discount for a coupon given an order subtotal
   */
  calculateDiscount(coupon: CouponDocument, subtotal: number): number {
    if (subtotal <= 0) return 0;
    if (subtotal < coupon.minimumOrder) return 0;

    let discount = 0;

    switch (coupon.type) {
      case "PERCENTAGE": {
        // e.g. 10% on 560 = 56
        const rawDiscount = Math.round((subtotal * coupon.value) / 100);
        discount = coupon.maximumDiscount
          ? Math.min(rawDiscount, coupon.maximumDiscount)
          : rawDiscount;
        break;
      }
      case "FIXED_AMOUNT": {
        // e.g. 100 off on 560 = 100. If subtotal is 50, discount = 50.
        discount = Math.min(coupon.value, subtotal);
        break;
      }
      case "FREE_SHIPPING": {
        discount = 0; // Subtotal discount is 0; shipping is waived in shipping engine
        break;
      }
      default:
        discount = 0;
    }

    // Invariant: discount can never exceed the subtotal
    return Math.max(0, Math.min(discount, subtotal));
  }
}

export const couponCalculator = new CouponCalculator();
