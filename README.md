# 🍄 MushBio — Fresh Mushrooms. Better Living.
### *A Company of Dodanna & CO*

[![Netlify Status](https://api.netlify.com/api/v1/badges/d7851011-9cb9-41c6-8693-3e9e0c1e0cb0/deploy-status)](https://app.netlify.com/projects/mushbio-organics)
[![Live Site](https://img.shields.io/badge/Live%20Demo-mushbio--organics.netlify.app-71872F?style=flat&logo=netlify)](https://mushbio-organics.netlify.app)
[![Ownership](https://img.shields.io/badge/Ownership-Dodanna%20%26%20CO-1B2416?style=flat)](https://mushbio-organics.netlify.app)
[![Backend Tests](https://img.shields.io/badge/Backend%20Tests-12%2F12%20Suites%20Passing-success?style=flat&logo=firebase)](https://mushbio-organics.netlify.app)
[![Tech Stack](https://img.shields.io/badge/Stack-Vanilla%20JS%20%7C%20Three.js%20%7C%20Firebase%20Functions%20%7C%20Firestore%20%7C%20Razorpay-71872F)](https://mushbio-organics.netlify.app)

> **MushBio** is a production-grade organic gourmet mushroom e-commerce platform maintained and operated by **Dodanna & CO**. The application combines a high-performance, visually rich WebGL/Three.js frontend with a robust, secure, server-authoritative backend powered by Firebase Cloud Functions (v2), Firestore, Firebase Authentication, Nominatim GPS geocoding, and the Razorpay Payment Gateway.

---

## 🌐 Live Application & Links

* **Production Storefront**: [https://mushbio-organics.netlify.app](https://mushbio-organics.netlify.app)
* **Shop Catalog**: [https://mushbio-organics.netlify.app/shop.html](https://mushbio-organics.netlify.app/shop.html)
* **Cart & GPS Checkout**: [https://mushbio-organics.netlify.app/cart.html](https://mushbio-organics.netlify.app/cart.html)
* **API Documentation**:
  * [PAYMENTS.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/PAYMENTS.md) — Razorpay Architecture & Signature Verification
  * [WEBHOOKS.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/WEBHOOKS.md) — Webhook Ingestion & Reconciliation Ledgers
  * [LOCATION_PRIVACY.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/LOCATION_PRIVACY.md) — GPS Delivery & Privacy Policy
  * [FIRESTORE_SCHEMA.md](file:///c:/Projects/Ashishlabs/MushBio/mushbio/backend/firebase/FIRESTORE_SCHEMA.md) — Database Models & Collections

---

## 🧭 System Architecture

```text
                               ┌────────────────────────────────────────┐
                               │             CLIENT LAYER               │
                               │  HTML5 + CSS3 + Three.js + GSAP + Lenis│
                               └──────────────────┬─────────────────────┘
                                                  │
                                                  ▼
                               ┌────────────────────────────────────────┐
                               │           API GATEWAY (EXPRESS)        │
                               │  Base Path: /api/v1 (CORS + Rate-limit)│
                               └──────┬───────────┬───────────┬─────────┘
                                      │           │           │
                 ┌────────────────────┴───┐       │       ┌───┴────────────────────┐
                 ▼                        ▼       ▼       ▼                        ▼
       ┌──────────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
       │   Auth & RBAC    │     │  Inventory   │     │   Coupons    │     │  GPS Geocoding   │
       │ (CUSTOMER/STAFF) │     │(Reservations)│     │(Calculations)│     │ (Nominatim OSM)  │
       └──────────────────┘     └──────────────┘     └──────────────┘     └──────────────────┘
                 │                        │                   │                        │
                 └────────────────────┬───┴───────────────────┴────────────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │       ORDERS ENGINE       │
                        │(State Machine + Snapshots)│
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │      PAYMENTS ENGINE      │
                        │  Razorpay + Webhooks +    │
                        │  HMAC-SHA256 + Reconcile  │
                        └─────────────┬─────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │     FIRESTORE DATABASE    │
                        │  Strict Least-Privilege   │
                        │  Client Write Denial      │
                        └───────────────────────────┘
```

---

## ✨ Full Feature Overview

### 1. Storefront & Visual Experience
* **Cinematic 3D Hero (`#home`)**: Interactive Three.js WebGL canvas rendering floating harvest islands with dynamic particle systems, mouse parallax, and ambient lighting.
* **Shop Preview & Filtering (`#shop-preview`)**: Interactive category pills that filter mushroom varieties with smooth GSAP reveal animations.
* **Benefits, Farm Journey & Journal**: Storytelling sections highlighting sustainable cultivation in Coorg, Karnataka, with responsive layout grids and recipe blogs.
* **Global Modal Search**: Instant product lookup with keyboard shortcuts (`/` to open, `Esc` to close).

### 2. Catalog & Circular Pagination (`shop.html`)
* **12 Organic Varieties**: Categorized across Oyster, Button, Shiitake, Milky, and Portobello.
* **Circular Numbered Pagination**: 6 items per page with automated page recalculation on filter changes and smooth viewport scrolling.
* **Real-time Price & Stock Indicators**: Visual stock availability badges synced with the backend inventory.

### 3. GPS-Assisted Delivery Address (Phase 10A)
* **1-Click Geolocation ("📍 Use Current Location")**: Captures WGS-84 coordinates with accuracy radius detection.
* **Server-Side Reverse Geocoding**: Converts latitude/longitude to verified street, city, state, postal code, and country via Nominatim with coordinate caching.
* **Authoritative Order Snapshots**: Freezes GPS coordinates (`latitude`, `longitude`, `accuracyMeters`, `locationSource`, `deliveryInstructions`) into the immutable order record.
* **Admin/Staff Dispatch Endpoint**: `GET /api/v1/admin/orders/:orderId/delivery` provides on-ground fulfillment teams with exact delivery coordinates.

### 4. Server-Authoritative Cart & Checkout
* **Monetary Standard**: All database entries and API calculations use **integer paise** with ISO currency code `"INR"`. The customer UI renders the formatted `₹` symbol.
* **Dynamic Coupon Engine (Phase 09)**: Percentage and fixed discounts (`MUSH10`, `SAVE100`), minimum order subtotal enforcement, maximum discount caps, and per-user redemption limits.
* **Tiered Shipping Engine**: Free shipping calculation based on post-discount subtotal (e.g. free above ₹500.00 / 50,000 paise; standard ₹50.00; express ₹120.00).
* **Inventory Reservation Lifecycle**: Atomic stock reservation upon order placement; automatic release on cancellation or payment timeout.

### 5. Razorpay Payments & Webhooks (Phase 10 & 11)
* **Authoritative Order Creation**: `POST /api/v1/payments/create-order` calculates final amounts server-side; clients cannot alter prices.
* **Cryptographic Verification**: `POST /api/v1/payments/verify` computes HMAC-SHA256 signatures using secret environment keys.
* **Webhook Ingestion Engine**: `POST /api/v1/payments/webhook` verifies raw byte stream signatures without requiring customer auth tokens.
* **Idempotency Ledger (`paymentEvents/{providerEventId}`)**: Prevents duplicate payment processing, double inventory deductions, or repeated coupon redemptions during webhook retries.
* **Payment Reconciliation**: `GET /api/v1/payments/admin/reconciliation/:orderId` diagnoses discrepancies (`CONSISTENT`, `REQUIRES_REVIEW`, `RECOVERABLE`, `INVALID`).
* **Full & Partial Refunds**: Managed state machine transitions (`REFUNDED`, `PARTIALLY_REFUNDED`) backed by verified provider events.

---

## ⚖️ Cons & Technical Limitations of the Application

While the architecture is secure, robust, and cleanly separated, every software system involves engineering trade-offs. Here is an honest, comprehensive evaluation of the current **cons, limitations, and future architectural challenges**:

### 1. Monolithic Vanilla Frontend vs Declarative Framework
* **The Limitation**: The frontend uses vanilla JavaScript (`script.js` ~1800 lines) with direct DOM manipulation.
* **The Impact**:
  * Managing complex asynchronous UI states (simultaneous cart merges, auth token refreshes, GPS coordinate modals, Razorpay iframe callbacks, and error banners) requires manual DOM synchronizations.
  * As the application grows to include customer order tracking dashboards, user profile management, and review submissions, state management becomes harder to maintain and unit test compared to component frameworks like **React, Next.js, or Vue**.

### 2. Synchronous Webhook Processing (No Message Queue)
* **The Limitation**: Webhook processing currently executes synchronously within the Cloud Function HTTP invocation.
* **The Impact**:
  * During massive flash sales or viral marketing campaigns, hundreds of concurrent Razorpay webhooks hitting Cloud Functions concurrently could experience cold-start latency or execution timeouts if Firestore encounters lock contention.
  * **Production Solution**: A decoupled queue (e.g. **Google Cloud Tasks** or **Cloud Pub/Sub**) where webhooks immediately return HTTP 200 upon receipt and offload state transitions to background worker functions.

### 3. Firestore Single-Document Write Limits (Hotspotting)
* **The Limitation**: Firestore enforces a sustained limit of **~1 write per second per document**.
* **The Impact**:
  * Highly contested single documents (such as inventory for a single viral product variant or global usage counters on viral coupons) can suffer from transaction contention or retry exhaustion if hundreds of customers check out in the exact same second.
  * **Production Solution**: Implementing **Distributed Counter Shards** for high-velocity inventory variants and coupon campaigns.

### 4. Dependency on Free Nominatim (OpenStreetMap) Geocoding
* **The Limitation**: Reverse geocoding is powered by OpenStreetMap's Nominatim public API without an enterprise SLA.
* **The Impact**:
  * Nominatim imposes a strict usage policy limit of **1 request per second** and can occasionally experience rate-limiting or latency spikes during network congestion.
  * **Production Solution**: Migrating to a commercial geocoding provider (e.g. **Google Maps Geocoding API**, **Mapbox**, or **Radar.io**) with dedicated API keys, high QPS limits, and SLA guarantees.

### 5. WebGL / Canvas Resource Consumption on Low-End Devices
* **The Limitation**: Three.js WebGL canvas rendering, ambient lighting, particle calculations, and GSAP scroll triggers run continuously in the browser.
* **The Impact**:
  * On low-end mobile devices, older hardware, or devices running in battery-saver mode, WebGL animations can increase CPU/GPU usage, leading to potential frame drops or accelerated battery drain.
  * **Production Solution**: Adding dynamic performance detection (e.g., measuring FPS or checking `navigator.hardwareConcurrency`) to automatically fallback to static optimized WebP/SVG hero imagery on lower-tier devices.

### 6. Dual-Platform Split Hosting (Netlify + Firebase)
* **The Limitation**: The static frontend is hosted on **Netlify**, while the API and Cloud Functions reside on **Firebase/Google Cloud** in `asia-south1`.
* **The Impact**:
  * Introduces cross-origin CORS preflight overhead (`OPTIONS` requests) on API calls.
  * Deployment and environment variable management are split across two separate provider dashboards (Netlify CLI and Firebase CLI).

### 7. Absence of Native Push / WhatsApp / SMS Notifications
* **The Limitation**: Real-time customer communication is currently limited to in-app banners and Firebase Auth emails.
* **The Impact**:
  * Indian e-commerce customers heavily expect instant WhatsApp or SMS dispatch updates (e.g., "Order Confirmed", "Out for Delivery").
  * **Production Solution**: Integrating transactional SMS/WhatsApp webhooks via **Twilio**, **Gupshup**, or **Fast2SMS** into the `OrderStatusService`.

---

## 🛠️ Technology Stack

| Domain | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | HTML5, CSS3, ES6+ | Semantic markup, responsive mobile CSS, DOM scripting |
| **3D & Canvas** | [Three.js](https://threejs.org/) | Interactive WebGL hero scene & particle effects |
| **Animation** | [GSAP 3](https://greensock.com/gsap/) + [Lenis](https://github.com/darkroomengineering/lenis) | Scroll triggers, smooth inertia scrolling, card reveals |
| **Backend Runtime** | Node.js 20 (TypeScript) | Cloud Functions v2 REST API (Express) |
| **Database** | Google Cloud Firestore | NoSQL document storage with least-privilege security rules |
| **Authentication** | Firebase Auth | JWT tokens, customer logins, staff/admin custom claims |
| **Payment Gateway** | Razorpay SDK & Webhooks | Server-authoritative order creation, HMAC-SHA256 signature verification |
| **Geolocation** | Nominatim (OpenStreetMap) | Server-side reverse geocoding & coordinate caching |
| **Validation** | Zod v4 | Schema validation for all API inputs and webhooks |
| **Testing** | Node.js Test Harness (TS) | 12 automated test suites (>115 scenarios) |
| **Hosting** | Netlify + Firebase Functions | Edge CDN static storefront + Cloud Functions API |

---

## 📁 Repository Structure

```text
mushbio/
├── index.html                   # Homepage with 3D WebGL Hero Canvas
├── shop.html                    # Complete catalog with circular pagination
├── cart.html                    # Shopping cart & GPS-assisted delivery address
├── styles.css                   # Mobile-responsive design system
├── script.js                    # Frontend logic (Three.js, cart sync, GPS flow, Razorpay)
│
├── functions/                   # Firebase Cloud Functions Backend (TypeScript)
│   ├── src/
│   │   ├── api.ts               # Main Express application (raw body preservation)
│   │   ├── auth/                # Auth repository, middleware & role guards
│   │   ├── addresses/           # Address book CRUD & GPS metadata
│   │   ├── locations/           # Reverse geocoding & Nominatim client
│   │   ├── inventory/           # Real-time stock counters & reservations
│   │   ├── coupons/             # Coupon calculation engine & limits
│   │   ├── checkout/            # Checkout preview calculation
│   │   ├── orders/              # Order lifecycle & state machine
│   │   ├── payments/            # Razorpay gateway, webhooks & reconciliation
│   │   ├── admin/               # Staff delivery & reconciliation endpoints
│   │   └── test/                # 12 backend automated test suites
│   ├── package.json             # Backend dependencies & test scripts
│   └── tsconfig.json            # TypeScript configuration
│
├── backend/firebase/            # Backend specifications & architectural docs
│   ├── PAYMENTS.md              # Payment gateway guide
│   ├── WEBHOOKS.md              # Webhook ingestion & reconciliation guide
│   ├── LOCATION_PRIVACY.md      # GPS privacy policy & data handling
│   └── FIRESTORE_SCHEMA.md      # Firestore data models & rules
│
├── firestore.rules              # Strict Firestore Security Rules
├── firebase.json                # Firebase configuration & emulators
└── README.md                    # Project documentation
```

---

## 🚀 Local Development Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **Firebase CLI**: `npm install -g firebase-tools`

### 2. Clone & Install
```bash
git clone https://github.com/ashishlabs-23/mushbio.git
cd mushbio

# Install backend dependencies
cd functions
npm install
cd ..
```

### 3. Run Backend Automated Tests
```bash
npm --prefix functions test
```

### 4. Start Local Development Server
```bash
# Start frontend local static server
npx serve .

# Or run Firebase emulators
firebase emulators:start --only functions,firestore
```

---

## 🧪 Automated Test Coverage (12 Suites)

Run the full backend test suite:
```bash
npm --prefix functions test
```

All 12 backend test suites validate real-world scenarios:
1. **Firestore Security Rules**: Client write denial on orders, payments, inventory, coupons, audit logs.
2. **API Foundation & Health**: Route mounting, error formatters, CORS headers.
3. **Products & Catalog**: Category filtering, active/inactive guards.
4. **Inventory Engine**: Atomic counter mutations, reservation locks, race condition resilience.
5. **Authentication & RBAC**: JWT verification, `CUSTOMER`, `STAFF`, `ADMIN` custom claims.
6. **Address Book**: CRUD operations, atomic default address switching, 10-address limits.
7. **Server-Validated Cart**: Guest/authenticated cart merge, pricing snapshots.
8. **Orders & State Machine**: Legal status transitions (`PAYMENT_PENDING` $\rightarrow$ `PAID` $\rightarrow$ `DELIVERED`).
9. **Coupons & Delivery Engine**: Dynamic percentage/fixed discounts, minimum subtotal, threshold shipping.
10. **Razorpay Payments**: Server-authoritative integer paise calculations, HMAC-SHA256 verification.
11. **GPS Delivery & Locations (Phase 10A)**: WGS-84 coordinate validation, reverse-geocoding, admin delivery routes.
12. **Razorpay Webhooks & Reconciliation (Phase 11)**: Webhook signature verification, raw body preservation, `paymentEvents` idempotency, full/partial refunds, out-of-order event resilience.

---

## 👥 Ownership & Operations

> **MushBio — A Company of Dodanna & CO**  
> Maintained & Operated by **Dodanna & CO**

All commercial operations, digital platforms, and farm distribution logistics are managed by **Dodanna & CO**.

---

## 📄 License

© 2026 **MushBio (A Company of Dodanna & CO)**. All rights reserved.
