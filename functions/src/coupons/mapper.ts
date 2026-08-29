/**
 * ============================================================================
 * MUSHBIO COUPON ENGINE MAPPER (PHASE 09)
 * ============================================================================
 */

import { CouponDocument } from "../types";
import { CouponDto, CouponDiscountDto } from "./dto";

export function toCouponDto(doc: CouponDocument): CouponDto {
  return {
    id: doc.id,
    code: doc.code,
    type: doc.type,
    value: doc.value,
    minimumOrder: doc.minimumOrder,
    maximumDiscount: doc.maximumDiscount,
    isActive: doc.isActive,
    startsAt: (doc.startsAt as any)?.toDate?.()?.toISOString?.() || new Date().toISOString(),
    expiresAt: (doc.expiresAt as any)?.toDate?.()?.toISOString?.(),
  };
}

export function toCouponDiscountDto(coupon: CouponDocument, discountAmount: number): CouponDiscountDto {
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    discountAmount,
    minimumOrder: coupon.minimumOrder,
    maximumDiscount: coupon.maximumDiscount,
  };
}
