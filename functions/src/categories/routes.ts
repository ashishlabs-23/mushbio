/**
 * ============================================================================
 * MUSHBIO CATEGORY ROUTER (PHASE 03)
 *
 * Mounts:
 *   GET /api/v1/categories
 *   GET /api/v1/categories/:slug
 *   GET /api/v1/categories/:slug/products (delegates to productController)
 * ============================================================================
 */

import { Router } from "express";
import { categoryController } from "./controller";
import { productController } from "../products/controller";

export const categoryRouter = Router();

// 1. List active categories
categoryRouter.get("/", (req, res) => categoryController.listCategories(req, res));

// 2. Category detail
categoryRouter.get("/:slug", (req, res) => categoryController.getCategoryBySlug(req, res));

// 3. Category products endpoint (GET /api/v1/categories/:slug/products)
categoryRouter.get("/:slug/products", (req, res) => productController.listCategoryProducts(req, res));
