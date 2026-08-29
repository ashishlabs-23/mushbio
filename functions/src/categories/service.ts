/**
 * ============================================================================
 * MUSHBIO CATEGORY SERVICE (PHASE 03)
 *
 * Business logic layer for categories.
 * ============================================================================
 */

import { categoryRepository, CategoryRepository } from "./repository";
import { toCategoryDto, toCategoryDetailDto } from "./mapper";
import { CategoryDto, CategoryDetailDto } from "./dto";
import { NotFoundError } from "../utils/errors";

export class CategoryService {
  constructor(private repo: CategoryRepository = categoryRepository) {}

  async listActiveCategories(): Promise<CategoryDto[]> {
    const docs = await this.repo.getActiveCategories();
    return docs.map(toCategoryDto);
  }

  async getCategoryBySlug(slug: string): Promise<CategoryDetailDto> {
    const doc = await this.repo.getCategoryBySlug(slug);
    if (!doc) {
      throw new NotFoundError(`Category with slug '${slug}' not found`, "CATEGORY_NOT_FOUND");
    }
    return toCategoryDetailDto(doc);
  }
}

export const categoryService = new CategoryService();
