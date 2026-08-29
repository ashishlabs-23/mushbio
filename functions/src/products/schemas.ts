/**
 * ============================================================================
 * MUSHBIO PRODUCT VALIDATION SCHEMAS (PHASE 03)
 *
 * Validates all query parameters and path arguments with Zod.
 * Rejects invalid types, out-of-range bounds, and malformed inputs with 400.
 * ============================================================================
 */

import { z } from "zod";

export const ProductSortSchema = z.enum([
  "popular",
  "price_asc",
  "price_desc",
  "rating_desc",
  "newest",
]);

export type ProductSortOption = z.infer<typeof ProductSortSchema>;

export const ProductListQuerySchema = z
  .object({
    category: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9-]+$/, "Invalid category slug format")
      .optional(),
    organic: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
    minPrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "minPrice must be a valid non-negative number")
      .transform((val) => parseFloat(val))
      .refine((val) => val >= 0, "minPrice must be at least 0")
      .optional(),
    maxPrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "maxPrice must be a valid non-negative number")
      .transform((val) => parseFloat(val))
      .refine((val) => val >= 0, "maxPrice must be at least 0")
      .optional(),
    sort: ProductSortSchema.default("popular"),
    pageSize: z
      .string()
      .regex(/^\d+$/, "pageSize must be an integer")
      .transform((val) => parseInt(val, 10))
      .refine((val) => val >= 1 && val <= 24, "pageSize must be between 1 and 24")
      .default("6" as unknown as number),
    cursor: z
      .string()
      .trim()
      .min(1, "Cursor cannot be empty")
      .max(500, "Cursor is invalid")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.minPrice !== undefined && data.maxPrice !== undefined) {
        return data.minPrice <= data.maxPrice;
      }
      return true;
    },
    {
      message: "minPrice cannot be greater than maxPrice",
      path: ["minPrice"],
    }
  );

export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const ProductSlugParamSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1, "Slug cannot be empty")
    .max(100, "Slug is too long")
    .regex(/^[a-z0-9-]+$/, "Product slug must contain only lowercase letters, numbers, and hyphens"),
});

export type ProductSlugParam = z.infer<typeof ProductSlugParamSchema>;
