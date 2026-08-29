/**
 * ============================================================================
 * MUSHBIO PAYMENT SERVICE (PHASE 10)
 *
 * Authoritative business logic for Razorpay payment order generation,
 * cryptographic signature verification, payment state transitions,
 * idempotency, and retry handling.
 * All monetary operations use integer Paise (minor units) with currency "INR".
 * ============================================================================
 */

import { OrderRepository, orderRepository } from "../orders/repository";
import { OrderStatusService, orderStatusService } from "../orders/statusService";
import { PaymentRepository, paymentRepository } from "./repository";
import { IRazorpayAdapter, razorpayAdapter, verifyRazorpaySignature } from "./razorpay";
import {
  RazorpayCheckoutDataDto,
  VerifyPaymentDto,
  PaymentVerificationResultDto,
  PaymentRecordDto,
} from "./dto";
import { OrderPaymentDocument } from "../types";
import { BadRequestError, NotFoundError, ForbiddenError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository = paymentRepository,
    private orderRepo: OrderRepository = orderRepository,
    private statusService: OrderStatusService = orderStatusService,
    private rzpAdapter: IRazorpayAdapter = razorpayAdapter
  ) {}

  /**
   * Create Razorpay payment order for an authenticated customer's pending order
   */
  async createPaymentOrder(userId: string, orderId: string): Promise<RazorpayCheckoutDataDto> {
    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "PAYMENT_ORDER_NOT_FOUND");
    }

    // 1. Verify order ownership
    if (order.userId !== userId) {
      throw new ForbiddenError(
        "You do not have permission to pay for this order",
        "FORBIDDEN"
      );
    }

    // 2. Prevent payment on already-paid orders
    if (order.status === "PAID" || order.paymentStatus === "PAID") {
      throw new BadRequestError("This order has already been paid", "PAYMENT_ALREADY_PAID");
    }

    // 3. Verify order status is PAYMENT_PENDING or PENDING
    if (order.status !== "PAYMENT_PENDING" && order.status !== "PENDING") {
      throw new BadRequestError(
        `Payment is not permitted for order in '${order.status}' status`,
        "PAYMENT_NOT_ALLOWED"
      );
    }

    // 4. Verify currency is strictly "INR"
    if (order.currency !== "INR") {
      throw new BadRequestError(
        `Invalid currency '${order.currency}'. Payments must be in INR`,
        "PAYMENT_CURRENCY_MISMATCH"
      );
    }

    // 5. Authoritative amount verification against calculation formula
    const expectedSubtotalAfterDiscount = Math.max(0, order.subtotal - order.discount);
    const expectedTotal = expectedSubtotalAfterDiscount + order.shipping + order.tax;

    if (order.total !== expectedTotal || order.total <= 0) {
      throw new BadRequestError(
        `Authoritative order amount calculation mismatch (Expected: ${expectedTotal}, Recorded: ${order.total})`,
        "ORDER_AMOUNT_INCONSISTENT"
      );
    }

    // 6. Idempotency Check: Return existing active Razorpay provider order if present
    const latestPayment = await this.paymentRepo.findLatestPaymentByOrder(orderId);
    if (
      latestPayment &&
      (latestPayment.status === "PENDING" || latestPayment.status === "AUTHORIZED") &&
      latestPayment.providerOrderId &&
      latestPayment.amount === order.total
    ) {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: latestPayment.providerOrderId,
        razorpayKeyId: this.rzpAdapter.getKeyId(),
        amount: order.total,
        currency: "INR",
        name: "MushBio",
        description: `MushBio Order ${order.orderNumber}`,
        prefill: {
          name: order.customerName,
          email: order.customerEmail,
          contact: order.customerPhone,
        },
        notes: {
          orderId: order.id,
          orderNumber: order.orderNumber,
        },
      };
    }

    // 7. Create Razorpay order via adapter
    const receipt = `mushbio_${order.orderNumber}`.substring(0, 40);
    const rzpOrder = await this.rzpAdapter.createOrder({
      amount: order.total,
      currency: "INR",
      receipt,
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
      },
    });

    // 8. Persist payment attempt in orders/{orderId}/payments/{paymentId}
    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Timestamp.now();

    const paymentRecord: OrderPaymentDocument = {
      id: paymentId,
      provider: "RAZORPAY",
      providerOrderId: rzpOrder.id,
      status: "PENDING", // PENDING = payment order created, awaiting user action
      amount: order.total,
      currency: "INR",
      createdAt: now,
      updatedAt: now,
    };

    await this.paymentRepo.createPaymentRecord(orderId, paymentRecord);

    // 9. Return safe checkout payload (no secrets)
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: rzpOrder.id,
      razorpayKeyId: this.rzpAdapter.getKeyId(),
      amount: order.total,
      currency: "INR",
      name: "MushBio",
      description: `MushBio Order ${order.orderNumber}`,
      prefill: {
        name: order.customerName,
        email: order.customerEmail,
        contact: order.customerPhone,
      },
      notes: {
        orderId: order.id,
        orderNumber: order.orderNumber,
      },
    };
  }

  /**
   * Verify Razorpay payment signature and transition order to PAID
   */
  async verifyPayment(
    userId: string,
    payload: VerifyPaymentDto
  ): Promise<PaymentVerificationResultDto> {
    const order = await this.orderRepo.getOrderById(payload.orderId);
    if (!order) {
      throw new NotFoundError(`Order '${payload.orderId}' not found`, "PAYMENT_ORDER_NOT_FOUND");
    }

    // 1. Verify order ownership
    if (order.userId !== userId) {
      throw new ForbiddenError(
        "You do not have permission to verify payment for this order",
        "FORBIDDEN"
      );
    }

    // 2. Idempotent Success: If already PAID, return success
    if (order.status === "PAID" && order.paymentStatus === "PAID") {
      return {
        success: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentStatus: "PAID",
        orderStatus: "PAID",
        providerPaymentId: payload.razorpayPaymentId,
        amount: order.total,
        currency: "INR",
        message: "Payment already verified successfully",
      };
    }

    // 3. Find payment attempt by providerOrderId
    let paymentDoc = await this.paymentRepo.findPaymentByProviderOrderId(
      payload.orderId,
      payload.razorpayOrderId
    );

    if (!paymentDoc) {
      paymentDoc = await this.paymentRepo.findLatestPaymentByOrder(payload.orderId);
    }

    if (!paymentDoc || paymentDoc.providerOrderId !== payload.razorpayOrderId) {
      throw new BadRequestError(
        "Payment attempt record does not match the provided Razorpay order ID",
        "PAYMENT_ORDER_MISMATCH"
      );
    }

    // 4. Server-Side Cryptographic Signature Verification
    const isValidSignature = verifyRazorpaySignature(
      payload.razorpayOrderId,
      payload.razorpayPaymentId,
      payload.razorpaySignature,
      this.rzpAdapter.getKeySecret()
    );

    if (!isValidSignature) {
      // Record failure on payment attempt
      await this.paymentRepo.updatePaymentRecord(payload.orderId, paymentDoc.id, {
        status: "FAILED",
        errorCode: "PAYMENT_SIGNATURE_INVALID",
        errorDescription: "HMAC-SHA256 signature verification failed",
      });

      throw new BadRequestError(
        "Invalid payment signature verification failed",
        "PAYMENT_SIGNATURE_INVALID"
      );
    }

    // 5. Update Payment Record to PAID (captured)
    await this.paymentRepo.updatePaymentRecord(payload.orderId, paymentDoc.id, {
      status: "PAID",
      providerPaymentId: payload.razorpayPaymentId,
      providerSignature: payload.razorpaySignature,
    });

    // 6. Transition Order Status to PAID via OrderStatusService
    // (Note: Inventory was already reserved during order placement - DO NOT double reserve)
    await this.statusService.transitionStatus(
      userId,
      payload.orderId,
      "PAID",
      `Payment verified via Razorpay ID: ${payload.razorpayPaymentId}`
    );

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentStatus: "PAID",
      orderStatus: "PAID",
      providerPaymentId: payload.razorpayPaymentId,
      amount: order.total,
      currency: "INR",
      message: "Payment successfully verified and order marked as PAID",
    };
  }

  /**
   * Get safe payment history for an order
   */
  async getOrderPayments(userId: string, orderId: string): Promise<PaymentRecordDto[]> {
    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "PAYMENT_ORDER_NOT_FOUND");
    }

    if (order.userId !== userId) {
      throw new ForbiddenError("You do not have access to these payment records", "FORBIDDEN");
    }

    const records = await this.paymentRepo.getPaymentsByOrder(orderId);
    return records.map((p) => ({
      id: p.id,
      orderId,
      provider: p.provider,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
      createdAt: p.createdAt instanceof Timestamp ? p.createdAt.toDate().toISOString() : new Date().toISOString(),
      updatedAt: p.updatedAt instanceof Timestamp ? p.updatedAt.toDate().toISOString() : new Date().toISOString(),
    }));
  }

  // --- Internal methods prepared for Phase 11 Webhook Reconciliation ---
  async markPaymentCaptured(orderId: string, paymentId: string, providerPaymentId: string): Promise<void> {
    await this.paymentRepo.updatePaymentRecord(orderId, paymentId, {
      status: "PAID",
      providerPaymentId,
    });
  }

  async markPaymentFailed(orderId: string, paymentId: string, reason: string): Promise<void> {
    await this.paymentRepo.updatePaymentRecord(orderId, paymentId, {
      status: "FAILED",
      errorDescription: reason,
    });
  }

  async markPaymentRefunded(orderId: string, paymentId: string): Promise<void> {
    await this.paymentRepo.updatePaymentRecord(orderId, paymentId, {
      status: "REFUNDED",
    });
  }
}

export const paymentService = new PaymentService();
