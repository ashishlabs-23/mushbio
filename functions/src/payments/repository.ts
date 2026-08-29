/**
 * ============================================================================
 * MUSHBIO PAYMENT REPOSITORY (PHASE 10)
 *
 * Direct database access for the orders/{orderId}/payments/{paymentId}
 * subcollection.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { OrderPaymentDocument } from "../types";
import { Timestamp, QueryDocumentSnapshot } from "firebase-admin/firestore";

export class PaymentRepository {
  private getPaymentsSubcollection(orderId: string) {
    return db.collection("orders").doc(orderId).collection("payments");
  }

  async createPaymentRecord(orderId: string, payment: OrderPaymentDocument): Promise<void> {
    await this.getPaymentsSubcollection(orderId).doc(payment.id).set(payment);
  }

  async getPaymentById(orderId: string, paymentId: string): Promise<OrderPaymentDocument | null> {
    const snap = await this.getPaymentsSubcollection(orderId).doc(paymentId).get();
    if (!snap.exists) return null;
    return snap.data() as OrderPaymentDocument;
  }

  async getPaymentsByOrder(orderId: string): Promise<OrderPaymentDocument[]> {
    const snap = await this.getPaymentsSubcollection(orderId).orderBy("createdAt", "desc").get();
    return snap.docs.map((doc: QueryDocumentSnapshot) => doc.data() as OrderPaymentDocument);
  }

  async findPaymentByProviderOrderId(
    orderId: string,
    providerOrderId: string
  ): Promise<OrderPaymentDocument | null> {
    const snap = await this.getPaymentsSubcollection(orderId)
      .where("providerOrderId", "==", providerOrderId)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as OrderPaymentDocument;
  }

  async findLatestPaymentByOrder(orderId: string): Promise<OrderPaymentDocument | null> {
    const snap = await this.getPaymentsSubcollection(orderId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as OrderPaymentDocument;
  }

  async updatePaymentRecord(
    orderId: string,
    paymentId: string,
    fields: Partial<OrderPaymentDocument>
  ): Promise<void> {
    const updates: Partial<OrderPaymentDocument> & { updatedAt: Timestamp } = {
      ...fields,
      updatedAt: Timestamp.now(),
    };
    await this.getPaymentsSubcollection(orderId).doc(paymentId).update(updates);
  }
}

export const paymentRepository = new PaymentRepository();
