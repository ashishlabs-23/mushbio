/**
 * ============================================================================
 * MUSHBIO AUTHENTICATION & USER PROFILE DTOs (PHASE 05)
 * ============================================================================
 */

import { UserRole, UserStatus, FirestoreTimestamp } from "../types";

export interface AuthContext {
  uid: string;
  email?: string;
  role: UserRole;
  emailVerified: boolean;
}

export interface UserProfileDto {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt?: FirestoreTimestamp | string;
  lastLoginAt?: FirestoreTimestamp | string;
}

export interface UpdateProfileDto {
  displayName?: string;
  photoURL?: string;
  phone?: string;
}
