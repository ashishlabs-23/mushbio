/**
 * ============================================================================
 * MUSHBIO ORDER FIRESTORE REPOSITORY (PHASE 08)
 *
 * Database operations for orders, immutable items subcollection, and audit logs.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { OrderDocument, OrderItemDocument, AdminAuditLogDocument } from "../types";
import { DocumentReference, Query } from "firebase-admin/firestore";

export interface PaginatedOrderDocs {
  orders: OrderDocument[];
  hasMore: boolean;
  lastDocId?: string;
}

export class OrderRepository {
  private ordersCol = db.collection("orders");
  private auditCol = db.collection("adminAuditLogs");

  getOrderRef(orderId: string): DocumentReference {
    return this.ordersCol.doc(orderId);
  }

  getItemRef(orderId: string, itemId: string): DocumentReference {
    return this.ordersCol.doc(orderId).collection("items").doc(itemId);
  }

  /**
   * Atomically persist order document and its immutable items subcollection
   */
  async createOrder(order: OrderDocument, items: OrderItemDocument[]): Promise<void> {
    const batch = db.batch();

    // 1. Order Root Document
    batch.set(this.ordersCol.doc(order.id), order);

    // 2. Order Item Subcollection Documents
    const itemsCol = this.ordersCol.doc(order.id).collection("items");
    for (const item of items) {
      batch.set(itemsCol.doc(item.id), item);
    }

    await batch.commit();
  }

  /**
   * Get order by document ID
   */
  async getOrderById(orderId: string): Promise<OrderDocument | null> {
    const snap = await this.ordersCol.doc(orderId).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as OrderDocument), id: snap.id };
  }

  /**
   * Get order by human-facing orderNumber
   */
  async getOrderByNumber(orderNumber: string): Promise<OrderDocument | null> {
    const snap = await this.ordersCol
      .where("orderNumber", "==", orderNumber)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as OrderDocument), id: snap.docs[0].id };
  }

  /**
   * Idempotency lookup by userId and idempotencyKey
   */
  async getOrderByIdempotencyKey(userId: string, idempotencyKey: string): Promise<OrderDocument | null> {
    const snap = await this.ordersCol
      .where("userId", "==", userId)
      .where("idempotencyKey", "==", idempotencyKey)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as OrderDocument), id: snap.docs[0].id };
  }

  /**
   * Get all items in an order
   */
  async getOrderItems(orderId: string): Promise<OrderItemDocument[]> {
    const snap = await this.ordersCol.doc(orderId).collection("items").get();
    return snap.docs.map((doc) => ({ ...(doc.data() as OrderItemDocument), id: doc.id }));
  }

  /**
   * List orders for a user with cursor pagination
   */
  async listUserOrders(
    userId: string,
    pageSize: number,
    cursorDocId?: string
  ): Promise<PaginatedOrderDocs> {
    let query: Query = this.ordersCol
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(pageSize + 1);

    if (cursorDocId) {
      const cursorSnap = await this.ordersCol.doc(cursorDocId).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > pageSize;
    const resultDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;

    const orders = resultDocs.map((doc) => ({
      ...(doc.data() as OrderDocument),
      id: doc.id,
    }));

    const lastDocId = resultDocs.length > 0 ? resultDocs[resultDocs.length - 1].id : undefined;

    return {
      orders,
      hasMore,
      lastDocId,
    };
  }

  /**
   * Update order fields (e.g. status, paymentStatus)
   */
  async updateOrder(orderId: string, fields: Partial<OrderDocument>): Promise<void> {
    await this.ordersCol.doc(orderId).update(fields);
  }

  /**
   * Record admin/server audit trail log
   */
  async recordAuditLog(log: AdminAuditLogDocument): Promise<void> {
    await this.auditCol.doc(log.id).set(log);
  }

  /**
   * Run Firestore transaction
   */
  async runTransaction<T>(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }
}

export const orderRepository = new OrderRepository();
