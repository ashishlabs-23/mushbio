/**
 * ============================================================================
 * MUSHBIO ORDER DOMAIN SERVICE (PHASE 08 / PHASE 09)
 *
 * Implements authoritative order creation, atomic stock reservations with saga
 * rollback protection, coupon redemption, idempotency, and order lifecycle.
 * ============================================================================
 */

import { orderRepository, OrderRepository } from "./repository";
import { cartService, CartService } from "../cart/service";
import { cartRepository, CartRepository } from "../cart/repository";
import { addressService, AddressService } from "../addresses/service";
import { productRepository, ProductRepository } from "../products/repository";
import { inventoryService, InventoryService } from "../inventory/service";
import { couponService, CouponService } from "../coupons/service";
import { checkoutCalculator, CheckoutCalculator } from "../checkout/calculator";
import { orderStatusService, OrderStatusService } from "./statusService";
import { generateOrderNumber } from "./orderNumber";
import { toOrderDto } from "./mapper";
import {
  OrderDto,
  OrderListDto,
} from "./dto";
import {
  CreateOrderSchema,
  OrderQuerySchema,
  CreateOrderInput,
  OrderQueryParams,
} from "./schemas";
import {
  OrderDocument,
  OrderItemDocument,
  AdminAuditLogDocument,
  UserAddress,
  CouponDocument,
} from "../types";
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

export class OrderService {
  constructor(
    private repo: OrderRepository = orderRepository,
    private cartSvc: CartService = cartService,
    private cartRepo: CartRepository = cartRepository,
    private addrSvc: AddressService = addressService,
    private prodRepo: ProductRepository = productRepository,
    private invSvc: InventoryService = inventoryService,
    private couponSvc: CouponService = couponService,
    private calc: CheckoutCalculator = checkoutCalculator,
    private statusSvc: OrderStatusService = orderStatusService
  ) {}

  /**
   * 1. Create Authoritative Order from Active Cart
   */
  async createOrder(
    userId: string,
    rawInput: CreateOrderInput,
    idempotencyKey?: string
  ): Promise<OrderDto> {
    const input = CreateOrderSchema.parse(rawInput);

    // 1. Idempotency Guard
    if (idempotencyKey) {
      const existing = await this.repo.getOrderByIdempotencyKey(userId, idempotencyKey);
      if (existing) {
        // Verify request payload matches the original
        if (
          existing.shippingAddressSnapshot.id === input.addressId &&
          existing.shippingMethod === input.shippingMethod &&
          (existing.couponCodeSnapshot || undefined) === (input.couponCode || undefined)
        ) {
          const existingItems = await this.repo.getOrderItems(existing.id);
          return toOrderDto(existing, existingItems);
        } else {
          throw new ConflictError(
            "Idempotency key has already been used with different checkout parameters",
            "IDEMPOTENCY_KEY_REUSE"
          );
        }
      }
    }

    // 2. Load and Verify Shipping Address
    const address = await this.addrSvc.getAddressById(userId, input.addressId);

    // 3. Load and Validate User Cart
    const cart = await this.cartSvc.getCart({ userId });
    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestError("Cannot place an order with an empty cart", "CART_EMPTY");
    }

    // 4. Re-read live authoritative product/variant data & prices at time of order creation
    const orderItems: OrderItemDocument[] = [];
    let authoritativeSubtotal = 0;
    const now = Timestamp.now();
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNumber = generateOrderNumber();

    for (const item of cart.items) {
      const product = await this.prodRepo.getProductById(item.productId);
      const variant = await this.prodRepo.getVariantById(item.productId, item.variantId);

      if (!product || product.status !== "ACTIVE") {
        throw new BadRequestError(`Product '${item.productName}' is no longer active`, "PRODUCT_INACTIVE");
      }

      if (!variant || !variant.isActive) {
        throw new BadRequestError(`Variant '${item.variantLabel}' is no longer available`, "VARIANT_INACTIVE");
      }

      const lineTotal = variant.price * item.quantity;
      authoritativeSubtotal += lineTotal;

      const orderItem: OrderItemDocument = {
        id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        productId: item.productId,
        variantId: item.variantId,
        sku: variant.sku,
        productNameSnapshot: product.name,
        weightSnapshot: variant.weightLabel,
        unitPrice: variant.price, // Immutable price snapshot
        quantity: item.quantity,
        discount: 0,
        tax: 0,
        lineTotal,
        imageSnapshot: product.primaryImageUrl,
      };

      orderItems.push(orderItem);
    }

    // 5. Dynamic Coupon Validation & Calculation
    let appliedCoupon: CouponDocument | undefined;
    let discountAmount = 0;

    if (input.couponCode) {
      const validated = await this.couponSvc.validateCouponForCheckout(
        input.couponCode,
        authoritativeSubtotal,
        userId
      );
      appliedCoupon = validated.coupon;
      discountAmount = validated.discountAmount;
    }

    // 6. Authoritative Totals Calculation
    const totals = this.calc.calculateTotals(authoritativeSubtotal, input.shippingMethod, discountAmount);

    // 7. Atomic Inventory Reservation with Saga Rollback Protection
    const reservedList: { variantId: string; quantity: number }[] = [];
    try {
      for (const orderItem of orderItems) {
        await this.invSvc.reserveStock({
          variantId: orderItem.variantId,
          quantity: orderItem.quantity,
          referenceId: orderId,
        });
        reservedList.push({ variantId: orderItem.variantId, quantity: orderItem.quantity });
      }
    } catch (err: any) {
      // Rollback any reservations already committed in this checkout session
      for (const reserved of reservedList) {
        try {
          await this.invSvc.releaseReservation({
            variantId: reserved.variantId,
            quantity: reserved.quantity,
            referenceId: orderId,
          });
        } catch (releaseErr) {
          console.error(`Failed to rollback reservation for ${reserved.variantId}:`, releaseErr);
        }
      }
      throw new BadRequestError("One or more items do not have sufficient stock to complete order", "INSUFFICIENT_STOCK");
    }

