/**
 * ============================================================================
 * MUSHBIO CATEGORY HTTP CONTROLLER (PHASE 03)
 * ============================================================================
 */

import { Request, Response } from "express";
import { categoryService } from "./service";
import { CategorySlugParamSchema } from "./schemas";
import { handleFunctionError, BadRequestError } from "../utils/errors";

export class CategoryController {
  async listCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await categoryService.listActiveCategories();
      res.status(200).json({
        data: categories,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  async getCategoryBySlug(req: Request, res: Response): Promise<void> {
    try {
      const parseResult = CategorySlugParamSchema.safeParse(req.params);
      if (!parseResult.success) {
        throw new BadRequestError(parseResult.error.issues?.[0]?.message || "Invalid category slug", "INVALID_QUERY");
      }

      const category = await categoryService.getCategoryBySlug(parseResult.data.slug);
      res.status(200).json({
        data: category,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const categoryController = new CategoryController();
