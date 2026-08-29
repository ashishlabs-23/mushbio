/**
 * ============================================================================
 * MUSHBIO ORDER CONTROLLER & ROUTES (PHASE 08)
 * ============================================================================
 */

import { Request, Response, Router } from "express";
import { orderService } from "./service";
import { requireAuth, requireActiveAccount } from "../auth/middleware";
import { handleFunctionError, UnauthorizedError } from "../utils/errors";

export class OrderController {
  /**
   * POST /api/v1/orders
   */
  async createOrder(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");

      const idempotencyKey =
        (req.headers["idempotency-key"] as string) ||
        (req.headers["x-idempotency-key"] as string);

      const order = await orderService.createOrder(req.auth.uid, req.body, idempotencyKey);
      res.status(201).json({ data: order });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * GET /api/v1/orders/:orderId
   */
  async getOrder(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      const orderId = String(req.params.orderId);
      const isStaff = req.auth.role === "STAFF" || req.auth.role === "ADMIN";

      const order = await orderService.getOrder(req.auth.uid, orderId, isStaff);
      res.status(200).json({ data: order });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * GET /api/v1/orders
   */
  async listOrders(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");

      const queryResult = await orderService.listOrders(req.auth.uid, {
        pageSize: req.query.pageSize as any,
        cursor: req.query.cursor as string,
      });

      res.status(200).json(queryResult);
    } catch (err) {
      handleFunctionError(err, res);
    }
  }

  /**
   * POST /api/v1/orders/:orderId/cancel
   */
  async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      if (!req.auth?.uid) throw new UnauthorizedError("Authentication required", "AUTH_REQUIRED");
      const orderId = String(req.params.orderId);
      const reason = req.body?.reason;

      const order = await orderService.cancelOrder(req.auth.uid, orderId, reason);
      res.status(200).json({ data: order });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
}

export const orderController = new OrderController();

export const orderRouter = Router();

orderRouter.post("/orders", requireAuth(), requireActiveAccount(), (req, res) =>
  orderController.createOrder(req, res)
);
orderRouter.get("/orders", requireAuth(), requireActiveAccount(), (req, res) =>
  orderController.listOrders(req, res)
);
orderRouter.get("/orders/:orderId", requireAuth(), requireActiveAccount(), (req, res) =>
  orderController.getOrder(req, res)
);
orderRouter.post("/orders/:orderId/cancel", requireAuth(), requireActiveAccount(), (req, res) =>
  orderController.cancelOrder(req, res)
);
