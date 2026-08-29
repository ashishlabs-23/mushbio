/**
 * ============================================================================
 * MUSHBIO ORDER STATUS & STATE MACHINE SERVICE (PHASE 08 / PHASE 09)
 *
 * Enforces legal state transitions, automated inventory and coupon release on
 * cancellation, and immutable audit trail logging.
 * ============================================================================
 */

import { orderRepository, OrderRepository } from "./repository";
import { inventoryService, InventoryService } from "../inventory/service";
import { couponService, CouponService } from "../coupons/service";
import { couponRepository, CouponRepository } from "../coupons/repository";
import { OrderStatus, PaymentStatus, AdminAuditLogDocument } from "../types";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

// Explicit State Machine Transition Table
const LEGAL_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["CONFIRMED", "REFUNDED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [], // Terminal State
  REFUNDED: [], // Terminal State
};

export class OrderStatusService {
  constructor(
    private repo: OrderRepository = orderRepository,
    private invSvc: InventoryService = inventoryService,
    private couponSvc: CouponService = couponService,
    private couponRepo: CouponRepository = couponRepository
  ) {}

  /**
   * Validate if transition from currentStatus to nextStatus is permitted
   */
  canTransition(currentStatus: OrderStatus, nextStatus: OrderStatus): boolean {
    const allowed = LEGAL_STATUS_TRANSITIONS[currentStatus];
    return allowed ? allowed.includes(nextStatus) : false;
  }

  /**
   * Transition order to a new status with business side effects
   */
  async transitionStatus(
    actorUid: string,
    orderId: string,
    nextStatus: OrderStatus,
    notes?: string
  ): Promise<void> {
    const order = await this.repo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "ORDER_NOT_FOUND");
    }

    if (order.status === nextStatus) {
      return; // No-op idempotent
    }

    if (!this.canTransition(order.status, nextStatus)) {
      throw new BadRequestError(
        `Illegal order status transition from '${order.status}' to '${nextStatus}'`,
        "ILLEGAL_STATUS_TRANSITION"
      );
    }

    const previousStatus = order.status;
    const now = Timestamp.now();

    // Side Effect: Releasing reserved inventory & coupon on Cancellation
    if (nextStatus === "CANCELLED") {
      const items = await this.repo.getOrderItems(orderId);
      for (const item of items) {
        try {
          await this.invSvc.releaseReservation({
            variantId: item.variantId,
            quantity: item.quantity,
            referenceId: orderId,
          });
        } catch (err) {
          console.warn(`[Inventory Release Warning] Failed to release ${item.quantity} units for variant ${item.variantId}:`, err);
        }
      }

      if (order.couponCodeSnapshot) {
        try {
          const coupon = await this.couponRepo.getCouponByNormalizedCode(order.couponCodeSnapshot);
          if (coupon) {
            await this.couponSvc.releaseCoupon(coupon.id, orderId);
          }
        } catch (cpnErr) {
          console.warn(`[Coupon Release Warning] Failed to release coupon ${order.couponCodeSnapshot}:`, cpnErr);
        }
      }
    }

    // Update Order Document
    const updates: any = {
      status: nextStatus,
      updatedAt: now,
    };
    if (notes) updates.notes = notes;
    if (nextStatus === "PAID") updates.paymentStatus = "PAID";
    if (nextStatus === "REFUNDED") updates.paymentStatus = "REFUNDED";

    await this.repo.updateOrder(orderId, updates);

    // Audit Logging
    const auditLog: AdminAuditLogDocument = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUid,
      action: "ADMIN_UPDATED_ORDER",
      resourceType: "order",
      resourceId: orderId,
      previousState: { status: previousStatus, paymentStatus: order.paymentStatus },
      newState: { status: nextStatus, notes },
      createdAt: now,
    };
    await this.repo.recordAuditLog(auditLog);
  }

  /**
   * Handle payment failure transition
   */
  async handlePaymentFailure(orderId: string, _paymentStatus: PaymentStatus = "FAILED", reason?: string): Promise<void> {
    const order = await this.repo.getOrderById(orderId);
    if (!order) throw new NotFoundError(`Order '${orderId}' not found`, "ORDER_NOT_FOUND");

    const items = await this.repo.getOrderItems(orderId);
    for (const item of items) {
      try {
        await this.invSvc.releaseReservation({
          variantId: item.variantId,
          quantity: item.quantity,
          referenceId: orderId,
        });
      } catch (err) {
        console.warn(`[Inventory Release Warning] Failed to release ${item.quantity} units on payment failure:`, err);
      }
    }

    if (order.couponCodeSnapshot) {
      try {
        const coupon = await this.couponRepo.getCouponByNormalizedCode(order.couponCodeSnapshot);
        if (coupon) {
          await this.couponSvc.releaseCoupon(coupon.id, orderId);
        }
      } catch (cpnErr) {
        console.warn(`[Coupon Release Warning] Failed to release coupon ${order.couponCodeSnapshot}:`, cpnErr);
      }
    }

    await this.repo.updateOrder(orderId, {
      paymentStatus: "FAILED",
      status: "CANCELLED",
      notes: reason || "Payment failed or was declined",
      updatedAt: Timestamp.now(),
    });
  }
}

export const orderStatusService = new OrderStatusService();
