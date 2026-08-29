# MushBio Phase 10 — Razorpay Payment Gateway

## Phase 11 — Webhook Verification & Payment Reconciliation

For complete documentation on server-side webhook ingestion, raw body preservation, cryptographic HMAC-SHA256 signature verification, idempotency ledgers (`paymentEvents/{providerEventId}`), refund handling, and admin reconciliation, see:

👉 [WEBHOOKS.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/WEBHOOKS.md)

### Key Webhook Endpoints
- Ingestion: `POST /api/v1/payments/webhook` (Public, verified via `x-razorpay-signature`)
- Admin Reconciliation: `GET /api/v1/payments/admin/reconciliation/:orderId` (Roles: `ADMIN`, `STAFF`)

---

## Overview

Phase 10 implements full, **server-authoritative** Razorpay payment processing.

The server is the **single source of truth** for:

- Payment amount (integer paise, never floats)
- Currency (`"INR"` ISO code, not the `₹` symbol)
- Order identity
- HMAC-SHA256 signature verification

The client **never** determines the amount or verifies signatures directly.

---

## Currency Convention

```
Database / API:  integer paise, currency = "INR"
Display (UI):    ₹ symbol + rupee value

Example:
  ₹280.00  →  28000 paise stored as integer
  ₹50.00   →  5000 paise stored as integer
  ₹0 free  →  0 paise
```

| Correct ✅ | Wrong ❌ |
|---|---|
| `"currency": "INR"` | `"currency": "₹"` |
| `"amount": 28000` (paise) | `"amount": 280.00` (rupees as float) |

---

## Architecture

```
CUSTOMER BROWSER
  |
  | 1. POST /api/v1/payments/create-order  { orderId }
  ↓
BACKEND (server-authoritative)
  - Verify orderId ownership
  - Validate status == PAYMENT_PENDING
  - Confirm currency == "INR"
  - Idempotency check: reuse existing Razorpay order if PENDING/AUTHORIZED
  - Call Razorpay Orders API with order.total (paise) + "INR"
  - Store payment record (status: PENDING)
  - Return { razorpayOrderId, amount (paise), currency, razorpayKeyId }
          <- NOTE: razorpayKeySecret NEVER returned
  |
  | 2. Frontend opens Razorpay modal
  |
  | 3. Customer completes payment
  |
  | 4. Razorpay returns { razorpay_order_id, razorpay_payment_id, razorpay_signature }
  |
  | 5. POST /api/v1/payments/verify
  ↓
BACKEND VERIFICATION
  - Reconstruct HMAC-SHA256: sha256(orderId + "|" + paymentId, RAZORPAY_KEY_SECRET)
  - timingSafeEqual(expected, received) — prevents timing attacks
  - If valid: payment status -> PAID, order status -> PAID
  - Inventory NOT re-reserved (was reserved at order creation)
  - Return { success: true, paymentStatus: "PAID", orderNumber }
```

---

## API Endpoints

### POST /api/v1/payments/create-order

**Auth:** Bearer token required (CUSTOMER role)

**Request:**
```json
{ "orderId": "ord_xxxxxxxxxxxxxxxx" }
```

**Response (201):**
```json
{
  "data": {
    "orderId": "ord_xxxxxxxxxxxxxxxx",
    "orderNumber": "MB-20260001",
    "razorpayOrderId": "order_Pxxxxxxxxxx",
    "razorpayKeyId": "rzp_live_xxxxxxxx",
    "amount": 28000,
    "currency": "INR",
    "prefill": { "name": "Alice", "email": "alice@example.com" }
  }
}
```

> `razorpayKeySecret` is **never** included in any response.

---

### POST /api/v1/payments/verify

**Request:**
```json
{
  "orderId": "ord_xxx",
  "razorpayOrderId": "order_Pxxx",
  "razorpayPaymentId": "pay_Pxxx",
  "razorpaySignature": "hmac_sha256_hex"
}
```

