# MushBio Firestore Database Schema Reference (Phase 02)

This document defines the complete **Firestore Document Model, Collection Contracts, Indexing Architecture, and Security Access Matrix** for the MushBio platform.

---

## 1. Architectural Philosophy

1. **Query-Driven Modeling**: Designed specifically for the MushBio frontend (category filtering, organic sorting, price ranges, variant picking, cart drawer, and order history).
2. **Denormalization for Performance**: Selective snapshotting of category slugs, variant weights, primary image URLs, and order pricing eliminates expensive client-side joins.
3. **Strict Authoritative Isolation**: Sensitive commerce operations (order creation, price calculations, stock decrement, coupon redemption) are locked down and executable **only by Cloud Functions using the Firebase Admin SDK**.
4. **Cursor-Based Pagination**: Employs `startAfter(lastDoc)` for infinite scroll and pagination instead of high-latency SQL offsets.

---

## 2. Core Collections & Subcollections Map

```text
Firestore Root
├── users/ {userId}
│   └── addresses/ {addressId}
├── categories/ {categoryId}
├── products/ {productId}
│   ├── variants/ {variantId}
│   └── images/ {imageId}
├── carts/ {cartId}
│   └── items/ {itemId}
├── orders/ {orderId}
│   ├── items/ {itemId}
│   └── payments/ {paymentId}
├── inventory/ {variantId}
├── inventoryMovements/ {movementId}
├── coupons/ {couponId}
├── reviews/ {reviewId}
├── blogPosts/ {postId}
├── contactMessages/ {messageId}
├── newsletterSubscribers/ {subscriberId}
├── paymentEvents/ {eventId}
└── adminAuditLogs/ {logId}
```

---

## 3. Detailed Collection Specifications

### 3.1 Users & Addresses
- **Collection Path**: `users/{userId}`
- **Subcollection**: `users/{userId}/addresses/{addressId}`
- **Ownership**: `request.auth.uid == userId`
- **Fields (`users/{userId}`)**:
  ```typescript
  {
    uid: string;                 // Matches Firebase Auth UID
    email: string;
    displayName: string;
    photoURL?: string;
    phone?: string;
    role: "CUSTOMER" | "STAFF" | "ADMIN"; // Default: CUSTOMER
    status: "ACTIVE" | "SUSPENDED" | "DELETED";
    emailVerified: boolean;
    lastLoginAt?: Timestamp;
    defaultShippingAddressId?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```
