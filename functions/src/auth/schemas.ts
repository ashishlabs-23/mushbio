/**
 * ============================================================================
 * MUSHBIO AUTHENTICATION VALIDATION SCHEMAS (PHASE 05)
 * ============================================================================
 */

import { z } from "zod";

// Password Policy: Minimum 8 characters, max 128 chars
export const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters long")
  .max(128, "Password must not exceed 128 characters");

// Registration Schema
export const RegisterUserSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address")
    .max(150, "Email is too long"),
  password: PasswordSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Display name cannot be empty")
    .max(100, "Display name is too long"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]{10,20}$/, "Invalid phone number format")
    .optional(),
});

// Update Profile Schema (Strict: Ignores/Rejects forbidden privilege fields)
export const UpdateProfileSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Display name cannot be empty")
      .max(100, "Display name is too long")
      .optional(),
    photoURL: z
      .string()
      .trim()
      .max(500, "photoURL is too long")
      .optional(),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s()-]{10,20}$/, "Invalid phone number format")
      .optional(),
  })
  .strict();

export const SetUserRoleSchema = z.object({
  role: z.enum(["CUSTOMER", "STAFF", "ADMIN"]),
});

export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type SetUserRoleInput = z.infer<typeof SetUserRoleSchema>;
