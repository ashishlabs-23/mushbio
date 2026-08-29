/**
 * ============================================================================
 * MUSHBIO PRODUCT API DTOs (PHASE 04 UPDATED)
 *
 * Public data contracts exposed to frontend/clients.
 * Derives dynamic availability without leaking raw warehouse counts.
 * ============================================================================
 */

import { Currency } from "../types";
import { StockAvailabilityStatus } from "../inventory/dto";

export interface ProductCategoryRefDto {
  slug: string;
  name: string;
}

export interface ProductVariantDto {
  id: string;
  sku: string;
  weightGrams: number;
  weightLabel: string;
  price: number; // Final variant price in INR (₹)
  compareAtPrice?: number;
  currency: Currency;
  availability: StockAvailabilityStatus;
}

export interface ProductImageDto {
  url: string;
  alt: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface ProductSummaryDto {
  id: string;
  name: string;
  slug: string;
  shortDescription: string;
  category: ProductCategoryRefDto;
  image: string;
  basePrice: number;
  rating: number;
  reviewCount: number;
  organic: boolean;
  featured: boolean;
}

export interface ProductDetailDto extends ProductSummaryDto {
  description: string;
  benefits?: string[];
  harvestCycleDays?: number;
  variants: ProductVariantDto[];
  images: ProductImageDto[];
  availability: StockAvailabilityStatus;
}

export interface PaginationMetaDto {
  pageSize: number;
  nextCursor?: string;
  hasMore: boolean;
}

export interface PaginatedProductsDto {
  data: ProductSummaryDto[];
  pagination: PaginationMetaDto;
}
