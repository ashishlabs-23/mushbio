/**
 * ============================================================================
 * MUSHBIO ADDRESS REPOSITORY (PHASE 06)
 *
 * Interacts with Firestore subcollection: users/{userId}/addresses/{addressId}
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { UserAddress } from "../types";
import { DocumentReference } from "firebase-admin/firestore";

export class AddressRepository {
  /**
   * Get user document reference
   */
  getUserRef(userId: string): DocumentReference {
    return db.collection("users").doc(userId);
  }

  /**
   * Get address document reference
   */
  getAddressRef(userId: string, addressId: string): DocumentReference {
    return db.collection("users").doc(userId).collection("addresses").doc(addressId);
  }

  /**
   * Get all addresses for user
   */
  async getAddresses(userId: string): Promise<UserAddress[]> {
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .get();

    return snap.docs.map((doc) => doc.data() as UserAddress);
  }

  /**
   * Get single address by ID
   */
  async getAddressById(userId: string, addressId: string): Promise<UserAddress | null> {
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .doc(addressId)
      .get();

    if (!snap.exists) return null;
    return snap.data() as UserAddress;
  }

  /**
   * Get total address count for a user
   */
  async countAddresses(userId: string): Promise<number> {
    const snap = await db
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .count()
      .get();

    return snap.data().count;
  }

  /**
   * Run Firestore transaction
   */
  async runTransaction<T>(updateFunction: (tx: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    return db.runTransaction(updateFunction);
  }
}

export const addressRepository = new AddressRepository();
