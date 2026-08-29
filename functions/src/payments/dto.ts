/**
 * ============================================================================
 * MUSHBIO PAYMENT DATA TRANSFER OBJECTS (PHASE 10)
 *
 * Safe client representations and request/response payloads for Razorpay
 * payment processing. Secrets and private provider details are NEVER exposed.
 * All monetary amounts are integer values in Paise (e.g. 50400 = ₹504.00).
 * ============================================================================
 */

import { Currency, PaymentProvider, PaymentStatus, OrderStatus } from "../types";

export interface CreatePaymentOrderDto {
  orderId: string;
}

export interface RazorpayCustomerPrefillDto {
  name?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayCheckoutDataDto {
  orderId: string;
  orderNumber: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number; // In paise
  currency: Currency; // "INR"
  name: string; // "MushBio"
  description: string;
  prefill: RazorpayCustomerPrefillDto;
  notes?: Record<string, string>;
}

export interface VerifyPaymentDto {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface PaymentVerificationResultDto {
  success: boolean;
  orderId: string;
  orderNumber: string;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  providerPaymentId: string;
  amount: number;
  currency: Currency;
  message: string;
}

export interface PaymentRecordDto {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerOrderId?: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  amount: number;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
}
