/**
 * ============================================================================
 * MUSHBIO PHASE 06 — USERS, PROFILES & ADDRESS BOOK TEST SUITE
 *
 * Validates address CRUD, default address atomic transitions, limit guards,
 * concurrency safety, and security rules.
 * Usage: npm --prefix functions test
 * ============================================================================
 */

import http from "http";
import express from "express";
import { AddressService } from "../addresses/service";
import { AddressRepository } from "../addresses/repository";
import { requireAuth, requireActiveAccount } from "../auth/middleware";
import { UserAddress, UserDocument } from "../types";
import { Timestamp } from "firebase-admin/firestore";
import { CreateAddressSchema } from "../addresses/schemas";
import { validateFirestoreRulesFile } from "./rules.test";

// In-Memory Address & User Repository with transactional atomic locking
class InMemoryAddressRepo extends AddressRepository {
  public userProfiles = new Map<string, UserDocument>();
  public addresses = new Map<string, Map<string, UserAddress>>();
  private lockPromise: Promise<void> = Promise.resolve();

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

    this.userProfiles.set(alice.uid, alice);
    this.userProfiles.set(bobSuspended.uid, bobSuspended);
    this.userProfiles.set(charlieDeleted.uid, charlieDeleted);

    this.addresses.set(alice.uid, new Map());
    this.addresses.set(bobSuspended.uid, new Map());
    this.addresses.set(charlieDeleted.uid, new Map());
  }

  getUserRef(userId: string): any {
    return { id: userId, type: "user" };
  }

  getAddressRef(userId: string, addressId: string): any {
    return { id: addressId, userId, type: "address" };
  }

  async getAddresses(userId: string): Promise<UserAddress[]> {
    const userMap = this.addresses.get(userId);
    if (!userMap) return [];
    return Array.from(userMap.values()).map((a) => ({ ...a }));
  }

  async getAddressById(userId: string, addressId: string): Promise<UserAddress | null> {
    const userMap = this.addresses.get(userId);
    if (!userMap) return null;
    const addr = userMap.get(addressId);
    return addr ? { ...addr } : null;
  }

  async countAddresses(userId: string): Promise<number> {
    const userMap = this.addresses.get(userId);
    return userMap ? userMap.size : 0;
  }

  // Simulates atomic database transaction locking
  async runTransaction<T>(updateFunction: (tx: any) => Promise<T>): Promise<T> {
    const prevLock = this.lockPromise;
    let releaseLock: () => void;
    this.lockPromise = new Promise((resolve) => {
      releaseLock = resolve;
    });

    await prevLock;
    try {
      const mockTx = {
        get: async (ref: any) => {
          if (ref.type === "user") {
            const u = this.userProfiles.get(ref.id);
            return { exists: !!u, data: () => (u ? { ...u } : undefined) };
          }
          const userMap = this.addresses.get(ref.userId);
          const a = userMap ? userMap.get(ref.id) : undefined;
          return { exists: !!a, data: () => (a ? { ...a } : undefined) };
        },
        set: (ref: any, data: any) => {
          if (ref.type === "user") {
            this.userProfiles.set(ref.id, { ...data });
          } else {
            let userMap = this.addresses.get(ref.userId);
            if (!userMap) {
              userMap = new Map();
              this.addresses.set(ref.userId, userMap);
            }
            userMap.set(ref.id, { ...data });
          }
        },
        update: (ref: any, data: any) => {
          if (ref.type === "user") {
            const current = this.userProfiles.get(ref.id) || ({} as any);
            this.userProfiles.set(ref.id, { ...current, ...data });
          } else {
            const userMap = this.addresses.get(ref.userId);
            if (userMap) {
              const current = userMap.get(ref.id) || ({} as any);
              userMap.set(ref.id, { ...current, ...data });
            }
          }
        },
        delete: (ref: any) => {
          if (ref.type === "address") {
            const userMap = this.addresses.get(ref.userId);
            if (userMap) userMap.delete(ref.id);
          }
        },
      };

      return await updateFunction(mockTx);
    } finally {
      releaseLock!();
    }
  }

  // Token verification for auth middleware in tests
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
    if (idToken === "token_other_user") {
      return { uid: "user_other", email: "other@example.com", role: "CUSTOMER", email_verified: true };
    }
    throw new Error("Invalid token signature");
  }

  async getUserById(uid: string): Promise<UserDocument | null> {
    const doc = this.userProfiles.get(uid);
    return doc ? { ...doc } : null;
  }
}

