/**
 * ============================================================================
 * MUSHBIO PRODUCT FIRESTORE REPOSITORY (PHASE 03)
 *
 * Query builder and database operations for 'products' and subcollections.
 * Optimized for composite indexes defined in firestore.indexes.json.
 * ============================================================================
 */

import { db } from "../config/firebaseAdmin";
import {
  ProductDocument,
  ProductVariantDocument,
  ProductImageDocument,
} from "../types";
import { ProductSortOption } from "./schemas";
import { Query, DocumentSnapshot } from "firebase-admin/firestore";

export interface DecodedCursor {
  docId: string;
  sortValue: string | number;
  sortOption: ProductSortOption;
}

export interface ProductQueryParams {
  category?: string;
  organic?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSortOption;
  pageSize: number;
  cursorData?: DecodedCursor;
}

export interface ProductQueryResult {
  products: ProductDocument[];
  hasMore: boolean;
  lastDoc?: DocumentSnapshot;
  lastSortValue?: string | number;
}

export class ProductRepository {
  private collection = db.collection("products");

  /**
   * Main catalog query with index alignment, filtering, sorting, and cursor pagination
   */
  async getProducts(params: ProductQueryParams): Promise<ProductQueryResult> {
    let query: Query = this.collection.where("status", "==", "ACTIVE");

    // 1. Category Filter
    if (params.category) {
      query = query.where("categorySlug", "==", params.category);
    }

    // 2. Organic Filter
    if (params.organic !== undefined) {
      query = query.where("organic", "==", params.organic);
    }

    // 3. Price Filter (basePrice)
    if (params.minPrice !== undefined) {
      query = query.where("basePrice", ">=", params.minPrice);
    }
    if (params.maxPrice !== undefined) {
      query = query.where("basePrice", "<=", params.maxPrice);
    }

    // 4. Sorting
    switch (params.sort) {
      case "price_asc":
        query = query.orderBy("basePrice", "asc");
        break;
      case "price_desc":
        query = query.orderBy("basePrice", "desc");
        break;
      case "rating_desc":
        query = query.orderBy("rating", "desc");
        break;
      case "newest":
        query = query.orderBy("createdAt", "desc");
        break;
      case "popular":
      default:
        query = query.orderBy("sortOrder", "asc");
        break;
    }

    // Tie-breaker order for deterministic pagination
    query = query.orderBy("__name__", "asc");

    // 5. Cursor Pagination (startAfter)
    if (params.cursorData) {
      query = query.startAfter(
        params.cursorData.sortValue,
        params.cursorData.docId
      );
    }

    // Fetch pageSize + 1 to determine hasMore without an extra count query
    const snapshot = await query.limit(params.pageSize + 1).get();

    const hasMore = snapshot.docs.length > params.pageSize;
    const resultDocs = hasMore ? snapshot.docs.slice(0, params.pageSize) : snapshot.docs;

    const products = resultDocs.map((doc) => ({
      ...(doc.data() as ProductDocument),
      id: doc.id,
    }));

    const lastDoc = resultDocs[resultDocs.length - 1];
    let lastSortValue: string | number | undefined;

    if (lastDoc) {
      const data = lastDoc.data() as ProductDocument;
      switch (params.sort) {
        case "price_asc":
        case "price_desc":
          lastSortValue = data.basePrice;
          break;
        case "rating_desc":
          lastSortValue = data.rating;
          break;
        case "newest":
          lastSortValue = data.createdAt ? (data.createdAt as { toMillis?: () => number }).toMillis?.() ?? 0 : 0;
          break;
        case "popular":
        default:
          lastSortValue = data.sortOrder;
          break;
      }
    }

    return {
      products,
      hasMore,
      lastDoc,
      lastSortValue,
    };
  }

  /**
   * Fetch a single active product by slug with variants and images
   */
  async getProductBySlug(
    slug: string
  ): Promise<{
    product: ProductDocument;
    variants: ProductVariantDocument[];
    images: ProductImageDocument[];
  } | null> {
    const snapshot = await this.collection
      .where("slug", "==", slug)
      .where("status", "==", "ACTIVE")
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const productDoc = snapshot.docs[0];
    const product = {
      ...(productDoc.data() as ProductDocument),
      id: productDoc.id,
    };

    // Subcollections: Variants & Images
    const [variantsSnap, imagesSnap] = await Promise.all([
      productDoc.ref.collection("variants").where("isActive", "==", true).get(),
      productDoc.ref.collection("images").orderBy("sortOrder", "asc").get(),
    ]);

    const variants = variantsSnap.docs.map((v) => ({
      ...(v.data() as ProductVariantDocument),
      id: v.id,
    }));

    const images = imagesSnap.docs.map((img) => ({
      ...(img.data() as ProductImageDocument),
      id: img.id,
    }));

    return {
      product,
      variants,
      images,
    };
  }

  /**
   * Fetch active featured products for homepage showcase
   */
  async getFeaturedProducts(limitCount = 3): Promise<ProductDocument[]> {
    const snapshot = await this.collection
      .where("status", "==", "ACTIVE")
      .where("featured", "==", true)
      .orderBy("sortOrder", "asc")
      .limit(limitCount)
      .get();

    return snapshot.docs.map((doc) => ({
      ...(doc.data() as ProductDocument),
      id: doc.id,
    }));
  }

  /**
   * Get product by document ID
   */
  async getProductById(productId: string): Promise<ProductDocument | null> {
    const snap = await this.collection.doc(productId).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as ProductDocument), id: snap.id };
  }

  /**
   * Get variant by product ID and variant ID
   */
  async getVariantById(productId: string, variantId: string): Promise<ProductVariantDocument | null> {
    const snap = await this.collection.doc(productId).collection("variants").doc(variantId).get();
    if (!snap.exists) return null;
    return { ...(snap.data() as ProductVariantDocument), id: snap.id };
  }
}

export const productRepository = new ProductRepository();
