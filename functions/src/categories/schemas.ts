/**
 * ============================================================================
 * MUSHBIO CATEGORY VALIDATION SCHEMAS (PHASE 03)
 * ============================================================================
 */

import { z } from "zod";

export const CategorySlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug cannot be empty")
    .max(50, "Slug is too long")
    .regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
});

export type CategorySlugParam = z.infer<typeof CategorySlugParamSchema>;
