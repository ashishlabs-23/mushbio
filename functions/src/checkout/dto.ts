/**
 * ============================================================================
 * MUSHBIO CHECKOUT DTOs (PHASE 08 / PHASE 09)
 * ============================================================================
 */

import { Currency, CouponType } from "../types";
import { StockAvailabilityStatus } from "../inventory/dto";
import { ShippingMethod } from "../shipping/dto";
import { AddressDto } from "../addresses/dto";

export interface CheckoutItemPreviewDto {
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  image?: string;
  availability: StockAvailabilityStatus;
}

export type CheckoutIssueCode =
  | "CART_EMPTY"
  | "PRODUCT_INACTIVE"
  | "VARIANT_INACTIVE"
  | "PRODUCT_VARIANT_MISMATCH"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "INVALID_QUANTITY"
  | "ADDRESS_NOT_FOUND"
  | "ADDRESS_NOT_OWNED"
  | "ACCOUNT_SUSPENDED"
  | "PRICE_CHANGED"
  | "COUPON_NOT_FOUND"
  | "COUPON_INACTIVE"
  | "COUPON_EXPIRED"
  | "COUPON_MINIMUM_ORDER_NOT_MET"
  | "COUPON_USAGE_LIMIT_REACHED"
  | "COUPON_USER_LIMIT_REACHED";

export interface CheckoutIssue {
  code: CheckoutIssueCode;
  message: string;
  severity: "WARNING" | "BLOCKER";
  productId?: string;
  variantId?: string;
}

export interface CheckoutCouponSummaryDto {
  code: string;
  type: CouponType;
  discount: number;
}

export interface CheckoutPreviewResultDto {
  valid: boolean;
  currency: Currency;
  items: CheckoutItemPreviewDto[];
  itemCount: number;
  shippingAddress: AddressDto;
  shippingMethod: ShippingMethod;
  coupon?: CheckoutCouponSummaryDto;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  issues: CheckoutIssue[];
}

export interface CheckoutPreviewRequestDto {
  addressId: string;
  shippingMethod?: ShippingMethod;
  couponCode?: string;
}
