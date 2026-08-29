/**
 * ============================================================================
 * MUSHBIO CHECKOUT DOMAIN SERVICE (PHASE 08 / PHASE 09)
 *
 * Implements live cart loading, stock & pricing validation, dynamic coupon
 * calculation, and authoritative financial breakdown.
 * ============================================================================
 */

import { CartService, cartService } from "../cart/service";
import { AddressService, addressService } from "../addresses/service";
import { ProductRepository, productRepository } from "../products/repository";
import { InventoryService, inventoryService } from "../inventory/service";
import { CouponService, couponService } from "../coupons/service";
import { CheckoutCalculator, checkoutCalculator } from "./calculator";
import {
  CheckoutPreviewResultDto,
  CheckoutItemPreviewDto,
  CheckoutIssue,
  CheckoutPreviewRequestDto,
  CheckoutCouponSummaryDto,
} from "./dto";
import { CheckoutPreviewSchema } from "./schemas";
import { BadRequestError } from "../utils/errors";

export class CheckoutService {
  constructor(
    private cartSvc: CartService = cartService,
    private addrSvc: AddressService = addressService,
    private prodRepo: ProductRepository = productRepository,
    private invSvc: InventoryService = inventoryService,
    private couponSvc: CouponService = couponService,
    private calc: CheckoutCalculator = checkoutCalculator
  ) {}

  /**
   * Generate authoritative checkout preview
   */
  async generatePreview(
    userId: string,
    rawInput: CheckoutPreviewRequestDto
  ): Promise<CheckoutPreviewResultDto> {
    const input = CheckoutPreviewSchema.parse(rawInput);

    // 1. Verify and Load Shipping Address
    const address = await this.addrSvc.getAddressById(userId, input.addressId);

    // 2. Load and Validate User's Active Cart
    const cart = await this.cartSvc.getCart({ userId });
    if (!cart.items || cart.items.length === 0) {
      throw new BadRequestError("Cannot checkout with an empty cart", "CART_EMPTY");
    }

    const issues: CheckoutIssue[] = [];
    const previewItems: CheckoutItemPreviewDto[] = [];
    let authoritativeSubtotal = 0;

    const variantIds = cart.items.map((it) => it.variantId);
    const availabilityMap = await this.invSvc.getBatchAvailability(variantIds);

    for (const it of cart.items) {
      const product = await this.prodRepo.getProductById(it.productId);
      const variant = await this.prodRepo.getVariantById(it.productId, it.variantId);

      if (!product || product.status !== "ACTIVE") {
        issues.push({
          code: "PRODUCT_INACTIVE",
          message: `Product '${it.productName}' is no longer active.`,
          severity: "BLOCKER",
          productId: it.productId,
          variantId: it.variantId,
        });
        continue;
      }

      if (!variant || !variant.isActive) {
        issues.push({
          code: "VARIANT_INACTIVE",
          message: `Variant '${it.variantLabel}' is no longer available.`,
          severity: "BLOCKER",
          productId: it.productId,
          variantId: it.variantId,
        });
        continue;
      }

      // Live inventory availability
      const availability = availabilityMap.get(it.variantId) || "OUT_OF_STOCK";
      if (availability === "OUT_OF_STOCK") {
        issues.push({
          code: "OUT_OF_STOCK",
          message: `'${product.name} (${variant.weightLabel})' is out of stock.`,
          severity: "BLOCKER",
          productId: it.productId,
          variantId: it.variantId,
        });
      }

      // Check price changes
      if (variant.price !== it.displayPriceSnapshot) {
        issues.push({
          code: "PRICE_CHANGED",
          message: `Price for '${product.name} (${variant.weightLabel})' updated to ₹${variant.price}.`,
          severity: "WARNING",
          productId: it.productId,
          variantId: it.variantId,
        });
      }

      const lineTotal = variant.price * it.quantity;
      authoritativeSubtotal += lineTotal;

      previewItems.push({
        productId: it.productId,
        variantId: it.variantId,
        productName: product.name,
        variantLabel: variant.weightLabel,
        unitPrice: variant.price,
        quantity: it.quantity,
        lineTotal,
        image: product.primaryImageUrl,
        availability,
      });
    }

    // 3. Dynamic Coupon Validation & Discount
    let couponSummary: CheckoutCouponSummaryDto | undefined;
    let discount = 0;

    if (input.couponCode) {
      try {
        const { coupon, discountAmount } = await this.couponSvc.validateCouponForCheckout(
          input.couponCode,
          authoritativeSubtotal,
          userId
        );
        discount = discountAmount;
        couponSummary = {
          code: coupon.code,
          type: coupon.type,
          discount: discountAmount,
        };
      } catch (err: any) {
        const errorCode = err.errorCode || "COUPON_NOT_FOUND";
        issues.push({
          code: errorCode,
          message: err.message || `Coupon '${input.couponCode}' could not be applied`,
          severity: "WARNING",
        });
      }
    }

    const hasBlockers = issues.some((iss) => iss.severity === "BLOCKER");
    const totals = this.calc.calculateTotals(authoritativeSubtotal, input.shippingMethod, discount);

    return {
      valid: !hasBlockers,
      currency: "INR",
      items: previewItems,
      itemCount: previewItems.reduce((sum, it) => sum + it.quantity, 0),
      shippingAddress: address,
      shippingMethod: input.shippingMethod,
      coupon: couponSummary,
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
      issues,
    };
  }
}

export const checkoutService = new CheckoutService();
