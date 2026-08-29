/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — COUPONS & DISCOUNTS (PHASE 02)
 *
 * Collection: coupons/{couponId}
 * ============================================================================
 */

import { TimestampFields, FirestoreTimestamp } from "./common";

export type CouponType = "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";

export interface CouponDocument extends TimestampFields {
  id: string;
  code: string; // e.g. "MUSH10"
  normalizedCode: string; // e.g. "MUSH10" (uppercase trimmed)
  type: CouponType;
  value: number; // e.g. 10 for 10% or 100 for ₹100
  minimumOrder: number; // Minimum subtotal required in INR (₹)
  maximumDiscount?: number; // Cap for percentage discounts (₹)
  usageLimit?: number; // Total campaign limit (e.g. 500 orders)
  usageCount: number; // Server-incremented count
  perUserLimit: number; // Max redemptions per user UID (default: 1)
  startsAt: FirestoreTimestamp;
  expiresAt?: FirestoreTimestamp;
  isActive: boolean;
  applicableCategorySlugs?: string[]; // Specific category filter if restricted
}

export interface CouponRedemptionDocument extends TimestampFields {
  id: string; // e.g. "redm_<couponId>_<userId>_<orderId>"
  couponId: string;
  code: string;
  userId: string;
  orderId: string;
  discount: number;
  status: "APPLIED" | "CANCELLED";
  createdAt: FirestoreTimestamp;
}
