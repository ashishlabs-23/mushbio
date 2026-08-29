/**
 * ============================================================================
 * MUSHBIO USER & AUTH REPOSITORY (PHASE 05)
 *
 * Interacts with Firebase Auth and Firestore 'users' collection using Admin SDK.
 * ============================================================================
 */

import { db, auth } from "../config/firebaseAdmin";
import { UserDocument, UserRole, UserStatus } from "../types";
import { Timestamp } from "firebase-admin/firestore";

export class UserRepository {
  private usersCol = db.collection("users");

  /**
   * Get user document by UID
   */
  async getUserById(uid: string): Promise<UserDocument | null> {
    const snap = await this.usersCol.doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as UserDocument;
  }

  /**
   * Create new user profile document
   */
  async createUserProfile(profile: UserDocument): Promise<void> {
    await this.usersCol.doc(profile.uid).set(profile);
  }

  /**
   * Update editable profile fields
   */
  async updateUserProfile(uid: string, fields: Partial<UserDocument>): Promise<UserDocument> {
    const docRef = this.usersCol.doc(uid);
    const updated = {
      ...fields,
      updatedAt: Timestamp.now(),
    };
    await docRef.update(updated);
    const snap = await docRef.get();
    return snap.data() as UserDocument;
  }

  /**
   * Update user status (ACTIVE, SUSPENDED, DELETED)
   */
  async setUserStatus(uid: string, status: UserStatus): Promise<void> {
    await this.usersCol.doc(uid).update({
      status,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Set Custom User Claims & update Firestore role
   */
  async setUserRole(uid: string, role: UserRole): Promise<void> {
    // 1. Assign custom claim in Firebase Auth
    await auth.setCustomUserClaims(uid, { role });

    // 2. Synchronize role in Firestore user document
    await this.usersCol.doc(uid).set(
      {
        role,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  }

  /**
   * Verify Firebase Auth ID token
   */
  async verifyIdToken(idToken: string, checkRevoked = false) {
    return auth.verifyIdToken(idToken, checkRevoked);
  }

  /**
   * Get Firebase Auth user record
   */
  async getAuthUser(uid: string) {
    return auth.getUser(uid);
  }
}

export const userRepository = new UserRepository();
