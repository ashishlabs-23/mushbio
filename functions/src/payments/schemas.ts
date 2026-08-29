/**
 * ============================================================================
 * MUSHBIO PAYMENT VALIDATION SCHEMAS (PHASE 10)
 *
 * Runtime validation for payment order creation and signature verification.
 * ============================================================================
 */

import { z } from "zod";

export const createPaymentOrderSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  razorpayOrderId: z.string().trim().min(1, "Razorpay order ID is required"),
  razorpayPaymentId: z.string().trim().min(1, "Razorpay payment ID is required"),
  razorpaySignature: z.string().trim().min(1, "Razorpay signature is required"),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
});
