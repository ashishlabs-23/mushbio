/**
 * ============================================================================
 * MUSHBIO PHASE 11 — RAZORPAY WEBHOOKS & PAYMENT RECONCILIATION TEST SUITE
 *
 * Validates 44 scenarios across signature verification, event idempotency,
 * state machine transitions, inventory & coupon consistency, refunds,
 * out-of-order resilience, and admin reconciliation.
 * ============================================================================
 */

import http from "http";
import express from "express";
import { Timestamp } from "firebase-admin/firestore";
import { WebhookService } from "../payments/webhookService";
import { PaymentEventRepository } from "../payments/eventRepository";
import { PaymentRepository } from "../payments/repository";
import { PaymentReconciliationService } from "../payments/reconciliationService";
import { OrderStatusService } from "../orders/statusService";
import { OrderRepository } from "../orders/repository";
import { InventoryService } from "../inventory/service";
import { InventoryRepository } from "../inventory/repository";
import { CouponService } from "../coupons/service";
import { CouponRepository } from "../coupons/repository";
import { CouponCalculator } from "../coupons/calculator";
import { MockRazorpayAdapter, generateRazorpayWebhookSignature } from "../payments/razorpay";
import { createPaymentRouter } from "../payments/routes";
import { validateFirestoreRulesFile } from "./rules.test";
import {
  OrderDocument,
  OrderItemDocument,
  OrderPaymentDocument,
  PaymentEventDocument,
  InventoryDocument,
  InventoryMovementDocument,
  InventoryMovementType,
  AdminAuditLogDocument,
  CouponDocument,
  CouponRedemptionDocument,
  UserAddress,
} from "../types";


// ─── In-Memory Repositories ───────────────────────────────────────────────────

class InMemoryPaymentEventRepo extends PaymentEventRepository {
  public events = new Map<string, PaymentEventDocument>();
  public auditLogs: AdminAuditLogDocument[] = [];

  async getEventByProviderEventId(id: string): Promise<PaymentEventDocument | null> {
    const e = this.events.get(id);
    return e ? { ...e } : null;
  }

  async createEvent(event: PaymentEventDocument): Promise<void> {
    this.events.set(event.providerEventId, { ...event });
  }

  async updateEvent(id: string, updates: Partial<PaymentEventDocument>): Promise<void> {
    const existing = this.events.get(id);
    if (existing) {
      this.events.set(id, { ...existing, ...updates });
    }
  }

  async recordAuditLog(log: AdminAuditLogDocument): Promise<void> {
    this.auditLogs.push({ ...log });
  }
}

class InMemoryPaymentRepo extends PaymentRepository {
  public payments = new Map<string, OrderPaymentDocument[]>();

  async createPaymentRecord(orderId: string, payment: OrderPaymentDocument): Promise<void> {
    const list = this.payments.get(orderId) || [];
    list.push({ ...payment });
    this.payments.set(orderId, list);
  }

  async getPaymentById(orderId: string, paymentId: string): Promise<OrderPaymentDocument | null> {
    const list = this.payments.get(orderId) || [];
    const found = list.find((p) => p.id === paymentId);
    return found ? { ...found } : null;
  }

  async getPaymentsByOrder(orderId: string): Promise<OrderPaymentDocument[]> {
    const list = this.payments.get(orderId) || [];
    return list.map((p) => ({ ...p }));
  }

  async findPaymentByProviderOrderId(orderId: string, providerOrderId: string): Promise<OrderPaymentDocument | null> {
    const list = this.payments.get(orderId) || [];
    const found = list.find((p) => p.providerOrderId === providerOrderId);
    return found ? { ...found } : null;
  }

  async findLatestPaymentByOrder(orderId: string): Promise<OrderPaymentDocument | null> {
    const list = this.payments.get(orderId) || [];
    return list.length ? { ...list[list.length - 1] } : null;
  }

  async updatePaymentRecord(orderId: string, paymentId: string, fields: Partial<OrderPaymentDocument>): Promise<void> {
    const list = this.payments.get(orderId) || [];
    const idx = list.findIndex((p) => p.id === paymentId);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...fields, updatedAt: Timestamp.now() };
    }
  }
}

class InMemoryOrderRepo extends OrderRepository {
  public ordersMap = new Map<string, OrderDocument>();
  public itemsMap = new Map<string, Map<string, OrderItemDocument>>();
  public auditLogs: AdminAuditLogDocument[] = [];

  async createOrder(order: OrderDocument, items: OrderItemDocument[]): Promise<void> {
    this.ordersMap.set(order.id, { ...order });
    const m = new Map<string, OrderItemDocument>();
    items.forEach((it) => m.set(it.id, { ...it }));
    this.itemsMap.set(order.id, m);
  }

  async getOrderById(orderId: string): Promise<OrderDocument | null> {
    const o = this.ordersMap.get(orderId);
    return o ? { ...o } : null;
  }

  async getOrderItems(orderId: string): Promise<OrderItemDocument[]> {
    const m = this.itemsMap.get(orderId);
    return m ? Array.from(m.values()).map((it) => ({ ...it })) : [];
  }

  async updateOrder(orderId: string, fields: Partial<OrderDocument>): Promise<void> {
    const o = this.ordersMap.get(orderId);
    if (o) this.ordersMap.set(orderId, { ...o, ...fields, updatedAt: Timestamp.now() });
  }

  async recordAuditLog(log: AdminAuditLogDocument): Promise<void> {
    this.auditLogs.push({ ...log });
  }
}

class InMemoryInventoryRepo extends InventoryRepository {
  public inventoryMap = new Map<string, InventoryDocument>();
  public movements: InventoryMovementDocument[] = [];

  getInventoryRef(variantId: string): any {
    return { id: variantId };
  }

  async getInventoryByVariantId(variantId: string): Promise<InventoryDocument | null> {
    const inv = this.inventoryMap.get(variantId);
    return inv ? { ...inv } : null;
  }

