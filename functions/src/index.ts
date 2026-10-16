/**
 * ============================================================================
 * MUSHBIO CLOUD FUNCTIONS — MAIN ENTRYPOINT (PHASE 03)
 *
 * Exposes:
 *   - api: Main Express API mounted at /api/v1 (Categories, Products, Health)
 *   - health: Standalone HTTP health check
 * ============================================================================
 */

import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { app } from "./api";
import { config } from "./config/environment";
import { safeLogger } from "./utils/logger";
import { handleFunctionError } from "./utils/errors";

// Set global options for all Functions
setGlobalOptions({
  region: "asia-south1", // Mumbai region for minimal latency in India
  maxInstances: 10,
  concurrency: 80,
  timeoutSeconds: 60,
});

/**
 * Main MushBio REST API Endpoint
 * Exposes /api/v1/products, /api/v1/categories, /api/v1/health
 */
export const api = onRequest(
  {
    cors: true,
    invoker: "public",
  },
  app
);

/**
 * Standalone Health Check Endpoint
 */
export const health = onRequest(
  {
    cors: true,
    invoker: "public",
  },
  (req, res) => {
    try {
      safeLogger.info("Health check ping received", {
        method: req.method,
        ip: req.ip,
      });

      res.status(200).json({
        status: "ok",
        service: "mushbio-backend",
        version: "1.0.0",
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
);

/**
 * Scheduled cleanup of stale PAYMENT_PENDING orders (runs every 15 minutes)
 * Automatically releases locked inventory for abandoned checkout sessions.
 */
export const cleanupExpiredReservations = onRequest(
  {
    region: "asia-south1",
    timeoutSeconds: 120,
    invoker: "private",
  },
  async (req, res) => {
    try {
      safeLogger.info("Starting cleanup of expired order reservations");
      const { orderService } = await import("./orders/service");
      const result = await orderService.cleanupStalePendingOrders(15);
      safeLogger.info("Expired reservations cleanup completed", result);
      res.status(200).json({ status: "ok", data: result });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
);

// Module exports
export * from "./categories";
export * from "./products";
export * from "./auth";
export * from "./addresses";
export * from "./inventory";
export * from "./cart";
export * from "./shipping";
export * from "./coupons";
export * from "./checkout";
export * from "./orders";
export * from "./payments";
export * from "./admin";
export * from "./notifications";
