# MushBio Address Book & User Profiles Architecture (Phase 06)

---

## 1. Overview & Data Model

Addresses belong directly to a customer's profile as a subcollection under `users/{uid}`:

```text
┌──────────────────────────────────────────────┐
│           Firestore: users/{uid}             │
│  (User Profile)                              │
│  - defaultShippingAddressId: "addr_123"      │
│                                              │
│  └── Subcollection: addresses/{addressId}    │
│      - id: "addr_123"                        │
│      - label: "Home"                         │
│      - recipientName: "Customer Name"        │
│      - phone: "+919876543210"                │
│      - line1: "123 Farm Lane"                │
│      - line2: "Opposite Temple"              │
│      - city: "Madikeri"                      │
│      - state: "Karnataka"                    │
│      - postalCode: "571201"                  │
│      - country: "IN"                         │
│      - isDefault: true                       │
│      - createdAt: Timestamp                  │
│      - updatedAt: Timestamp                  │
└──────────────────────────────────────────────┘
```

---

## 2. Invariants & Business Rules

1. **Strict Ownership**: All operations derive `userId` solely from `request.auth.uid`. Cross-user address access is impossible.
2. **Deterministic Default Address**:
   - The first address created by a user automatically receives `isDefault = true`.
   - A user with $\ge 1$ address has **EXACTLY ONE** default address.
   - `users/{uid}.defaultShippingAddressId` strictly points to the active `isDefault: true` address.
3. **Atomic Default Transitions**:
   - Setting a new default address atomically sets the previous default to `isDefault: false` and updates the profile's `defaultShippingAddressId` inside a Firestore transaction.
4. **Default Deletion & Promotion**:
   - Deleting the active default address automatically promotes the most recently updated remaining address as the new default.
   - Deleting the only remaining address clears `defaultShippingAddressId` to `null`.
5. **Address Book Limits**:
   - Maximum of **10 addresses** per user. Exceeding 10 returns `409 ADDRESS_LIMIT_REACHED`.
6. **Future Checkout Immutability**:
   - When an order is placed in later phases, an immutable `shippingAddressSnapshot` will be captured inside the order record. Mutations to the mutable address book will never corrupt past order history.

---

## 3. Address Book REST API

All endpoints require `requireAuth` + `requireActiveAccount`:

| Method | Endpoint | Description |
|---|---|---|
| **GET** | `/api/v1/me/addresses` | List all addresses for user (default address first, then newest). |
| **POST** | `/api/v1/me/addresses` | Create a new address (auto-default on first address). |
| **GET** | `/api/v1/me/addresses/:addressId` | Retrieve single address by ID. |
| **PATCH** | `/api/v1/me/addresses/:addressId` | Update address fields. Atomically manages default switching if `isDefault: true`. |
| **DELETE** | `/api/v1/me/addresses/:addressId` | Delete address. Promotes replacement if deleting default. |
| **POST** | `/api/v1/me/addresses/:addressId/default` | Atomically designate address as default. |

---

## 4. Input Validation (India-First & International Compatible)

- **`label`**: Optional string, 1–40 characters (e.g. "Home", "Farm", "Warehouse").
- **`recipientName`**: Required string, 2–100 characters.
- **`phone`**: Required phone format (`/^[0-9+\s()-]{10,20}$/`).
- **`line1`**: Required street address, 3–200 characters.
- **`line2`**: Optional secondary address / landmark, up to 200 characters.
- **`city`**: Required city name, 2–100 characters.
- **`state`**: Required state / province, 2–100 characters.
- **`postalCode`**: Required PIN code (`/^[A-Za-z0-9\s-]{3,12}$/`).
- **`country`**: Required country code, default `"IN"`.

---

## 5. Security Rules

```rules
match /users/{userId} {
  allow read: if isOwner(userId) || isStaff();
  
  // Subcollection: Addresses
  match /addresses/{addressId} {
    allow read, write: if isOwner(userId) || isStaff();
  }
}
```
Client mutations directly targeting `users/{uid}.defaultShippingAddressId` are blocked, ensuring synchronization is solely managed by trusted Cloud Functions transactions.
