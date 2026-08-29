# MushBio Checkout Engine Architecture (Phase 08)

---

## 1. Overview & Core Principles

The MushBio checkout engine bridges the active Cart (Phase 07) and the Order Lifecycle (Phase 08):
- **Authoritative Server Preview**: Financial totals (subtotal, shipping, tax, total), live prices, and inventory availability are calculated on demand by the server. Frontend totals are never trusted.
- **Configurable Shipping Rules**: Free standard shipping on orders $\ge ₹500$, ₹50 standard fee below ₹500, ₹120 for express shipping.
- **Address Ownership Guard**: Checkout preview strictly verifies that the selected shipping address belongs to the authenticated customer (`request.auth.uid`).
- **No Premature Inventory Locking**: Previewing checkout **DOES NOT reserve inventory**. Stock reservation occurs only during actual order creation (`POST /api/v1/orders`).

---

## 2. Checkout Endpoints

| Method | Endpoint | Description | Auth Requirement |
|---|---|---|---|
| **POST** | `/api/v1/checkout/preview` | Generates authoritative checkout breakdown, calculates shipping and taxes, and verifies stock availability. | `requireAuth()`, `requireActiveAccount()` |

---

## 3. Request & Response Payload

### Request:
```json
{
  "addressId": "addr_123456",
  "shippingMethod": "STANDARD"
}
```

### Response:
```json
{
  "data": {
    "valid": true,
    "currency": "INR",
    "items": [
      {
        "productId": "prod_oyster_pearl",
        "variantId": "var_oyster_250g",
        "productName": "Pearl Oyster Mushroom",
        "variantLabel": "250g",
        "unitPrice": 80,
        "quantity": 2,
        "lineTotal": 160,
        "image": "assets/oyster.jpg",
        "availability": "IN_STOCK"
      }
    ],
    "itemCount": 2,
    "shippingAddress": {
      "id": "addr_123456",
      "recipientName": "Customer Name",
      "phone": "+919876543210",
      "line1": "123 Farm Lane",
      "city": "Madikeri",
      "state": "Karnataka",
      "postalCode": "571201",
      "country": "IN",
      "isDefault": true
    },
    "shippingMethod": "STANDARD",
    "subtotal": 160,
    "discount": 0,
    "shipping": 50,
    "tax": 0,
    "total": 210,
    "issues": []
  }
}
```

---

## 4. Checkout Issue Codes

- `CART_EMPTY` (Severity: `BLOCKER`): Cart has no items.
- `PRODUCT_INACTIVE` (Severity: `BLOCKER`): Product deactivated by admin.
- `VARIANT_INACTIVE` (Severity: `BLOCKER`): Variant deactivated by admin.
- `OUT_OF_STOCK` (Severity: `BLOCKER`): Variant has 0 available units in inventory.
- `INSUFFICIENT_STOCK` (Severity: `BLOCKER`): Available quantity < requested cart quantity.
- `ADDRESS_NOT_FOUND` (Severity: `BLOCKER`): Address does not exist or belong to user.
- `PRICE_CHANGED` (Severity: `WARNING`): Live catalog price has changed since item was added to cart.