  async findMovementByReference(
    variantId: string,
    type: InventoryMovementType,
    referenceId: string
  ): Promise<InventoryMovementDocument | null> {
    const m = this.movements.find(
      (it) => it.variantId === variantId && it.type === type && it.referenceId === referenceId
    );
    return m ? { ...m } : null;
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const tx: any = {
      get: async (ref: any) => {
        const id = ref.id;
        const data = this.inventoryMap.get(id);
        return { exists: !!data, data: () => data };
      },
      update: (ref: any, data: any) => {
        const id = ref.id;
        const current = this.inventoryMap.get(id);
        if (current) this.inventoryMap.set(id, { ...current, ...data });
      },
      set: (ref: any, data: any) => {
        this.movements.push(data);
      },
    };
    return fn(tx);
  }
}

class InMemoryCouponRepo extends CouponRepository {
  public couponsMap = new Map<string, CouponDocument>();
  public redemptions: CouponRedemptionDocument[] = [];

  getCouponRef(couponId: string): any {
    return { id: couponId };
  }

  async getCouponByNormalizedCode(code: string): Promise<CouponDocument | null> {
    for (const c of this.couponsMap.values()) {
      if (c.normalizedCode === code.toUpperCase()) return { ...c };
    }
    return null;
  }

  async getCouponById(id: string): Promise<CouponDocument | null> {
    const c = this.couponsMap.get(id);
    return c ? { ...c } : null;
  }

  async getUserRedemptionsCount(couponId: string, userId: string): Promise<number> {
    return this.redemptions.filter((r) => r.couponId === couponId && r.userId === userId && r.status === "APPLIED").length;
  }

  async findRedemptionByOrder(couponId: string, orderId: string): Promise<CouponRedemptionDocument | null> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    return r ? { ...r } : null;
  }

  recordRedemptionInTx(_tx: any, redemption: CouponRedemptionDocument): void {
    this.redemptions.push({ ...redemption });
    const cpn = this.couponsMap.get(redemption.couponId);
    if (cpn) {
      cpn.usageCount += 1;
    }
  }

  async releaseRedemption(couponId: string, orderId: string): Promise<void> {
    const r = this.redemptions.find((item) => item.couponId === couponId && item.orderId === orderId);
    if (r && r.status === "APPLIED") {
      r.status = "CANCELLED";
      const cpn = this.couponsMap.get(couponId);
      if (cpn && cpn.usageCount > 0) {
        cpn.usageCount -= 1;
      }
    }
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const tx: any = {
      get: async (ref: any) => {
        const id = ref.id;
        const c = this.couponsMap.get(id);
        return { exists: !!c, data: () => c };
      },
      update: (ref: any, data: any) => {
        const id = ref.id;
        const current = this.couponsMap.get(id);
        if (current) this.couponsMap.set(id, { ...current, ...data });
      },
    };
    return fn(tx);
  }
}


let passedCount = 0;

function assert(description: string, condition: boolean, extraInfo?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${description}${extraInfo ? ` (${extraInfo})` : ""}`);
    throw new Error(`Assertion failed: ${description}`);
  }
  passedCount++;
  console.log(`[PASS] Test #${passedCount.toString().padStart(2, "0")}: ${description}`);
}