    // 8. Atomic Coupon Redemption
    if (appliedCoupon) {
      try {
        await this.couponSvc.redeemCoupon(appliedCoupon.id, userId, orderId, discountAmount);
      } catch (couponErr: any) {
        // Rollback reserved stock if coupon redemption fails
        for (const reserved of reservedList) {
          try {
            await this.invSvc.releaseReservation({
              variantId: reserved.variantId,
              quantity: reserved.quantity,
              referenceId: orderId,
            });
          } catch (releaseErr) {
            console.error(`Failed to rollback reservation on coupon failure:`, releaseErr);
          }
        }
        throw couponErr;
      }
    }

    // 9. Construct Immutable Order Document
    // Re-read address coordinates from the address DTO (already re-read from Firestore above at step 2)
    const addressSnapshot: UserAddress = {
      id: address.id,
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
      // Phase 10A: GPS fields from the address document (NOT from client checkout params)
      ...(address.latitude !== undefined && { latitude: address.latitude }),
      ...(address.longitude !== undefined && { longitude: address.longitude }),
      ...(address.accuracyMeters !== undefined && { accuracyMeters: address.accuracyMeters }),
      ...(address.locationSource && { locationSource: address.locationSource as "GPS" | "MANUAL" }),
      ...(address.locationCapturedAt && { locationCapturedAt: address.locationCapturedAt as any }),
      ...(address.deliveryInstructions && { deliveryInstructions: address.deliveryInstructions }),
      createdAt: now,
      updatedAt: now,
    };

    // Build delivery location snapshot for fulfillment/admin use
    const deliveryLocation = {
      source: (address.locationSource || "MANUAL") as "GPS" | "MANUAL",
      ...(address.latitude !== undefined && { latitude: address.latitude }),
      ...(address.longitude !== undefined && { longitude: address.longitude }),
      ...(address.accuracyMeters !== undefined && { accuracyMeters: address.accuracyMeters }),
    };

    const orderDoc: OrderDocument = {
      id: orderId,
      orderNumber,
      userId,
      customerEmail: "",
      customerPhone: address.phone,
      customerName: address.recipientName,
      status: "PAYMENT_PENDING",
      paymentStatus: "PENDING",
      currency: "INR",
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
      couponCodeSnapshot: appliedCoupon?.code,
      shippingMethod: input.shippingMethod,
      shippingAddressSnapshot: addressSnapshot,
      notes: input.notes,
      idempotencyKey,
      itemCount: orderItems.reduce((sum, it) => sum + it.quantity, 0),
      // Phase 10A: GPS delivery location snapshot
      deliveryLocation,
      ...(input.deliveryInstructions && { deliveryInstructions: input.deliveryInstructions }),
      createdAt: now,
      updatedAt: now,
    };

    // 10. Persist Order and Items atomically
    await this.repo.createOrder(orderDoc, orderItems);

    // 11. Convert active cart
    await this.cartRepo.updateCart(cart.cartId, { status: "CONVERTED", updatedAt: now });

    // 12. Record Audit Log
    const auditLog: AdminAuditLogDocument = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actorUid: userId,
      action: "ADMIN_UPDATED_ORDER",
      resourceType: "order",
      resourceId: orderId,
      newState: { orderNumber, total: totals.total, status: "PAYMENT_PENDING", coupon: appliedCoupon?.code },
      createdAt: now,
    };
    await this.repo.recordAuditLog(auditLog);

    return toOrderDto(orderDoc, orderItems);
  }

  /**
   * 2. Get Order Detail with Ownership Guard
   */
  async getOrder(userId: string, orderId: string, isStaff = false): Promise<OrderDto> {
    const order = await this.repo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "ORDER_NOT_FOUND");
    }

    if (order.userId !== userId && !isStaff) {
      throw new ForbiddenError("You do not have permission to view this order", "FORBIDDEN");
    }

    const items = await this.repo.getOrderItems(orderId);
    return toOrderDto(order, items);
  }

  /**
   * 3. List Customer Orders with Cursor Pagination
   */
  async listOrders(userId: string, rawQuery: OrderQueryParams): Promise<OrderListDto> {
    const query = OrderQuerySchema.parse(rawQuery);
    const paginated = await this.repo.listUserOrders(userId, query.pageSize, query.cursor);

    const orderDtos: OrderDto[] = [];
    for (const order of paginated.orders) {
      const items = await this.repo.getOrderItems(order.id);
      orderDtos.push(toOrderDto(order, items));
    }

    return {
      data: orderDtos,
      pagination: {
        pageSize: query.pageSize,
        nextCursor: paginated.lastDocId,
        hasMore: paginated.hasMore,
      },
    };
  }

  /**
   * 4. Cancel Order and Release Reserved Inventory and Coupon
   */
  async cancelOrder(userId: string, orderId: string, reason?: string): Promise<OrderDto> {
    const order = await this.repo.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found`, "ORDER_NOT_FOUND");
    }

    if (order.userId !== userId) {
      throw new ForbiddenError("You do not have permission to cancel this order", "FORBIDDEN");
    }

    await this.statusSvc.transitionStatus(userId, orderId, "CANCELLED", reason);
    return this.getOrder(userId, orderId);
  }

  /**
   * 5. Internal Failure Handler for Payments
   */
  async markPaymentFailed(orderId: string, reason?: string): Promise<void> {
    await this.statusSvc.handlePaymentFailure(orderId, "FAILED", reason);
  }
}

export const orderService = new OrderService();
