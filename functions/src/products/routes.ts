/**
 * ============================================================================
 * MUSHBIO PRODUCT ROUTER (PHASE 03)
 *
 * Mounts:
 *   GET /api/v1/products
 *   GET /api/v1/products/featured (Registered before /:slug to avoid collision!)
 *   GET /api/v1/products/:slug
 * ============================================================================
 */

import { Router } from "express";
import { productController } from "./controller";

export const productRouter = Router();

// 1. Main Products Catalog (Filtering, Sorting, Cursor Pagination)
productRouter.get("/", (req, res) => productController.listProducts(req, res));

// 2. Featured Showcase (Registered before /:slug!)
productRouter.get("/featured", (req, res) => productController.getFeaturedProducts(req, res));

// 3. Product Detail by Slug
productRouter.get("/:slug", (req, res) => productController.getProductBySlug(req, res));
