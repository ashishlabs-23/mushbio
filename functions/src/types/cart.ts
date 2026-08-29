/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — CARTS & CART ITEMS (PHASE 02)
 *
 * Collection: carts/{cartId}
 * Subcollection: carts/{cartId}/items/{itemId}
 * ============================================================================
 */

import { TimestampFields, Currency } from "./common";

export type CartStatus = "ACTIVE" | "CONVERTED" | "ABANDONED";

export interface CartItemDocument extends TimestampFields {
  id: string;
  productId: string;
  variantId: string;
  productNameSnapshot: string;
  variantLabelSnapshot: string;
  imageSnapshot?: string;
  quantity: number;
  displayPriceSnapshot: number; // UI display only; NEVER trusted for checkout calculations
}

export interface CartDocument extends TimestampFields {
  id: string;
  userId?: string; // Set when authenticated
  guestId?: string; // Set for unauthenticated guest sessions
  status: CartStatus;
  currency: Currency;
  appliedCouponSnapshot?: string;
  itemCount: number;
}
