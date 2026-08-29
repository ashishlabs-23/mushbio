/**
 * ============================================================================
 * MUSHBIO AUTHENTICATION & USER PROFILE CONTROLLER (PHASE 05)
 * ============================================================================
 */

import { Request, Response } from "express";
import { authService } from "./service";
import { handleFunctionError, UnauthorizedError } from "../utils/errors";

export class AuthController {
  /**
   * GET /api/v1/me
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) {
        throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      }

      const profile = await authService.getProfile(req.auth.uid);
      res.status(200).json({
        data: profile,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * PATCH /api/v1/me
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) {
        throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      }

      const updated = await authService.updateProfile(req.auth.uid, req.body);
      res.status(200).json({
        data: updated,
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const authController = new AuthController();
