/**
 * ============================================================================
 * MUSHBIO CART ROUTER (PHASE 07)
 *
 * Mounts:
 *   GET    /api/v1/cart
 *   POST   /api/v1/cart/items
 *   PATCH  /api/v1/cart/items/:itemId
 *   DELETE /api/v1/cart/items/:itemId
 *   DELETE /api/v1/cart
 *   POST   /api/v1/cart/validate
 *   POST   /api/v1/cart/merge
 * ============================================================================
 */

import { Router } from "express";
import { cartController } from "./controller";
import { optionalAuth, requireAuth } from "../auth/middleware";

export const cartRouter = Router();

// Optional Auth enables seamless support for both Guest and Authenticated users
cartRouter.get("/cart", optionalAuth(), (req, res) => cartController.getCart(req, res));
cartRouter.post("/cart/items", optionalAuth(), (req, res) => cartController.addItem(req, res));
cartRouter.patch("/cart/items/:itemId", optionalAuth(), (req, res) => cartController.updateItem(req, res));
cartRouter.delete("/cart/items/:itemId", optionalAuth(), (req, res) => cartController.removeItem(req, res));
cartRouter.delete("/cart", optionalAuth(), (req, res) => cartController.clearCart(req, res));
cartRouter.post("/cart/validate", optionalAuth(), (req, res) => cartController.validateCart(req, res));

// Merge requires verified user account
cartRouter.post("/cart/merge", requireAuth(), (req, res) => cartController.mergeCart(req, res));
