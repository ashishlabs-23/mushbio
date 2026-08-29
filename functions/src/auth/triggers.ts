/**
 * ============================================================================
 * MUSHBIO FIREBASE AUTH TRIGGERS (PHASE 05)
 *
 * Cloud Function triggers that handle user lifecycle events:
 *   - onUserCreated: Initializes Firestore users/{uid} document with CUSTOMER role
 *   - onUserDeleted: Marks Firestore user as DELETED for compliance/historical retention
 * ============================================================================
 */

import { authService } from "./service";
import { safeLogger } from "../utils/logger";

/**
 * Handle new user account initialization
 */
export async function handleUserCreated(user: {
  uid: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  emailVerified?: boolean;
}): Promise<void> {
  try {
    safeLogger.info(`Initializing profile for newly registered user ${user.uid}`);
    await authService.ensureUserProfile(
      user.uid,
      user.email || "",
      user.displayName || "Customer",
      user.photoURL,
      user.phoneNumber,
      user.emailVerified || false
    );
  } catch (err) {
    safeLogger.error(`Failed to initialize profile for user ${user.uid}`, err);
  }
}

/**
 * Handle user account deletion (Soft mark as DELETED)
 */
export async function handleUserDeleted(user: { uid: string }): Promise<void> {
  try {
    safeLogger.info(`Marking user profile as DELETED for ${user.uid}`);
    await authService.setUserStatus(user.uid, "DELETED");
  } catch (err) {
    safeLogger.error(`Failed to mark user ${user.uid} as DELETED`, err);
  }
}
