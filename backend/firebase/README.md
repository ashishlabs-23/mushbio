# MushBio — Firebase Backend Foundation (Phase 01)

This directory documents the Firebase-native backend architecture for the **MushBio** gourmet mushroom e-commerce platform.

---

## 1. System Architecture

```text
                     MUSHBIO FRONTEND
                 HTML / CSS / JavaScript
                          │
                          │ HTTPS (Client SDK)
                          ▼
              ┌─────────────────────────┐
              │ Firebase Authentication │
              │   (Email, Phone, OTP)   │
              └────────────┬────────────┘
                           │
                           ▼
                 ┌──────────────────┐
                 │ Cloud Firestore  │
                 │ (Deny by Default)│
                 └────────┬─────────┘
                          │
              ┌───────────┼────────────┐
              ▼           ▼            ▼
       Cloud Functions  Storage   Cloud Tasks
      (Node 20 / TS)   (Assets)
              │
       ┌──────┼───────────┐
       ▼      ▼           ▼
   Razorpay  Email      Admin
   Payments  Service    Operations
```

---

## 2. Directory Structure

```text
mushbio/
├── .firebaserc                     # Firebase project aliases (dev/prod)
├── firebase.json                   # Emulator, Firestore, Functions & Storage mapping
├── firestore.rules                 # Strict deny-by-default database rules
├── firestore.indexes.json          # Composite queries and index definitions
├── storage.rules                   # Strict media storage security rules
├── .gitignore                      # Excludes credentials, node_modules & build artifacts
├── src/
│   └── firebase/
│       └── config.js               # Client Firebase SDK configuration boundary
├── backend/
│   └── firebase/
│       └── README.md               # Architecture documentation
└── functions/                      # Cloud Functions (TypeScript / Node 20)
    ├── package.json
    ├── tsconfig.json
    ├── .env.example
    └── src/
        ├── index.ts                # Main functions export & health endpoint
        ├── config/
        │   ├── firebaseAdmin.ts    # Firebase Admin SDK singleton (Server-only)
        │   └── environment.ts     # Type-safe environment & secrets resolution
        ├── utils/
        │   ├── logger.ts           # Sensitive field scrubbing & structured logger
        │   └── errors.ts           # Standardized AppError & error handler
        ├── types/                  # Shared TypeScript domain interfaces
        │   ├── common.ts
        │   ├── user.ts
        │   ├── product.ts
        │   ├── cart.ts
        │   └── order.ts
        └── [auth, products, inventory, cart, orders, payments, admin, notifications]/
            └── index.ts            # Future phase module stubs
```

---

## 3. Client vs Server Boundary (Core Principle)

| Component | SDK | Privilege Level | Allowed Operations |
|---|---|---|---|
| **Frontend Browser** | Firebase Web SDK (v10+) | Low / Untrusted | Safe reads (published products, blogs), auth state, user profile reads |
| **Cloud Functions** | Firebase Admin SDK | Elevated / Trusted | Price validation, order calculation, inventory reservation, Razorpay API, webhook verification |

> [!IMPORTANT]
> **Never import the Firebase Admin SDK or private service-account keys into frontend browser JavaScript.**

---

## 4. Local Development & Firebase Emulator Suite

The Firebase Emulator Suite allows 100% offline local development without touching production data or incurring billing.

### Emulators Port Map:
- **Emulator UI**: `http://localhost:4000`
- **Cloud Functions**: `http://localhost:5001`
- **Cloud Firestore**: `localhost:8085`
- **Firebase Auth**: `http://localhost:9099`
- **Firebase Storage**: `localhost:9199`

### Commands:
```bash
# Start all emulators
npm run emulators:start

# Export emulator state for persistence
npm run emulators:export

# Start emulators importing previous test data
npm run emulators:import
```

---

## 5. Cloud Functions Build & Test

```bash
# Build TypeScript functions
npm run functions:build

# Watch mode for active development
npm run functions:watch
```

### Health Check Endpoint:
- **Function**: `health`
- **URL (Local Emulator)**: `http://127.0.0.1:5001/mushbio-organics/asia-south1/health`
- **Response**:
```json
{
  "status": "ok",
  "service": "mushbio-backend",
  "version": "1.0.0",
  "environment": "development",
  "timestamp": "2026-08-28T14:25:00.000Z"
}
```

---

## 6. Secrets & Environment Configuration

Private credentials (e.g. Razorpay Keys, Webhook secrets, SMTP passwords) must **never be committed to Git**.

### Production Secrets Setup:
```bash
# Set Razorpay API Secrets in Cloud Secret Manager
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
```

---

---

## 7. Security Rules Posture & Test Suite

- **Firestore**: Strict **DENY BY DEFAULT** and resource-specific least-privilege matrix.
- **Storage**: Strict **DENY BY DEFAULT** with mime-type and size guards (5MB products/blogs, 2MB avatars).
- **Rule Verification Suite**: Run `npm --prefix functions test` to execute the automated 12-scenario security test suite.

---

## 8. Development Data Seeding & Architecture Specifications

- **Schema Document**: [FIRESTORE_SCHEMA.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/FIRESTORE_SCHEMA.md)
- **API Documentation**: [API_PRODUCTS.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/API_PRODUCTS.md)
- **Inventory Specification**: [INVENTORY.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/INVENTORY.md)
- **Authentication Architecture**: [AUTHENTICATION.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/AUTHENTICATION.md)
- **Address Book Specification**: [ADDRESSES.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/ADDRESSES.md)
- **Cart Engine Architecture**: [CART.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/CART.md)
- **Checkout Preparation & Preview**: [CHECKOUT.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/CHECKOUT.md)
- **Order Lifecycle & State Machine**: [ORDERS.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/ORDERS.md)
- **Dynamic Coupons & Discounts**: [COUPONS.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/COUPONS.md)
- **Delivery & Shipping Calculation**: [SHIPPING.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/SHIPPING.md)
- **Seed Command**: `npm --prefix functions run seed` (populates local emulator with 5 categories, 12+ realistic products, seed coupons)

---

## 9. Development Roadmap

1. ✅ **Phase 01: Firebase Foundation Only** *(Complete)*
2. ✅ **Phase 02: Firestore Data Model, Collections & Composite Indexes** *(Complete)*
3. ✅ **Phase 03: Products & Categories API** *(Complete)*
4. ✅ **Phase 04: Real-time Inventory Engine** *(Complete)*
5. ✅ **Phase 05: Firebase Authentication (Email/Password & User Profiles)** *(Complete)*
6. ✅ **Phase 06: Users, Profiles & Address Book** *(Complete)*
7. ✅ **Phase 07: Server-Validated Cart Engine** *(Complete)*
8. ✅ **Phase 08: Order Lifecycle & State Machine** *(Complete)*
9. ✅ **Phase 09: Dynamic Coupons & Delivery Calculations** *(Complete)*
10. ⏳ **Phase 10: Razorpay Payment Gateway Integration**
11. ⏳ **Phase 11: Payment Webhooks & Async Reconciliation**
12. ⏳ **Phase 12: Blog, Contact & Transactional Email Notifications**
13. ⏳ **Phase 13: Verified Customer Reviews**
14. ⏳ **Phase 14: Farm Admin Operations & Management Dashboard**
15. ⏳ **Phase 15: Security Rules Hardening & App Check Enforcement**
16. ⏳ **Phase 16: Automated Backend Test Suite**
17. ⏳ **Phase 17: Frontend Integration & State Sync**
18. ⏳ **Phase 18: Production Deployment & Monitoring**
