/**
 * ============================================================================
 * MUSHBIO COUPON CONTROLLER & ROUTES (PHASE 09)
 *
 * Exposes /api/v1/checkout/coupon/validate and /api/v1/checkout/coupon/remove
 * ============================================================================
 */

import { Request, Response, Router } from "express";
import { couponService } from "./service";
import { requireAuth, requireActiveAccount } from "../auth/middleware";
import { handleFunctionError, UnauthorizedError } from "../utils/errors";

export class CouponController {
  /**
   * POST /api/v1/checkout/coupon/validate
   */
  async validateCoupon(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) {
        throw new UnauthorizedError("Authentication required to validate coupons", "AUTH_REQUIRED");
      }

      const result = await couponService.validateCoupon(req.auth.uid, req.body?.code);
      res.status(200).json({ data: result });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/checkout/coupon/remove
   */
  async removeCoupon(_req: Request, res: Response): Promise<void> {
    try {
      res.status(200).json({
        data: {
          removed: true,
          message: "Coupon removed from checkout session",
        },
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const couponController = new CouponController();

export const couponRouter = Router();

couponRouter.post(
  "/checkout/coupon/validate",
  requireAuth(),
  requireActiveAccount(),
  (req, res) => couponController.validateCoupon(req, res)
);

couponRouter.post(
  "/checkout/coupon/remove",
  requireAuth(),
  requireActiveAccount(),
  (req, res) => couponController.removeCoupon(req, res)
);
