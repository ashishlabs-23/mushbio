/**
 * ============================================================================
 * MUSHBIO CART DTOs (PHASE 07)
 * ============================================================================
 */

import { CartStatus, Currency, FirestoreTimestamp } from "../types";
import { StockAvailabilityStatus } from "../inventory/dto";

export interface CartItemDto {
  id: string;
  productId: string;
  variantId: string;
  productName: string;
  variantLabel: string;
  image?: string;
  quantity: number;
  currentUnitPrice: number;
  displayPriceSnapshot: number;
  priceChanged: boolean;
  availability: StockAvailabilityStatus;
  itemSubtotal: number;
  createdAt?: FirestoreTimestamp | string;
  updatedAt?: FirestoreTimestamp | string;
}

export interface CartDto {
  cartId: string;
  userId?: string;
  guestId?: string;
  status: CartStatus;
  currency: Currency;
  items: CartItemDto[];
  itemCount: number;
  subtotal: number;
  hasUnavailableItems: boolean;
  hasPriceChanges: boolean;
  createdAt?: FirestoreTimestamp | string;
  updatedAt?: FirestoreTimestamp | string;
}

export type CartValidationIssueCode =
  | "PRICE_CHANGED"
  | "OUT_OF_STOCK"
  | "INSUFFICIENT_STOCK"
  | "PRODUCT_INACTIVE"
  | "VARIANT_INACTIVE"
  | "INVALID_QUANTITY"
  | "PRODUCT_VARIANT_MISMATCH";

export interface CartValidationIssue {
  itemId: string;
  productId: string;
  variantId: string;
  code: CartValidationIssueCode;
  message: string;
  severity: "WARNING" | "BLOCKER";
}

export interface CartValidationResultDto {
  valid: boolean;
  subtotal: number;
  currency: Currency;
  itemCount: number;
  issues: CartValidationIssue[];
}

export interface AddCartItemDto {
  productId: string;
  variantId: string;
  quantity: number;
}

export interface UpdateCartItemDto {
  quantity: number;
}

export interface MergeCartDto {
  guestCartId: string;
}
