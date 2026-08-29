/**
 * ============================================================================
 * MUSHBIO CART CONTROLLER (PHASE 07)
 * ============================================================================
 */

import { Request, Response } from "express";
import { cartService, CartIdentity } from "./service";
import { handleFunctionError, BadRequestError } from "../utils/errors";

export function getCartIdentity(req: Request, res: Response): CartIdentity {
  if (req.auth?.uid) {
    return { userId: req.auth.uid };
  }

  let guestId =
    (req.headers["x-guest-cart-id"] as string) ||
    (req.headers["x-guest-id"] as string) ||
    (req.query.guestId as string) ||
    req.body?.guestId;

  if (!guestId) {
    guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    res.setHeader("X-Guest-Cart-Id", guestId);
  }

  return { guestId };
}

export class CartController {
  /**
   * GET /api/v1/cart
   */
  async getCart(req: Request, res: Response): Promise<void> {
    try {
      const identity = getCartIdentity(req, res);
      const cart = await cartService.getCart(identity);
      res.status(200).json({ data: cart });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/cart/items
   */
  async addItem(req: Request, res: Response): Promise<void> {
    try {
      const identity = getCartIdentity(req, res);
      const cart = await cartService.addItem(identity, req.body);
      res.status(201).json({ data: cart });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * PATCH /api/v1/cart/items/:itemId
   */
  async updateItem(req: Request, res: Response): Promise<void> {
    try {
      const identity = getCartIdentity(req, res);
      const itemId = String(req.params.itemId);
      const cart = await cartService.updateItem(identity, itemId, req.body);
      res.status(200).json({ data: cart });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * DELETE /api/v1/cart/items/:itemId
   */
  async removeItem(req: Request, res: Response): Promise<void> {
    try {
      const identity = getCartIdentity(req, res);
      const itemId = String(req.params.itemId);
      const cart = await cartService.removeItem(identity, itemId);
      res.status(200).json({ data: cart });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * DELETE /api/v1/cart
   */
  async clearCart(req: Request, res: Response): Promise<void> {
    try {
      const identity = getCartIdentity(req, res);
      const cart = await cartService.clearCart(identity);
      res.status(200).json({ data: cart });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/cart/validate
   */
  async validateCart(req: Request, res: Response): Promise<void> {
    try {
      const identity = getCartIdentity(req, res);
      const validation = await cartService.validateCart(identity);
      res.status(200).json({ data: validation });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/cart/merge
   */
  async mergeCart(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) {
        throw new BadRequestError("Authenticated session required to merge guest cart", "AUTH_REQUIRED");
      }

      const { guestCartId } = req.body;
      if (!guestCartId) {
        throw new BadRequestError("guestCartId is required", "INVALID_INPUT");
      }

      const mergedCart = await cartService.mergeGuestCart(req.auth.uid, guestCartId);
      res.status(200).json({ data: mergedCart });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const cartController = new CartController();
