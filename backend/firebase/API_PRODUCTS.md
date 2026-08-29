# MushBio Products & Categories API Specification (Phase 03)

**Base URL**: `/api/v1` (or local emulator: `http://localhost:5001/mushbio-prod/asia-south1/api/v1`)

---

## 1. Overview & Architecture

The Products & Categories API provides a high-performance, strongly typed read interface to MushBio's mushroom catalog.

```text
HTTP Request
     │
     ▼
Route Definition (/api/v1/...)
     │
     ▼
Zod Input Validation (400 if invalid)
     │
     ▼
Express Controller
     │
     ▼
Domain Service (Pagination envelope & Cursor encoding)
     │
     ▼
Firestore Repository (Composite Index Aligned Queries)
     │
     ▼
Cloud Firestore / Local Emulator
```

### Key Principles:
1. **Public Catalog Read-Only**: Direct document write APIs (`POST`, `PATCH`, `DELETE`) do not exist on the client gateway.
2. **DTO Isolation**: Internal Firestore metadata, timestamps, audit histories, and raw warehouse quantities (`availableQuantity`, `reservedQuantity`) are never leaked to callers.
3. **Deterministic Opaque Pagination**: Cursors are encrypted/base64url encoded strings preventing client tampering.
4. **Denormalized Indexing**: Products store `categorySlug` and `basePrice` (lowest active variant price) for single-roundtrip filtered queries without costly collection-group scans.

---

## 2. Endpoints Reference

### 2.1 Categories

#### 1. List Active Categories
- **Path**: `GET /api/v1/categories`
- **Description**: Returns all active mushroom categories sorted by `sortOrder ASC`.
- **Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "cat_oyster",
      "name": "Oyster",
      "slug": "oyster",
      "description": "Delicate, velvety oyster mushrooms freshly harvested with rich umami flavor.",
      "image": "assets/oyster.jpg",
      "sortOrder": 1,
      "productsCount": 3
    },
    {
      "id": "cat_button",
      "name": "Button",
      "slug": "button",
      "description": "Classic tender white and brown button mushrooms perfect for daily cooking.",
      "image": "assets/button.jpg",
      "sortOrder": 2,
      "productsCount": 3
    }
  ]
}
```

#### 2. Get Category Detail
- **Path**: `GET /api/v1/categories/:slug`
- **Parameters**: `slug` (string, lowercase alphanumeric)
- **Response**: `200 OK`
```json
{
  "data": {
    "id": "cat_oyster",
    "name": "Oyster",
    "slug": "oyster",
    "description": "Delicate, velvety oyster mushrooms freshly harvested with rich umami flavor.",
    "image": "assets/oyster.jpg",
    "sortOrder": 1,
    "productsCount": 3,
    "isActive": true
  }
}
```
- **Errors**: `404 Not Found` (`CATEGORY_NOT_FOUND`) if category slug does not exist or is inactive.

#### 3. List Products by Category
- **Path**: `GET /api/v1/categories/:slug/products`
- **Parameters**: Same query filters as `GET /api/v1/products` (`organic`, `minPrice`, `maxPrice`, `sort`, `pageSize`, `cursor`).

---

### 2.2 Products

#### 1. Main Catalog Query
- **Path**: `GET /api/v1/products`
- **Description**: Queries active mushroom catalog with multi-field filtering, sorting, and cursor-based pagination.
- **Query Parameters**:

| Parameter | Type | Default | Bounds / Allowed Values | Description |
|---|---|---|---|---|
| `category` | String | *none* | e.g. `oyster`, `button`, `shiitake` | Filter by category slug |
| `organic` | Boolean | *none* | `true`, `false` | Filter organic certified products |
| `minPrice` | Number | *none* | $\ge 0$ | Minimum base price (₹) |
| `maxPrice` | Number | *none* | $\ge 0$ ($\ge \text{minPrice}$) | Maximum base price (₹) |
| `sort` | String | `popular` | `popular`, `price_asc`, `price_desc`, `rating_desc`, `newest` | Field ordering |
| `pageSize` | Integer | `6` | Min `1`, Max `24` | Products per page |
| `cursor` | String | *none* | Opaque base64url string | Pagination token for next page |

- **Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "prod_oyster_pearl",
      "name": "Fresh Pearl Oyster Mushroom",
      "slug": "fresh-pearl-oyster-mushroom",
      "shortDescription": "Delicate clusters with mild, velvety umami flavor.",
      "category": {
        "slug": "oyster",
        "name": "Oyster"
      },
      "image": "assets/oyster.jpg",
      "basePrice": 80,
      "rating": 4.9,
      "reviewCount": 48,
      "organic": true,
      "featured": true
    }
  ],
  "pagination": {
    "pageSize": 6,
    "nextCursor": "eyJkb2NJZCI6InByb2Rfb3lzdGVyX3BlYXJsIiwic29ydFZhbHVlIjoxLCJzb3J0T3B0aW9uIjoicG9wdWxhciJ9",
    "hasMore": true
  }
}
```

