/**
 * ============================================================================
 * MUSHBIO LOCATION SERVICES — VALIDATION SCHEMAS (PHASE 10A)
 *
 * Validates reverse-geocode requests.
 * Coordinates are validated strictly to prevent injection of garbage values.
 * ============================================================================
 */

import { z } from "zod";

export const ReverseGeocodeSchema = z
  .object({
    latitude: z
      .number()
      .min(-90, "latitude must be >= -90")
      .max(90, "latitude must be <= 90"),
    longitude: z
      .number()
      .min(-180, "longitude must be >= -180")
      .max(180, "longitude must be <= 180"),
    accuracyMeters: z
      .number()
      .positive("accuracyMeters must be > 0")
      .optional(),
  })
  .strict();

export type ReverseGeocodeInput = z.infer<typeof ReverseGeocodeSchema>;

export interface ReverseGeocodeResult {
  formattedAddress: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "IN"
  latitude: number;
  longitude: number;
}
