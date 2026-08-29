/**
 * ============================================================================
 * MUSHBIO CHECKOUT CONTROLLER & ROUTES (PHASE 08)
 * ============================================================================
 */

import { Request, Response, Router } from "express";
import { checkoutService } from "./service";
import { requireAuth, requireActiveAccount } from "../auth/middleware";
import { handleFunctionError, UnauthorizedError } from "../utils/errors";

export class CheckoutController {
  /**
   * POST /api/v1/checkout/preview
   */
  async preview(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");

      const previewResult = await checkoutService.generatePreview(req.auth.uid, req.body);
      res.status(200).json({ data: previewResult });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const checkoutController = new CheckoutController();

export const checkoutRouter = Router();
checkoutRouter.post("/checkout/preview", requireAuth(), requireActiveAccount(), (req, res) =>
  checkoutController.preview(req, res)
);
