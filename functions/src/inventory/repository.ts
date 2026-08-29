/**
 * ============================================================================
 * MUSHBIO INVENTORY FIRESTORE REPOSITORY (PHASE 04)
 *
 * Provides transactional mutations and ledger logging for:
 *   - inventory/{variantId}
 *   - inventoryMovements/{movementId}
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import {
  InventoryDocument,
  InventoryMovementDocument,
  InventoryMovementType,
} from "../types";
import { Timestamp, Transaction } from "firebase-admin/firestore";

export class InventoryRepository {
  private inventoryCol = db.collection("inventory");
  private movementsCol = db.collection("inventoryMovements");

  getInventoryRef(variantId: string) {
    return this.inventoryCol.doc(variantId);
  }

  getMovementRef(movementId?: string) {
    return movementId ? this.movementsCol.doc(movementId) : this.movementsCol.doc();
  }

  /**
   * Read single inventory document by variantId
   */
  async getInventoryByVariantId(variantId: string): Promise<InventoryDocument | null> {
    const docSnap = await this.inventoryCol.doc(variantId).get();
    if (!docSnap.exists) return null;
    return docSnap.data() as InventoryDocument;
  }

  /**
   * Batch read multiple inventory documents
   */
  async getInventoryByVariantIds(variantIds: string[]): Promise<Map<string, InventoryDocument>> {
    const map = new Map<string, InventoryDocument>();
    if (variantIds.length === 0) return map;

    const refs = variantIds.map((id) => this.inventoryCol.doc(id));
    const snapshots = await db.getAll(...refs);

    for (const snap of snapshots) {
      if (snap.exists) {
        const data = snap.data() as InventoryDocument;
        map.set(snap.id, data);
      }
    }
    return map;
  }

  /**
   * Find existing movement for idempotency check
   */
  async findMovementByReference(
    variantId: string,
    type: InventoryMovementType,
    referenceId: string
  ): Promise<InventoryMovementDocument | null> {
    const snapshot = await this.movementsCol
      .where("variantId", "==", variantId)
      .where("type", "==", type)
      .where("referenceId", "==", referenceId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      ...(doc.data() as InventoryMovementDocument),
      id: doc.id,
    };
  }

  /**
   * Fetch movement audit history for a variant (Staff/Admin only)
   */
  async getMovementsByVariantId(
    variantId: string,
    limitCount = 50
  ): Promise<InventoryMovementDocument[]> {
    const snapshot = await this.movementsCol
      .where("variantId", "==", variantId)
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();

    return snapshot.docs.map((doc) => ({
      ...(doc.data() as InventoryMovementDocument),
      id: doc.id,
    }));
  }

  /**
   * Run atomic transaction
   */
  async runTransaction<T>(updateFunction: (tx: Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }

  /**
   * Helper to write movement inside an active transaction
   */
  recordMovementInTx(
    tx: Transaction,
    movement: Omit<InventoryMovementDocument, "id" | "createdAt">
  ): InventoryMovementDocument {
    const movementRef = this.movementsCol.doc();
    const fullMovement: InventoryMovementDocument = {
      ...movement,
      id: movementRef.id,
      createdAt: Timestamp.now(),
    };
    tx.set(movementRef, fullMovement);
    return fullMovement;
  }
}

export const inventoryRepository = new InventoryRepository();
