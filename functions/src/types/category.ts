/**
 * ============================================================================
 * MUSHBIO FIRESTORE DATA MODEL — CATEGORIES (PHASE 02)
 *
 * Collection: categories/{categoryId}
 * ============================================================================
 */

import { TimestampFields } from "./common";

export interface CategoryDocument extends TimestampFields {
  id: string;
  name: string; // e.g. "Oyster", "Button", "Shiitake", "Milky", "Portobello"
  slug: string; // e.g. "oyster", "button", "shiitake", "milky", "portobello"
  description: string;
  image?: string; // Storage path or CDN URL
  sortOrder: number;
  isActive: boolean;
  productsCount?: number;
}
