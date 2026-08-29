/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — AUDIT LOGS & PAYMENT EVENTS (PHASE 02)
 *
 * Collections:
 *   - adminAuditLogs/{logId}
 *   - paymentEvents/{eventId}
 * ============================================================================
 */

import { FirestoreTimestamp } from "./common";

export type AdminAuditAction =
  | "ADMIN_CREATED_PRODUCT"
  | "ADMIN_UPDATED_PRODUCT"
  | "ADMIN_DELETED_PRODUCT"
  | "ADMIN_CHANGED_PRICE"
  | "ADMIN_CHANGED_INVENTORY"
  | "ADMIN_UPDATED_ORDER"
  | "ADMIN_REFUNDED_ORDER"
  | "ADMIN_CHANGED_ROLE"
  | "ADMIN_MODERATED_REVIEW"
  | "ADMIN_CREATED_COUPON"
  | "ADMIN_UPDATED_COUPON"
  | "PAYMENT_WEBHOOK_RECEIVED"
  | "PAYMENT_WEBHOOK_PROCESSED"
  | "PAYMENT_WEBHOOK_DUPLICATE"
  | "PAYMENT_SIGNATURE_INVALID"
  | "PAYMENT_AMOUNT_MISMATCH"
  | "PAYMENT_CURRENCY_MISMATCH"
  | "PAYMENT_RECONCILIATION_REQUIRED"
  | "PAYMENT_REFUND_PROCESSED";

export type PaymentEventStatus =
  | "RECEIVED"
  | "PROCESSED"
  | "FAILED"
  | "DUPLICATE"
  | "PENDING_RECONCILIATION";

export interface AdminAuditLogDocument {
  id: string;
  actorUid: string; // Admin UID or "system_webhook"
  actorEmail?: string;
  action: AdminAuditAction;
  resourceType: string; // e.g. "product", "order", "inventory", "user", "payment"
  resourceId: string;
  previousState?: Record<string, unknown>;
  newState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: FirestoreTimestamp;
}

export interface PaymentEventDocument {
  id: string;
  provider: "RAZORPAY";
  eventType: string; // e.g. "payment.captured", "payment.failed", "refund.processed"
  providerEventId: string; // Razorpay x-razorpay-event-id (enforces webhook idempotency)
  orderId?: string;
  paymentId?: string;
  status: PaymentEventStatus;
  receivedAt: FirestoreTimestamp;
  processedAt?: FirestoreTimestamp;
  processingAttempts?: number;
  errorCode?: string;
  errorMessage?: string;
  payloadSnapshot?: Record<string, unknown>;
}