- **Fields (`addresses/{addressId}`)**:
  ```typescript
  {
    id: string;
    label?: string;              // "Home" | "Farm Delivery Point" | "Work"
    recipientName: string;
    phone: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "IN";
    isDefault: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.2 Categories
- **Collection Path**: `categories/{categoryId}`
- **Access**: Public Read (`isActive == true`), Admin Write
- **Fields**:
  ```typescript
  {
    id: string;                  // e.g. "cat_oyster"
    name: string;                // "Oyster"
    slug: string;                // "oyster" (stable for URL routing)
    description: string;
    image?: string;              // "assets/oyster.jpg"
    sortOrder: number;
    isActive: boolean;
    productsCount?: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.3 Products, Variants & Images
- **Collection Path**: `products/{productId}`
- **Subcollections**:
  - `products/{productId}/variants/{variantId}`
  - `products/{productId}/images/{imageId}`
- **Access**: Public Read (`status == "ACTIVE"`), Admin Write
- **Fields (`products/{productId}`)**:
  ```typescript
  {
    id: string;                  // e.g. "prod_oyster"
    name: string;                // "Fresh Oyster Mushroom"
    slug: string;                // "oyster-mushroom"
    shortDescription: string;
    description: string;
    categoryId: string;          // "cat_oyster"
    categorySlug: string;        // "oyster" (denormalized for 0-join querying)
    featured: boolean;
    organic: boolean;
    status: "ACTIVE" | "INACTIVE" | "DRAFT";
    sortOrder: number;
    basePrice: number;           // Minimum variant price for range filtering (₹80)
    rating: number;              // 4.9
    reviewCount: number;         // 48
    searchKeywords: string[];    // ["oyster", "fresh", "organic", "mushroom"]
    benefits?: string[];
    harvestCycleDays?: number;
    primaryImageUrl?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```
- **Fields (`variants/{variantId}`)**:
  ```typescript
  {
    id: string;                  // e.g. "var_oyster_250g"
    sku: string;                 // "MB-OYS-250"
    weightGrams: number;         // 250
    weightLabel: string;         // "250g"
    price: number;               // 80 (in INR)
    compareAtPrice?: number;     // 95
    currency: "INR";
    isActive: boolean;
    stockQuantitySnapshot?: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.4 Carts & Cart Items
- **Collection Path**: `carts/{cartId}`
- **Subcollection**: `carts/{cartId}/items/{itemId}`
- **Ownership**: `request.auth.uid == resource.data.userId` or `guestId` session match
- **Fields (`carts/{cartId}`)**:
  ```typescript
  {
    id: string;
    userId?: string;             // Set if authenticated
    guestId?: string;            // UUID for unauthenticated guest
    status: "ACTIVE" | "CONVERTED" | "ABANDONED";
    currency: "INR";
    appliedCouponSnapshot?: string;
    itemCount: number;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```
- **Fields (`items/{itemId}`)**:
  ```typescript
  {
    id: string;
    productId: string;
    variantId: string;
    productNameSnapshot: string;
    variantLabelSnapshot: string;
    imageSnapshot?: string;
    quantity: number;
    displayPriceSnapshot: number;// UI DISPLAY ONLY; never authoritative
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.5 Orders, Order Items & Payments
- **Collection Path**: `orders/{orderId}`
- **Subcollections**:
  - `orders/{orderId}/items/{itemId}`
  - `orders/{orderId}/payments/{paymentId}`
- **Access**: Customer Reads Own (`userId == request.auth.uid`), **Server-Only Writes (`allow write: if false;`)**
- **Fields (`orders/{orderId}`)**:
  ```typescript
  {
    id: string;
    orderNumber: string;         // "MUSH-2026-0001"
    userId: string;
    customerEmail: string;
    customerPhone: string;
    customerName: string;
    status: "PENDING" | "CONFIRMED" | "PROCESSING" | "PACKED" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
    paymentStatus: "PENDING" | "AUTHORIZED" | "PAID" | "FAILED" | "REFUNDED";
    currency: "INR";
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
    couponCodeSnapshot?: string;
    shippingMethod: string;
    shippingAddressSnapshot: UserAddress;
    estimatedDeliveryDate?: Timestamp;
    trackingNumber?: string;
    courierPartner?: string;
    notes?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```
- **Fields (`items/{itemId}`)**:
  ```typescript
  {
    id: string;
    productId: string;
    variantId: string;
    sku: string;
    productNameSnapshot: string;
    weightSnapshot: string;
    unitPrice: number;           // Authoritative snapshot
    quantity: number;
    discount: number;
    tax: number;
    lineTotal: number;
    imageSnapshot?: string;
  }
  ```

---

### 3.6 Inventory & Inventory Movements
- **Collections**:
  - `inventory/{variantId}`
  - `inventoryMovements/{movementId}`
- **Access**: Staff/Admin Read, **Server-Only Writes**
- **Fields (`inventory/{variantId}`)**:
  ```typescript
  {
    variantId: string;
    productId: string;
    sku: string;
    availableQuantity: number;   // Real-time purchasable stock
    reservedQuantity: number;    // Locked during checkout window
    lowStockThreshold: number;   // Reorder trigger (e.g. 10)
    updatedAt: Timestamp;
  }
  ```
- **Fields (`inventoryMovements/{movementId}`)**:
  ```typescript
  {
    id: string;
    variantId: string;
    productId: string;
    type: "RECEIPT" | "SALE" | "RETURN" | "DAMAGE" | "ADJUSTMENT" | "RESERVATION" | "RELEASE";
    quantity: number;            // Signed integer (e.g. +50, -2)
    previousQuantity: number;
    newQuantity: number;
    reason: string;
    referenceType?: "ORDER" | "PURCHASE_RECEIPT" | "MANUAL_ADJUSTMENT";
    referenceId?: string;
    actorUid: string;
    createdAt: Timestamp;
  }
  ```

---

### 3.7 Coupons
- **Collection Path**: `coupons/{couponId}`
- **Access**: Staff Read, Admin Write (Evaluated securely via Cloud Function)
- **Fields**:
  ```typescript
  {
    id: string;                  // "cpn_mush10"
    code: string;                // "MUSH10"
    normalizedCode: string;      // "MUSH10"
    type: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
    value: number;               // 10
    minimumOrder: number;        // 200
    maximumDiscount?: number;    // 100
    usageLimit?: number;         // 1000
    usageCount: number;          // Server-incremented
    perUserLimit: number;        // 1
    startsAt: Timestamp;
    expiresAt?: Timestamp;
    isActive: boolean;
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.8 Reviews
- **Collection Path**: `reviews/{reviewId}`
- **Access**: Public Read (`status == "APPROVED"`), Authenticated Create (`status == "PENDING"`, `verifiedPurchase == false`), Admin Moderation
- **Fields**:
  ```typescript
  {
    id: string;
    productId: string;
    userId: string;
    orderId?: string;
    authorNameSnapshot: string;
    rating: number;              // 1 - 5
    title: string;
    content: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    verifiedPurchase: boolean;   // Set exclusively by Cloud Functions
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.9 Blog Posts
- **Collection Path**: `blogPosts/{postId}`
- **Access**: Public Read (`status == "PUBLISHED"`), Staff Write
- **Fields**:
  ```typescript
  {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    coverImage: string;
    category: string;
    authorId: string;
    authorName: string;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    featured: boolean;
    readingTimeMinutes: number;
    publishedAt?: Timestamp;
    tags?: string[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }
  ```

---

### 3.10 Ingestion & Auditing Collections
- **`contactMessages/{messageId}`**: Ingested via Cloud Function (`status: NEW | IN_PROGRESS | RESOLVED | SPAM`).
- **`newsletterSubscribers/{subscriberId}`**: Normalized email index, double opt-in verification.
- **`paymentEvents/{eventId}`**: Razorpay webhook idempotency records (`providerEventId` unique lock).
- **`adminAuditLogs/{logId}`**: Append-only administrative action trail (`actorUid`, `action`, `resourceId`, `metadata`).

---

## 4. Query-to-Index Mapping Matrix

| Collection | Query Pattern | Composite Index Fields | Why It Is Required |
|---|---|---|---|
| `products` | Category Tab Filter | `categorySlug ASC, status ASC, sortOrder ASC` | Default shop grid category tabs |
| `products` | Category + Price Low-High | `categorySlug ASC, status ASC, basePrice ASC` | Sorted catalog within a specific mushroom type |
| `products` | Category + Price High-Low | `categorySlug ASC, status ASC, basePrice DESC` | Sorted catalog within a specific mushroom type |
| `products` | Organic Badge Filter | `organic ASC, status ASC, sortOrder ASC` | Organic certified toggle in shop filters |
| `products` | Featured Showcase | `featured ASC, status ASC, sortOrder ASC` | Home page hero & curated cards |
| `products` | Top Rated Sorting | `status ASC, rating DESC` | "Highest Rated" shop sorting option |
| `blogPosts` | Date-Sorted Blog Feed | `status ASC, publishedAt DESC` | Main blog post listing |
| `blogPosts` | Category Blog Articles | `category ASC, status ASC, publishedAt DESC` | Recipes / Health / Farm Stories filtering |
| `blogPosts` | Featured Article Banner | `featured ASC, status ASC, publishedAt DESC` | Featured blog header on index page |
| `reviews` | Product Reviews Feed | `productId ASC, status ASC, createdAt DESC` | Customer review tab on product details |
| `orders` | Customer Order History | `userId ASC, createdAt DESC` | User dashboard order history |
| `orders` | Filter by Order Status | `userId ASC, status ASC, createdAt DESC` | "Active Orders" vs "Completed Orders" tab |

---

## 5. Security Rules Access Matrix

| Resource | Unauthenticated Public | Customer (Owner) | Staff | Admin |
|---|---|---|---|---|
| **Products (Active)** | Read | Read | Read | Read / Write |
| **Products (Draft)** | None | None | Read | Read / Write |
| **Categories** | Read (Active) | Read (Active) | Read | Read / Write |
| **User Profile** | None | Read / Update Own | Read | Full Control |
| **User Addresses** | None | Full Control Own | Read | Full Control |
| **Cart & Items** | Session Guest Create | Full Control Own | Read | Full Control |
| **Orders** | None | Read Own (No Direct Write) | Read | Server-Only Write |
| **Inventory & Movements** | None | None | Read | Server-Only Write |
| **Coupons** | None (Validated via Function) | None (Function Read) | Read | Read / Write |
| **Reviews** | Read Approved | Read / Create (Pending) | Moderate | Moderate / Delete |
| **Blog Posts** | Read Published | Read Published | Read / Write | Read / Write |
| **Contact Messages** | Create via Function | Create via Function | Read / Triage | Full Control |
| **Payment Events** | None | None | Read | Server-Only Write |
| **Admin Audit Logs** | None | None | None | Read (Append-Only Server) |
