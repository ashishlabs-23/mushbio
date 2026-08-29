/**
 * ============================================================================
 * MUSHBIO PHASE 10A — GPS ADDRESS & DELIVERY LOCATION TEST SUITE
 *
 * Tests GPS field storage, coordinate bounds, server timestamps, order snapshots,
 * admin delivery location endpoint, and delivery instructions.
 * ============================================================================
 */

import http from "http";
import express from "express";
import { Timestamp } from "firebase-admin/firestore";
import { AddressService } from "../addresses/service";
import { AddressRepository } from "../addresses/repository";
import { UserAddress, UserDocument } from "../types";
import { CreateAddressSchema } from "../addresses/schemas";
import { ReverseGeocodeSchema } from "../locations/schemas";
import { locationRouter } from "../locations/routes";
import { adminDeliveryRouter } from "../admin/deliveryRoutes";
import { addressRouter } from "../addresses/routes";
import { orderRepository } from "../orders/repository";
import { OrderDocument } from "../types/order";

// Minimal in-memory repository for address testing
class InMemoryGPSAddressRepo extends AddressRepository {
  public userProfiles = new Map<string, UserDocument>();
  public addresses = new Map<string, Map<string, UserAddress>>();
  private lockPromise: Promise<void> = Promise.resolve();

  constructor() {
    super();
    const defaultUser: UserDocument = {
      uid: "user_gps_01",
      email: "gps.test@example.com",
      emailVerified: true,
      displayName: "GPS Tester",
      phone: "+919876543210",
      role: "CUSTOMER",
      status: "ACTIVE",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    this.userProfiles.set("user_gps_01", defaultUser);
    this.addresses.set("user_gps_01", new Map());
  }

  async verifyIdToken() { return { uid: "user_gps_01", email: "gps.test@example.com" } as any; }
  async getUserById(uid: string) { return this.userProfiles.get(uid) || null; }
  getUserRef(uid: string) { return { id: uid, path: `users/${uid}` } as any; }
  getAddressRef(uid: string, addrId: string) { return { id: addrId, path: `users/${uid}/addresses/${addrId}` } as any; }

  async getAddresses(uid: string): Promise<UserAddress[]> {
    return Array.from(this.addresses.get(uid)?.values() || []);
  }

  async getAddressById(uid: string, addrId: string): Promise<UserAddress | null> {
    return this.addresses.get(uid)?.get(addrId) || null;
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const prev = this.lockPromise;
    let resolveLock!: () => void;
    this.lockPromise = new Promise(r => { resolveLock = r; });
    await prev;

    const tx: any = {
      get: async (ref: any) => {
        const addrId = ref.id;
        const uid = "user_gps_01";
        const data = this.addresses.get(uid)?.get(addrId);
        return { exists: !!data, data: () => data };
      },
      set: (ref: any, data: any) => {
        const uid = "user_gps_01";
        const addrId = ref.id;
        if (!this.addresses.has(uid)) this.addresses.set(uid, new Map());
        this.addresses.get(uid)!.set(addrId, { ...data });
      },
      update: (ref: any, data: any) => {
        const uid = "user_gps_01";
        const id = ref.id;
        if (this.userProfiles.has(id)) {
          this.userProfiles.set(id, { ...this.userProfiles.get(id)!, ...data });
        } else {
          const current = this.addresses.get(uid)?.get(id);
          if (current) this.addresses.get(uid)!.set(id, { ...current, ...data });
        }
      },
    };

    try {
      const res = await fn(tx);
      return res;
    } finally {
      resolveLock();
    }
  }
}

let passedCount = 0;

function assert(description: string, condition: boolean, extraInfo?: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${description}${extraInfo ? ` (${extraInfo})` : ""}`);
    throw new Error(`Assertion failed: ${description}`);
  }
  passedCount++;
  console.log(`✅ PASS: ${description}`);
}

export async function runLocationTestSuite() {
  console.log("================================================================================");
  console.log("MUSHBIO PHASE 10A — GPS ADDRESS & DELIVERY LOCATION TEST SUITE");
  console.log("================================================================================");

  passedCount = 0;
  const UID = "user_gps_01";
  const repo = new InMemoryGPSAddressRepo();
  const svc = new AddressService(repo as any);

  // ─── 1. REVERSE GEOCODE SCHEMA TESTS ─────────────────────────────────────────
  console.log("\n--- 1. REVERSE GEOCODE SCHEMA VALIDATIONS ---");

  let threwT01 = false;
  try {
    ReverseGeocodeSchema.parse({ latitude: 95, longitude: 77.5946 });
  } catch {
    threwT01 = true;
  }
  assert("Test #01: ReverseGeocodeSchema rejects latitude > 90", threwT01);

  let threwT02 = false;
  try {
    ReverseGeocodeSchema.parse({ latitude: 12.9716, longitude: 200 });
  } catch {
    threwT02 = true;
  }
  assert("Test #02: ReverseGeocodeSchema rejects longitude > 180", threwT02);

  let threwT03 = false;
  try {
    ReverseGeocodeSchema.parse({ latitude: 12.9716, longitude: 77.5946, accuracyMeters: -5 });
  } catch {
    threwT03 = true;
  }
  assert("Test #03: ReverseGeocodeSchema rejects negative accuracyMeters", threwT03);

  const validGeocode = ReverseGeocodeSchema.parse({
    latitude: 12.9716,
    longitude: 77.5946,
    accuracyMeters: 15,
  });
  assert("Test #04: ReverseGeocodeSchema accepts valid coordinates within WGS-84 range", validGeocode.latitude === 12.9716 && validGeocode.longitude === 77.5946);

  // ─── 2. ADDRESS SCHEMA & STORAGE TESTS ────────────────────────────────────────
  console.log("\n--- 2. ADDRESS GPS METADATA & PERSISTENCE ---");

  let threwT05 = false;
  try {
    CreateAddressSchema.parse({
      recipientName: "Test",
      phone: "9000000000",
      line1: "Addr",
      city: "City",
      state: "State",
      postalCode: "000000",
      latitude: 95,
      longitude: 77.59,
    });
  } catch {
    threwT05 = true;
  }
  assert("Test #05: CreateAddressSchema rejects invalid latitude on address create", threwT05);

  const createdGps = await svc.createAddress(UID, {
    recipientName: "Ravi Kumar",
    phone: "9876543210",
    line1: "Plot 14 Green Valley",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "IN",
    latitude: 12.9716,
    longitude: 77.5946,
    accuracyMeters: 18,
    locationSource: "GPS",
    deliveryInstructions: "Call before arriving",
    isDefault: true,
  });
  assert(
    "Test #06: createAddress persists GPS metadata (lat, lng, accuracy, source, instructions)",
    createdGps.latitude === 12.9716 &&
    createdGps.longitude === 77.5946 &&
    createdGps.accuracyMeters === 18 &&
    createdGps.locationSource === "GPS" &&
    createdGps.deliveryInstructions === "Call before arriving" &&
    createdGps.locationCapturedAt !== undefined
  );

  const createdManual = await svc.createAddress(UID, {
    recipientName: "Priya Sharma",
    phone: "9123456789",
    line1: "123 MG Road",
    city: "Mangaluru",
    state: "Karnataka",
    postalCode: "575001",
    isDefault: false,
  });
  assert(
    "Test #07: Manual address creation does not store GPS coordinates or locationCapturedAt",
    createdManual.latitude === undefined &&
    createdManual.longitude === undefined &&
    createdManual.locationSource === undefined &&
    createdManual.locationCapturedAt === undefined
  );

  const updatedGps = await svc.updateAddress(UID, createdManual.id, {
    latitude: 12.9141,
    longitude: 74.8560,
    accuracyMeters: 20,
    locationSource: "GPS",
    deliveryInstructions: "Ring doorbell twice",
  });
  assert(
    "Test #08: updateAddress assigns locationCapturedAt when GPS coordinates are added",
    updatedGps.latitude === 12.9141 &&
    updatedGps.longitude === 74.8560 &&
    updatedGps.locationSource === "GPS" &&
    updatedGps.locationCapturedAt !== undefined &&
    updatedGps.deliveryInstructions === "Ring doorbell twice"
  );

  let threwT09 = false;
  try {
    CreateAddressSchema.parse({
      recipientName: "Test",
      phone: "9000000000",
      line1: "Addr",
      city: "City",
      state: "State",
      postalCode: "000000",
      deliveryInstructions: "A".repeat(501),
    });
  } catch {
    threwT09 = true;
  }
  assert("Test #09: deliveryInstructions max length 500 characters enforced", threwT09);

  let threwT10 = false;
  try {
    CreateAddressSchema.parse({
      recipientName: "Test",
      phone: "9000000000",
      line1: "Addr",
      city: "City",
      state: "State",
      postalCode: "000000",
      locationSource: "INVALID_SOURCE" as any,
    });
  } catch {
    threwT10 = true;
  }
  assert("Test #10: locationSource only accepts 'GPS' | 'MANUAL'", threwT10);

  // ─── 3. HTTP ENDPOINTS & RBAC TESTS ──────────────────────────────────────────
  console.log("\n--- 3. HTTP ROUTING & ROLE-BASED ACCESS CONTROL ---");

  // Import userRepository to mock token verification for integration tests
  const { userRepository } = await import("../auth/repository");
  const origVerifyIdToken = userRepository.verifyIdToken;
  const origGetUserById = userRepository.getUserById;

  userRepository.verifyIdToken = async (token: string) => {
    if (token === "staff_token") return { uid: "staff_01", email: "staff@mushbio.com", role: "STAFF", email_verified: true } as any;
    if (token === "admin_token") return { uid: "admin_01", email: "admin@mushbio.com", role: "ADMIN", email_verified: true } as any;
    if (token === "customer_token") return { uid: "user_gps_01", email: "gps.test@example.com", role: "CUSTOMER", email_verified: true } as any;
    throw new Error("Invalid token");
  };

  userRepository.getUserById = async (uid: string) => ({
    uid,
    status: "ACTIVE",
    role: uid.includes("staff") ? "STAFF" : uid.includes("admin") ? "ADMIN" : "CUSTOMER",
    email: `${uid}@mushbio.com`,
    emailVerified: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  } as any);

  const app = express();
  app.use(express.json());

  app.use("/api/v1/locations", locationRouter);
  app.use("/api/v1/admin", adminDeliveryRouter);
  app.use("/api/v1", addressRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  const port = (server.address() as any).port;

  function apiRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
    body?: any
  ): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            "Content-Type": "application/json",
            ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 500, body: data ? JSON.parse(data) : {} });
            } catch {
              resolve({ status: res.statusCode || 500, body: data });
            }
          });
        }
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    const unauthGeo = await apiRequest("POST", "/api/v1/locations/reverse-geocode", {}, { latitude: 12.97, longitude: 77.59 });
    assert("Test #11: POST /api/v1/locations/reverse-geocode rejects unauthenticated calls (401)", unauthGeo.status === 401);

    const invalidGeo = await apiRequest(
      "POST",
      "/api/v1/locations/reverse-geocode",
      { Authorization: "Bearer customer_token" },
      { latitude: 120, longitude: 77.59 }
    );
    assert("Test #12: POST /api/v1/locations/reverse-geocode rejects invalid latitude (400)", invalidGeo.status === 400);

    const unauthAdmin = await apiRequest("GET", "/api/v1/admin/orders/order_test_123/delivery");
    assert("Test #13: GET /api/v1/admin/orders/:id/delivery rejects unauthenticated calls (401)", unauthAdmin.status === 401);

    const customerAdmin = await apiRequest("GET", "/api/v1/admin/orders/order_test_123/delivery", {
      Authorization: "Bearer customer_token",
    });
    assert("Test #14: GET /api/v1/admin/orders/:id/delivery rejects CUSTOMER role (403)", customerAdmin.status === 403);

    // Mock order in orderRepository to test STAFF/ADMIN delivery endpoint response
    const mockOrder: OrderDocument = {
      id: "order_delivery_test",
      orderNumber: "MB-2026-9999",
      userId: "user_gps_01",
      customerEmail: "ravi@example.com",
      customerName: "Ravi Kumar",
      customerPhone: "9876543210",
      status: "PROCESSING",
      paymentStatus: "PAID",
      currency: "INR",
      subtotal: 50000,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: 50000,
      shippingMethod: "STANDARD",
      shippingAddressSnapshot: createdGps as any,
      deliveryLocation: {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracyMeters: 18,
        source: "GPS",
      },
      deliveryInstructions: "Call before arriving",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    // Temporarily hook repo
    const origGetOrder = orderRepository.getOrderById;
    orderRepository.getOrderById = async (id: string) => {
      if (id === "order_delivery_test") return mockOrder;
      return null;
    };

    try {
      const staffDelivery = await apiRequest("GET", "/api/v1/admin/orders/order_delivery_test/delivery", {
        Authorization: "Bearer staff_token",
      });
      assert(
        "Test #15: GET /api/v1/admin/orders/:id/delivery allows STAFF role and returns deliveryLocation",
        staffDelivery.status === 200 &&
        staffDelivery.body.data.location.latitude === 12.9716 &&
        staffDelivery.body.data.location.source === "GPS" &&
        staffDelivery.body.data.deliveryInstructions === "Call before arriving"
      );

      const adminDelivery = await apiRequest("GET", "/api/v1/admin/orders/order_delivery_test/delivery", {
        Authorization: "Bearer admin_token",
      });
      assert(
        "Test #16: GET /api/v1/admin/orders/:id/delivery allows ADMIN role and returns complete dispatch payload",
        adminDelivery.status === 200 &&
        adminDelivery.body.data.orderNumber === "MB-2026-9999" &&
        adminDelivery.body.data.customer.phone === "9876543210"
      );
    } finally {
      orderRepository.getOrderById = origGetOrder;
    }

    console.log("================================================================================");
    console.log(`TEST SUMMARY: ${passedCount}/16 Phase 10A GPS & Delivery Location Scenarios Passed Cleanly.`);
    console.log("================================================================================");
  } finally {
    const { userRepository } = await import("../auth/repository");
    userRepository.verifyIdToken = origVerifyIdToken;
    userRepository.getUserById = origGetUserById;
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}


if (require.main === module) {
  runLocationTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Location test suite failed:", err);
      process.exit(1);
    });
}