#### 2. Get Featured Products
- **Path**: `GET /api/v1/products/featured`
- **Description**: Returns the curated top 3 active featured products sorted by `sortOrder ASC` to power the home page Hero and Product Emergence experience.
- **Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "prod_oyster_pearl",
      "name": "Fresh Pearl Oyster Mushroom",
      "slug": "fresh-pearl-oyster-mushroom",
      "shortDescription": "Delicate clusters with mild, velvety umami flavor.",
      "category": { "slug": "oyster", "name": "Oyster" },
      "image": "assets/oyster.jpg",
      "basePrice": 80,
      "rating": 4.9,
      "reviewCount": 48,
      "organic": true,
      "featured": true
    },
    {
      "id": "prod_button_white",
      "name": "Crisp White Button Mushroom",
      "slug": "crisp-white-button-mushroom",
      "shortDescription": "Crisp, plump button mushrooms for everyday cuisine.",
      "category": { "slug": "button", "name": "Button" },
      "image": "assets/button.jpg",
      "basePrice": 65,
      "rating": 4.8,
      "reviewCount": 52,
      "organic": true,
      "featured": true
    },
    {
      "id": "prod_shiitake_fresh",
      "name": "Organic Shiitake Mushroom",
      "slug": "organic-shiitake-mushroom",
      "shortDescription": "Gourmet Asian mushroom with intense savory depth.",
      "category": { "slug": "shiitake", "name": "Shiitake" },
      "image": "assets/shiitake.jpg",
      "basePrice": 150,
      "rating": 4.95,
      "reviewCount": 42,
      "organic": true,
      "featured": true
    }
  ]
}
```

#### 3. Get Product Detail
- **Path**: `GET /api/v1/products/:slug`
- **Parameters**: `slug` (string)
- **Description**: Returns detailed product info, benefits, active packaging variants (`250g`, `500g`, `1kg`), gallery images, and safe public availability status (`IN_STOCK` / `OUT_OF_STOCK`).
- **Response**: `200 OK`
```json
{
  "data": {
    "id": "prod_oyster_pearl",
    "name": "Fresh Pearl Oyster Mushroom",
    "slug": "fresh-pearl-oyster-mushroom",
    "shortDescription": "Delicate clusters with mild, velvety umami flavor.",
    "description": "Harvested fresh daily at dawn from organic vertical growing rooms...",
    "category": {
      "slug": "oyster",
      "name": "Oyster"
    },
    "image": "assets/oyster.jpg",
    "basePrice": 80,
    "rating": 4.9,
    "reviewCount": 48,
    "organic": true,
    "featured": true,
    "benefits": [
      "Immune Defense Support",
      "Zero Saturated Fat",
      "Natural Antioxidants"
    ],
    "harvestCycleDays": 21,
    "variants": [
      {
        "id": "var_oyster_250g",
        "sku": "MB-OYS-250",
        "weightGrams": 250,
        "weightLabel": "250g",
        "price": 80,
        "compareAtPrice": 95,
        "currency": "INR"
      },
      {
        "id": "var_oyster_500g",
        "sku": "MB-OYS-500",
        "weightGrams": 500,
        "weightLabel": "500g",
        "price": 150,
        "compareAtPrice": 180,
        "currency": "INR"
      },
      {
        "id": "var_oyster_1kg",
        "sku": "MB-OYS-1000",
        "weightGrams": 1000,
        "weightLabel": "1kg",
        "price": 280,
        "compareAtPrice": 320,
        "currency": "INR"
      }
    ],
    "images": [
      {
        "url": "assets/oyster.jpg",
        "alt": "Fresh oyster mushroom clusters",
        "isPrimary": true,
        "sortOrder": 1
      }
    ],
    "availability": "IN_STOCK"
  }
}
```
- **Errors**: `404 Not Found` (`PRODUCT_NOT_FOUND`) if product does not exist or is not active.

---

## 3. Error Responses

All API errors return a standardized, structured JSON envelope:

```json
{
  "status": "error",
  "code": "INVALID_QUERY",
  "message": "minPrice cannot be greater than maxPrice"
}
```

| HTTP Status | Error Code | Scenario |
|---|---|---|
| `400 Bad Request` | `INVALID_QUERY` | Malformed parameters, out-of-range bounds, or invalid sort |
| `400 Bad Request` | `INVALID_CURSOR` | Corrupted, expired, or mismatched pagination cursor |
| `404 Not Found` | `CATEGORY_NOT_FOUND` | Category slug not found or inactive |
| `404 Not Found` | `PRODUCT_NOT_FOUND` | Product slug not found or inactive |
| `404 Not Found` | `ROUTE_NOT_FOUND` | Unmatched API path |
| `500 Internal Server Error` | `INTERNAL_ERROR` | Scrubbed server exception |

---

## 4. Example cURL Requests

```bash
# 1. List Categories
curl -X GET "http://localhost:5001/mushbio-prod/asia-south1/api/v1/categories"

# 2. Main Shop Catalog (Page 1, 6 items)
curl -X GET "http://localhost:5001/mushbio-prod/asia-south1/api/v1/products?pageSize=6"

# 3. Filter by Category & Organic
curl -X GET "http://localhost:5001/mushbio-prod/asia-south1/api/v1/products?category=oyster&organic=true"

# 4. Filter by Price Range & Sort High to Low
curl -X GET "http://localhost:5001/mushbio-prod/asia-south1/api/v1/products?minPrice=80&maxPrice=200&sort=price_desc"

# 5. Fetch Homepage Featured Showcase
curl -X GET "http://localhost:5001/mushbio-prod/asia-south1/api/v1/products/featured"

# 6. Fetch Product Detail
curl -X GET "http://localhost:5001/mushbio-prod/asia-south1/api/v1/products/fresh-pearl-oyster-mushroom"
```
