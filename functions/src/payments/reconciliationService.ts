/**
 * ============================================================================
 * MUSHBIO PAYMENT RECONCILIATION SERVICE (PHASE 11)
 *
 * Diagnoses and verifies state consistency across orders, payment records,
 * and webhook events. Returns detailed diagnostics for admin/staff review.
 * ============================================================================
 */

import { OrderRepository, orderRepository } from "../orders/repository";
import { PaymentRepository, paymentRepository } from "./repository";
import { PaymentStatus } from "../types";
import { NotFoundError } from "../utils/errors";

export type ReconciliationStatus =
  | "CONSISTENT"
  | "REQUIRES_REVIEW"
  | "RECOVERABLE"
  | "INVALID";

export interface PaymentReconciliationDto {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  orderPaymentStatus: string;
  totalAmount: number; // integer paise
  currency: string;
  reconciliationStatus: ReconciliationStatus;
  isPaid: boolean;
  paymentAttemptsCount: number;
  latestPaymentAttempt?: {
    id: string;
    provider: string;
    providerOrderId?: string;
    providerPaymentId?: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    method?: string;
    refundId?: string;
    refundAmount?: number;
  };
  discrepancies: string[];
  reconciliationTimestamp: string;
}

export class PaymentReconciliationService {
  constructor(
    private orderRepo: OrderRepository = orderRepository,
    private paymentRepo: PaymentRepository = paymentRepository
  ) {}


  /**
   * Reconcile payment records for a specific order
   */
  async reconcilePayment(orderId: string): Promise<PaymentReconciliationDto> {
    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "ORDER_NOT_FOUND");
    }

    const payments = await this.paymentRepo.getPaymentsByOrder(orderId);
    const discrepancies: string[] = [];
    let status: ReconciliationStatus = "CONSISTENT";

    const hasPaidRecord = payments.some((p) => p.status === "PAID");
    const hasRefundedRecord = payments.some((p) => p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED");
    const latestPayment = payments.length > 0 ? payments[0] : undefined;

    // Check 1: Order marked PAID but no successful payment record found
    if (order.paymentStatus === "PAID" && !hasPaidRecord) {
      discrepancies.push("Order is marked as PAID but no matching PAID record exists in payments subcollection");
      status = "REQUIRES_REVIEW";
    }

    // Check 2: Successful payment record exists but order is still PAYMENT_PENDING (Recoverable via webhook or admin)
    if (hasPaidRecord && (order.status === "PAYMENT_PENDING" || order.paymentStatus === "PENDING")) {
      discrepancies.push("A successful PAID payment attempt exists, but the order status has not transitioned to PAID");
      status = "RECOVERABLE";
    }

    // Check 3: Multiple PAID payment attempts for single order (Double payment detection)
    const paidRecords = payments.filter((p) => p.status === "PAID");
    if (paidRecords.length > 1) {
      discrepancies.push(`Multiple PAID payment attempts detected (${paidRecords.length} records). Possible double charge requires manual review.`);
      status = "REQUIRES_REVIEW";
    }

    // Check 4: Payment amount mismatch on paid records
    for (const p of paidRecords) {
      if (p.amount !== order.total) {
        discrepancies.push(`Paid amount (${p.amount} paise) does not match order total (${order.total} paise)`);
        status = "INVALID";
      }
      if (p.currency !== "INR" || order.currency !== "INR") {
        discrepancies.push(`Currency mismatch: Payment=${p.currency}, Order=${order.currency}`);
        status = "INVALID";
      }
    }

    // Check 5: Refund status consistency
    if (hasRefundedRecord && order.paymentStatus !== "REFUNDED" && order.paymentStatus !== "PARTIALLY_REFUNDED") {
      discrepancies.push("Refund records exist but order payment status does not reflect REFUNDED/PARTIALLY_REFUNDED");
      status = "REQUIRES_REVIEW";
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      orderPaymentStatus: order.paymentStatus,
      totalAmount: order.total,
      currency: order.currency,
      reconciliationStatus: status,
      isPaid: order.paymentStatus === "PAID" || hasPaidRecord,
      paymentAttemptsCount: payments.length,
      latestPaymentAttempt: latestPayment
        ? {
            id: latestPayment.id,
            provider: latestPayment.provider,
            providerOrderId: latestPayment.providerOrderId,
            providerPaymentId: latestPayment.providerPaymentId,
            status: latestPayment.status,
            amount: latestPayment.amount,
            currency: latestPayment.currency,
            method: latestPayment.method,
            refundId: latestPayment.refundId,
            refundAmount: latestPayment.refundAmount,
          }
        : undefined,
      discrepancies,
      reconciliationTimestamp: new Date().toISOString(),
    };
  }
}

export const paymentReconciliationService = new PaymentReconciliationService();
