/**
 * ============================================================================
 * MUSHBIO CATEGORY API DTOs (PHASE 03)
 * ============================================================================
 */

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  image?: string;
  sortOrder: number;
  productsCount?: number;
}

export interface CategoryDetailDto extends CategoryDto {
  isActive: boolean;
}
