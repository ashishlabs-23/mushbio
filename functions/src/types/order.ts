/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — ORDERS, ITEMS & PAYMENTS (PHASE 02)
 *
 * Collection: orders/{orderId}
 * Subcollections:
 *   - orders/{orderId}/items/{itemId}
 *   - orders/{orderId}/payments/{paymentId}
 * ============================================================================
 */

import { TimestampFields, Currency, FirestoreTimestamp } from "./common";
import { UserAddress, LocationSource } from "./user";

/**
 * Delivery location snapshot (GPS or MANUAL).
 * Stored in the order for fulfillment/admin use.
 * Coordinates may be null for manual-only addresses.
 */
export interface DeliveryLocation {
  latitude?: number;       // WGS-84, null for manual addresses
  longitude?: number;      // WGS-84, null for manual addresses
  accuracyMeters?: number; // GPS accuracy radius in meters
  source: LocationSource;  // "GPS" | "MANUAL"
}


export type OrderStatus =
  | "PENDING"
  | "PAYMENT_PENDING"
  | "PAID"
  | "CONFIRMED"
  | "PROCESSING"
  | "PACKED"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentStatus =
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type PaymentProvider = "RAZORPAY" | "COD";

export interface OrderItemDocument {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  productNameSnapshot: string;
  weightSnapshot: string;
  unitPrice: number; // Final authoritative price at order placement
  quantity: number;
  discount: number;
  tax: number;
  lineTotal: number;
  imageSnapshot?: string;
}

export interface OrderPaymentDocument extends TimestampFields {
  id: string;
  provider: PaymentProvider;
  providerOrderId?: string; // Razorpay order_id
  providerPaymentId?: string; // Razorpay payment_id
  providerSignature?: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  method?: string; // "upi", "card", "netbanking", "wallet"
  errorCode?: string;
  errorDescription?: string;
  // Phase 11: Refund tracking
  refundId?: string; // Razorpay refund_id (e.g. "rfnd_xxx")
  refundAmount?: number; // In integer paise
  refundStatus?: string; // "processed" | "created" | "failed"
}


export interface OrderDocument extends TimestampFields {
  id: string;
  orderNumber: string; // e.g. "MUSH-2026-0001"
  userId: string;
  customerEmail: string;
  customerPhone: string;
  customerName: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: Currency;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  couponCodeSnapshot?: string;
  shippingMethod: string; // "Standard Farm Delivery" | "Express Same-Day"
  shippingAddressSnapshot: UserAddress;
  estimatedDeliveryDate?: FirestoreTimestamp;
  trackingNumber?: string;
  courierPartner?: string;
  notes?: string;
  idempotencyKey?: string;
  itemCount?: number;
  // Phase 10A: GPS delivery location snapshot
  deliveryLocation?: DeliveryLocation;
  deliveryInstructions?: string; // Max 500 chars
}
