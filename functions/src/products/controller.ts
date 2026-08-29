/**
 * ============================================================================
 * MUSHBIO PRODUCT HTTP CONTROLLER (PHASE 03)
 * ============================================================================
 */

import { Request, Response } from "express";
import { productService } from "./service";
import { ProductListQuerySchema, ProductSlugParamSchema } from "./schemas";
import { CategorySlugParamSchema } from "../categories/schemas";
import { handleFunctionError, BadRequestError } from "../utils/errors";

export class ProductController {
  /**
   * GET /api/v1/products
   */
  async listProducts(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = ProductListQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new BadRequestError(
          parseResult.error.issues?.[0]?.message || "Invalid query parameters",
          "INVALID_QUERY"
        );
      }

      const result = await productService.listProducts(parseResult.data);
      res.status(200).json(result);
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * GET /api/v1/products/featured
   */
  async getFeaturedProducts(req: Request, res: Response): Promise<void> {
    try {
      const products = await productService.getFeaturedProducts(3);
      res.status(200).json({
        data: products,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * GET /api/v1/products/:slug
   */
  async getProductBySlug(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = ProductSlugParamSchema.safeParse(req.params);
      if (!parseResult.success) {
        throw new BadRequestError(
          parseResult.error.issues?.[0]?.message || "Invalid product slug",
          "INVALID_QUERY"
        );
      }

      const product = await productService.getProductBySlug(parseResult.data.slug);
      res.status(200).json({
        data: product,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * GET /api/v1/categories/:slug/products
   */
  async listCategoryProducts(req: Request, res: Response): Promise<void> {
    try {
      const slugParse = CategorySlugParamSchema.safeParse(req.params);
      if (!slugParse.success) {
        throw new BadRequestError(
          slugParse.error.issues?.[0]?.message || "Invalid category slug",
          "INVALID_QUERY"
        );
      }

      const queryParse = ProductListQuerySchema.safeParse({
        ...req.query,
        category: slugParse.data.slug,
      });

      if (!queryParse.success) {
        throw new BadRequestError(
          queryParse.error.issues?.[0]?.message || "Invalid query parameters",
          "INVALID_QUERY"
        );
      }

      const result = await productService.listProducts(queryParse.data);
      res.status(200).json(result);
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const productController = new ProductController();
