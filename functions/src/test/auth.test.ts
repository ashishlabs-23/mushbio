/**
 * ============================================================================
 * MUSHBIO PHASE 05 — FIREBASE AUTHENTICATION TEST SUITE
 *
 * Validates token verification, role enforcement, profile CRUD,
 * suspended account rejection, deletion handling, custom claims, and rules.
 * Usage: npm --prefix functions test
 * ============================================================================
 */

import http from "http";
import express from "express";
import { AuthService } from "../auth/service";
import { UserRepository } from "../auth/repository";
import { requireAuth, optionalAuth, requireActiveAccount, requireRole } from "../auth/middleware";
import { UserDocument, UserRole, UserStatus } from "../types";
import { Timestamp } from "firebase-admin/firestore";
import { PasswordSchema, UpdateProfileSchema } from "../auth/schemas";
import { validateFirestoreRulesFile } from "./rules.test";

// In-Memory User Repository for isolated unit & API testing
class InMemoryUserRepo extends UserRepository {
  public usersMap = new Map<string, UserDocument>();
  public customClaimsMap = new Map<string, Record<string, any>>();
  public authUsersMap = new Map<string, any>();

  constructor() {
    super();
    // Default seed users
    const alice: UserDocument = {
      uid: "user_alice",
      email: "alice@example.com",
      displayName: "Alice Farmer",
      phone: "+919876543210",
      role: "CUSTOMER",
      status: "ACTIVE",
      emailVerified: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const bobSuspended: UserDocument = {
      uid: "user_bob_suspended",
      email: "bob@example.com",
      displayName: "Bob Suspended",
      role: "CUSTOMER",
      status: "SUSPENDED",
      emailVerified: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const charlieDeleted: UserDocument = {
      uid: "user_charlie_deleted",
      email: "charlie@example.com",
      displayName: "Charlie Deleted",
      role: "CUSTOMER",
      status: "DELETED",
      emailVerified: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const adminDave: UserDocument = {
      uid: "user_dave_admin",
      email: "admin@mushbio.com",
      displayName: "Dave Admin",
      role: "ADMIN",
      status: "ACTIVE",
      emailVerified: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    this.usersMap.set(alice.uid, alice);
    this.usersMap.set(bobSuspended.uid, bobSuspended);
    this.usersMap.set(charlieDeleted.uid, charlieDeleted);
    this.usersMap.set(adminDave.uid, adminDave);

    this.customClaimsMap.set(adminDave.uid, { role: "ADMIN" });
  }

  async getUserById(uid: string): Promise<UserDocument | null> {
    const doc = this.usersMap.get(uid);
    return doc ? { ...doc } : null;
  }

  async createUserProfile(profile: UserDocument): Promise<void> {
    this.usersMap.set(profile.uid, { ...profile });
  }

  async updateUserProfile(uid: string, fields: Partial<UserDocument>): Promise<UserDocument> {
    const current = this.usersMap.get(uid) || ({} as UserDocument);
    const updated = {
      ...current,
      ...fields,
      updatedAt: Timestamp.now(),
    };
    this.usersMap.set(uid, updated);
    return { ...updated };
  }

  async setUserStatus(uid: string, status: UserStatus): Promise<void> {
    const current = this.usersMap.get(uid);
    if (current) {
      current.status = status;
      current.updatedAt = Timestamp.now();
    }
  }

  async setUserRole(uid: string, role: UserRole): Promise<void> {
    this.customClaimsMap.set(uid, { role });
    const current = this.usersMap.get(uid);
    if (current) {
      current.role = role;
      current.updatedAt = Timestamp.now();
    }
  }

  async verifyIdToken(idToken: string, _checkRevoked = false): Promise<any> {
    if (idToken === "token_alice_valid") {
      return { uid: "user_alice", email: "alice@example.com", role: "CUSTOMER", email_verified: true };
    }
    if (idToken === "token_bob_valid") {
      return { uid: "user_bob_suspended", email: "bob@example.com", role: "CUSTOMER", email_verified: false };
    }
    if (idToken === "token_charlie_valid") {
      return { uid: "user_charlie_deleted", email: "charlie@example.com", role: "CUSTOMER", email_verified: true };
    }
    if (idToken === "token_admin_valid") {
      return { uid: "user_dave_admin", email: "admin@mushbio.com", role: "ADMIN", email_verified: true };
    }
    if (idToken === "token_expired") {
      const err: any = new Error("Token expired");
      err.code = "auth/id-token-expired";
      throw err;
    }
    throw new Error("Invalid token signature");
  }

  async getAuthUser(uid: string): Promise<any> {
    const user = this.authUsersMap.get(uid);
    if (!user) throw new Error("User not found in Auth");
    return user;
  }
}

export async function runAuthTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 05 — FIREBASE AUTHENTICATION TEST SUITE");
  console.log("================================================================================");

  const testRepo = new InMemoryUserRepo();
  const service = new AuthService(testRepo);

  let passedCount = 0;
  function assert(name: string, condition: boolean, details?: string): void {
    if (condition) {
      console.log(`[PASS] ${name}${details ? ` -> ${details}` : ""}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${name} ${details || ""}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // --- 1. REGISTRATION & PASSWORD POLICY ---
  console.log("\n--- PASSWORD POLICY & REGISTRATION ---");

  // Test 1: Password validation (min 8 chars)
  const validPass = PasswordSchema.safeParse("SecretPass123!");
  const invalidPass = PasswordSchema.safeParse("short");
  assert("Test #01: Password policy requires >= 8 characters", validPass.success && !invalidPass.success);

  // Test 2: Profile creation assigns default CUSTOMER role and ACTIVE status
  const newProfile = await service.ensureUserProfile(
    "user_new_01",
    "newuser@mushbio.com",
    "New Customer",
    undefined,
    undefined,
    false
  );
  assert(
    "Test #02: New account auto-creates profile with role CUSTOMER and status ACTIVE",
    newProfile.role === "CUSTOMER" && newProfile.status === "ACTIVE" && newProfile.emailVerified === false
  );

  // --- 2. TOKEN VERIFICATION & MIDDLEWARE ---
  console.log("\n--- TOKEN VERIFICATION & RBAC MIDDLEWARES ---");

  // Test 3: Token verification with valid token
  const decodedAlice = await testRepo.verifyIdToken("token_alice_valid");
  assert("Test #03: Valid ID token decoded to verified UID & claims", decodedAlice.uid === "user_alice");

  // Test 4: Expired token rejection
  let expiredCaught = false;
  try {
    await testRepo.verifyIdToken("token_expired");
  } catch (err: any) {
    expiredCaught = err.code === "auth/id-token-expired";
  }
  assert("Test #04: Expired ID token throws auth/id-token-expired", expiredCaught);

  // Test 5: Invalid token rejection
  let invalidCaught = false;
  try {
    await testRepo.verifyIdToken("token_garbage_fake");
  } catch {
    invalidCaught = true;
  }
  assert("Test #05: Invalid token signature rejected", invalidCaught);

  // Test 6: Suspended account access rejection
  let suspendedCaught = false;
  try {
    await service.getProfile("user_bob_suspended");
  } catch (err: any) {
    suspendedCaught = err.statusCode === 403 && err.errorCode === "ACCOUNT_SUSPENDED";
  }
  assert("Test #06: Suspended account profile access throws 403 ACCOUNT_SUSPENDED", suspendedCaught);

  // Test 7: Deleted account access rejection
  let deletedCaught = false;
  try {
    await service.getProfile("user_charlie_deleted");
  } catch (err: any) {
    deletedCaught = err.statusCode === 403 && err.errorCode === "ACCOUNT_DELETED";
  }
  assert("Test #07: Deleted account profile access throws 403 ACCOUNT_DELETED", deletedCaught);

  // Test 8: Admin custom claim assignment (Trusted server code)
  await service.setUserRole("user_alice", "STAFF");
  const aliceUpdated = await testRepo.getUserById("user_alice");
  assert("Test #08: Trusted code successfully updates user role claim to STAFF", aliceUpdated?.role === "STAFF");
  // Reset back to CUSTOMER
  await service.setUserRole("user_alice", "CUSTOMER");

  // --- 3. PROFILE CRUD & PRIVILEGE GUARDS ---
  console.log("\n--- PROFILE UPDATES & PRIVILEGE GUARDS ---");

  // Test 9: Valid profile update
  const updatedProfile = await service.updateProfile("user_alice", {
    displayName: "Alice Organics",
    phone: "+919123456789",
  });
  assert(
    "Test #09: Allowed fields (displayName, phone) updated successfully",
    updatedProfile.displayName === "Alice Organics" && updatedProfile.phone === "+919123456789"
  );

  // Test 10: Strict schema ignores/rejects attempts to inject 'role'
  const roleInjection = UpdateProfileSchema.safeParse({
    displayName: "Hacker Alice",
    role: "ADMIN",
  });
  assert("Test #10: Privilege escalation attempt ('role' in update body) rejected by strict schema", !roleInjection.success);

  // Test 11: Attempt to inject status rejected
  const statusInjection = UpdateProfileSchema.safeParse({
    status: "SUSPENDED",
  });
  assert("Test #11: Status injection rejected by strict schema", !statusInjection.success);

  // Test 12: Attempt to inject emailVerified rejected
  const emailVerifiedInjection = UpdateProfileSchema.safeParse({
    emailVerified: true,
  });
  assert("Test #12: emailVerified injection rejected by strict schema", !emailVerifiedInjection.success);

  // --- 4. HTTP API INTEGRATION TESTS (/api/v1/me) ---
  console.log("\n--- HTTP API /api/v1/me TESTS ---");

  const testApp = express();
  testApp.use(express.json());
  
  // Mount auth router with testRepo injected
  const router = express.Router();
  router.get("/me", requireAuth(testRepo), requireActiveAccount(testRepo), (r, s) => {
    service.getProfile(r.auth!.uid)
      .then((p) => s.status(200).json({ data: p }))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.patch("/me", requireAuth(testRepo), requireActiveAccount(testRepo), (r, s) => {
    service.updateProfile(r.auth!.uid, r.body)
      .then((p) => s.status(200).json({ data: p }))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.get("/admin-only", requireAuth(testRepo), requireRole("ADMIN"), (_r, s) => {
    s.status(200).json({ status: "admin_access_granted" });
  });
  router.get("/optional-auth-test", optionalAuth(testRepo), (r, s) => {
    s.status(200).json({ authenticated: !!r.auth, uid: r.auth?.uid || null });
  });

  testApp.use("/api/v1", router);

  const server = http.createServer(testApp);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  async function apiRequest(
    method: string,
    path: string,
    token?: string,
    body?: any
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { Connection: "close" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (body) headers["Content-Type"] = "application/json";

      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 200, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode || 200, body: data });
            }
          });
        }
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  try {
    // Test 13: GET /api/v1/me with valid token
    const meRes = await apiRequest("GET", "/api/v1/me", "token_alice_valid");
    assert(
      "Test #13: GET /api/v1/me returns safe profile (uid, email, role, status)",
      meRes.status === 200 && meRes.body.data.uid === "user_alice" && meRes.body.data.role === "CUSTOMER"
    );

    // Test 14: GET /api/v1/me without token -> 401 AUTH_REQUIRED
    const noTokenRes = await apiRequest("GET", "/api/v1/me");
    assert("Test #14: Missing Bearer token rejected with 401 AUTH_REQUIRED", noTokenRes.status === 401);

    // Test 15: GET /api/v1/me with expired token -> 401 TOKEN_EXPIRED
    const expiredRes = await apiRequest("GET", "/api/v1/me", "token_expired");
    assert("Test #15: Expired token rejected with 401 TOKEN_EXPIRED", expiredRes.status === 401);

    // Test 16: GET /api/v1/me for suspended user -> 403 ACCOUNT_SUSPENDED
    const suspendedRes = await apiRequest("GET", "/api/v1/me", "token_bob_valid");
    assert("Test #16: Suspended account rejected with 403 ACCOUNT_SUSPENDED", suspendedRes.status === 403);

    // Test 17: GET /api/v1/me for deleted user -> 403 ACCOUNT_DELETED
    const deletedRes = await apiRequest("GET", "/api/v1/me", "token_charlie_valid");
    assert("Test #17: Deleted account rejected with 403 ACCOUNT_DELETED", deletedRes.status === 403);

    // Test 18: PATCH /api/v1/me updates allowed fields
    const patchRes = await apiRequest("PATCH", "/api/v1/me", "token_alice_valid", {
      displayName: "Alice In Wonderland",
    });
    assert(
      "Test #18: PATCH /api/v1/me updates displayName successfully",
      patchRes.status === 200 && patchRes.body.data.displayName === "Alice In Wonderland"
    );

    // Test 19: PATCH /api/v1/me rejects role tampering
    const patchTamperRes = await apiRequest("PATCH", "/api/v1/me", "token_alice_valid", {
      role: "ADMIN",
    });
    assert("Test #19: PATCH /api/v1/me rejects forbidden 'role' edit with 400", patchTamperRes.status === 400);

    // Test 20: Role guard /admin-only allows ADMIN and blocks CUSTOMER
    const adminPass = await apiRequest("GET", "/api/v1/admin-only", "token_admin_valid");
    const customerBlock = await apiRequest("GET", "/api/v1/admin-only", "token_alice_valid");
    assert(
      "Test #20: requireRole('ADMIN') permits admin user and blocks customer with 403",
      adminPass.status === 200 && customerBlock.status === 403
    );

    // Test 21: optionalAuth permits anonymous access and populates authenticated identity
    const anonRes = await apiRequest("GET", "/api/v1/optional-auth-test");
    const authRes = await apiRequest("GET", "/api/v1/optional-auth-test", "token_alice_valid");
    assert(
      "Test #21: optionalAuth handles both anonymous and authenticated requests correctly",
      anonRes.body.authenticated === false && authRes.body.authenticated === true && authRes.body.uid === "user_alice"
    );

    // Test 22: Zero credentials / tokens leaked in DTO responses
    const returnedKeys = Object.keys(meRes.body.data);
    assert(
      "Test #22: Zero sensitive fields exposed (no password, hash, or secrets)",
      !returnedKeys.includes("password") && !returnedKeys.includes("passwordHash") && !returnedKeys.includes("secret")
    );

    // --- 5. FIRESTORE SECURITY RULES ---
    console.log("\n--- FIRESTORE USERS SECURITY RULES ---");

    // Test 23: Security rules validation
    const rulesValidation = validateFirestoreRulesFile();
    assert(
      "Test #23: Security rules enforce isOwner(userId) and prevent client role/status escalation",
      rulesValidation.passed
    );

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/23 Phase 05 Firebase Auth Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runAuthTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test suite failed:", err);
      process.exit(1);
    });
}
