/**
 * ============================================================================
 * MUSHBIO RAZORPAY ADAPTER & SIGNATURE UTILITIES (PHASE 10)
 *
 * Provides a decoupled interface for Razorpay API operations, cryptographically
 * secure server-side HMAC-SHA256 signature verification, and mock adapter support.
 * ============================================================================
 */

import crypto from "crypto";
import Razorpay from "razorpay";
import { config } from "../config/environment";
import { InternalServerError } from "../utils/errors";

export interface RazorpayCreateOrderParams {
  amount: number; // Integer paise
  currency: string; // "INR"
  receipt: string; // Max 40 chars identifier
  notes?: Record<string, string>;
}

export interface RazorpayOrderResult {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
  created_at: number;
}

export interface IRazorpayAdapter {
  createOrder(params: RazorpayCreateOrderParams): Promise<RazorpayOrderResult>;
  getKeyId(): string;
  getKeySecret(): string;
  getWebhookSecret(): string;
}

/**
 * Production Razorpay SDK Adapter
 */
export class ProductionRazorpayAdapter implements IRazorpayAdapter {
  private instance: any = null;

  constructor(
    private keyId: string = config.razorpay.keyId,
    private keySecret: string = config.razorpay.keySecret,
    private webhookSecret: string = config.razorpay.webhookSecret
  ) {
    if (this.keyId && this.keySecret) {
      this.instance = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret,
      });
    }
  }

  getKeyId(): string {
    return this.keyId;
  }

  getKeySecret(): string {
    return this.keySecret;
  }

  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  async createOrder(params: RazorpayCreateOrderParams): Promise<RazorpayOrderResult> {
    if (!this.instance) {
      throw new InternalServerError(
        "Razorpay SDK is not configured with valid credentials",
        "PAYMENT_CONFIG_MISSING"
      );
    }

    try {
      const order = await this.instance.orders.create({
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      });

      return {
        id: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        created_at: order.created_at,
      };
    } catch (err: any) {
      console.error("[Razorpay API Error]", err);
      throw new InternalServerError(
        `Failed to create Razorpay order: ${err?.error?.description || err.message || "Provider error"}`,
        "PAYMENT_PROVIDER_ERROR"
      );
    }
  }
}

/**
 * Mock Razorpay Adapter for Automated Unit & Integration Testing
 */
export class MockRazorpayAdapter implements IRazorpayAdapter {
  public createdOrders: Map<string, RazorpayOrderResult> = new Map();
  public shouldFailCreate = false;
  private keyId: string;
  private keySecret: string;
  private webhookSecret: string;

  constructor(
    keyId = "rzp_test_mushbio123",
    keySecret = "secret_test_mushbio456",
    webhookSecret = "whsec_test_mushbio789"
  ) {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  getKeyId(): string {
    return this.keyId;
  }

  getKeySecret(): string {
    return this.keySecret;
  }

  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  async createOrder(params: RazorpayCreateOrderParams): Promise<RazorpayOrderResult> {
    if (this.shouldFailCreate) {
      throw new InternalServerError("Simulated Razorpay provider outage", "PAYMENT_PROVIDER_ERROR");
    }

    const orderId = `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const result: RazorpayOrderResult = {
      id: orderId,
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      status: "created",
      created_at: Math.floor(Date.now() / 1000),
    };

    this.createdOrders.set(orderId, result);
    return result;
  }
}

/**
 * Generate Razorpay HMAC-SHA256 signature for verification/testing (Browser Payment flow)
 */
export function generateRazorpaySignature(
  orderId: string,
  paymentId: string,
  secret: string
): string {
  const body = `${orderId}|${paymentId}`;
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Cryptographically verify Razorpay HMAC-SHA256 signature (Browser Payment flow)
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }

  try {
    const expectedSignature = generateRazorpaySignature(orderId, paymentId, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, "utf-8"),
      Buffer.from(expectedSignature, "utf-8")
    );
  } catch {
    return false;
  }
}

/**
 * Generate Razorpay Webhook HMAC-SHA256 signature for testing (Raw Body flow)
 */
export function generateRazorpayWebhookSignature(
  rawBody: string | Buffer,
  webhookSecret: string
): string {
  return crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
}

/**
 * Cryptographically verify Razorpay Webhook HMAC-SHA256 signature (Phase 11)
 * Must use the exact raw bytes received from Razorpay.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  webhookSecret: string
): boolean {
  if (!rawBody || !signature || !webhookSecret) {
    return false;
  }

  try {
    const expectedSignature = generateRazorpayWebhookSignature(rawBody, webhookSecret);
    const sigBuffer = Buffer.from(signature, "utf-8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export const razorpayAdapter = new ProductionRazorpayAdapter();

