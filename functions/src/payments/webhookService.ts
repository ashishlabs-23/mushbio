/**
 * ============================================================================
 * MUSHBIO RAZORPAY WEBHOOK PROCESSING ENGINE (PHASE 11)
 *
 * Implements server-side cryptographic signature verification against raw bytes,
 * strict event-level idempotency via paymentEvents/{providerEventId},
 * authoritative order/payment cross-checks (integer paise INR amounts, order IDs),
 * controlled state machine transitions, inventory & coupon consistency,
 * refund handling, and complete audit logging.
 * ============================================================================
 */

import { Timestamp } from "firebase-admin/firestore";
import { PaymentEventRepository, paymentEventRepository } from "./eventRepository";
import { PaymentRepository, paymentRepository } from "./repository";
import { OrderRepository, orderRepository } from "../orders/repository";
import { OrderStatusService, orderStatusService } from "../orders/statusService";
import { IRazorpayAdapter, razorpayAdapter, verifyRazorpayWebhookSignature } from "./razorpay";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { safeLogger } from "../utils/logger";
import { AdminAuditLogDocument, PaymentEventDocument, OrderPaymentDocument } from "../types";


export interface WebhookProcessingResult {
  status: "processed" | "idempotent_duplicate" | "ignored" | "rejected";
  providerEventId: string;
  eventType: string;
  orderId?: string;
  message: string;
}

export class WebhookService {
  constructor(
    private eventRepo: PaymentEventRepository = paymentEventRepository,
    private paymentRepo: PaymentRepository = paymentRepository,
    private orderRepo: OrderRepository = orderRepository,
    private statusService: OrderStatusService = orderStatusService,
    private rzpAdapter: IRazorpayAdapter = razorpayAdapter
  ) {}

  /**
   * Main entry point for ingesting and processing Razorpay webhooks
   *
   * @param rawBody - Exact unmodified byte buffer or string received in HTTP request
   * @param signatureHeader - Value of x-razorpay-signature header
   * @param parsedPayload - JSON payload of the webhook event
   */
  async processWebhook(
    rawBody: string | Buffer,
    signatureHeader: string,
    parsedPayload: any
  ): Promise<WebhookProcessingResult> {
    // 1. Validate inputs
    if (!rawBody || !signatureHeader) {
      throw new BadRequestError("Missing webhook payload or signature header", "WEBHOOK_SIGNATURE_MISSING");
    }

    // 2. Cryptographic HMAC-SHA256 Signature Verification
    const webhookSecret = this.rzpAdapter.getWebhookSecret();
    const isSignatureValid = verifyRazorpayWebhookSignature(rawBody, signatureHeader, webhookSecret);

    if (!isSignatureValid) {
      safeLogger.warn("payment_webhook_signature_invalid", {
        hasSignature: Boolean(signatureHeader),
      });

      // Record security audit log for invalid signature attempts
      const auditLog: AdminAuditLogDocument = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUid: "system_webhook",
        action: "PAYMENT_SIGNATURE_INVALID",
        resourceType: "payment",
        resourceId: parsedPayload?.event_id || "unknown_event",
        metadata: {
          eventType: parsedPayload?.event || "unknown",
        },
        createdAt: Timestamp.now(),
      };
      await this.eventRepo.recordAuditLog(auditLog).catch((e) => safeLogger.error("Failed to log audit", e));

      throw new BadRequestError("Invalid webhook signature verification failed", "PAYMENT_SIGNATURE_INVALID");
    }

    // 3. Extract and validate event identity
    const eventType: string = parsedPayload?.event || "";
    // Razorpay standard: x-razorpay-event-id or payload.event_id
    const providerEventId: string = parsedPayload?.event_id || parsedPayload?.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    if (!eventType) {
      throw new BadRequestError("Malformed webhook payload: missing event type", "WEBHOOK_MALFORMED");
    }

    // 4. Idempotency Gate (paymentEvents/{providerEventId})
    const existingEvent = await this.eventRepo.getEventByProviderEventId(providerEventId);
    if (existingEvent && (existingEvent.status === "PROCESSED" || existingEvent.status === "DUPLICATE")) {
      safeLogger.info("payment_webhook_duplicate", { providerEventId, eventType });

      // Record duplicate audit log
      const auditLog: AdminAuditLogDocument = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUid: "system_webhook",
        action: "PAYMENT_WEBHOOK_DUPLICATE",
        resourceType: "paymentEvents",
        resourceId: providerEventId,
        metadata: { eventType, orderId: existingEvent.orderId },
        createdAt: Timestamp.now(),
      };
      await this.eventRepo.recordAuditLog(auditLog).catch((e) => safeLogger.error("Failed to log audit", e));

