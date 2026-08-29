/**
 * ============================================================================
 * MUSHBIO ADDRESS BOOK VALIDATION SCHEMAS (PHASE 06)
 * ============================================================================
 */

import { z } from "zod";

// Reusable phone regex supporting Indian & International formats (+91 9876543210, 09876543210, etc.)
export const PhoneRegex = /^[0-9+\s()-]{10,20}$/;

// Postal code regex (supporting 6-digit Indian PIN codes as well as standard alphanumeric postal codes)
export const PostalCodeRegex = /^[A-Za-z0-9\s-]{3,12}$/;

export const CreateAddressSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Label cannot be empty")
      .max(40, "Label cannot exceed 40 characters")
      .optional(),
    recipientName: z
      .string()
      .trim()
      .min(2, "Recipient name must be at least 2 characters")
      .max(100, "Recipient name cannot exceed 100 characters"),
    phone: z
      .string()
      .trim()
      .regex(PhoneRegex, "Please provide a valid 10-digit phone number"),
    line1: z
      .string()
      .trim()
      .min(3, "Address line 1 must be at least 3 characters")
      .max(200, "Address line 1 cannot exceed 200 characters"),
    line2: z
      .string()
      .trim()
      .max(200, "Address line 2 cannot exceed 200 characters")
      .optional(),
    city: z
      .string()
      .trim()
      .min(2, "City must be at least 2 characters")
      .max(100, "City cannot exceed 100 characters"),
    state: z
      .string()
      .trim()
      .min(2, "State must be at least 2 characters")
      .max(100, "State cannot exceed 100 characters"),
    postalCode: z
      .string()
      .trim()
      .regex(PostalCodeRegex, "Please provide a valid PIN / Postal code"),
    country: z
      .string()
      .trim()
      .min(2, "Country code must be at least 2 characters")
      .max(100, "Country cannot exceed 100 characters")
      .default("IN"),
    isDefault: z.boolean().optional().default(false),
    // GPS-assisted delivery location fields (Phase 10A)
    latitude: z
      .number()
      .min(-90, "latitude must be >= -90")
      .max(90, "latitude must be <= 90")
      .optional(),
    longitude: z
      .number()
      .min(-180, "longitude must be >= -180")
      .max(180, "longitude must be <= 180")
      .optional(),
    accuracyMeters: z
      .number()
      .positive("accuracyMeters must be > 0")
      .optional(),
    locationSource: z
      .enum(["GPS", "MANUAL"])
      .optional(),
    deliveryInstructions: z
      .string()
      .trim()
      .max(500, "Delivery instructions cannot exceed 500 characters")
      .optional(),
  });

export const UpdateAddressSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, "Label cannot be empty")
      .max(40, "Label cannot exceed 40 characters")
      .optional(),
    recipientName: z
      .string()
      .trim()
      .min(2, "Recipient name must be at least 2 characters")
      .max(100, "Recipient name cannot exceed 100 characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(PhoneRegex, "Please provide a valid 10-digit phone number")
      .optional(),
    line1: z
      .string()
      .trim()
      .min(3, "Address line 1 must be at least 3 characters")
      .max(200, "Address line 1 cannot exceed 200 characters")
      .optional(),
    line2: z
      .string()
      .trim()
      .max(200, "Address line 2 cannot exceed 200 characters")
      .optional(),
    city: z
      .string()
      .trim()
      .min(2, "City must be at least 2 characters")
      .max(100, "City cannot exceed 100 characters")
      .optional(),
    state: z
      .string()
      .trim()
      .min(2, "State must be at least 2 characters")
      .max(100, "State cannot exceed 100 characters")
      .optional(),
    postalCode: z
      .string()
      .trim()
      .regex(PostalCodeRegex, "Please provide a valid PIN / Postal code")
      .optional(),
    country: z
      .string()
      .trim()
      .min(2, "Country code must be at least 2 characters")
      .max(100, "Country cannot exceed 100 characters")
      .optional(),
    isDefault: z.boolean().optional(),
    // GPS-assisted delivery location fields (Phase 10A)
    latitude: z
      .number()
      .min(-90, "latitude must be >= -90")
      .max(90, "latitude must be <= 90")
      .optional(),
    longitude: z
      .number()
      .min(-180, "longitude must be >= -180")
      .max(180, "longitude must be <= 180")
      .optional(),
    accuracyMeters: z
      .number()
      .positive("accuracyMeters must be > 0")
      .optional(),
    locationSource: z
      .enum(["GPS", "MANUAL"])
      .optional(),
    deliveryInstructions: z
      .string()
      .trim()
      .max(500, "Delivery instructions cannot exceed 500 characters")
      .optional(),
  });

export type CreateAddressInput = z.input<typeof CreateAddressSchema>;
export type UpdateAddressInput = z.input<typeof UpdateAddressSchema>;
