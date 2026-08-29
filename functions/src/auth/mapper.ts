/**
 * ============================================================================
 * MUSHBIO USER PROFILE MAPPER (PHASE 05)
 *
 * Converts internal Firestore UserDocument to safe public UserProfileDto.
 * Completely strips credentials, sensitive tokens, and admin audit flags.
 * ============================================================================
 */

import { UserDocument } from "../types";
import { UserProfileDto } from "./dto";

export function toUserProfileDto(doc: UserDocument): UserProfileDto {
  return {
    uid: doc.uid,
    email: doc.email,
    displayName: doc.displayName,
    photoURL: doc.photoURL,
    phone: doc.phone,
    role: doc.role || "CUSTOMER",
    status: doc.status || "ACTIVE",
    emailVerified: doc.emailVerified || false,
    createdAt: doc.createdAt,
    lastLoginAt: doc.lastLoginAt,
  };
}
