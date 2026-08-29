/**
 * ============================================================================
 * MUSHBIO CART MAPPER (PHASE 07)
 *
 * Enriches cart item documents with live authoritative product prices and
 * real-time inventory availability.
 * ============================================================================
 */

import { CartDocument, CartItemDocument, ProductVariantDocument } from "../types";
import { StockAvailabilityStatus } from "../inventory/dto";
import { CartDto, CartItemDto } from "./dto";

export interface LiveVariantLookup {
  productName: string;
  variant: ProductVariantDocument;
  image?: string;
  availability: StockAvailabilityStatus;
}

export function toCartDto(
  cart: CartDocument,
  items: CartItemDocument[],
  liveDataMap: Map<string, LiveVariantLookup>
): CartDto {
  let subtotal = 0;
  let hasUnavailableItems = false;
  let hasPriceChanges = false;

  const itemDtos: CartItemDto[] = items.map((item) => {
    const live = liveDataMap.get(item.variantId);
    const currentPrice = live ? live.variant.price : item.displayPriceSnapshot;
    const availability: StockAvailabilityStatus = live ? live.availability : "OUT_OF_STOCK";
    const priceChanged = live ? live.variant.price !== item.displayPriceSnapshot : false;

    if (priceChanged) hasPriceChanges = true;
    if (availability === "OUT_OF_STOCK") hasUnavailableItems = true;

    const itemSubtotal = currentPrice * item.quantity;
    subtotal += itemSubtotal;

    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: live?.productName || item.productNameSnapshot,
      variantLabel: live?.variant.weightLabel || item.variantLabelSnapshot,
      image: live?.image || item.imageSnapshot,
      quantity: item.quantity,
      currentUnitPrice: currentPrice,
      displayPriceSnapshot: item.displayPriceSnapshot,
      priceChanged,
      availability,
      itemSubtotal,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  return {
    cartId: cart.id,
    userId: cart.userId,
    guestId: cart.guestId,
    status: cart.status,
    currency: cart.currency || "INR",
    items: itemDtos,
    itemCount: items.reduce((sum, it) => sum + it.quantity, 0),
    subtotal,
    hasUnavailableItems,
    hasPriceChanges,
    createdAt: cart.createdAt,
    updatedAt: cart.updatedAt,
  };
}
