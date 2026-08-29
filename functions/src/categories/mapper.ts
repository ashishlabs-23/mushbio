/**
 * ============================================================================
 * MUSHBIO CATEGORY MAPPER (PHASE 03)
 *
 * Converts internal Firestore CategoryDocument to safe public CategoryDto.
 * Excludes internal timestamps and private metadata.
 * ============================================================================
 */

import { CategoryDocument } from "../types";
import { CategoryDto, CategoryDetailDto } from "./dto";

export function toCategoryDto(doc: CategoryDocument): CategoryDto {
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    description: doc.description,
    image: doc.image,
    sortOrder: doc.sortOrder,
    productsCount: doc.productsCount ?? 0,
  };
}

export function toCategoryDetailDto(doc: CategoryDocument): CategoryDetailDto {
  return {
    ...toCategoryDto(doc),
    isActive: doc.isActive,
  };
}
