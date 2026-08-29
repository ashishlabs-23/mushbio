# MushBio Server-Validated Cart Engine Architecture (Phase 07)

---

## 1. Overview & Core Philosophy

The MushBio cart engine uses a **server-authoritative commerce model**:
- **Dual Identity Support**: Supports both **Guest Sessions** (identified by opaque/safe guest session tokens `guest_<timestamp>_<random>`) and **Authenticated Accounts** (`userId` derived strictly from Firebase Auth ID token).
- **Server Authoritative**: Products, variants, active statuses, current unit prices, and inventory availability are always re-evaluated from database documents on every read, update, validation pass, and checkout.
- **UI Snapshots**: Display snapshots (`productNameSnapshot`, `variantLabelSnapshot`, `imageSnapshot`, `displayPriceSnapshot`) are preserved for client convenience and price-drift warnings, but are never trusted for financial totals.
- **Zero Inventory Lock on Cart**: Adding items to the cart **DOES NOT reserve inventory**. Inventory reservation occurs atomically during checkout / order placement (Phase 08).

---

## 2. Firestore Data Model

```text
┌──────────────────────────────────────────────────────────┐
│                   Firestore: carts/{cartId}              │
│  - userId?: string                                       │
│  - guestId?: string                                      │
│  - status: "ACTIVE" | "CONVERTED" | "ABANDONED"          │
│  - currency: "INR"                                       │
│  - itemCount: number                                     │
│  - createdAt: Timestamp                                  │
│  - updatedAt: Timestamp                                  │
│                                                          │
│  └── Subcollection: items/{itemId}                       │
│      - id: string                                        │
│      - productId: string                                 │
│      - variantId: string                                 │
│      - productNameSnapshot: string                       │
│      - variantLabelSnapshot: string                      │
│      - imageSnapshot?: string                            │
│      - quantity: number (1–20)                           │
│      - displayPriceSnapshot: number (UI convenience)     │
│      - createdAt: Timestamp                              │
│      - updatedAt: Timestamp                              │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Cart REST API

Mounted under `/api/v1/cart`:

| Method | Endpoint | Description | Auth Requirement |
|---|---|---|---|
| **GET** | `/api/v1/cart` | Read cart with live authoritative prices, stock states, and subtotal. | `optionalAuth()` |
| **POST** | `/api/v1/cart/items` | Add item `{ productId, variantId, quantity }`. Increments quantity if variant exists (max 20). | `optionalAuth()` |
| **PATCH** | `/api/v1/cart/items/:itemId` | Update quantity `{ quantity }` (1–20). | `optionalAuth()` |
| **DELETE** | `/api/v1/cart/items/:itemId` | Remove specific item. | `optionalAuth()` |
| **DELETE** | `/api/v1/cart` | Clear active cart items. | `optionalAuth()` |
| **POST** | `/api/v1/cart/validate` | Full validation pass returning issue codes, blockers, and warnings. | `optionalAuth()` |
| **POST** | `/api/v1/cart/merge` | Merges guest cart items into authenticated user cart upon login. | `requireAuth()` |

---

## 4. Validation & Error Handling

- **Product & Variant Integrity**: The server verifies that `variantId` exists and belongs directly to `productId`, and both are `status: "ACTIVE"` and `isActive: true`. Mismatches return `400 INVALID_CART_ITEM`.
- **Quantity Bounds**:
  - Minimum quantity: 1 unit.
  - Maximum quantity per item: **20 units**. Exceeding 20 returns `400 QUANTITY_LIMIT_EXCEEDED`.
- **Validation Codes (`POST /cart/validate`)**:
  - `PRICE_CHANGED` (Severity: `WARNING`): Live variant price differs from `displayPriceSnapshot`. Customer is alerted without blocking the cart.
  - `OUT_OF_STOCK` (Severity: `BLOCKER`): Product has 0 available units in inventory.
  - `INSUFFICIENT_STOCK` (Severity: `BLOCKER`): Available quantity < requested cart quantity.
  - `PRODUCT_INACTIVE` (Severity: `BLOCKER`): Product deactivated by admin.
  - `VARIANT_INACTIVE` (Severity: `BLOCKER`): Variant deactivated by admin.
  - `PRODUCT_VARIANT_MISMATCH` (Severity: `BLOCKER`): Variant does not belong to product.

---

## 5. Guest to Authenticated Cart Merge

When a customer logs in with an active guest cart:
1. Client calls `POST /api/v1/cart/merge` with `{ guestCartId: "guest_..." }` and their Bearer token.
2. Server loads guest items and user cart items.
3. Matching variants have their quantities combined (`Math.min(userQty + guestQty, 20)`).
4. New variants are transferred to the user cart.
5. The guest cart is marked `status = "CONVERTED"` to prevent double-merging.
6. The enriched user `CartDto` is returned.
