/**
 * ============================================================================
 * MUSHBIO CART DOMAIN SERVICE (PHASE 07)
 *
 * Implements server-validated cart operations, guest cart merging, authoritative
 * price recalculations, and real-time inventory validation.
 * ============================================================================
 */

import { cartRepository, CartRepository } from "./repository";
import { productRepository, ProductRepository } from "../products/repository";
import { inventoryService, InventoryService } from "../inventory/service";
import {
  CartDto,
  CartValidationResultDto,
  CartValidationIssue,
} from "./dto";
import {
  AddCartItemSchema,
  UpdateCartItemSchema,
  AddCartItemInput,
  UpdateCartItemInput,
  MAX_CART_ITEM_QUANTITY,
} from "./schemas";
import { toCartDto, LiveVariantLookup } from "./mapper";
import { CartDocument, CartItemDocument } from "../types";
import { NotFoundError, BadRequestError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

export interface CartIdentity {
  userId?: string;
  guestId?: string;
}

export class CartService {
  constructor(
    private repo: CartRepository = cartRepository,
    private prodRepo: ProductRepository = productRepository,
    private invService: InventoryService = inventoryService
  ) {}

  /**
   * Helper to ensure cart exists for user or guest
   */
  async getOrCreateCart(identity: CartIdentity): Promise<CartDocument> {
    if (!identity.userId && !identity.guestId) {
      throw new BadRequestError("Cart identity requires either userId or guestId", "INVALID_CART_IDENTITY");
    }

    let cart: CartDocument | null = null;
    if (identity.userId) {
      cart = await this.repo.getActiveCartByUser(identity.userId);
    } else if (identity.guestId) {
      cart = await this.repo.getActiveCartByGuest(identity.guestId);
    }

    if (!cart) {
      const now = Timestamp.now();
      const cartId = `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      cart = {
        id: cartId,
        userId: identity.userId,
        guestId: identity.guestId,
        status: "ACTIVE",
        currency: "INR",
        itemCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await this.repo.createCart(cart);
    }

    return cart;
  }

  /**
   * Helper to build live product/variant/inventory lookup map
   */
  private async buildLiveMap(items: CartItemDocument[]): Promise<Map<string, LiveVariantLookup>> {
    const liveMap = new Map<string, LiveVariantLookup>();
    const variantIds = items.map((it) => it.variantId);
    const availabilityMap = await this.invService.getBatchAvailability(variantIds);

    for (const it of items) {
      const product = await this.prodRepo.getProductById(it.productId);
      const variant = await this.prodRepo.getVariantById(it.productId, it.variantId);

      if (product && variant && product.status === "ACTIVE" && variant.isActive) {
        liveMap.set(it.variantId, {
          productName: product.name,
          variant,
          image: product.primaryImageUrl,
          availability: availabilityMap.get(it.variantId) || "OUT_OF_STOCK",
        });
      }
    }

    return liveMap;
  }

  /**
   * 1. Get Cart with Live Prices & Availability
   */
  async getCart(identity: CartIdentity): Promise<CartDto> {
    const cart = await this.getOrCreateCart(identity);
    const items = await this.repo.getCartItems(cart.id);
    const liveMap = await this.buildLiveMap(items);

    return toCartDto(cart, items, liveMap);
  }

  /**
   * 2. Add Item to Cart
   */
  async addItem(identity: CartIdentity, rawInput: AddCartItemInput): Promise<CartDto> {
    const input = AddCartItemSchema.parse(rawInput);
    const cart = await this.getOrCreateCart(identity);

    // 1. Authoritative Product & Variant Verification
    const product = await this.prodRepo.getProductById(input.productId);
    if (!product || product.status !== "ACTIVE") {
      throw new BadRequestError(`Product '${input.productId}' is not available`, "INVALID_CART_ITEM");
    }

    const variant = await this.prodRepo.getVariantById(input.productId, input.variantId);
    if (!variant || !variant.isActive) {
      throw new BadRequestError(
        `Variant '${input.variantId}' is invalid or does not belong to product '${input.productId}'`,
        "INVALID_CART_ITEM"
      );
    }

    const now = Timestamp.now();
    const existingItem = await this.repo.getCartItemByVariant(cart.id, input.variantId);

    if (existingItem) {
      // Increment quantity, capping at MAX_CART_ITEM_QUANTITY (20)
      const combinedQty = existingItem.quantity + input.quantity;
      if (combinedQty > MAX_CART_ITEM_QUANTITY) {
        throw new BadRequestError(
          `Cannot exceed maximum limit of ${MAX_CART_ITEM_QUANTITY} units per variant`,
          "QUANTITY_LIMIT_EXCEEDED"
        );
      }

      await this.repo.setCartItem(cart.id, {
        ...existingItem,
        quantity: combinedQty,
        displayPriceSnapshot: variant.price,
        updatedAt: now,
      });
    } else {
      const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newItem: CartItemDocument = {
        id: itemId,
        productId: input.productId,
        variantId: input.variantId,
        productNameSnapshot: product.name,
        variantLabelSnapshot: variant.weightLabel,
        imageSnapshot: product.primaryImageUrl,
        quantity: input.quantity,
        displayPriceSnapshot: variant.price,
        createdAt: now,
        updatedAt: now,
      };

      await this.repo.setCartItem(cart.id, newItem);
    }

    const updatedItems = await this.repo.getCartItems(cart.id);
    const totalCount = updatedItems.reduce((sum, it) => sum + it.quantity, 0);
    await this.repo.updateCart(cart.id, { itemCount: totalCount, updatedAt: now });

    return this.getCart(identity);
  }

  /**
   * 3. Update Item Quantity
   */
  async updateItem(identity: CartIdentity, itemId: string, rawInput: UpdateCartItemInput): Promise<CartDto> {
    const input = UpdateCartItemSchema.parse(rawInput);
    const cart = await this.getOrCreateCart(identity);
    const items = await this.repo.getCartItems(cart.id);
    const targetItem = items.find((it) => it.id === itemId);

    if (!targetItem) {
      throw new NotFoundError(`Cart item '${itemId}' not found`, "CART_ITEM_NOT_FOUND");
    }

    const now = Timestamp.now();
    await this.repo.setCartItem(cart.id, {
      ...targetItem,
      quantity: input.quantity,
      updatedAt: now,
    });

    const updatedItems = await this.repo.getCartItems(cart.id);
    const totalCount = updatedItems.reduce((sum, it) => sum + it.quantity, 0);
    await this.repo.updateCart(cart.id, { itemCount: totalCount, updatedAt: now });

    return this.getCart(identity);
  }

  /**
   * 4. Remove Item from Cart
   */
  async removeItem(identity: CartIdentity, itemId: string): Promise<CartDto> {
    const cart = await this.getOrCreateCart(identity);
    const items = await this.repo.getCartItems(cart.id);
    const targetItem = items.find((it) => it.id === itemId);

    if (!targetItem) {
      throw new NotFoundError(`Cart item '${itemId}' not found`, "CART_ITEM_NOT_FOUND");
    }

    await this.repo.deleteCartItem(cart.id, itemId);

    const updatedItems = await this.repo.getCartItems(cart.id);
    const totalCount = updatedItems.reduce((sum, it) => sum + it.quantity, 0);
    await this.repo.updateCart(cart.id, { itemCount: totalCount, updatedAt: Timestamp.now() });

    return this.getCart(identity);
  }

  /**
   * 5. Clear Cart Items
   */
  async clearCart(identity: CartIdentity): Promise<CartDto> {
    const cart = await this.getOrCreateCart(identity);
    await this.repo.clearCartItems(cart.id);
    await this.repo.updateCart(cart.id, { itemCount: 0, updatedAt: Timestamp.now() });

    return this.getCart(identity);
  }

  /**
   * 6. Comprehensive Server-Side Cart Validation
   */
  async validateCart(identity: CartIdentity): Promise<CartValidationResultDto> {
    const cart = await this.getOrCreateCart(identity);
    const items = await this.repo.getCartItems(cart.id);
    const issues: CartValidationIssue[] = [];
    let subtotal = 0;

    const variantIds = items.map((it) => it.variantId);
    const availabilityMap = await this.invService.getBatchAvailability(variantIds);

    for (const it of items) {
      const product = await this.prodRepo.getProductById(it.productId);
      const variant = await this.prodRepo.getVariantById(it.productId, it.variantId);

      if (!product || product.status !== "ACTIVE") {
        issues.push({
          itemId: it.id,
          productId: it.productId,
          variantId: it.variantId,
          code: "PRODUCT_INACTIVE",
          message: `Product '${it.productNameSnapshot}' is no longer active.`,
          severity: "BLOCKER",
        });
        continue;
      }

      if (!variant || !variant.isActive) {
        issues.push({
          itemId: it.id,
          productId: it.productId,
          variantId: it.variantId,
          code: "VARIANT_INACTIVE",
          message: `Variant '${it.variantLabelSnapshot}' is no longer active.`,
          severity: "BLOCKER",
        });
        continue;
      }

      // Check Price Changes
      if (variant.price !== it.displayPriceSnapshot) {
        issues.push({
          itemId: it.id,
          productId: it.productId,
          variantId: it.variantId,
          code: "PRICE_CHANGED",
          message: `Price for '${product.name} (${variant.weightLabel})' changed from ₹${it.displayPriceSnapshot} to ₹${variant.price}.`,
          severity: "WARNING",
        });
      }

      // Check Inventory Availability
      const avail = availabilityMap.get(it.variantId);
      if (avail === "OUT_OF_STOCK") {
        issues.push({
          itemId: it.id,
          productId: it.productId,
          variantId: it.variantId,
          code: "OUT_OF_STOCK",
          message: `'${product.name} (${variant.weightLabel})' is currently out of stock.`,
          severity: "BLOCKER",
        });
      }

      subtotal += variant.price * it.quantity;
    }

    const hasBlockers = issues.some((iss) => iss.severity === "BLOCKER");

    return {
      valid: !hasBlockers,
      subtotal,
      currency: cart.currency || "INR",
      itemCount: items.reduce((sum, it) => sum + it.quantity, 0),
      issues,
    };
  }

  /**
   * 7. Merge Guest Cart into Authenticated User Cart
   */
  async mergeGuestCart(userId: string, guestIdOrCartId: string): Promise<CartDto> {
    let guestCart: CartDocument | null = await this.repo.getActiveCartByGuest(guestIdOrCartId);
    if (!guestCart) {
      guestCart = await this.repo.getCartById(guestIdOrCartId);
    }

    if (!guestCart || guestCart.status !== "ACTIVE") {
      return this.getCart({ userId });
    }

    const guestItems = await this.repo.getCartItems(guestCart.id);
    const userCart = await this.getOrCreateCart({ userId });

    for (const gItem of guestItems) {
      const existing = await this.repo.getCartItemByVariant(userCart.id, gItem.variantId);
      const now = Timestamp.now();

      if (existing) {
        const mergedQty = Math.min(existing.quantity + gItem.quantity, MAX_CART_ITEM_QUANTITY);
        await this.repo.setCartItem(userCart.id, {
          ...existing,
          quantity: mergedQty,
          updatedAt: now,
        });
      } else {
        const newItem: CartItemDocument = {
          id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          productId: gItem.productId,
          variantId: gItem.variantId,
          productNameSnapshot: gItem.productNameSnapshot,
          variantLabelSnapshot: gItem.variantLabelSnapshot,
          imageSnapshot: gItem.imageSnapshot,
          quantity: Math.min(gItem.quantity, MAX_CART_ITEM_QUANTITY),
          displayPriceSnapshot: gItem.displayPriceSnapshot,
          createdAt: now,
          updatedAt: now,
        };
        await this.repo.setCartItem(userCart.id, newItem);
      }
    }

    // Mark guest cart converted
    await this.repo.updateCart(guestCart.id, { status: "CONVERTED", updatedAt: Timestamp.now() });

    // Update user cart item count
    const updatedUserItems = await this.repo.getCartItems(userCart.id);
    const totalCount = updatedUserItems.reduce((sum, it) => sum + it.quantity, 0);
    await this.repo.updateCart(userCart.id, { itemCount: totalCount, updatedAt: Timestamp.now() });

    return this.getCart({ userId });
  }
}

export const cartService = new CartService();
