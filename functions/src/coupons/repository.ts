/**
 * ============================================================================
 * MUSHBIO COUPON FIRESTORE REPOSITORY (PHASE 09)
 *
 * Handles database operations for coupons, usage counters, and redemptions.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { CouponDocument, CouponRedemptionDocument } from "../types";
import { DocumentReference, FieldValue, Timestamp } from "firebase-admin/firestore";

export class CouponRepository {
  private couponsCol = db.collection("coupons");
  private redemptionsCol = db.collection("couponRedemptions");

  getCouponRef(couponId: string): DocumentReference {
    return this.couponsCol.doc(couponId);
  }

  getRedemptionRef(redemptionId: string): DocumentReference {
    return this.redemptionsCol.doc(redemptionId);
  }

  /**
   * Find coupon by normalized uppercase code
   */
  async getCouponByNormalizedCode(normalizedCode: string): Promise<CouponDocument | null> {
    const snap = await this.couponsCol
      .where("normalizedCode", "==", normalizedCode)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as CouponDocument), id: snap.docs[0].id };
  }

  /**
   * Find coupon by ID
   */
  async getCouponById(couponId: string): Promise<CouponDocument | null> {
    const snap = await this.couponsCol.doc(couponId).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as CouponDocument), id: snap.id };
  }

  /**
   * Get active redemptions count for a specific user and coupon
   */
  async getUserRedemptionsCount(couponId: string, userId: string): Promise<number> {
    const snap = await this.redemptionsCol
      .where("couponId", "==", couponId)
      .where("userId", "==", userId)
      .where("status", "==", "APPLIED")
      .get();

    return snap.size;
  }

  /**
   * Find existing redemption record by orderId
   */
  async findRedemptionByOrder(couponId: string, orderId: string): Promise<CouponRedemptionDocument | null> {
    const snap = await this.redemptionsCol
      .where("couponId", "==", couponId)
      .where("orderId", "==", orderId)
      .limit(1)
      .get();

    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as CouponRedemptionDocument), id: snap.docs[0].id };
  }

  /**
   * Record coupon redemption and increment usage count within transaction
   */
  recordRedemptionInTx(
    tx: FirebaseFirestore.Transaction,
    redemption: CouponRedemptionDocument
  ): void {
    const redmRef = this.redemptionsCol.doc(redemption.id);
    const cpnRef = this.couponsCol.doc(redemption.couponId);

    tx.set(redmRef, redemption);
    tx.update(cpnRef, {
      usageCount: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Release coupon redemption on order cancellation
   */
  async releaseRedemption(couponId: string, orderId: string): Promise<void> {
    const existing = await this.findRedemptionByOrder(couponId, orderId);
    if (!existing || existing.status === "CANCELLED") return;

    const batch = db.batch();
    const redmRef = this.redemptionsCol.doc(existing.id);
    const cpnRef = this.couponsCol.doc(couponId);

    batch.update(redmRef, { status: "CANCELLED", updatedAt: Timestamp.now() });
    batch.update(cpnRef, {
      usageCount: FieldValue.increment(-1),
      updatedAt: Timestamp.now(),
    });

    await batch.commit();
  }

  /**
   * Run Firestore transaction
   */
  async runTransaction<T>(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }
}

export const couponRepository = new CouponRepository();
