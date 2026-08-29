/**
 * ============================================================================
 * MUSHBIO PAYMENT ROUTES (PHASE 10 & PHASE 11)
 *
 * REST Endpoints for creating Razorpay checkout sessions, verifying payments,
 * ingesting Razorpay webhooks, and admin payment reconciliation.
 * Base path: /api/v1/payments
 * ============================================================================
 */

import { Router, Request, Response } from "express";
import { paymentService, PaymentService } from "./service";
import { webhookService, WebhookService } from "./webhookService";
import { paymentReconciliationService, PaymentReconciliationService } from "./reconciliationService";
import { createPaymentOrderSchema, verifyPaymentSchema, orderIdParamSchema } from "./schemas";
import { requireAuth, requireActiveAccount, requireRole } from "../auth/middleware";
import { handleFunctionError, BadRequestError } from "../utils/errors";
import { UserRole } from "../types";

export function createPaymentRouter(
  svc: PaymentService = paymentService,
  whSvc: WebhookService = webhookService,
  reconSvc: PaymentReconciliationService = paymentReconciliationService
): Router {
  const router = Router();

  // ==========================================================================
  // 1. PUBLIC WEBHOOK ENDPOINT (PHASE 11)
  // Razorpay calls this endpoint directly with x-razorpay-signature header.
  // Must NOT require customer Firebase authentication.
  // ==========================================================================
  router.post("/webhook", async (req: Request, res: Response) => {
    try {
      const signatureHeader = req.get("x-razorpay-signature") || "";
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);

      if (!signatureHeader) {
        throw new BadRequestError("Missing x-razorpay-signature header", "WEBHOOK_SIGNATURE_MISSING");
      }

      const result = await whSvc.processWebhook(rawBody, signatureHeader, req.body);
      res.status(200).json({ data: result });
    } catch (err) {
      handleFunctionError(err, res);
    }
  });

  // ==========================================================================
  // 2. ADMIN RECONCILIATION ENDPOINT (PHASE 11)
  // Protected with ADMIN / STAFF role guard
  // ==========================================================================
  router.get(
    "/admin/reconciliation/:orderId",
    requireAuth(),
    requireActiveAccount(),
    requireRole(["ADMIN", "STAFF"] as UserRole[]),
    async (req: Request, res: Response) => {
      try {
        const parsed = orderIdParamSchema.safeParse(req.params);
        if (!parsed.success) {
          throw new BadRequestError("Invalid order ID", "VALIDATION_ERROR");
        }

        const data = await reconSvc.reconcilePayment(parsed.data.orderId);
        res.status(200).json({ data });
      } catch (err) {
        handleFunctionError(err, res);
      }
    }
  );

  // ==========================================================================
  // 3. AUTHENTICATED CUSTOMER PAYMENT ENDPOINTS (PHASE 10)
  // Requires customer login and active account
  // ==========================================================================

  /**
   * POST /api/v1/payments/create-order
   * Creates a Razorpay checkout session for a pending order
   */
  router.post("/create-order", requireAuth(), requireActiveAccount(), async (req: Request, res: Response) => {
    try {
      const parsed = createPaymentOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(
          `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          "VALIDATION_ERROR"
        );
      }

      const userId = req.auth!.uid;
      const checkoutData = await svc.createPaymentOrder(userId, parsed.data.orderId);
      res.status(201).json({ data: checkoutData });
    } catch (err) {
      handleFunctionError(err, res);
    }
  });

  /**
   * POST /api/v1/payments/verify
   * Verifies Razorpay payment signature and transitions order to PAID
   */
  router.post("/verify", requireAuth(), requireActiveAccount(), async (req: Request, res: Response) => {
    try {
      const parsed = verifyPaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError(
          `Validation error: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          "VALIDATION_ERROR"
        );
      }

      const userId = req.auth!.uid;
      const result = await svc.verifyPayment(userId, parsed.data);
      res.status(200).json({ data: result });
    } catch (err) {
      handleFunctionError(err, res);
    }
  });

  /**
   * GET /api/v1/payments/:orderId
   * Retrieves safe payment history for an order
   */
  router.get("/:orderId", requireAuth(), requireActiveAccount(), async (req: Request, res: Response) => {
    try {
      const parsed = orderIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        throw new BadRequestError("Invalid order ID", "VALIDATION_ERROR");
      }

      const userId = req.auth!.uid;
      const payments = await svc.getOrderPayments(userId, parsed.data.orderId);
      res.status(200).json({ data: payments });
    } catch (err) {
      handleFunctionError(err, res);
    }
  });

  return router;
}

export const paymentRouter = createPaymentRouter();
