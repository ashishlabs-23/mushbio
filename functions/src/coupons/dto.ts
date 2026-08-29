/**
 * ============================================================================
 * MUSHBIO COUPON ENGINE DTOs (PHASE 09)
 * ============================================================================
 */

import { CouponType } from "../types";

export interface CouponDto {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minimumOrder: number;
  maximumDiscount?: number;
  isActive: boolean;
  startsAt: string;
  expiresAt?: string;
}

export interface CouponDiscountDto {
  code: string;
  type: CouponType;
  value: number;
  discountAmount: number;
  minimumOrder: number;
  maximumDiscount?: number;
}

export interface CouponValidationDto {
  valid: boolean;
  code: string;
  discount: number;
  discountType: CouponType;
  subtotal: number;
  subtotalAfterDiscount: number;
  message: string;
  issues?: string[];
}
