/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — USERS & ADDRESSES (PHASE 02)
 *
 * Collection: users/{userId}
 * Subcollection: users/{userId}/addresses/{addressId}
 * ============================================================================
 */

import { TimestampFields, FirestoreTimestamp } from "./common";

export type UserRole = "CUSTOMER" | "STAFF" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export type LocationSource = "GPS" | "MANUAL";

export interface UserAddress extends TimestampFields {
  id: string;
  label?: string; // e.g. "Home", "Work", "Farm Warehouse"
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // e.g. "IN"
  isDefault: boolean;
  // GPS-assisted delivery location fields (Phase 10A)
  latitude?: number;           // WGS-84, -90 to 90
  longitude?: number;          // WGS-84, -180 to 180
  accuracyMeters?: number;     // GPS accuracy radius in meters
  locationSource?: LocationSource; // "GPS" | "MANUAL"
  locationCapturedAt?: FirestoreTimestamp; // Server-assigned timestamp
  deliveryInstructions?: string; // Max 500 chars
}


export interface UserDocument extends TimestampFields {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt?: FirestoreTimestamp;
  defaultShippingAddressId?: string;
}
