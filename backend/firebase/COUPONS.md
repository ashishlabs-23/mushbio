# MushBio Coupon & Discount Engine

## 1. Overview
The MushBio Coupon Engine provides server-authoritative discount validation, financial calculation, and transactional redemption during checkout.

## 2. Core Monetary Standards
- **Currency Code**: `currency = "INR"` across all schemas, APIs, Firestore documents, and calculations.
- **Internal Monetary Representation**: **Integer value in Paise (minor units)**.
  - Example: ₹280.00 $\rightarrow$ `28000` paise.
  - Example: ₹100.00 $\rightarrow$ `10000` paise.
- **Frontend Display**: Formatted with the Indian Rupee symbol `₹` (e.g., `₹280.00` / `₹100`).

## 3. Core Concepts & Rules

### 3.1 Supported Coupon Types
- **`PERCENTAGE`**: Percentage discount of the subtotal (e.g., 10% on 56000 paise = 5600 paise discount). Supports an optional `maximumDiscount` cap in paise (e.g., 50% capped at 15000 paise = ₹150.00).
- **`FIXED_AMOUNT`**: Flat monetary reduction in paise (e.g., 10000 paise = ₹100.00 off). Capped at the current subtotal to guarantee non-negative balances.
- **`FREE_SHIPPING`**: Waives standard delivery charges.

### 3.2 Normalization & Case Insensitivity
All coupon codes are normalized before validation and storage:
```typescript
const normalized = rawCode.trim().toUpperCase();
```
Both `mush10` and `  MUSH10  ` resolve to the canonical record `MUSH10`.

### 3.3 Read-Only Validation vs. Transactional Redemption
- **Validation (`POST /api/v1/checkout/coupon/validate`)**:
  - Validates active status, campaign date bounds, minimum order requirement (in paise), global usage limits, and per-user redemption limits.
  - **Strictly read-only**: Does NOT increment `usageCount` or create a redemption record.
- **Redemption (`createOrder`)**:
  - Executed inside a Firestore transaction.
  - Atomically increments `usageCount` and inserts a `CouponRedemptionDocument` (`status: "APPLIED"`).
  - Enforces concurrency protection so racing checkouts cannot exceed `usageLimit`.

### 3.4 Cancellation & Auto-Release
- When an order transitions to `CANCELLED`, `OrderStatusService` releases the redemption record (`status: "CANCELLED"`) and decrements `usageCount`.

## 4. Financial Calculation Pipeline (in Paise)
$$\text{Subtotal} = \sum (\text{variant.price} \times \text{quantity})$$
$$\text{Discount} = \text{calculateDiscount}(\text{coupon}, \text{Subtotal})$$
$$\text{SubtotalAfterDiscount} = \max(0, \text{Subtotal} - \text{Discount})$$
$$\text{Shipping} = \text{calculateShipping}(\text{SubtotalAfterDiscount}, \text{method})$$
$$\text{Tax} = 0$$
$$\text{Total} = \text{SubtotalAfterDiscount} + \text{Shipping} + \text{Tax}$$

## 5. REST Endpoints

### 5.1 Validate Coupon
- **Endpoint**: `POST /api/v1/checkout/coupon/validate`
- **Auth**: Required (`Authorization: Bearer <ID_TOKEN>`)
- **Request Body**:
```json
{
  "code": "MUSH10",
  "subtotal": 56000
}
```
- **Response (`200 OK`)**:
```json
{
  "data": {
    "valid": true,
    "code": "MUSH10",
    "type": "PERCENTAGE",
    "value": 10,
    "discount": 5600,
    "currency": "INR",
    "message": "Coupon applied: 10% off"
  }
}
```

### 5.2 Remove Coupon
- **Endpoint**: `POST /api/v1/checkout/coupon/remove`
- **Auth**: Required
- **Response (`200 OK`)**:
```json
{
  "data": {
    "removed": true
  }
}
```
