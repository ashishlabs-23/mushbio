/**
 * ============================================================================
 * MUSHBIO ORDER MAPPER (PHASE 08)
 * ============================================================================
 */

import { OrderDocument, OrderItemDocument } from "../types";
import { OrderDto, OrderItemDto } from "./dto";

export function toOrderItemDto(item: OrderItemDocument): OrderItemDto {
  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    productName: item.productNameSnapshot,
    variantLabel: item.weightSnapshot,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    discount: item.discount,
    tax: item.tax,
    lineTotal: item.lineTotal,
    image: item.imageSnapshot,
  };
}

export function toOrderDto(order: OrderDocument, items: OrderItemDocument[]): OrderDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    currency: order.currency || "INR",
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    tax: order.tax,
    total: order.total,
    shippingMethod: order.shippingMethod,
    shippingAddress: order.shippingAddressSnapshot,
    couponCode: order.couponCodeSnapshot,
    items: items.map(toOrderItemDto),
    itemCount: items.reduce((sum, it) => sum + it.quantity, 0),
    notes: order.notes,
    trackingNumber: order.trackingNumber,
    courierPartner: order.courierPartner,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
