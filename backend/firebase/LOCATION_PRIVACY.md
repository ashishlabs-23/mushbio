# MushBio — Location Privacy Policy & GPS Data Handling

**Phase 10A — GPS-Assisted Delivery Address**

---

## 1. What We Collect

When a user explicitly clicks **"Use Current Location"** on the cart/checkout page, we collect:

| Field | Description | Stored |
|---|---|---|
| `latitude` | WGS-84 latitude | Firestore (user address doc) |
| `longitude` | WGS-84 longitude | Firestore (user address doc) |
| `accuracyMeters` | GPS accuracy radius | Firestore (user address doc) |
| `locationSource` | `"GPS"` or `"MANUAL"` | Firestore (user address doc) |
| `locationCapturedAt` | Server-assigned timestamp | Firestore (user address doc) |

All of the above are also snapshotted into the `orders/{orderId}/shippingAddressSnapshot` and `orders/{orderId}/deliveryLocation` at the time of order creation.

---

## 2. What We DO NOT Collect

- **No background location tracking.** Location is requested only once, on explicit user action.
- **No movement history or continuous location updates.**
- **No precise coordinates in server logs.** Our geocoding service only logs `"reverse_geocode_requested"` (no coordinates).

---

## 3. How Coordinates Are Used

1. **Reverse geocoding (server-side):** Coordinates are sent to our backend, which calls Nominatim (OpenStreetMap) to convert them to a human-readable address. The user can then edit/confirm before saving.
2. **Delivery fulfillment:** Admin and Staff roles can view delivery coordinates via `GET /api/v1/admin/orders/:orderId/delivery` to assist with on-ground dispatch.
3. **Order snapshot:** Coordinates are frozen into the order document at the time of checkout. Subsequent edits to the address do NOT retroactively update historical orders.

---

## 4. Access Control

| Role | Access to GPS Coordinates |
|---|---|
| `CUSTOMER` | Can see their own address coordinates via `GET /api/v1/me/addresses/:id` |
| `STAFF` | Can see delivery location via admin endpoint |
| `ADMIN` | Can see delivery location via admin endpoint |
| Anonymous | No access |
| Another customer | No access (cross-user read is blocked by Firestore rules) |

---

## 5. Data Retention

- GPS coordinates are stored in the address document until the user deletes the address.
- GPS coordinates in order snapshots are retained for the lifetime of the order (same as all other order data).

---

## 6. Geocoding Provider

We use **Nominatim (OpenStreetMap)** for server-side reverse geocoding:
- Free, no API key required.
- Usage policy: max 1 request/second, `User-Agent` header required.
- No user data is shared beyond coordinates (for the purpose of geocoding).
- OpenStreetMap's privacy policy: https://wiki.osmfoundation.org/wiki/Privacy_Policy

---

## 7. User Rights

Users can:
- **Delete** their saved addresses (which removes GPS coordinates from the address book).
- **Edit** an address to remove GPS coordinates by saving without the GPS button.
- **Opt out** simply by not clicking "Use Current Location" and entering their address manually.

Historical order snapshots cannot be retroactively modified (this is intentional — orders are immutable records).

---

## 8. Technical Security Notes

- GPS coordinates are **never** exposed through public product or catalog APIs.
- GPS coordinates are **never** logged in server logs.
- The `GET /api/v1/admin/orders/:orderId/delivery` endpoint requires `ADMIN` or `STAFF` role.
- Coordinate cache uses a rounded grid key (~100m resolution) for performance — the stored values are always the user's original precision.
- No third-party analytics scripts receive GPS data.

---

*Last updated: Phase 10A implementation*