      return {
        status: "idempotent_duplicate",
        providerEventId,
        eventType,
        orderId: existingEvent.orderId,
        message: "Webhook event already processed previously (idempotent no-op)",
      };
    }

    // Record initial receipt in paymentEvents ledger
    const now = Timestamp.now();
    const eventRecord: PaymentEventDocument = {
      id: providerEventId,
      provider: "RAZORPAY",
      eventType,
      providerEventId,
      status: "RECEIVED",
      processingAttempts: 1,
      receivedAt: now,
    };
    await this.eventRepo.createEvent(eventRecord);

    // 5. Extract entity data from webhook structure
    const payloadEntity = parsedPayload?.payload;
    const paymentEntity = payloadEntity?.payment?.entity;
    const orderEntity = payloadEntity?.order?.entity;
    const refundEntity = payloadEntity?.refund?.entity;

    // Resolve orderId from notes or entity references
    const orderId =
      paymentEntity?.notes?.orderId ||
      orderEntity?.notes?.orderId ||
      refundEntity?.notes?.orderId;

    if (orderId) {
      await this.eventRepo.updateEvent(providerEventId, { orderId });
    }

    try {
      // 6. Route and Process Supported Events
      switch (eventType) {
        case "payment.captured":
        case "order.paid": {
          await this.handlePaymentCaptured(orderId, paymentEntity, providerEventId);
          break;
        }

        case "payment.authorized": {
          await this.handlePaymentAuthorized(orderId, paymentEntity, providerEventId);
          break;
        }

        case "payment.failed": {
          await this.handlePaymentFailed(orderId, paymentEntity, providerEventId);
          break;
        }

        case "refund.created":
        case "refund.processed": {
          await this.handleRefundProcessed(orderId, refundEntity, paymentEntity, providerEventId);
          break;
        }

        case "refund.failed": {
          await this.handleRefundFailed(orderId, refundEntity, providerEventId);
          break;
        }

        default: {
          // Unsupported or informational event
          safeLogger.info("payment_webhook_ignored", { eventType, providerEventId });
          await this.eventRepo.updateEvent(providerEventId, {
            status: "PROCESSED",
            processedAt: Timestamp.now(),
          });
          return {
            status: "ignored",
            providerEventId,
            eventType,
            orderId,
            message: `Event '${eventType}' acknowledged without internal action`,
          };
        }
      }

      // Mark event as PROCESSED
      await this.eventRepo.updateEvent(providerEventId, {
        status: "PROCESSED",
        processedAt: Timestamp.now(),
      });

      // Record successful processing audit log
      const auditLog: AdminAuditLogDocument = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUid: "system_webhook",
        action: "PAYMENT_WEBHOOK_PROCESSED",
        resourceType: "order",
        resourceId: orderId || providerEventId,
        metadata: { eventType, providerEventId },
        createdAt: Timestamp.now(),
      };
      await this.eventRepo.recordAuditLog(auditLog).catch((e) => safeLogger.error("Failed to log audit", e));

      return {
        status: "processed",
        providerEventId,
        eventType,
        orderId,
        message: `Event '${eventType}' processed successfully`,
      };
    } catch (err: any) {
      safeLogger.error("payment_webhook_processing_failed", {
        providerEventId,
        eventType,
        error: err?.message || String(err),
      });

      await this.eventRepo.updateEvent(providerEventId, {
        status: "FAILED",
        errorCode: err?.code || "PROCESSING_ERROR",
        errorMessage: err?.message || "Error during event processing",
      });

      throw err;
    }
  }

  /**
   * Handle payment.captured / order.paid
   */
  private async handlePaymentCaptured(
    orderId: string | undefined,
    paymentEntity: any,
    providerEventId: string
  ): Promise<void> {
    if (!orderId) {
      throw new BadRequestError("Webhook missing orderId in payment notes", "PAYMENT_ORDER_ID_MISSING");
    }

    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "PAYMENT_ORDER_NOT_FOUND");
    }

    // 1. Authoritative Currency Verification (strictly "INR")
    const providerCurrency = (paymentEntity?.currency || "INR").toUpperCase();
    if (providerCurrency !== "INR" || order.currency !== "INR") {
      const auditLog: AdminAuditLogDocument = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUid: "system_webhook",
        action: "PAYMENT_CURRENCY_MISMATCH",
        resourceType: "order",
        resourceId: orderId,
        metadata: { expected: "INR", received: providerCurrency, providerEventId },
        createdAt: Timestamp.now(),
      };
      await this.eventRepo.recordAuditLog(auditLog);
      throw new BadRequestError(`Currency mismatch: expected INR, received ${providerCurrency}`, "PAYMENT_CURRENCY_MISMATCH");
    }

    // 2. Authoritative Amount Verification (Integer Paise)
    const providerAmount = Number(paymentEntity?.amount);
    if (providerAmount !== order.total) {
      const auditLog: AdminAuditLogDocument = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUid: "system_webhook",
        action: "PAYMENT_AMOUNT_MISMATCH",
        resourceType: "order",
        resourceId: orderId,
        metadata: { expectedTotal: order.total, receivedAmount: providerAmount, providerEventId },
        createdAt: Timestamp.now(),
      };
      await this.eventRepo.recordAuditLog(auditLog);
      throw new BadRequestError(
        `Payment amount mismatch: expected ${order.total} paise, received ${providerAmount} paise`,
        "PAYMENT_AMOUNT_MISMATCH"
      );
    }

    // 3. Provider Order ID Verification
    const providerOrderId = paymentEntity?.order_id;
    let paymentDoc = providerOrderId
      ? await this.paymentRepo.findPaymentByProviderOrderId(orderId, providerOrderId)
      : null;

    if (!paymentDoc) {
      paymentDoc = await this.paymentRepo.findLatestPaymentByOrder(orderId);
    }

    if (providerOrderId && paymentDoc && paymentDoc.providerOrderId && paymentDoc.providerOrderId !== providerOrderId) {
      throw new BadRequestError("Provider order ID mismatch", "PAYMENT_ORDER_MISMATCH");
    }

    // 4. Update or Create Payment Record
    const providerPaymentId = paymentEntity?.id;
    const now = Timestamp.now();

    if (paymentDoc) {
      await this.paymentRepo.updatePaymentRecord(orderId, paymentDoc.id, {
        status: "PAID",
        providerPaymentId: providerPaymentId || paymentDoc.providerPaymentId,
        method: paymentEntity?.method,
      });
    } else {
      // If no pre-existing attempt record, create one
      const newPaymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newPayment: OrderPaymentDocument = {
        id: newPaymentId,
        provider: "RAZORPAY",
        providerOrderId,
        providerPaymentId,
        status: "PAID",
        amount: order.total,
        currency: "INR",
        method: paymentEntity?.method,
        createdAt: now,
        updatedAt: now,
      };
      await this.paymentRepo.createPaymentRecord(orderId, newPayment);
    }

    // 5. Order State Machine Transition: Only transition if not already PAID or advanced state
    if (order.status === "PAYMENT_PENDING" || order.status === "PENDING") {
      // Transition to PAID
      // Note: Inventory was reserved during order creation — DO NOT double-reserve
      await this.statusService.transitionStatus(
        "system_webhook",
        orderId,
        "PAID",
        `Payment captured via Razorpay Webhook [${providerEventId}]`
      );
    } else if (order.status === "PAID" || order.status === "CONFIRMED" || order.status === "PROCESSING" || order.status === "PACKED" || order.status === "SHIPPED" || order.status === "DELIVERED") {
      // Order is already PAID or further in fulfillment lifecycle — no-op state transition (idempotent)
      safeLogger.info("order_already_paid_or_advanced", { orderId, currentStatus: order.status });
    } else {
      // If order was in CANCELLED/REFUNDED state, flag for review rather than blindly moving to PAID
      const auditLog: AdminAuditLogDocument = {
        id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUid: "system_webhook",
        action: "PAYMENT_RECONCILIATION_REQUIRED",
        resourceType: "order",
        resourceId: orderId,
        metadata: {
          reason: `Captured payment received for order in '${order.status}' status`,
          providerEventId,
          providerPaymentId,
        },
        createdAt: Timestamp.now(),
      };
      await this.eventRepo.recordAuditLog(auditLog);
    }
  }

  /**
   * Handle payment.authorized
   */
  private async handlePaymentAuthorized(
    orderId: string | undefined,
    paymentEntity: any,
    _providerEventId: string
  ): Promise<void> {
    if (!orderId) return;

    const providerOrderId = paymentEntity?.order_id;
    const paymentDoc = providerOrderId
      ? await this.paymentRepo.findPaymentByProviderOrderId(orderId, providerOrderId)
      : await this.paymentRepo.findLatestPaymentByOrder(orderId);

    if (paymentDoc && paymentDoc.status === "PENDING") {
      await this.paymentRepo.updatePaymentRecord(orderId, paymentDoc.id, {
        status: "AUTHORIZED",
        providerPaymentId: paymentEntity?.id,
        method: paymentEntity?.method,
      });
    }
  }

  /**
   * Handle payment.failed
   */
  private async handlePaymentFailed(
    orderId: string | undefined,
    paymentEntity: any,
    _providerEventId: string
  ): Promise<void> {
    if (!orderId) return;

    const providerOrderId = paymentEntity?.order_id;
    const paymentDoc = providerOrderId
      ? await this.paymentRepo.findPaymentByProviderOrderId(orderId, providerOrderId)
      : await this.paymentRepo.findLatestPaymentByOrder(orderId);

    const errorCode = paymentEntity?.error_code || "PAYMENT_FAILED";
    const errorDesc = paymentEntity?.error_description || "Payment attempt failed or was declined";

    if (paymentDoc && paymentDoc.status !== "PAID") {
      await this.paymentRepo.updatePaymentRecord(orderId, paymentDoc.id, {
        status: "FAILED",
        errorCode,
        errorDescription: errorDesc,
        providerPaymentId: paymentEntity?.id,
      });
    }

    // Preserve payment history. Do not automatically cancel order if user is actively retrying,
    // but record audit trail.
    const auditLog: AdminAuditLogDocument = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUid: "system_webhook",
      action: "ADMIN_UPDATED_ORDER",
      resourceType: "order",
      resourceId: orderId,
      metadata: { event: "payment.failed", errorCode, errorDesc },
      createdAt: Timestamp.now(),
    };
    await this.eventRepo.recordAuditLog(auditLog).catch((e) => safeLogger.error("Failed to log audit", e));
  }

  /**
   * Handle refund.created / refund.processed
   */
  private async handleRefundProcessed(
    orderId: string | undefined,
    refundEntity: any,
    paymentEntity: any,
    providerEventId: string
  ): Promise<void> {
    if (!orderId) return;

    const order = await this.orderRepo.getOrderById(orderId);
    if (!order) return;

    const refundId = refundEntity?.id;
    const refundAmount = Number(refundEntity?.amount || 0); // integer paise
    const isFullRefund = refundAmount >= order.total;

    // Find payment attempt
    const providerPaymentId = refundEntity?.payment_id || paymentEntity?.id;
    const payments = await this.paymentRepo.getPaymentsByOrder(orderId);
    const targetPayment = payments.find((p) => p.providerPaymentId === providerPaymentId) || payments[0];

    if (targetPayment) {
      await this.paymentRepo.updatePaymentRecord(orderId, targetPayment.id, {
        status: isFullRefund ? "REFUNDED" : "PARTIALLY_REFUNDED",
        refundId,
        refundAmount,
        refundStatus: "processed",
      });
    }

    // State machine update on full refund
    if (isFullRefund && order.status !== "REFUNDED") {
      await this.statusService.transitionStatus(
        "system_webhook",
        orderId,
        "REFUNDED",
        `Full refund processed via Razorpay [${refundId}]`
      );
    } else if (!isFullRefund) {
      // Partial refund: update payment status while keeping order flow intact
      await this.orderRepo.updateOrder(orderId, {
        paymentStatus: "PARTIALLY_REFUNDED",
        updatedAt: Timestamp.now(),
      });
    }

    // Record refund audit log
    const auditLog: AdminAuditLogDocument = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUid: "system_webhook",
      action: "PAYMENT_REFUND_PROCESSED",
      resourceType: "order",
      resourceId: orderId,
      metadata: { refundId, refundAmount, isFullRefund, providerEventId },
      createdAt: Timestamp.now(),
    };
    await this.eventRepo.recordAuditLog(auditLog);
  }

  /**
   * Handle refund.failed
   */
  private async handleRefundFailed(
    orderId: string | undefined,
    refundEntity: any,
    providerEventId: string
  ): Promise<void> {
    if (!orderId) return;

    const refundId = refundEntity?.id;
    const auditLog: AdminAuditLogDocument = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUid: "system_webhook",
      action: "PAYMENT_RECONCILIATION_REQUIRED",
      resourceType: "order",
      resourceId: orderId,
      metadata: {
        reason: `Refund attempt failed on provider side: ${refundEntity?.error_description || "Provider error"}`,
        refundId,
        providerEventId,
      },
      createdAt: Timestamp.now(),
    };
    await this.eventRepo.recordAuditLog(auditLog);
  }
}

export const webhookService = new WebhookService();
