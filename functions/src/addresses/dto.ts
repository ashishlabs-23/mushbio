/**
 * ============================================================================
 * MUSHBIO ADDRESS BOOK DTOs (PHASE 06 / PHASE 10A)
 * ============================================================================
 */

import { FirestoreTimestamp } from "../types";

export interface AddressDto {
  id: string;
  label?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  // GPS fields (Phase 10A)
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationSource?: "GPS" | "MANUAL";
  locationCapturedAt?: FirestoreTimestamp | string;
  deliveryInstructions?: string;
  createdAt?: FirestoreTimestamp | string;
  updatedAt?: FirestoreTimestamp | string;
}

export interface CreateAddressDto {
  label?: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country?: string;
  isDefault?: boolean;
  // GPS fields (Phase 10A)
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationSource?: "GPS" | "MANUAL";
  deliveryInstructions?: string;
}

export interface UpdateAddressDto {
  label?: string;
  recipientName?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  isDefault?: boolean;
  // GPS fields (Phase 10A)
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  locationSource?: "GPS" | "MANUAL";
  deliveryInstructions?: string;
}

export interface AddressListDto {
  data: AddressDto[];
  total: number;
  defaultAddressId?: string;
}
