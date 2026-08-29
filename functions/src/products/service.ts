/**
 * ============================================================================
 * MUSHBIO PRODUCT SERVICE (PHASE 03)
 *
 * Application service for products catalog.
 * Manages cursor encoding/decoding, pagination envelope, and validation.
 * ============================================================================
 */

import {
  productRepository,
  ProductRepository,
  DecodedCursor,
} from "./repository";
import {
  toProductSummaryDto,
  toProductDetailDto,
} from "./mapper";
import {
  ProductSummaryDto,
  ProductDetailDto,
  PaginatedProductsDto,
} from "./dto";
import { ProductListQuery, ProductSortOption } from "./schemas";
import { NotFoundError, BadRequestError } from "../utils/errors";
import { inventoryService, InventoryService } from "../inventory/service";

export class ProductService {
  constructor(
    private repo: ProductRepository = productRepository,
    private invService: InventoryService = inventoryService
  ) {}

  /**
   * Safe Base64URL Cursor Encoding
   */
  encodeCursor(docId: string, sortValue: string | number, sortOption: ProductSortOption): string {
    const payload = JSON.stringify({ docId, sortValue, sortOption });
    return Buffer.from(payload, "utf-8").toString("base64url");
  }

  /**
   * Safe Base64URL Cursor Decoding with validation
   */
  decodeCursor(cursorStr: string, expectedSort: ProductSortOption): DecodedCursor {
    try {
      const jsonStr = Buffer.from(cursorStr, "base64url").toString("utf-8");
      const parsed = JSON.parse(jsonStr);

      if (!parsed.docId || parsed.sortValue === undefined) {
        throw new Error("Missing required cursor fields");
      }

      if (parsed.sortOption && parsed.sortOption !== expectedSort) {
        throw new Error("Cursor sort option does not match current query sort");
      }

      return {
        docId: String(parsed.docId),
        sortValue: parsed.sortValue,
        sortOption: parsed.sortOption || expectedSort,
      };
    } catch {
      throw new BadRequestError("Invalid or malformed pagination cursor", "INVALID_CURSOR");
    }
  }

  /**
   * Main list products with pagination envelope
   */
  async listProducts(query: ProductListQuery): Promise<PaginatedProductsDto> {
    let cursorData: DecodedCursor | undefined;
    if (query.cursor) {
      cursorData = this.decodeCursor(query.cursor, query.sort);
    }

    const result = await this.repo.getProducts({
      category: query.category,
      organic: query.organic,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: query.sort,
      pageSize: query.pageSize,
      cursorData,
    });

    let nextCursor: string | undefined;
    if (result.hasMore && result.lastDoc && result.lastSortValue !== undefined) {
      nextCursor = this.encodeCursor(
        result.lastDoc.id,
        result.lastSortValue,
        query.sort
      );
    }

    return {
      data: result.products.map(toProductSummaryDto),
      pagination: {
        pageSize: query.pageSize,
        nextCursor,
        hasMore: result.hasMore,
      },
    };
  }

  /**
   * Product detail by slug with dynamic real-time inventory availability
   */
  async getProductBySlug(slug: string): Promise<ProductDetailDto> {
    const data = await this.repo.getProductBySlug(slug);
    if (!data) {
      throw new NotFoundError(`Product with slug '${slug}' not found`, "PRODUCT_NOT_FOUND");
    }

    const variantIds = data.variants.map((v) => v.id);
    const availabilityMap = await this.invService.getBatchAvailability(variantIds);

    return toProductDetailDto(data.product, data.variants, data.images, availabilityMap);
  }

  /**
   * Featured products showcase
   */
  async getFeaturedProducts(limit = 3): Promise<ProductSummaryDto[]> {
    const products = await this.repo.getFeaturedProducts(limit);
    return products.map(toProductSummaryDto);
  }
}

export const productService = new ProductService();
