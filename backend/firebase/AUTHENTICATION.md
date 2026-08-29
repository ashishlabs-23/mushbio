# MushBio Firebase Authentication & User Profile Architecture (Phase 05)

---

## 1. Overview & Identity Separation

MushBio strictly separates **User Identity & Authentication** from **Application Profile Data**:

```text
┌──────────────────────────────────────────────┐
│            Firebase Authentication           │
│  (Authoritative Identity Provider)           │
│  - uid                                       │
│  - email                                     │
│  - password credential (secure hash)         │
│  - emailVerified state                       │
│  - Custom Claims ({ role: "CUSTOMER" })      │
└──────────────────────┬───────────────────────┘
                       │
             Synchronized Profile
                       │
                       ▼
┌──────────────────────────────────────────────┐
│           Firestore: users/{uid}             │
│  (Application Profile Data Store)            │
│  - uid                                       │
│  - email                                     │
│  - displayName                               │
│  - photoURL                                  │
│  - phone                                     │
│  - role: "CUSTOMER" | "STAFF" | "ADMIN"      │
│  - status: "ACTIVE" | "SUSPENDED" | "DELETED"│
│  - emailVerified                             │
│  - createdAt / updatedAt / lastLoginAt       │
└──────────────────────────────────────────────┘
```

### Critical Security Invariants:
1. **Zero Passwords in Firestore**: Passwords, password hashes, and raw credentials are **never** stored in Firestore documents.
2. **Client Privilege Isolation**: The client SDK can never self-assign `STAFF` or `ADMIN` roles, manipulate account `status`, or fake `emailVerified` boolean state.
3. **Identity Authority**: The backend exclusively derives identity from the verified Firebase ID Token (`request.auth.uid`). Any `userId` supplied in the request body is strictly ignored.

---

## 2. Client vs Admin SDK Separation

| Boundary | SDK | Location | Capabilities |
|---|---|---|---|
| **Frontend / Browser** | Firebase Client Web SDK v10+ | `src/firebase/config.js` | Sign in, register, sign out, send verification emails, request password resets. Zero elevated privileges. |
| **Backend Server** | Firebase Admin SDK | `functions/src/config/firebaseAdmin.ts` | Verify ID tokens, set Custom User Claims, read/write profile records, manage account suspensions. |

---

## 3. Role-Based Access Control (RBAC) & Custom Claims

MushBio supports three distinct user roles:
- **`CUSTOMER`** (Default): Can view catalog, manage own cart, place orders, read/update own profile, and manage personal shipping addresses.
- **`STAFF`**: Farm warehouse operators. Can view farm inventory, update stock levels, log receipts, and view customer orders.
- **`ADMIN`**: Dodanna & Co managers. Full administrative access to inventory, coupons, products, and user status management.

### Custom Claims Synchronization:
- Trusted server code calls `setUserRole(uid, role)`:
  1. Sets Firebase Auth Custom Claim: `auth.setCustomUserClaims(uid, { role })`.
  2. Updates `users/{uid}.role` in Firestore.
- In case of a temporary claim/document discrepancy, the server verifies both token claim and active database document before granting elevated staff/admin actions.

---

## 4. Token Verification & Middleware Strategy

### `requireAuth()`
1. Extracts `Bearer <Firebase ID Token>` from `Authorization` header.
2. Calls `auth.verifyIdToken(token)`.
3. If token is missing, expired, or invalid, throws 401 (`AUTH_REQUIRED`, `TOKEN_EXPIRED`, `INVALID_TOKEN`).
4. Attaches `req.auth = { uid, email, role, emailVerified }` to Express request.

### `optionalAuth()`
- Permits public/anonymous access.
- If a valid Bearer token is provided, populates `req.auth` for personalized features (e.g. associating guest items with account).

### `requireActiveAccount()`
- Inspects `users/{uid}.status`.
- If `SUSPENDED` $\rightarrow$ Throws `403 ACCOUNT_SUSPENDED`.
- If `DELETED` $\rightarrow$ Throws `403 ACCOUNT_DELETED`.

### `requireRole(allowedRoles)`
- Enforces that `req.auth.role` matches the required privilege tier (`STAFF` or `ADMIN`).

---

## 5. Protected REST API Endpoints

### 1. `GET /api/v1/me`
- **Auth**: `requireAuth` + `requireActiveAccount`
- **Response**:
```json
{
  "data": {
    "uid": "usr_948271048",
    "email": "customer@example.com",
    "displayName": "Ananya Sharma",
    "photoURL": null,
    "phone": "+919876543210",
    "role": "CUSTOMER",
    "status": "ACTIVE",
    "emailVerified": true,
    "createdAt": "2026-08-28T12:00:00.000Z",
    "lastLoginAt": "2026-08-28T14:30:00.000Z"
  }
}
```

### 2. `PATCH /api/v1/me`
- **Auth**: `requireAuth` + `requireActiveAccount`
- **Editable Fields**: `displayName`, `photoURL`, `phone`.
- **Protected/Forbidden Fields**: `role`, `status`, `emailVerified`, `uid`, `createdAt` (attempts to update these are strictly rejected with `400 INVALID_PROFILE_UPDATE`).

---

## 6. Account Lifecycle & Data Retention

- **Suspended Accounts**: Profile status is set to `SUSPENDED`. Token remains valid at identity level but backend rejects all protected commerce and profile operations.
- **Account Deletion**: Profile status is set to `DELETED`. Historical business records (orders, payment invoices) are preserved for legal, financial, and taxation audit compliance.

---

## 7. Security Rules Hardening

The `users/{userId}` security rule protects against tampering:
```rules
match /users/{userId} {
  allow read: if isOwner(userId) || isStaff();
  
  allow create: if isOwner(userId) 
    && request.resource.data.uid == userId
    && (!('role' in request.resource.data) || request.resource.data.role == 'CUSTOMER')
    && (!('status' in request.resource.data) || request.resource.data.status == 'ACTIVE');

  allow update: if isOwner(userId)
    && request.resource.data.uid == resource.data.uid
    && (!('role' in request.resource.data) || request.resource.data.role == resource.data.role)
    && (!('status' in request.resource.data) || request.resource.data.status == resource.data.status)
    && (!('emailVerified' in request.resource.data) || request.resource.data.emailVerified == resource.data.emailVerified)
    || isAdmin();

  allow delete: if isAdmin();
}
```
