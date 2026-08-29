/**
 * ============================================================================
 * MUSHBIO PAYMENT EVENTS REPOSITORY (PHASE 11)
 *
 * Manages the paymentEvents/{eventId} collection used for Webhook Idempotency,
 * audit verification, and reconciliation ledgers.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { PaymentEventDocument, AdminAuditLogDocument } from "../types";
import { Transaction } from "firebase-admin/firestore";


export class PaymentEventRepository {
  private eventsCol = db.collection("paymentEvents");
  private auditCol = db.collection("adminAuditLogs");

  getEventRef(providerEventId: string) {
    return this.eventsCol.doc(providerEventId);
  }

  async getEventByProviderEventId(providerEventId: string): Promise<PaymentEventDocument | null> {
    const snap = await this.eventsCol.doc(providerEventId).get();
    if (!snap.exists) return null;
    return snap.data() as PaymentEventDocument;
  }

  async createEvent(event: PaymentEventDocument): Promise<void> {
    await this.eventsCol.doc(event.providerEventId).set(event);
  }

  async updateEvent(providerEventId: string, updates: Partial<PaymentEventDocument>): Promise<void> {
    await this.eventsCol.doc(providerEventId).update(updates);
  }

  async runTransaction<T>(updateFunction: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }

  async recordAuditLog(log: AdminAuditLogDocument): Promise<void> {
    await this.auditCol.doc(log.id).set(log);
  }
}

export const paymentEventRepository = new PaymentEventRepository();
