/**
 * ============================================================================
 * MUSHBIO ADDRESS MAPPER (PHASE 06 / PHASE 10A)
 *
 * Converts internal Firestore UserAddress documents to sanitized public AddressDto.
 * GPS coordinates are included (customers can see their own delivery location).
 * ============================================================================
 */

import { UserAddress } from "../types";
import { AddressDto } from "./dto";

export function toAddressDto(doc: UserAddress): AddressDto {
  return {
    id: doc.id,
    label: doc.label,
    recipientName: doc.recipientName,
    phone: doc.phone,
    line1: doc.line1,
    line2: doc.line2,
    city: doc.city,
    state: doc.state,
    postalCode: doc.postalCode,
    country: doc.country || "IN",
    isDefault: !!doc.isDefault,
    // GPS fields (Phase 10A)
    latitude: doc.latitude,
    longitude: doc.longitude,
    accuracyMeters: doc.accuracyMeters,
    locationSource: doc.locationSource,
    locationCapturedAt: doc.locationCapturedAt,
    deliveryInstructions: doc.deliveryInstructions,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
