/**
 * ============================================================================
 * MUSHBIO ORDER DTOs (PHASE 08)
 * ============================================================================
 */

import { OrderStatus, PaymentStatus, Currency, FirestoreTimestamp } from "../types";
import { UserAddress } from "../types/user";

export interface OrderItemDto {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  tax: number;
  lineTotal: number;
  image?: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: Currency;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  shippingMethod: string;
  shippingAddress: UserAddress;
  couponCode?: string;
  items: OrderItemDto[];
  itemCount: number;
  notes?: string;
  trackingNumber?: string;
  courierPartner?: string;
  createdAt?: FirestoreTimestamp | string;
  updatedAt?: FirestoreTimestamp | string;
}

export interface OrderListPaginationDto {
  pageSize: number;
  nextCursor?: string;
  hasMore: boolean;
}

export interface OrderListDto {
  data: OrderDto[];
  pagination: OrderListPaginationDto;
}

export interface CreateOrderDto {
  addressId: string;
  shippingMethod?: "STANDARD" | "EXPRESS";
  couponCode?: string;
  notes?: string;
}

export interface UpdateOrderStatusDto {
  status: OrderStatus;
  notes?: string;
}