export async function runAddressesTestSuite(): Promise<void> {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 06 — USERS, PROFILES & ADDRESS BOOK TEST SUITE");
  console.log("================================================================================");

  const testRepo = new InMemoryAddressRepo();
  const service = new AddressService(testRepo);

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

  // --- 1. ADDRESS CREATION & AUTO-DEFAULT ---
  console.log("\n--- ADDRESS CREATION & DEFAULT INITIALIZATION ---");

  // Test 1: First address automatically becomes default
  const addr1 = await service.createAddress("user_alice", {
    label: "Home Farm",
    recipientName: "Alice Farmer",
    phone: "+919876543210",
    line1: "123 Mushroom Lane",
    city: "Madikeri",
    state: "Karnataka",
    postalCode: "571201",
    country: "IN",
    isDefault: false, // Explicitly sending false
  });
  const aliceProfile1 = await testRepo.getUserById("user_alice");
  assert(
    "Test #01: First created address automatically receives isDefault: true",
    addr1.isDefault === true && aliceProfile1?.defaultShippingAddressId === addr1.id
  );

  // Test 2: Second address created without isDefault keeps first as default
  const addr2 = await service.createAddress("user_alice", {
    label: "Warehouse 1",
    recipientName: "Alice Farmer",
    phone: "+919876543210",
    line1: "456 Industrial Estate",
    city: "Mysuru",
    state: "Karnataka",
    postalCode: "570001",
    country: "IN",
    isDefault: false,
  });
  const aliceProfile2 = await testRepo.getUserById("user_alice");
  assert(
    "Test #02: Second address (isDefault: false) preserves first address as default",
    addr2.isDefault === false && aliceProfile2?.defaultShippingAddressId === addr1.id
  );

  // Test 3: Third address created with isDefault: true atomically promotes 3 and demotes 1
  const addr3 = await service.createAddress("user_alice", {
    label: "Primary Residence",
    recipientName: "Alice Farmer",
    phone: "+919876543210",
    line1: "789 Plantation Way",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
    isDefault: true,
  });
  const addr1Updated = await service.getAddressById("user_alice", addr1.id);
  const aliceProfile3 = await testRepo.getUserById("user_alice");
  assert(
    "Test #03: Creating new default address atomically demotes previous default",
    addr3.isDefault === true && addr1Updated.isDefault === false && aliceProfile3?.defaultShippingAddressId === addr3.id
  );

  // --- 2. LISTING & ORDERING ---
  console.log("\n--- ADDRESS LISTING & RETRIEVAL ---");

  // Test 4: List addresses returns default address first
  const listRes = await service.listAddresses("user_alice");
  assert(
    "Test #04: List addresses orders default address first",
    listRes.total === 3 && listRes.data[0].id === addr3.id && listRes.data[0].isDefault === true
  );

  // Test 5: Get address by ID
  const singleAddr = await service.getAddressById("user_alice", addr2.id);
  assert("Test #05: Get address by ID returns valid DTO", singleAddr.city === "Mysuru");

  // Test 6: Cross-user address access rejected (User B cannot access Alice's address)
  let crossUserCaught = false;
  try {
    await service.getAddressById("user_bob_suspended", addr1.id);
  } catch (err: any) {
    crossUserCaught = err.statusCode === 404 && err.errorCode === "ADDRESS_NOT_FOUND";
  }
  assert("Test #06: Cross-user address retrieval rejected with 404", crossUserCaught);

  // --- 3. UPDATES & DEFAULT SWITCHING ---
  console.log("\n--- UPDATES & ATOMIC DEFAULT SWITCHING ---");

  // Test 7: Update regular address fields
  const updatedAddr2 = await service.updateAddress("user_alice", addr2.id, {
    label: "Warehouse Main",
    line2: "Gate No. 2",
  });
  assert(
    "Test #07: Update address fields updates document successfully",
    updatedAddr2.label === "Warehouse Main" && updatedAddr2.line2 === "Gate No. 2"
  );

  // Test 8: Setting Address 2 as default via setDefaultAddress
  await service.setDefaultAddress("user_alice", addr2.id);
  const addr2AfterSet = await service.getAddressById("user_alice", addr2.id);
  const addr3AfterSet = await service.getAddressById("user_alice", addr3.id);
  const aliceProfile4 = await testRepo.getUserById("user_alice");
  assert(
    "Test #08: setDefaultAddress promotes Address 2 and demotes Address 3",
    addr2AfterSet.isDefault === true && addr3AfterSet.isDefault === false && aliceProfile4?.defaultShippingAddressId === addr2.id
  );

  // Test 9: Disallow removing isDefault without picking replacement
  let unDefaultCaught = false;
  try {
    await service.updateAddress("user_alice", addr2.id, { isDefault: false });
  } catch (err: any) {
    unDefaultCaught = err.statusCode === 400 && err.errorCode === "DEFAULT_ADDRESS_REQUIRED";
  }
  assert("Test #09: Cannot un-default primary address without selecting replacement", unDefaultCaught);

  // --- 4. DELETIONS & PROMOTION ---
  console.log("\n--- ADDRESS DELETIONS & DEFAULT PROMOTION ---");

  // Test 10: Delete non-default address (Address 1)
  await service.deleteAddress("user_alice", addr1.id);
  const listAfterDelete1 = await service.listAddresses("user_alice");
  assert("Test #10: Delete non-default address removes document cleanly", listAfterDelete1.total === 2);

  // Test 11: Deleting current default (Address 2) automatically promotes remaining address (Address 3)
  await service.deleteAddress("user_alice", addr2.id);
  const listAfterDeleteDefault = await service.listAddresses("user_alice");
  const aliceProfile5 = await testRepo.getUserById("user_alice");
  assert(
    "Test #11: Deleting default address automatically promotes remaining address as new default",
    listAfterDeleteDefault.total === 1 && listAfterDeleteDefault.data[0].id === addr3.id &&
    listAfterDeleteDefault.data[0].isDefault === true && aliceProfile5?.defaultShippingAddressId === addr3.id
  );

  // Test 12: Deleting last remaining address clears profile default address ID
  await service.deleteAddress("user_alice", addr3.id);
  const listEmpty = await service.listAddresses("user_alice");
  const aliceProfileEmpty = await testRepo.getUserById("user_alice");
  assert(
    "Test #12: Deleting last remaining address clears profile defaultShippingAddressId",
    listEmpty.total === 0 && aliceProfileEmpty?.defaultShippingAddressId === null
  );

  // --- 5. LIMITS & VALIDATIONS ---
  console.log("\n--- VALIDATION & ADDRESS LIMITS ---");

  // Test 13: Invalid phone number rejected
  const invalidPhone = CreateAddressSchema.safeParse({
    recipientName: "Test Name",
    phone: "123",
    line1: "123 Test St",
    city: "City",
    state: "State",
    postalCode: "571201",
  });
  assert("Test #13: Invalid short phone number rejected by schema", !invalidPhone.success);

  // Test 14: Invalid postal code rejected
  const invalidPIN = CreateAddressSchema.safeParse({
    recipientName: "Test Name",
    phone: "+919876543210",
    line1: "123 Test St",
    city: "City",
    state: "State",
    postalCode: "12", // too short
  });
  assert("Test #14: Invalid postal code rejected by schema", !invalidPIN.success);

  // Test 15: Address limit (Maximum 10 addresses)
  for (let i = 1; i <= 10; i++) {
    await service.createAddress("user_alice", {
      label: `Address #${i}`,
      recipientName: "Alice Farmer",
      phone: "+919876543210",
      line1: `${i} Plantation Way`,
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
    });
  }

  let limitCaught = false;
  try {
    await service.createAddress("user_alice", {
      label: "Address #11",
      recipientName: "Alice Farmer",
      phone: "+919876543210",
      line1: "11 Plantation Way",
      city: "Bengaluru",
      state: "Karnataka",
      postalCode: "560001",
    });
  } catch (err: any) {
    limitCaught = err.statusCode === 409 && err.errorCode === "ADDRESS_LIMIT_REACHED";
  }
  assert("Test #15: Exceeding 10 addresses rejected with 409 ADDRESS_LIMIT_REACHED", limitCaught);

  // --- 6. CONCURRENCY & RACE CONDITIONS ---
  console.log("\n--- CONCURRENCY & RACE CONDITIONS ---");

  // Test 16: Concurrent default switching race
  const aliceAddresses = await service.listAddresses("user_alice");
  const raceAddrA = aliceAddresses.data[1].id;
  const raceAddrB = aliceAddresses.data[2].id;

  const reqA = service.setDefaultAddress("user_alice", raceAddrA);
  const reqB = service.setDefaultAddress("user_alice", raceAddrB);

  await Promise.allSettled([reqA, reqB]);

  const listAfterRace = await service.listAddresses("user_alice");
  const defaultsCount = listAfterRace.data.filter((a) => a.isDefault).length;
  const aliceProfileRace = await testRepo.getUserById("user_alice");
  const currentDefault = listAfterRace.data.find((a) => a.isDefault);

  assert(
    "Test #16: Concurrency race results in EXACTLY ONE default address and synchronized profile",
    defaultsCount === 1 && aliceProfileRace?.defaultShippingAddressId === currentDefault?.id
  );

  // --- 7. HTTP API INTEGRATION TESTS ---
  console.log("\n--- HTTP API /api/v1/me/addresses INTEGRATION TESTS ---");

  const testApp = express();
  testApp.use(express.json());

  // Mount address routes with testRepo
  const router = express.Router();
  router.use(requireAuth(testRepo as any), requireActiveAccount(testRepo as any));
  router.get("/me/addresses", (r, s) => {
    service.listAddresses(r.auth!.uid)
      .then((res) => s.status(200).json(res))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.post("/me/addresses", (r, s) => {
    service.createAddress(r.auth!.uid, r.body)
      .then((res) => s.status(201).json({ data: res }))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.get("/me/addresses/:addressId", (r, s) => {
    service.getAddressById(r.auth!.uid, r.params.addressId)
      .then((res) => s.status(200).json({ data: res }))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.patch("/me/addresses/:addressId", (r, s) => {
    service.updateAddress(r.auth!.uid, r.params.addressId, r.body)
      .then((res) => s.status(200).json({ data: res }))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.delete("/me/addresses/:addressId", (r, s) => {
    service.deleteAddress(r.auth!.uid, r.params.addressId)
      .then((res) => s.status(200).json(res))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
  });
  router.post("/me/addresses/:addressId/default", (r, s) => {
    service.setDefaultAddress(r.auth!.uid, r.params.addressId)
      .then((res) => s.status(200).json({ data: res }))
      .catch((e) => s.status(e.statusCode || 500).json({ error: e.errorCode }));
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
    // Test 17: GET /api/v1/me/addresses with valid token
    const listHttp = await apiRequest("GET", "/api/v1/me/addresses", "token_alice_valid");
    assert("Test #17: GET /api/v1/me/addresses returns list of addresses", listHttp.status === 200 && Array.isArray(listHttp.body.data));

    // Test 18: Unauthenticated access rejected with 401
    const unauthHttp = await apiRequest("GET", "/api/v1/me/addresses");
    assert("Test #18: Unauthenticated request rejected with 401 AUTH_REQUIRED", unauthHttp.status === 401);

    // Test 19: Suspended account blocked with 403
    const suspendedHttp = await apiRequest("GET", "/api/v1/me/addresses", "token_bob_valid");
    assert("Test #19: Suspended account blocked with 403 ACCOUNT_SUSPENDED", suspendedHttp.status === 403);

    // Test 20: Deleted account blocked with 403
    const deletedHttp = await apiRequest("GET", "/api/v1/me/addresses", "token_charlie_valid");
    assert("Test #20: Deleted account blocked with 403 ACCOUNT_DELETED", deletedHttp.status === 403);

    // Test 21: Security rules enforcement
    const rulesValidation = validateFirestoreRulesFile();
    assert(
      "Test #21: Firestore rules maintain address subcollection ownership isOwner(userId)",
      rulesValidation.passed
    );

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/21 Phase 06 Address Book Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

if (require.main === module) {
  runAddressesTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Test suite failed:", err);
      process.exit(1);
    });
}
