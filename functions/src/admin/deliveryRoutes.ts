/**
 * ============================================================================
 * MUSHBIO ADMIN DELIVERY ROUTES (PHASE 10A)
 *
 * GET /api/v1/admin/orders/:orderId/delivery
 *
 * Returns delivery address + GPS coordinates for fulfillment/dispatch use.
 * Role-protected: ADMIN and STAFF only.
 *
 * Privacy:
 *   - Only accessible to authenticated ADMIN or STAFF roles.
 *   - Customers cannot access this endpoint.
 *   - Coordinates are NOT exposed through any public product or order APIs.
 *   - Coordinates never logged by this handler.
 *
 * Future admin map support:
 *   The returned latitude/longitude is provider-agnostic.
 *   The admin frontend can render on any map (Google Maps, Mapbox, OSM, etc.).
 * ============================================================================
 */

import { Router, Request, Response } from "express";
import { requireAuth, requireRole } from "../auth/middleware";
import { orderRepository } from "../orders/repository";
import { handleFunctionError, NotFoundError } from "../utils/errors";
import { UserRole } from "../types";

export const adminDeliveryRouter = Router();

adminDeliveryRouter.get(
  "/orders/:orderId/delivery",
  requireAuth(),
  requireRole(["ADMIN", "STAFF"] as UserRole[]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const orderId = req.params["orderId"] as string;

      const order = await orderRepository.getOrderById(orderId);
      if (!order) {
        throw new NotFoundError(`Order '${orderId}' not found`, "ORDER_NOT_FOUND");
      }


      const addr = order.shippingAddressSnapshot;

      // Build response — never log coordinates
      const responseData = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        customer: {
          name: order.customerName || addr.recipientName,
          phone: order.customerPhone || addr.phone,
        },
        address: {
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          postalCode: addr.postalCode,
          country: addr.country || "IN",
        },
        // GPS delivery location (null coordinates if address was manually entered)
        location: order.deliveryLocation
          ? {
              latitude: order.deliveryLocation.latitude ?? null,
              longitude: order.deliveryLocation.longitude ?? null,
              accuracyMeters: order.deliveryLocation.accuracyMeters ?? null,
              source: order.deliveryLocation.source,
            }
          : {
              latitude: null,
              longitude: null,
              accuracyMeters: null,
              source: "MANUAL",
            },
        deliveryInstructions: order.deliveryInstructions ?? addr.deliveryInstructions ?? null,
      };

      res.status(200).json({ data: responseData });
    } catch (err) {
      handleFunctionError(err, res);
    }
  }
);