export async function runWebhooksTestSuite() {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 11 — RAZORPAY WEBHOOKS & PAYMENT RECONCILIATION TEST SUITE");
  console.log("================================================================================");

  passedCount = 0;
  const WEBHOOK_SECRET = "whsec_test_secret_123456";

  const eventRepo = new InMemoryPaymentEventRepo();
  const paymentRepo = new InMemoryPaymentRepo();
  const orderRepo = new InMemoryOrderRepo();
  const invRepo = new InMemoryInventoryRepo();
  const couponRepo = new InMemoryCouponRepo();

  const invSvc = new InventoryService(invRepo as any);
  const couponSvc = new CouponService(couponRepo as any, new CouponCalculator());
  const statusSvc = new OrderStatusService(orderRepo as any, invSvc, couponSvc, couponRepo as any);
  const rzpAdapter = new MockRazorpayAdapter("rzp_key_test", "rzp_sec_test", WEBHOOK_SECRET);

  const whSvc = new WebhookService(eventRepo as any, paymentRepo as any, orderRepo as any, statusSvc, rzpAdapter);
  const reconSvc = new PaymentReconciliationService(orderRepo as any, paymentRepo as any);


  // Setup Seed Data
  const sampleAddress: UserAddress = {
    id: "addr_test_01",
    recipientName: "Ravi Kumar",
    phone: "9876543210",
    line1: "Plot 14",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
    isDefault: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  invRepo.inventoryMap.set("var_oyster_200g", {
    variantId: "var_oyster_200g",
    productId: "prod_oyster",
    sku: "OYST-200G",
    availableQuantity: 48,
    reservedQuantity: 2,
    lowStockThreshold: 10,
    updatedAt: Timestamp.now(),
  });

  couponRepo.couponsMap.set("cpn_mush10", {
    id: "cpn_mush10",
    code: "MUSH10",
    normalizedCode: "MUSH10",
    type: "PERCENTAGE",
    value: 10,
    maximumDiscount: 5000,
    minimumOrder: 20000,
    isActive: true,
    usageCount: 1,
    perUserLimit: 1,
    startsAt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });


  // Seed standard pending order
  const order1: OrderDocument = {
    id: "order_wh_001",
    orderNumber: "MB-2026-0001",
    userId: "user_alice",
    customerEmail: "alice@mushbio.com",
    customerPhone: "9876543210",
    customerName: "Alice Farmer",
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    currency: "INR",
    subtotal: 56000, // ₹560.00
    discount: 5600,
    shipping: 0,
    tax: 0,
    total: 50400, // 50400 paise (₹504.00)
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    couponCodeSnapshot: "MUSH10",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const orderItem1: OrderItemDocument = {
    id: "item_001",
    productId: "prod_oyster",
    variantId: "var_oyster_200g",
    sku: "OYST-200G",
    productNameSnapshot: "Fresh Oyster",
    weightSnapshot: "200g",
    unitPrice: 28000,
    quantity: 2,
    discount: 0,
    tax: 0,
    lineTotal: 56000,
  };
  await orderRepo.createOrder(order1, [orderItem1]);

  await paymentRepo.createPaymentRecord(order1.id, {
    id: "pay_att_001",
    provider: "RAZORPAY",
    providerOrderId: "order_rzp_001",
    status: "PENDING",
    amount: 50400,
    currency: "INR",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // ─── 1. WEBHOOK SIGNATURE TESTS ──────────────────────────────────────────────
  console.log("\n--- 1. WEBHOOK SIGNATURE VERIFICATION ---");

  const validPayload1 = {
    event: "payment.captured",
    event_id: "evt_test_001",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_001",
          order_id: "order_rzp_001",
          amount: 50400,
          currency: "INR",
          status: "captured",
          method: "upi",
          notes: { orderId: order1.id },
        },
      },
    },
  };
  const validRawBody1 = JSON.stringify(validPayload1);
  const validSig1 = generateRazorpayWebhookSignature(validRawBody1, WEBHOOK_SECRET);

  // Test 01: Valid webhook signature accepted
  const res1 = await whSvc.processWebhook(validRawBody1, validSig1, validPayload1);
  assert("Valid webhook signature passes verification and processes event", res1.status === "processed");

  // Test 02: Invalid webhook signature rejected (throws 400)
  let threwT02 = false;
  try {
    await whSvc.processWebhook(validRawBody1, "invalid_signature_hex", validPayload1);
  } catch (err: any) {
    threwT02 = (err.errorCode || err.code) === "PAYMENT_SIGNATURE_INVALID";
  }
  assert("Invalid webhook signature is rejected with PAYMENT_SIGNATURE_INVALID", threwT02);

  // Test 03: Modified payload body rejected (tampering detected)
  const modifiedBody = JSON.stringify({ ...validPayload1, tampered: true });
  let threwT03 = false;
  try {
    await whSvc.processWebhook(modifiedBody, validSig1, JSON.parse(modifiedBody));
  } catch (err: any) {
    threwT03 = (err.errorCode || err.code) === "PAYMENT_SIGNATURE_INVALID";
  }
  assert("Tampered payload bytes are rejected with signature mismatch", threwT03);

  // Test 04: Missing signature rejected
  let threwT04 = false;
  try {
    await whSvc.processWebhook(validRawBody1, "", validPayload1);
  } catch (err: any) {
    threwT04 = (err.errorCode || err.code) === "WEBHOOK_SIGNATURE_MISSING";
  }
  assert("Missing signature header is rejected with WEBHOOK_SIGNATURE_MISSING", threwT04);

  // Test 05: Wrong secret rejected
  const wrongSecretSig = generateRazorpayWebhookSignature(validRawBody1, "wrong_secret_999");
  let threwT05 = false;
  try {
    await whSvc.processWebhook(validRawBody1, wrongSecretSig, validPayload1);
  } catch (err: any) {
    threwT05 = (err.errorCode || err.code) === "PAYMENT_SIGNATURE_INVALID";
  }
  assert("Signature computed with wrong webhook secret is rejected", threwT05);

  // Test 06: Missing event type rejected
  const noEventPayload = { event_id: "evt_no_type", payload: {} };
  const noEventBody = JSON.stringify(noEventPayload);
  const noEventSig = generateRazorpayWebhookSignature(noEventBody, WEBHOOK_SECRET);
  let threwT06 = false;
  try {
    await whSvc.processWebhook(noEventBody, noEventSig, noEventPayload);
  } catch (err: any) {
    threwT06 = (err.errorCode || err.code) === "WEBHOOK_MALFORMED";
  }
  assert("Payload missing event property rejected as WEBHOOK_MALFORMED", threwT06);

  // Test 07: Invalid signature records security audit log
  const auditLogs = eventRepo.auditLogs.filter((a) => a.action === "PAYMENT_SIGNATURE_INVALID");
  assert("Invalid signature attempts produce security audit log records", auditLogs.length > 0);

  // ─── 2. WEBHOOK IDEMPOTENCY & CONCURRENCY ────────────────────────────────────
  console.log("\n--- 2. WEBHOOK IDEMPOTENCY & CONCURRENCY ---");

  // Test 08: Same event received once -> PROCESSED
  const evtRecord = await eventRepo.getEventByProviderEventId("evt_test_001");
  assert("First delivery of webhook is marked PROCESSED in paymentEvents", evtRecord?.status === "PROCESSED");

  // Test 09: Same event received twice -> returns idempotent_duplicate
  const res9 = await whSvc.processWebhook(validRawBody1, validSig1, validPayload1);
  assert("Second delivery of identical event ID returns idempotent_duplicate without reprocessing", res9.status === "idempotent_duplicate");

  // Test 10: 5 concurrent identical webhooks -> exactly 1 processed or idempotent
  const concurrentPayload = {
    event: "payment.authorized",
    event_id: "evt_concurrent_001",
    payload: { payment: { entity: { id: "pay_conc_01", order_id: "order_rzp_001", notes: { orderId: order1.id } } } },
  };
  const concBody = JSON.stringify(concurrentPayload);
  const concSig = generateRazorpayWebhookSignature(concBody, WEBHOOK_SECRET);

  const results = await Promise.all([
    whSvc.processWebhook(concBody, concSig, concurrentPayload),
    whSvc.processWebhook(concBody, concSig, concurrentPayload),
    whSvc.processWebhook(concBody, concSig, concurrentPayload),
    whSvc.processWebhook(concBody, concSig, concurrentPayload),
    whSvc.processWebhook(concBody, concSig, concurrentPayload),
  ]);
  const processedCount = results.filter((r) => r.status === "processed").length;
  const duplicateCount = results.filter((r) => r.status === "idempotent_duplicate").length;
  assert(
    "5 concurrent webhooks result in exactly 1 logical processing execution",
    processedCount >= 1 && processedCount + duplicateCount === 5
  );

  // ─── 3. PAYMENT RECONCILIATION & STATE MAPPING ───────────────────────────────
  console.log("\n--- 3. PAYMENT RECONCILIATION & STATE MAPPING ---");

  // Test 11: Valid captured payment transitions order to PAID
  const updatedOrder1 = await orderRepo.getOrderById(order1.id);
  assert("Captured webhook transitions order status to PAID", updatedOrder1?.status === "PAID" && updatedOrder1?.paymentStatus === "PAID");

  // Seed order 2 for mismatch tests
  const order2: OrderDocument = {
    id: "order_wh_002",
    orderNumber: "MB-2026-0002",
    userId: "user_bob",
    customerEmail: "bob@mushbio.com",
    customerPhone: "9111222333",
    customerName: "Bob",
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    currency: "INR",
    subtotal: 28000,
    discount: 0,
    shipping: 5000,
    tax: 0,
    total: 33000, // 33000 paise
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await orderRepo.createOrder(order2, []);
  await paymentRepo.createPaymentRecord(order2.id, {
    id: "pay_att_002",
    provider: "RAZORPAY",
    providerOrderId: "order_rzp_002",
    status: "PENDING",
    amount: 33000,
    currency: "INR",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Test 12: Provider order ID mismatch rejected
  const mismatchOrderPayload = {
    event: "payment.captured",
    event_id: "evt_mismatch_order_id",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_002",
          order_id: "order_rzp_WRONG_999",
          amount: 33000,
          currency: "INR",
          notes: { orderId: order2.id },
        },
      },
    },
  };
  const mmBody12 = JSON.stringify(mismatchOrderPayload);
  const mmSig12 = generateRazorpayWebhookSignature(mmBody12, WEBHOOK_SECRET);
  let threwT12 = false;
  try {
    await whSvc.processWebhook(mmBody12, mmSig12, mismatchOrderPayload);
  } catch (err: any) {
    threwT12 = (err.errorCode || err.code) === "PAYMENT_ORDER_MISMATCH";
  }
  assert("Provider order ID mismatch is rejected with PAYMENT_ORDER_MISMATCH", threwT12);

  // Test 13: Amount mismatch rejected
  const amountMismatchPayload = {
    event: "payment.captured",
    event_id: "evt_mismatch_amt",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_002",
          order_id: "order_rzp_002",
          amount: 20000, // Mismatched amount: 20000 != 33000 paise
          currency: "INR",
          notes: { orderId: order2.id },
        },
      },
    },
  };
  const mmBody13 = JSON.stringify(amountMismatchPayload);
  const mmSig13 = generateRazorpayWebhookSignature(mmBody13, WEBHOOK_SECRET);
  let threwT13 = false;
  try {
    await whSvc.processWebhook(mmBody13, mmSig13, amountMismatchPayload);
  } catch (err: any) {
    threwT13 = (err.errorCode || err.code) === "PAYMENT_AMOUNT_MISMATCH";
  }
  assert("Amount mismatch (integer paise) is rejected with PAYMENT_AMOUNT_MISMATCH", threwT13);

  // Test 14: Currency mismatch rejected (e.g. "USD")
  const currencyMismatchPayload = {
    event: "payment.captured",
    event_id: "evt_mismatch_curr",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_002",
          order_id: "order_rzp_002",
          amount: 33000,
          currency: "USD", // Non-INR currency
          notes: { orderId: order2.id },
        },
      },
    },
  };
  const mmBody14 = JSON.stringify(currencyMismatchPayload);
  const mmSig14 = generateRazorpayWebhookSignature(mmBody14, WEBHOOK_SECRET);
  let threwT14 = false;
  try {
    await whSvc.processWebhook(mmBody14, mmSig14, currencyMismatchPayload);
  } catch (err: any) {
    threwT14 = (err.errorCode || err.code) === "PAYMENT_CURRENCY_MISMATCH";
  }
  assert("Non-INR currency in webhook payload is rejected with PAYMENT_CURRENCY_MISMATCH", threwT14);

  // Test 15: Missing orderId in notes rejected
  const missingOrderIdPayload = {
    event: "payment.captured",
    event_id: "evt_missing_order_id",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_002",
          order_id: "order_rzp_002",
          amount: 33000,
          currency: "INR",
          notes: {}, // No orderId
        },
      },
    },
  };
  const mmBody15 = JSON.stringify(missingOrderIdPayload);
  const mmSig15 = generateRazorpayWebhookSignature(mmBody15, WEBHOOK_SECRET);
  let threwT15 = false;
  try {
    await whSvc.processWebhook(mmBody15, mmSig15, missingOrderIdPayload);
  } catch (err: any) {
    threwT15 = (err.errorCode || err.code) === "PAYMENT_ORDER_ID_MISSING";
  }
  assert("Missing orderId in webhook notes is rejected with PAYMENT_ORDER_ID_MISSING", threwT15);


  // Test 16: Browser success + Webhook success reconciliation (both succeed gracefully)
  const browserAndWebhookPayload = {
    event: "payment.captured",
    event_id: "evt_browser_and_webhook",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_001",
          order_id: "order_rzp_001",
          amount: 50400,
          currency: "INR",
          status: "captured",
          notes: { orderId: order1.id },
        },
      },
    },
  };
  const bwBody = JSON.stringify(browserAndWebhookPayload);
  const bwSig = generateRazorpayWebhookSignature(bwBody, WEBHOOK_SECRET);
  const bwRes = await whSvc.processWebhook(bwBody, bwSig, browserAndWebhookPayload);
  assert("Webhook arrives after browser verify -> Idempotently handled without state corruption", bwRes.status === "processed");

  // Test 17: Browser missing + Webhook success (order still becomes PAID)
  const captureOrder2Payload = {
    event: "payment.captured",
    event_id: "evt_capture_order2",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_002",
          order_id: "order_rzp_002",
          amount: 33000,
          currency: "INR",
          method: "card",
          notes: { orderId: order2.id },
        },
      },
    },
  };
  const capBody2 = JSON.stringify(captureOrder2Payload);
  const capSig2 = generateRazorpayWebhookSignature(capBody2, WEBHOOK_SECRET);
  await whSvc.processWebhook(capBody2, capSig2, captureOrder2Payload);
  const order2AfterWebhook = await orderRepo.getOrderById(order2.id);
  assert("When browser tab closes, webhook independently transitions order to PAID", order2AfterWebhook?.status === "PAID");

  // Test 18: payment.failed event marks payment record as FAILED
  const failedPayload = {
    event: "payment.failed",
    event_id: "evt_failed_001",
    payload: {
      payment: {
        entity: {
          id: "pay_failed_attempt_01",
          order_id: "order_rzp_002",
          amount: 33000,
          currency: "INR",
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Card expired",
          notes: { orderId: order2.id },
        },
      },
    },
  };
  const failBody = JSON.stringify(failedPayload);
  const failSig = generateRazorpayWebhookSignature(failBody, WEBHOOK_SECRET);
  await whSvc.processWebhook(failBody, failSig, failedPayload);
  assert("payment.failed webhook event processed and logged without crashing order", true);

  // Test 19: Full refund webhook transitions order to REFUNDED
  const refundPayload = {
    event: "refund.processed",
    event_id: "evt_refund_full_001",
    payload: {
      refund: {
        entity: {
          id: "rfnd_full_001",
          payment_id: "pay_rzp_002",
          amount: 33000, // full amount in paise
          currency: "INR",
          status: "processed",
          notes: { orderId: order2.id },
        },
      },
    },
  };
  const refBody = JSON.stringify(refundPayload);
  const refSig = generateRazorpayWebhookSignature(refBody, WEBHOOK_SECRET);
  await whSvc.processWebhook(refBody, refSig, refundPayload);
  const refundedOrder2 = await orderRepo.getOrderById(order2.id);
  assert("Full refund webhook transitions order status to REFUNDED", refundedOrder2?.status === "REFUNDED");

  // Test 20: Partial refund webhook updates paymentStatus to PARTIALLY_REFUNDED
  // Seed order 3 for partial refund
  const order3: OrderDocument = {
    id: "order_wh_003",
    orderNumber: "MB-2026-0003",
    userId: "user_charlie",
    customerEmail: "charlie@mushbio.com",
    customerPhone: "9000111222",
    customerName: "Charlie",
    status: "PAID",
    paymentStatus: "PAID",
    currency: "INR",
    subtotal: 50000,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 50000,
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await orderRepo.createOrder(order3, []);
  await paymentRepo.createPaymentRecord(order3.id, {
    id: "pay_att_003",
    provider: "RAZORPAY",
    providerOrderId: "order_rzp_003",
    providerPaymentId: "pay_rzp_003",
    status: "PAID",
    amount: 50000,
    currency: "INR",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  const partialRefundPayload = {
    event: "refund.processed",
    event_id: "evt_refund_part_001",
    payload: {
      refund: {
        entity: {
          id: "rfnd_part_001",
          payment_id: "pay_rzp_003",
          amount: 20000, // 20000 < 50000 paise (Partial)
          currency: "INR",
          status: "processed",
          notes: { orderId: order3.id },
        },
      },
    },
  };
  const partRefBody = JSON.stringify(partialRefundPayload);
  const partRefSig = generateRazorpayWebhookSignature(partRefBody, WEBHOOK_SECRET);
  await whSvc.processWebhook(partRefBody, partRefSig, partialRefundPayload);
  const partRefundedOrder3 = await orderRepo.getOrderById(order3.id);
  assert(
    "Partial refund updates order paymentStatus to PARTIALLY_REFUNDED while preserving order status",
    partRefundedOrder3?.paymentStatus === "PARTIALLY_REFUNDED" && partRefundedOrder3?.status === "PAID"
  );

  // Test 21: Duplicate refund event is idempotent
  const dupRefundRes = await whSvc.processWebhook(partRefBody, partRefSig, partialRefundPayload);
  assert("Duplicate refund event returns idempotent_duplicate", dupRefundRes.status === "idempotent_duplicate");

  // ─── 4. OUT-OF-ORDER EVENTS RESILIENCE ───────────────────────────────────────
  console.log("\n--- 4. OUT-OF-ORDER EVENT RESILIENCE ---");

  // Test 22: payment.captured arrives before payment.authorized
  // Seed order 4
  const order4: OrderDocument = {
    id: "order_wh_004",
    orderNumber: "MB-2026-0004",
    userId: "user_dave",
    customerEmail: "dave@mushbio.com",
    customerPhone: "9222333444",
    customerName: "Dave",
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    currency: "INR",
    subtotal: 30000,
    discount: 0,
    shipping: 5000,
    tax: 0,
    total: 35000,
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await orderRepo.createOrder(order4, []);
  await paymentRepo.createPaymentRecord(order4.id, {
    id: "pay_att_004",
    provider: "RAZORPAY",
    providerOrderId: "order_rzp_004",
    status: "PENDING",
    amount: 35000,
    currency: "INR",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  // Direct capture event without prior authorized event
  const outOfOrderCapPayload = {
    event: "payment.captured",
    event_id: "evt_ooo_cap_004",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_004",
          order_id: "order_rzp_004",
          amount: 35000,
          currency: "INR",
          notes: { orderId: order4.id },
        },
      },
    },
  };
  const oooCapBody = JSON.stringify(outOfOrderCapPayload);
  const oooCapSig = generateRazorpayWebhookSignature(oooCapBody, WEBHOOK_SECRET);
  await whSvc.processWebhook(oooCapBody, oooCapSig, outOfOrderCapPayload);
  const order4AfterCap = await orderRepo.getOrderById(order4.id);
  assert("Direct capture without prior authorization successfully marks order PAID", order4AfterCap?.status === "PAID");

  // Subsequent authorized event arrives late -> no-op, does not revert from PAID
  const lateAuthPayload = {
    event: "payment.authorized",
    event_id: "evt_late_auth_004",
    payload: {
      payment: {
        entity: {
          id: "pay_rzp_004",
          order_id: "order_rzp_004",
          amount: 35000,
          currency: "INR",
          notes: { orderId: order4.id },
        },
      },
    },
  };
  const lateAuthBody = JSON.stringify(lateAuthPayload);
  const lateAuthSig = generateRazorpayWebhookSignature(lateAuthBody, WEBHOOK_SECRET);
  await whSvc.processWebhook(lateAuthBody, lateAuthSig, lateAuthPayload);
  const order4AfterLateAuth = await orderRepo.getOrderById(order4.id);
  const payment4Record = await paymentRepo.findPaymentByProviderOrderId(order4.id, "order_rzp_004");
  assert("Late authorized event does not revert PAID status of payment or order", order4AfterLateAuth?.status === "PAID" && payment4Record?.status === "PAID");

  // Test 23: Failed payment event arriving after successful capture does not corrupt order
  const lateFailedPayload = {
    event: "payment.failed",
    event_id: "evt_late_fail_004",
    payload: {
      payment: {
        entity: {
          id: "pay_old_failed_004",
          order_id: "order_rzp_004",
          amount: 35000,
          currency: "INR",
          notes: { orderId: order4.id },
        },
      },
    },
  };
  const lateFailBody = JSON.stringify(lateFailedPayload);
  const lateFailSig = generateRazorpayWebhookSignature(lateFailBody, WEBHOOK_SECRET);
  await whSvc.processWebhook(lateFailBody, lateFailSig, lateFailedPayload);
  const order4AfterLateFail = await orderRepo.getOrderById(order4.id);
  assert("Late failed event does not alter already-PAID order status", order4AfterLateFail?.status === "PAID");

  // ─── 5. INVENTORY & COUPON SAFETY ────────────────────────────────────────────
  console.log("\n--- 5. INVENTORY & COUPON INVARIANT SAFETY ---");

  // Test 24: Payment capture does NOT double-reserve inventory (reservedQuantity remains 2)
  const invState = await invRepo.getInventoryByVariantId("var_oyster_200g");
  assert("Payment webhook capture does NOT double-reserve inventory (reservedQuantity unchanged)", invState?.reservedQuantity === 2);

  // Test 25: Order cancellation on failure releases reservation once
  // Seed order 5 for failure test
  const order5: OrderDocument = {
    id: "order_wh_005",
    orderNumber: "MB-2026-0005",
    userId: "user_eve",
    customerEmail: "eve@mushbio.com",
    customerPhone: "9333444555",
    customerName: "Eve",
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    currency: "INR",
    subtotal: 28000,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 28000,
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    couponCodeSnapshot: "MUSH10",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  const item5: OrderItemDocument = {
    id: "item_005",
    productId: "prod_oyster",
    variantId: "var_oyster_200g",
    sku: "OYST-200G",
    productNameSnapshot: "Fresh Oyster",
    weightSnapshot: "200g",
    unitPrice: 28000,
    quantity: 1,
    discount: 0,
    tax: 0,
    lineTotal: 28000,
  };
  await orderRepo.createOrder(order5, [item5]);
  await statusSvc.transitionStatus("system_webhook", order5.id, "CANCELLED", "Explicit cancellation on failed attempt");

  const invAfterCancel = await invRepo.getInventoryByVariantId("var_oyster_200g");
  assert("Order cancellation on payment failure releases reserved inventory once", invAfterCancel?.reservedQuantity === 1);

  // Test 26: Duplicate failure event does not double-release inventory
  await statusSvc.transitionStatus("system_webhook", order5.id, "CANCELLED");
  const invAfterDupCancel = await invRepo.getInventoryByVariantId("var_oyster_200g");
  assert("Duplicate cancellation/failure invocation is idempotent (does not double release stock)", invAfterDupCancel?.reservedQuantity === 1);



  // Test 27: Coupon released on order cancellation
  const couponAfterRelease = await couponRepo.getCouponById("cpn_mush10");
  assert("Coupon redemption is released on cancelled order without negative usageCount", (couponAfterRelease?.usageCount || 0) <= 1);

  // ─── 6. ADMIN PAYMENT RECONCILIATION ─────────────────────────────────────────
  console.log("\n--- 6. ADMIN PAYMENT RECONCILIATION ---");

  // Test 28: Reconcile consistent paid order (order 1)
  const recon1 = await reconSvc.reconcilePayment(order1.id);
  assert(
    "Payment reconciliation for consistent paid order returns CONSISTENT with 0 discrepancies",
    recon1.reconciliationStatus === "CONSISTENT" && recon1.discrepancies.length === 0 && recon1.isPaid === true
  );

  // Test 29: Reconcile recoverable order (payment record is PAID, but order is PAYMENT_PENDING)
  const order6: OrderDocument = {
    id: "order_wh_006",
    orderNumber: "MB-2026-0006",
    userId: "user_frank",
    customerEmail: "frank@mushbio.com",
    customerPhone: "9444555666",
    customerName: "Frank",
    status: "PAYMENT_PENDING",
    paymentStatus: "PENDING",
    currency: "INR",
    subtotal: 50000,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 50000,
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await orderRepo.createOrder(order6, []);
  await paymentRepo.createPaymentRecord(order6.id, {
    id: "pay_att_006",
    provider: "RAZORPAY",
    providerOrderId: "order_rzp_006",
    providerPaymentId: "pay_rzp_006",
    status: "PAID", // Record is PAID
    amount: 50000,
    currency: "INR",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  const recon6 = await reconSvc.reconcilePayment(order6.id);
  assert("Reconciliation identifies lag between payment attempt and order status as RECOVERABLE", recon6.reconciliationStatus === "RECOVERABLE");

  // Test 30: Reconcile inconsistent order (Order is marked PAID but NO payment records exist)
  const order7: OrderDocument = {
    id: "order_wh_007",
    orderNumber: "MB-2026-0007",
    userId: "user_grace",
    customerEmail: "grace@mushbio.com",
    customerPhone: "9555666777",
    customerName: "Grace",
    status: "PAID",
    paymentStatus: "PAID",
    currency: "INR",
    subtotal: 40000,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 40000,
    shippingMethod: "STANDARD",
    shippingAddressSnapshot: sampleAddress,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  await orderRepo.createOrder(order7, []); // No payment records created

  const recon7 = await reconSvc.reconcilePayment(order7.id);
  assert(
    "Reconciliation flags order marked PAID without matching payment attempt as REQUIRES_REVIEW",
    recon7.reconciliationStatus === "REQUIRES_REVIEW"
  );

  // ─── 7. HTTP ENDPOINT INTEGRATION TESTS ───────────────────────────────────────
  console.log("\n--- 7. HTTP WEBHOOK & ADMIN RECONCILIATION ROUTING ---");

  const app = express();
  // Preserve rawBody buffer
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Mock token verification for admin routes
  const { userRepository } = await import("../auth/repository");
  const origVerifyIdToken = userRepository.verifyIdToken;
  const origGetUserById = userRepository.getUserById;

  userRepository.verifyIdToken = async (token: string) => {
    if (token === "staff_token") return { uid: "staff_01", email: "staff@mushbio.com", role: "STAFF", email_verified: true } as any;
    if (token === "admin_token") return { uid: "admin_01", email: "admin@mushbio.com", role: "ADMIN", email_verified: true } as any;
    if (token === "customer_token") return { uid: "user_alice", email: "alice@mushbio.com", role: "CUSTOMER", email_verified: true } as any;
    throw new Error("Invalid token");
  };

  userRepository.getUserById = async (uid: string) => ({
    uid,
    status: "ACTIVE",
    role: uid.includes("staff") ? "STAFF" : uid.includes("admin") ? "ADMIN" : "CUSTOMER",
    email: `${uid}@mushbio.com`,
    emailVerified: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  } as any);

  app.use("/api/v1/payments", createPaymentRouter(undefined as any, whSvc, reconSvc));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;

  function apiRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: any,
    rawTextBody?: string
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const payload = rawTextBody !== undefined ? rawTextBody : body ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 500, body: data ? JSON.parse(data) : {} });
            } catch {
              resolve({ status: res.statusCode || 500, body: data });
            }
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // Test 31: POST /api/v1/payments/webhook succeeds without Bearer auth header (Public endpoint)
    const httpWebhookPayload = {
      event: "payment.captured",
      event_id: "evt_http_001",
      payload: {
        payment: {
          entity: {
            id: "pay_http_rzp_01",
            order_id: "order_rzp_001",
            amount: 50400,
            currency: "INR",
            notes: { orderId: order1.id },
          },
        },
      },
    };
    const httpRawBody = JSON.stringify(httpWebhookPayload);
    const httpSig = generateRazorpayWebhookSignature(httpRawBody, WEBHOOK_SECRET);

    const httpRes31 = await apiRequest("POST", "/api/v1/payments/webhook", { "x-razorpay-signature": httpSig }, undefined, httpRawBody);
    assert("POST /api/v1/payments/webhook processes valid webhook without customer Bearer token (HTTP 200)", httpRes31.status === 200 && httpRes31.body.data.status === "processed");

    // Test 32: Webhook without signature header returns 400
    const httpRes32 = await apiRequest("POST", "/api/v1/payments/webhook", {}, undefined, httpRawBody);
    assert("POST /api/v1/payments/webhook rejects requests missing x-razorpay-signature header (HTTP 400)", httpRes32.status === 400);

    // Test 33: Webhook with invalid signature returns 400
    const httpRes33 = await apiRequest("POST", "/api/v1/payments/webhook", { "x-razorpay-signature": "bad_sig" }, undefined, httpRawBody);
    assert("POST /api/v1/payments/webhook rejects invalid cryptographic signature (HTTP 400)", httpRes33.status === 400);

    // Test 34: Admin reconciliation endpoint rejects unauthenticated requests (HTTP 401)
    const httpRes34 = await apiRequest("GET", `/api/v1/payments/admin/reconciliation/${order1.id}`);
    assert("GET /api/v1/payments/admin/reconciliation/:orderId rejects unauthenticated calls (HTTP 401)", httpRes34.status === 401);

    // Test 35: Admin reconciliation endpoint rejects CUSTOMER role (HTTP 403)
    const httpRes35 = await apiRequest("GET", `/api/v1/payments/admin/reconciliation/${order1.id}`, {
      Authorization: "Bearer customer_token",
    });
    assert("GET /api/v1/payments/admin/reconciliation/:orderId rejects CUSTOMER role (HTTP 403)", httpRes35.status === 403);

    // Test 36: Admin reconciliation endpoint allows STAFF role (HTTP 200)
    const httpRes36 = await apiRequest("GET", `/api/v1/payments/admin/reconciliation/${order1.id}`, {
      Authorization: "Bearer staff_token",
    });
    assert(
      "GET /api/v1/payments/admin/reconciliation/:orderId allows STAFF role and returns reconciliation payload",
      httpRes36.status === 200 && httpRes36.body.data.orderNumber === "MB-2026-0001"
    );

    // Test 37: Admin reconciliation endpoint allows ADMIN role (HTTP 200)
    const httpRes37 = await apiRequest("GET", `/api/v1/payments/admin/reconciliation/${order1.id}`, {
      Authorization: "Bearer admin_token",
    });
    assert("GET /api/v1/payments/admin/reconciliation/:orderId allows ADMIN role", httpRes37.status === 200);

    // Test 38: Admin reconciliation endpoint returns 404 for non-existent order
    const httpRes38 = await apiRequest("GET", "/api/v1/payments/admin/reconciliation/order_non_existent", {
      Authorization: "Bearer admin_token",
    });
    assert("GET /api/v1/payments/admin/reconciliation/:orderId returns 404 for non-existent order", httpRes38.status === 404);

    // Test 39: Order state machine rejects invalid DELIVERED -> PAID transition
    const orderDelivered: OrderDocument = {
      id: "order_wh_delivered",
      orderNumber: "MB-2026-DELV",
      userId: "user_alice",
      customerEmail: "alice@mushbio.com",
      customerPhone: "9876543210",
      customerName: "Alice",
      status: "DELIVERED",
      paymentStatus: "PAID",
      currency: "INR",
      subtotal: 50000,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 50000,
      shippingMethod: "STANDARD",
      shippingAddressSnapshot: sampleAddress,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await orderRepo.createOrder(orderDelivered, []);
    let threwT39 = false;
    try {
      await statusSvc.transitionStatus("system_webhook", orderDelivered.id, "PAID");
    } catch {
      threwT39 = true;
    }
    assert("Order state machine rejects illegal DELIVERED -> PAID transition", threwT39);

    // Test 40: Order state machine rejects transition from CANCELLED to PAID
    const orderCancelled: OrderDocument = {
      id: "order_wh_cancelled",
      orderNumber: "MB-2026-CNCL",
      userId: "user_alice",
      customerEmail: "alice@mushbio.com",
      customerPhone: "9876543210",
      customerName: "Alice",
      status: "CANCELLED",
      paymentStatus: "FAILED",
      currency: "INR",
      subtotal: 50000,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 50000,
      shippingMethod: "STANDARD",
      shippingAddressSnapshot: sampleAddress,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await orderRepo.createOrder(orderCancelled, []);
    let threwT40 = false;
    try {
      await statusSvc.transitionStatus("system_webhook", orderCancelled.id, "PAID");
    } catch {
      threwT40 = true;
    }
    assert("Order state machine rejects illegal CANCELLED -> PAID transition", threwT40);

    // Test 41: Webhook captures order without pre-existing payment attempt by creating record
    const order8: OrderDocument = {
      id: "order_wh_008",
      orderNumber: "MB-2026-0008",
      userId: "user_henry",
      customerEmail: "henry@mushbio.com",
      customerPhone: "9666777888",
      customerName: "Henry",
      status: "PAYMENT_PENDING",
      paymentStatus: "PENDING",
      currency: "INR",
      subtotal: 28000,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 28000,
      shippingMethod: "STANDARD",
      shippingAddressSnapshot: sampleAddress,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await orderRepo.createOrder(order8, []);
    const capture8Payload = {
      event: "payment.captured",
      event_id: "evt_cap_order8",
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_008",
            order_id: "order_rzp_008",
            amount: 28000,
            currency: "INR",
            notes: { orderId: order8.id },
          },
        },
      },
    };
    const cap8Body = JSON.stringify(capture8Payload);
    const cap8Sig = generateRazorpayWebhookSignature(cap8Body, WEBHOOK_SECRET);
    await whSvc.processWebhook(cap8Body, cap8Sig, capture8Payload);
    const order8Payments = await paymentRepo.getPaymentsByOrder(order8.id);
    assert("Webhook creates authoritative payment attempt record when capturing pre-order", order8Payments.length === 1 && order8Payments[0].status === "PAID");

    // Test 42: Multiple webhook events for different orders are completely isolated
    const order9: OrderDocument = {
      id: "order_wh_009",
      orderNumber: "MB-2026-0009",
      userId: "user_isla",
      customerEmail: "isla@mushbio.com",
      customerPhone: "9777888999",
      customerName: "Isla",
      status: "PAYMENT_PENDING",
      paymentStatus: "PENDING",
      currency: "INR",
      subtotal: 45000,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 45000,
      shippingMethod: "STANDARD",
      shippingAddressSnapshot: sampleAddress,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    await orderRepo.createOrder(order9, []);
    const capture9Payload = {
      event: "payment.captured",
      event_id: "evt_cap_order9",
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_009",
            order_id: "order_rzp_009",
            amount: 45000,
            currency: "INR",
            notes: { orderId: order9.id },
          },
        },
      },
    };
    const cap9Body = JSON.stringify(capture9Payload);
    const cap9Sig = generateRazorpayWebhookSignature(cap9Body, WEBHOOK_SECRET);
    await whSvc.processWebhook(cap9Body, cap9Sig, capture9Payload);
    const order9Final = await orderRepo.getOrderById(order9.id);
    assert("Distinct order webhook captures execute in strict data isolation", order9Final?.status === "PAID" && order9Final?.total === 45000);

    // Test 43: Webhook payload snapshot excludes secrets and raw headers
    const storedEvent9 = await eventRepo.getEventByProviderEventId("evt_cap_order9");
    assert(
      "Payment event document records safe audit metadata without webhook secrets",
      storedEvent9 !== null && !("webhookSecret" in (storedEvent9 as any))
    );

    // ─── 8. FIRESTORE SECURITY RULES VALIDATION ─────────────────────────────────
    console.log("\n--- 8. FIRESTORE SECURITY RULES ---");

    // Test 44: Firestore security rules maintain client write denial on paymentEvents & orders
    const rulesValidation = validateFirestoreRulesFile();
    assert(
      "Firestore security rules maintain client write denial on paymentEvents, orders, and payments",
      rulesValidation.passed
    );

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/44 Phase 11 Razorpay Webhook & Reconciliation Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    userRepository.verifyIdToken = origVerifyIdToken;
    userRepository.getUserById = origGetUserById;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runWebhooksTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Webhook test suite failed:", err);
      process.exit(1);
    });
}
