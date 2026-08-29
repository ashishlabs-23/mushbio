/**
 * ============================================================================
 * MUSHBIO CATEGORY FIRESTORE REPOSITORY (PHASE 03)
 *
 * Direct, optimized queries to Firestore 'categories' collection.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import { CategoryDocument } from "../types";

export class CategoryRepository {
  private collection = db.collection("categories");

  /**
   * Fetch all active categories ordered by sortOrder ASC
   */
  async getActiveCategories(): Promise<CategoryDocument[]> {
    const snapshot = await this.collection
      .where("isActive", "==", true)
      .orderBy("sortOrder", "asc")
      .get();

    return snapshot.docs.map((doc) => ({
      ...(doc.data() as CategoryDocument),
      id: doc.id,
    }));
  }

  /**
   * Fetch a single category by its slug
   */
  async getCategoryBySlug(slug: string): Promise<CategoryDocument | null> {
    const snapshot = await this.collection
      .where("slug", "==", slug)
      .where("isActive", "==", true)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return {
      ...(doc.data() as CategoryDocument),
      id: doc.id,
    };
  }
}

export const categoryRepository = new CategoryRepository();
