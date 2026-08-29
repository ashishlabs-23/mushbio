/**
 * ============================================================================
 * MUSHBIO COUPON DOMAIN SERVICE (PHASE 09)
 *
 * Implements business validation, discount calculation, concurrency safety,
 * per-user limits, and atomic coupon redemption.
 * ============================================================================
 */

import { couponRepository, CouponRepository } from "./repository";
import { couponCalculator, CouponCalculator } from "./calculator";
import { cartService, CartService } from "../cart/service";
import { CouponDocument, CouponRedemptionDocument } from "../types";
import { CouponValidationDto } from "./dto";
import { ValidateCouponSchema } from "./schemas";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { Timestamp } from "firebase-admin/firestore";

export class CouponService {
  constructor(
    private repo: CouponRepository = couponRepository,
    private calc: CouponCalculator = couponCalculator,
    private cartSvc: CartService = cartService
  ) {}

  /**
   * Normalize coupon code (trim + uppercase)
   */
  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  /**
   * 1. Public Read-Only Validation (Does NOT consume usage)
   */
  async validateCoupon(
    userId: string,
    rawCode: string,
    subtotalOverride?: number
  ): Promise<CouponValidationDto> {
    const input = ValidateCouponSchema.parse({ code: rawCode });
    const normalized = this.normalizeCode(input.code);

    let subtotal = subtotalOverride;
    if (subtotal === undefined) {
      const cart = await this.cartSvc.getCart({ userId });
      if (!cart.items || cart.items.length === 0) {
        throw new BadRequestError("Cannot apply coupon to an empty cart", "CART_EMPTY");
      }
      subtotal = cart.subtotal;
    }

    const { coupon, discountAmount } = await this.validateCouponForCheckout(
      normalized,
      subtotal,
      userId
    );

    const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

    return {
      valid: true,
      code: coupon.code,
      discount: discountAmount,
      discountType: coupon.type,
      subtotal,
      subtotalAfterDiscount,
      message: `Coupon '${coupon.code}' applied successfully. You saved ₹${discountAmount}!`,
    };
  }

  /**
   * 2. Authoritative Checkout/Order Verification
   */
  async validateCouponForCheckout(
    rawCode: string,
    subtotal: number,
    userId: string
  ): Promise<{ coupon: CouponDocument; discountAmount: number }> {
    const normalized = this.normalizeCode(rawCode);
    const coupon = await this.repo.getCouponByNormalizedCode(normalized);

    if (!coupon) {
      throw new NotFoundError(`Coupon code '${rawCode}' is not valid`, "COUPON_NOT_FOUND");
    }

    if (!coupon.isActive) {
      throw new BadRequestError(`Coupon '${coupon.code}' is currently inactive`, "COUPON_INACTIVE");
    }

    const now = Date.now();
    const startsAtMillis = (coupon.startsAt as any)?.toMillis?.() || 0;
    if (startsAtMillis > now) {
      throw new BadRequestError(`Coupon '${coupon.code}' is not active yet`, "COUPON_NOT_STARTED");
    }

    if (coupon.expiresAt) {
      const expiresAtMillis = (coupon.expiresAt as any)?.toMillis?.() || 0;
      if (expiresAtMillis <= now) {
        throw new BadRequestError(`Coupon '${coupon.code}' has expired`, "COUPON_EXPIRED");
      }
    }

    if (subtotal < coupon.minimumOrder) {
      throw new BadRequestError(
        `Coupon '${coupon.code}' requires a minimum order subtotal of ₹${coupon.minimumOrder}`,
        "COUPON_MINIMUM_ORDER_NOT_MET"
      );
    }

    if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestError(
        `Coupon '${coupon.code}' has reached its total campaign usage limit`,
        "COUPON_USAGE_LIMIT_REACHED"
      );
    }

    if (userId) {
      const userRedemptions = await this.repo.getUserRedemptionsCount(coupon.id, userId);
      if (userRedemptions >= coupon.perUserLimit) {
        throw new BadRequestError(
          `You have already used coupon '${coupon.code}' the maximum number of times (${coupon.perUserLimit})`,
          "COUPON_USER_LIMIT_REACHED"
        );
      }
    }

    const discountAmount = this.calc.calculateDiscount(coupon, subtotal);

    return { coupon, discountAmount };
  }

  /**
   * 3. Atomic Coupon Redemption Execution (Transaction-safe)
   */
  async redeemCoupon(
    couponId: string,
    userId: string,
    orderId: string,
    discountAmount: number
  ): Promise<void> {
    const existing = await this.repo.findRedemptionByOrder(couponId, orderId);
    if (existing) return; // Idempotent replay

    await this.repo.runTransaction(async (tx) => {
      const cpnRef = this.repo.getCouponRef(couponId);
      const snap = await tx.get(cpnRef);

      if (!snap.exists) {
        throw new NotFoundError(`Coupon '${couponId}' not found during redemption`, "COUPON_NOT_FOUND");
      }

      const coupon = snap.data() as CouponDocument;

      // Invariant Check inside Transaction
      if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
        throw new BadRequestError("Coupon usage limit reached", "COUPON_USAGE_LIMIT_REACHED");
      }

      // Check per-user count inside or prior to tx
      const userRedemptions = await this.repo.getUserRedemptionsCount(couponId, userId);
      if (userRedemptions >= coupon.perUserLimit) {
        throw new BadRequestError("Per-user redemption limit reached", "COUPON_USER_LIMIT_REACHED");
      }

      const redemption: CouponRedemptionDocument = {
        id: `redm_${couponId}_${userId}_${orderId}`,
        couponId,
        code: coupon.code,
        userId,
        orderId,
        discount: discountAmount,
        status: "APPLIED",
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      this.repo.recordRedemptionInTx(tx, redemption);
    });
  }

  /**
   * 4. Release Coupon on Order Cancellation
   */
  async releaseCoupon(couponId: string, orderId: string): Promise<void> {
    await this.repo.releaseRedemption(couponId, orderId);
  }
}

export const couponService = new CouponService();
