/**
 * ============================================================================
 * MUSHBIO PRODUCT MAPPER (PHASE 04 UPDATED)
 *
 * Converts internal Firestore ProductDocument, VariantDocument, and ImageDocument
 * entities into clean, public API response DTOs with dynamic real-time availability.
 * ============================================================================
 */

import { ProductDocument, ProductVariantDocument, ProductImageDocument } from "../types";
import {
  ProductSummaryDto,
  ProductDetailDto,
  ProductVariantDto,
  ProductImageDto,
} from "./dto";
import { StockAvailabilityStatus } from "../inventory/dto";

function formatCategoryName(slug: string): string {
  if (!slug) return "Mushroom";
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function toProductSummaryDto(doc: ProductDocument): ProductSummaryDto {
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    shortDescription: doc.shortDescription,
    category: {
      slug: doc.categorySlug,
      name: formatCategoryName(doc.categorySlug),
    },
    image: doc.primaryImageUrl || "assets/oyster.jpg",
    basePrice: doc.basePrice,
    rating: doc.rating,
    reviewCount: doc.reviewCount,
    organic: doc.organic,
    featured: doc.featured,
  };
}

export function toProductVariantDto(
  variant: ProductVariantDocument,
  availability: StockAvailabilityStatus = "IN_STOCK"
): ProductVariantDto {
  return {
    id: variant.id,
    sku: variant.sku,
    weightGrams: variant.weightGrams,
    weightLabel: variant.weightLabel,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    currency: variant.currency,
    availability,
  };
}

export function toProductImageDto(img: ProductImageDocument): ProductImageDto {
  return {
    url: img.url,
    alt: img.alt,
    isPrimary: img.isPrimary,
    sortOrder: img.sortOrder,
  };
}

export function toProductDetailDto(
  doc: ProductDocument,
  variants: ProductVariantDocument[] = [],
  images: ProductImageDocument[] = [],
  availabilityMap: Map<string, StockAvailabilityStatus> = new Map()
): ProductDetailDto {
  const activeVariants = variants
    .filter((v) => v.isActive)
    .sort((a, b) => a.weightGrams - b.weightGrams);

  const publicImages = images.sort((a, b) => a.sortOrder - b.sortOrder);

  // Map variants with dynamic real-time availability
  const mappedVariants = activeVariants.map((v) => {
    const status = availabilityMap.get(v.id) ?? (v.stockQuantitySnapshot && v.stockQuantitySnapshot > 0 ? "IN_STOCK" : "OUT_OF_STOCK");
    return toProductVariantDto(v, status);
  });

  // Calculate composite product availability
  let overallAvailability: StockAvailabilityStatus = "OUT_OF_STOCK";
  if (mappedVariants.some((v) => v.availability === "IN_STOCK")) {
    overallAvailability = "IN_STOCK";
  } else if (mappedVariants.some((v) => v.availability === "LOW_STOCK")) {
    overallAvailability = "LOW_STOCK";
  }

  return {
    ...toProductSummaryDto(doc),
    description: doc.description,
    benefits: doc.benefits || [],
    harvestCycleDays: doc.harvestCycleDays,
    variants: mappedVariants,
    images: publicImages.map(toProductImageDto),
    availability: overallAvailability,
  };
}
