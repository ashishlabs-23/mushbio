# MushBio — Razorpay Webhooks & Payment Reconciliation (Phase 11)

---

## 1. Webhook Endpoint Specification

- **Endpoint**: `POST /api/v1/payments/webhook`
- **Authentication**: **None** (Customer Bearer authentication is **strictly disabled** for webhooks).
- **Security Mechanism**: Cryptographic HMAC-SHA256 signature verification via `x-razorpay-signature` header using the server-side `RAZORPAY_WEBHOOK_SECRET`.
- **Payload Limits**: Max 1MB body size enforced by Express parser to prevent resource exhaustion / DoS.
- **Raw Request Body**: Preserved as unmodified byte buffer `req.rawBody` by the global JSON middleware to ensure signature verification is performed on the exact raw byte stream.

---

## 2. Signature Verification Strategy

The signature verification algorithm uses constant-time comparison to prevent timing side-channel attacks:

```typescript
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  webhookSecret: string
): boolean {
  if (!rawBody || !signature || !webhookSecret) return false;
  try {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    const sigBuffer = Buffer.from(signature, "utf-8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf-8");
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
```

If the signature fails verification:
- Returns HTTP 400 with `PAYMENT_SIGNATURE_INVALID`.
- Records an audit log with action `PAYMENT_SIGNATURE_INVALID`.
- No order, payment, inventory, or coupon documents are mutated.

---

## 3. Webhook Idempotency Strategy (`paymentEvents/{providerEventId}`)

Every webhook received from Razorpay contains a unique provider event ID (`event_id` or `x-razorpay-event-id`).

### Event Lifecycle:
1. **Receipt**: Event is checked in `paymentEvents/{providerEventId}`.
2. **Duplicate Check**: If the event status is already `PROCESSED` or `DUPLICATE`:
   - Returns `{ status: "idempotent_duplicate", message: "..." }` with HTTP 200 immediately.
   - Logs `PAYMENT_WEBHOOK_DUPLICATE` in audit logs.
   - Does NOT execute side effects again.
3. **Execution**: If new:
   - Sets status to `RECEIVED`.
   - Executes authoritative validation and state machine transition.
   - Sets status to `PROCESSED` with `processedAt` timestamp.
   - If an unexpected error occurs, marks status `FAILED` with `errorCode` and `errorMessage`.

---

## 4. Supported Razorpay Events & Controlled State Transitions

| Razorpay Event | Internal Payment State | Internal Order State | Side Effects / Actions |
|---|---|---|---|
| `payment.authorized` | `AUTHORIZED` | Unchanged (`PAYMENT_PENDING`) | Payment attempt record updated to AUTHORIZED with providerPaymentId |
| `payment.captured` | `PAID` | `PAID` | Authoritative amount/currency/orderId verified. Order transitions to `PAID`. No inventory double-reserve. |
| `order.paid` | `PAID` | `PAID` | Equivalent to captured; marks order as `PAID`. |
| `payment.failed` | `FAILED` | Unchanged (retry allowed) | Payment attempt marked `FAILED` with provider error code/description. |
| `refund.created` | Unchanged | Unchanged | Refund initiated on provider side. |
| `refund.processed` (Full) | `REFUNDED` | `REFUNDED` | Order transitioned to `REFUNDED`. Audit log recorded. |
| `refund.processed` (Partial) | `PARTIALLY_REFUNDED` | `PAID` / `CONFIRMED` | Order `paymentStatus` updated to `PARTIALLY_REFUNDED`. |
| `refund.failed` | Unchanged | Unchanged | Audit log logged with `PAYMENT_RECONCILIATION_REQUIRED`. |

---

## 5. Authoritative Validation Checks

For `payment.captured` / `order.paid` events:

1. **Currency Verification**: Must strictly match `INR`. If non-INR: logs `PAYMENT_CURRENCY_MISMATCH` and rejects with HTTP 400.
2. **Amount Verification**: Provider `amount` in integer paise must match stored `order.total` exactly. If mismatch: logs `PAYMENT_AMOUNT_MISMATCH` and rejects with HTTP 400.
3. **Order Ownership & Provider ID**: `order_id` in payment entity must match `providerOrderId` in the order's payment attempt record.
4. **Order ID in Notes**: Resolves internal MushBio `orderId` from `notes.orderId`.

---

## 6. Inventory & Coupon Interaction

- **Successful Payment (`payment.captured`)**:
  - Stock was already reserved at order placement (Phase 08).
  - Webhook capture does **NOT** decrement stock again and does **NOT** double-reserve.
  - Reserved stock converts to sold stock during downstream fulfillment transitions (`PROCESSING` / `SHIPPED`).
- **Definitive Order Cancellation on Failure**:
  - Automatically calls `inventoryService.releaseReservation()` using `orderId` reference for idempotency.
  - Automatically calls `couponService.releaseCoupon()` to restore usage count safely.
  - Duplicate cancellation calls are completely idempotent.

---

## 7. Out-of-Order Events & Resiliency

- **Captured arrives before Authorized**: The system immediately transitions the payment attempt and order to `PAID`. If a late `payment.authorized` event arrives subsequently, it is acknowledged without reverting the `PAID` status.
- **Late Failed event after Capture**: If an old `payment.failed` event arrives after an order has already transitioned to `PAID`, the order status remains `PAID` (failed attempts are preserved as historical attempts without overriding the successful capture).
- **Browser vs Webhook Race**:
  - If the customer's browser verify endpoint (`POST /api/v1/payments/verify`) succeeds first and the webhook arrives second: the webhook is acknowledged idempotently without state corruption.
  - If the customer closes the browser tab after payment on Razorpay: the webhook independently and authoritatively marks the order as `PAID`.

---

## 8. Admin Payment Reconciliation Endpoint

- **Endpoint**: `GET /api/v1/payments/admin/reconciliation/:orderId`
- **Access Control**: Role-guarded (`ADMIN` and `STAFF` roles only). Customers receive `403 Forbidden`.
- **Diagnostics Output**:
  - `reconciliationStatus`: `"CONSISTENT"` | `"REQUIRES_REVIEW"` | `"RECOVERABLE"` | `"INVALID"`
  - `orderStatus` and `orderPaymentStatus`
  - `totalAmount` (paise) and `currency`
  - `paymentAttemptsCount` and `latestPaymentAttempt` summary
  - `discrepancies`: list of detected mismatches (e.g. amount mismatch, missing payment record, double charge attempts)
  - No webhook secrets or sensitive tokens exposed.

---

## 9. Audit Logging

Reconciliation and webhook actions are logged in `adminAuditLogs/{logId}`:
- `PAYMENT_WEBHOOK_RECEIVED`
- `PAYMENT_WEBHOOK_PROCESSED`
- `PAYMENT_WEBHOOK_DUPLICATE`
- `PAYMENT_SIGNATURE_INVALID`
- `PAYMENT_AMOUNT_MISMATCH`
- `PAYMENT_CURRENCY_MISMATCH`
- `PAYMENT_RECONCILIATION_REQUIRED`
- `PAYMENT_REFUND_PROCESSED`
