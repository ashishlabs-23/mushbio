/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — PRODUCTS, VARIANTS & IMAGES (PHASE 02)
 *
 * Collection: products/{productId}
 * Subcollections:
 *   - products/{productId}/variants/{variantId}
 *   - products/{productId}/images/{imageId}
 * ============================================================================
 */

import { TimestampFields, Currency, FirestoreTimestamp } from "./common";

export type ProductStatus = "ACTIVE" | "INACTIVE" | "DRAFT";

export interface ProductVariantDocument extends TimestampFields {
  id: string;
  sku: string; // e.g. "MUSH-OYS-250G"
  weightGrams: number; // e.g. 250, 500, 1000, 2000
  weightLabel: string; // e.g. "250g", "500g", "1kg", "2kg"
  price: number; // in INR (₹)
  compareAtPrice?: number;
  currency: Currency;
  isActive: boolean;
  stockQuantitySnapshot?: number; // Cached display estimate, authoritative stock in inventory/{variantId}
}

export interface ProductImageDocument {
  id: string;
  url: string; // Public CDN URL
  storagePath: string; // e.g. "products/prod_123/hero.webp"
  alt: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: FirestoreTimestamp;
}

export interface ProductDocument extends TimestampFields {
  id: string;
  name: string;
  slug: string; // e.g. "oyster-mushroom"
  shortDescription: string;
  description: string;
  categoryId: string;
  categorySlug: string; // Denormalized for zero-join shop queries
  featured: boolean;
  organic: boolean;
  status: ProductStatus;
  sortOrder: number;
  basePrice: number; // Minimum variant price for fast range filtering
  rating: number; // Average rating (e.g. 4.8)
  reviewCount: number;
  searchKeywords: string[]; // Normalized lowercase prefix tokens for indexed filtering
  benefits?: string[];
  harvestCycleDays?: number;
  primaryImageUrl?: string; // Denormalized primary image URL for instant grid render
}