**Response (200):**
```json
{
  "data": {
    "success": true,
    "paymentStatus": "PAID",
    "orderStatus": "PAID",
    "orderNumber": "MB-20260001",
    "amount": 28000,
    "currency": "INR"
  }
}
```

---

### GET /api/v1/payments/:orderId

Returns safe payment history (no providerSignature field).

---

## Security Properties

| Concern | Implementation |
|---|---|
| Server-authoritative amounts | Order total from Firestore only |
| Secret isolation | `RAZORPAY_KEY_SECRET` never sent to client |
| HMAC-SHA256 | `crypto.createHmac` + `timingSafeEqual` |
| Ownership | `order.userId === requestingUserId` enforced |
| Idempotency | Duplicate create-order calls reuse existing Razorpay order |
| No double inventory | Inventory reserved at order creation; payment does NOT re-reserve |
| Cross-user blocked | 403 on all cross-user payment attempts |
| State machine gates | Only `PAYMENT_PENDING` orders can be paid |
| Failed payment audit | Failed verification writes `FAILED` payment record |
| Retry support | Failed orders can create new Razorpay order and retry |

---

## Error Codes

| Code | HTTP | Description |
|---|---|---|
| `PAYMENT_ORDER_NOT_FOUND` | 404 | Order does not exist |
| `PAYMENT_ORDER_OWNERSHIP` | 403 | Order belongs to another user |
| `PAYMENT_ALREADY_PAID` | 400 | Order is already PAID |
| `PAYMENT_CURRENCY_MISMATCH` | 400 | Order currency is not INR |
| `ORDER_AMOUNT_INCONSISTENT` | 400 | Order total exceeds sanity limit |
| `PAYMENT_RECORD_NOT_FOUND` | 404 | Payment record missing during verify |
| `PAYMENT_ORDER_MISMATCH` | 400 | Razorpay order ID mismatch |
| `PAYMENT_SIGNATURE_INVALID` | 400 | HMAC-SHA256 verification failed |
| `VALIDATION_ERROR` | 400 | Missing/malformed request fields |

---

## Environment Variables

```env
# functions/.env.local — NEVER commit to git
RAZORPAY_KEY_ID=rzp_live_xxxxxxxx       # public key — safe for client
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx    # NEVER expose to client
```

Production (Firebase Secrets):
```bash
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
```

---

## Firestore Schema

```
orders/{orderId}/payments/{paymentId}
  id                string
  provider          "RAZORPAY"
  providerOrderId   string    Razorpay order_id
  providerPaymentId string    Razorpay payment_id (set on capture)
  providerSignature string    HMAC — stored server-side, never returned to client
  status            PENDING | PAID | FAILED | AUTHORIZED | REFUNDED
  amount            number    integer paise
  currency          "INR"
  method            string?   upi | card | netbanking | wallet
  errorCode         string?
  errorDescription  string?
  createdAt         Timestamp
  updatedAt         Timestamp
```

---

## Order / Payment Lifecycle

```
PAYMENT_PENDING → PAID → CONFIRMED → PROCESSING → PACKED → SHIPPED → DELIVERED
      ↓
  CANCELLED  (inventory released, coupon released)
```

---

## Test Suite — 31/31 Scenarios

Run: `cd functions && npm test`

| Category | Tests |
|---|---|
| Payment order creation (auth, ownership, currency, amount) | #01 – #11 |
| Idempotent create-order (no duplicate SDK calls) | #12 |
| HMAC signature verification (valid, invalid, mismatch) | #13 – #20 |
| Payment retry after failure | #21 – #22 |
| No double inventory reservation | #23 |
| Payment history & secret isolation | #24 – #26 |
| HTTP API integration (`/api/v1/payments`) | #27 – #30 |
| Firestore security rules | #31 |

---

## Phase 11 Preview (Webhooks — deferred)

- `POST /api/v1/payments/webhook`
- HMAC on `X-Razorpay-Signature` header
- Events: `payment.captured`, `payment.failed`, `order.paid`
- Reconcile payments lost to network failure

> Do NOT implement webhooks until Phase 11 is started.
