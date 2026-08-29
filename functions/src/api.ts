/**
 * ============================================================================
 * MUSHBIO MAIN REST API APP (EXPRESS / CLOUD FUNCTIONS V2)
 *
 * Base Path: /api/v1
 * Routes:
 *   - /api/v1/categories
 *   - /api/v1/products
 *   - /api/v1/health
 * ============================================================================
 */

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { categoryRouter } from "./categories/routes";
import { productRouter } from "./products/routes";
import { authRouter } from "./auth/routes";
import { addressRouter } from "./addresses/routes";
import { cartRouter } from "./cart/routes";
import { checkoutRouter } from "./checkout/routes";
import { orderRouter } from "./orders/routes";
import { couponRouter } from "./coupons/routes";
import { paymentRouter } from "./payments/routes";
import { locationRouter } from "./locations/routes";
import { adminDeliveryRouter } from "./admin/deliveryRoutes";
import { config } from "./config/environment";
import { handleFunctionError, NotFoundError } from "./utils/errors";
import { safeLogger } from "./utils/logger";

export const app = express();

// Global Middlewares
app.use(cors({ origin: true }));

// Express JSON Parser with Raw Body Preservation (Mandatory for Webhook HMAC Signature Verification)
// Max payload size capped at 1MB to protect against oversized payload abuse
app.use(
  express.json({
    limit: "1mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);


// Request logging in development
app.use((req: Request, res: Response, next: NextFunction) => {
  safeLogger.debug(`${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });
  next();
});

// Root API v1 Router
const apiV1Router = express.Router();

// 1. Health check
apiV1Router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "mushbio-backend",
    version: "1.0.0",
    environment: config.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

// 2. Categories
apiV1Router.use("/categories", categoryRouter);

// 3. Products
apiV1Router.use("/products", productRouter);

// 4. User Profile & Auth Context
apiV1Router.use("/", authRouter);

// 5. Address Book
apiV1Router.use("/", addressRouter);

// 6. Cart Engine
apiV1Router.use("/", cartRouter);

// 7. Checkout Preparation & Preview
apiV1Router.use("/", checkoutRouter);

// 8. Order Lifecycle & Management
apiV1Router.use("/", orderRouter);

// 9. Dynamic Coupon Validation
apiV1Router.use("/", couponRouter);

// 10. Razorpay Payments
apiV1Router.use("/payments", paymentRouter);

// 11. Reverse Geocoding (requireAuth — GPS only on user action, never public)
apiV1Router.use("/locations", locationRouter);

// 12. Admin Delivery (requireAuth + requireRole enforced inside router)
apiV1Router.use("/admin", adminDeliveryRouter);

// Mount under /api/v1 and root
app.use("/api/v1", apiV1Router);
app.use("/", apiV1Router);

// 404 Catch-All
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`, "ROUTE_NOT_FOUND"));
});

// Global Error Handler
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  handleFunctionError(err, res);
});
