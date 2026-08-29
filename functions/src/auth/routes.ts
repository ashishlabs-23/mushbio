/**
 * ============================================================================
 * MUSHBIO AUTH & USER PROFILE ROUTER (PHASE 05)
 *
 * Mounts:
 *   GET   /api/v1/me
 *   PATCH /api/v1/me
 * ============================================================================
 */

import { Router } from "express";
import { authController } from "./controller";
import { requireAuth, requireActiveAccount } from "./middleware";

export const authRouter = Router();

// Protected profile routes
authRouter.get(
  "/me",
  requireAuth(),
  requireActiveAccount(),
  (req, res) => authController.getProfile(req, res)
);

authRouter.patch(
  "/me",
  requireAuth(),
  requireActiveAccount(),
  (req, res) => authController.updateProfile(req, res)
);
