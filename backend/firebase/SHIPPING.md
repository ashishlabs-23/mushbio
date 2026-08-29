# MushBio Delivery & Shipping Engine

## 1. Overview
The MushBio Delivery Engine calculates authoritative shipping fees and estimated delivery timelines for organic mushroom orders across India.

## 2. Core Monetary Standards
- **Currency Code**: `currency = "INR"`
- **Internal Monetary Representation**: **Integer value in Paise (minor units)**.
  - Standard Delivery base price: `5000` paise (₹50.00).
  - Free Shipping threshold: `50000` paise (₹500.00).
  - Express Delivery flat price: `12000` paise (₹120.00).

## 3. Shipping Tiers

| Method | Base Price (Paise) | Base Price (Display) | Free Shipping Threshold | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **`STANDARD`** | `5000` | ₹50.00 | **`50000` paise (₹500.00)** | 3–5 Business Days. Delivered via eco-friendly insulated packaging. |
| **`EXPRESS`** | `12000` | ₹120.00 | Never free | 1–2 Business Days. Priority cold-chain dispatch for fresh gourmet harvest. |

## 4. Post-Discount Subtotal Rule
Free shipping eligibility for `STANDARD` delivery is evaluated strictly against the **post-discount subtotal**:
- Subtotal: `52000` paise (₹520.00), Coupon discount: `5200` paise (₹52.00) $\rightarrow$ Post-discount subtotal = `46800` paise (< `50000` paise / ₹500.00).
- Result: Standard shipping is **`5000` paise (₹50.00)** (Total = `51800` paise / ₹518.00).
- This guarantees margins are protected when discounts bring cart values below the logistical cost threshold.

## 5. Server-Side Enforcement
- The client cannot supply arbitrary shipping rates.
- Shipping fees and estimated delivery dates are calculated deterministically on the server during checkout preview and order creation.
