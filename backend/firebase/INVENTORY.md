# MushBio Real-Time Inventory Engine (Phase 04)

---

## 1. Overview & Data Model

The MushBio Inventory Engine manages real-time warehouse stock counters, transactional reservations during checkout, race-condition safety, and an append-only audit ledger of inventory movements.

### Core Collections:
1. **`inventory/{variantId}`**:
   - `variantId`: ID of the product packaging variant (e.g. `var_oyster_250g`).
   - `productId`: Parent product ID (`prod_oyster_pearl`).
   - `sku`: Barcode / SKU string (`MB-OYS-250`).
   - `availableQuantity`: Unreserved stock immediately available for purchase.
   - `reservedQuantity`: Stock temporarily locked during active checkout sessions.
   - `lowStockThreshold`: Threshold for warning triggers (default: `10` units).
   - `updatedAt`: Timestamp of last modification.

2. **`inventoryMovements/{movementId}`** (Append-Only Ledger):
   - `id`: Auto-generated unique movement identifier.
   - `variantId`: Target variant ID.
   - `productId`: Parent product ID.
   - `type`: `RECEIPT` | `SALE` | `RETURN` | `DAMAGE` | `ADJUSTMENT` | `RESERVATION` | `RELEASE`.
   - `quantity`: Signed delta applied to `availableQuantity` or `reservedQuantity`.
   - `previousQuantity`: Available quantity before operation.
   - `newQuantity`: Available quantity after operation.
   - `reason`: Descriptive audit explanation.
   - `referenceType`: `ORDER` | `PURCHASE_RECEIPT` | `MANUAL_ADJUSTMENT` | `RETURN_REQUEST`.
   - `referenceId`: Idempotency tracking key (e.g. `orderId`, `batchId`).
   - `actorUid`: User UID or `"SYSTEM"`.
   - `createdAt`: Timestamp.

---

## 2. Invariants & Stock Equation

$$\text{Total Physical Stock} = \text{availableQuantity} + \text{reservedQuantity}$$

### Global Invariants:
1. $\text{availableQuantity} \ge 0$ (No negative available stock allowed)
2. $\text{reservedQuantity} \ge 0$ (No negative reserved stock allowed)
3. Direct client writes (`allow write: if false;`) are strictly blocked; all updates happen via Cloud Functions + Firebase Admin SDK transactions.

---

## 3. Operations & Lifecycle

```text
                  [Farm Harvest / Inbound Delivery]
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │        RECEIVE STOCK         │
                   │ availableQuantity += qty     │
                   └──────────────┬───────────────┘
                                  │
                   [Customer Starts Checkout]
                                  │
                                  ▼
                   ┌──────────────────────────────┐
                   │        RESERVE STOCK         │
                   │ availableQuantity -= qty     │
                   │ reservedQuantity  += qty     │
                   └──────┬────────────────┬──────┘
                          │                │
           [Payment Success]              [Payment Failed / Expired]
                          │                │
                          ▼                ▼
         ┌─────────────────────────┐  ┌─────────────────────────┐
         │       COMMIT SALE       │  │   RELEASE RESERVATION   │
         │ reservedQuantity -= qty │  │ availableQuantity += qty│
         │ (available was already  │  │ reservedQuantity  -= qty│
         │  decremented at reserve)│  └─────────────────────────┘
         └─────────────────────────┘
```

### Detailed Lifecycle Matrix:

| Operation | `availableQuantity` | `reservedQuantity` | Movement Type | Condition |
|---|---|---|---|---|
| **`initializeInventory`** | $+ \text{initialQty}$ | $0$ | `RECEIPT` | Variant doc must not exist |
| **`receiveStock`** | $+ \text{qty}$ | $0$ | `RECEIPT` | $\text{qty} > 0$ |
| **`adjustStock`** | Set to $\text{newQty}$ | Unchanged | `ADJUSTMENT` | $\text{newQty} \ge 0$ |
| **`reserveStock`** | $- \text{qty}$ | $+ \text{qty}$ | `RESERVATION` | $\text{availableQuantity} \ge \text{qty}$ |
| **`releaseReservation`**| $+ \text{qty}$ | $- \text{qty}$ | `RELEASE` | $\text{reservedQuantity} \ge \text{qty}$ |
| **`commitSale`** | Unchanged | $- \text{qty}$ | `SALE` | $\text{reservedQuantity} \ge \text{qty}$ |
| **`processReturn`** | $+ \text{qty}$ | Unchanged | `RETURN` | $\text{qty} > 0$ |
| **`markDamaged`** | $- \text{qty}$ | Unchanged | `DAMAGE` | $\text{availableQuantity} \ge \text{qty}$ |

---

## 4. Concurrency & Race-Condition Safety

When concurrent customer checkouts arrive simultaneously for limited remaining stock (e.g. 5 units remaining, Customer A requests 4, Customer B requests 3):
- **Firestore Transaction Isolation**: Both requests attempt to read `inventory/{variantId}` and execute within an atomic transaction.
- **First-Committed Wins**: The first transaction to commit successfully deducts 4 units ($\text{available} = 1, \text{reserved} = 4$).
- **Second Request Fails Safely**: The second transaction detects $\text{available} (1) < \text{requested} (3)$ and throws `400 INSUFFICIENT_STOCK`.
- **Zero Overselling**: Overselling is structurally impossible.

---

## 5. Idempotency Guarantees

Every mutation that impacts customer orders or batches requires a `referenceId` (e.g. `order_101`).
- Prior to updating counters, the service queries `inventoryMovements` for an existing record with matching `(variantId, type, referenceId)`.
- If found, the service returns the previous successful result with `isIdempotentReplay: true` without double-decrementing or double-incrementing stock counters.

---

## 6. Public Availability Visibility

Customer endpoints (`/api/v1/products` and `/api/v1/products/:slug`) **never** leak raw warehouse quantities (`availableQuantity`, `reservedQuantity`, or audit logs).

Instead, variant and product availability are mapped to safe enum states:
- **`IN_STOCK`**: $\text{availableQuantity} > \text{lowStockThreshold}$
- **`LOW_STOCK`**: $0 < \text{availableQuantity} \le \text{lowStockThreshold}$
- **`OUT_OF_STOCK`**: $\text{availableQuantity} \le 0$
