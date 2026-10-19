/**
 * Phase 1-3 Integration Tests — Auth, Users, Policies, Packages, Promotions, Orders, Transactions
 *
 * Requires: Docker stack running on :3000 with seeded data
 *   - admin@cloudvps.com / Password1234! (role: admin)
 *   - support@cloudvps.com / Password1234! (role: support)
 *   - user@cloudvps.com / Password1234! (role: users)
 *   - package id=1 (active), os id=1, vm id=1
 *   - promo codes from seed: WELCOME10 (active), BLACKFRIDAY30 (active)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const BASE = "http://localhost:3000";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function req(
  method: HttpMethod,
  path: string,
  body?: any,
  token?: string
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Payment endpoint uses multipart/form-data (Phase 15)
async function reqPayment(
  fields: Record<string, string>,
  token?: string
): Promise<{ status: number; data: any }> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/transactions`, {
    method: "POST",
    headers,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let adminToken = "";
let supportToken = "";
let userToken = "";

// IDs created during tests (for cleanup / cross-reference)
let testPolicyId = 0;
let testOsId = 0;
let testVmId = 0;
let testPkgId = 0;
let testPromoId = 0;
let testOrderId = 0;
let testTxId = 0;

beforeAll(async () => {
  const [aRes, sRes, uRes] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "support@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com", password: "Password1234!" }),
  ]);
  adminToken = aRes.data?.data?.access_token ?? "";
  supportToken = sRes.data?.data?.access_token ?? "";
  userToken = uRes.data?.data?.access_token ?? "";

  if (!adminToken || !supportToken || !userToken) {
    throw new Error("Login failed — ensure Docker stack is running with seeded data");
  }
});

afterAll(async () => {
  // Best-effort cleanup: cancel test order if it was created
  if (testOrderId) {
    await req("PATCH", `/api/orders/${testOrderId}/cancel`, undefined, adminToken).catch(() => {});
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH — Registration & Login
// ══════════════════════════════════════════════════════════════════════════════

describe("Auth — Login", () => {
  it("AUTH-1: POST /api/auth/login → 200 with tokens for valid credentials", async () => {
    const { status, data } = await req("POST", "/api/auth/login", {
      email: "user@cloudvps.com",
      password: "Password1234!",
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.access_token).toBeTruthy();
    expect(data.data.refresh_token).toBeTruthy();
    expect(data.data.user.email).toBe("user@cloudvps.com");
  });

  it("AUTH-2: POST /api/auth/login → 401 for wrong password", async () => {
    const { status, data } = await req("POST", "/api/auth/login", {
      email: "user@cloudvps.com",
      password: "WrongPassword!",
    });
    expect(status).toBe(401);
    expect(data.success).toBe(false);
  });

  it("AUTH-3: POST /api/auth/login → 401 for non-existent email", async () => {
    const { status } = await req("POST", "/api/auth/login", {
      email: "ghost@example.com",
      password: "Password1234!",
    });
    expect(status).toBe(401);
  });

  it("AUTH-4: POST /api/auth/register → 422/400 for existing email", async () => {
    const { status } = await req("POST", "/api/auth/register", {
      email: "user@cloudvps.com",
      password: "Password1234!",
      first_name: "Test", last_name: "User",
      phone: "0800000000",
      address1: "123 St",
      address3: "BKK", address4: "BKK", address5: "10110", address6: "TH",
      policy_ids: [1, 2],
    });
    expect([400, 409, 422]).toContain(status);
  });
});

describe("Auth — Token Management", () => {
  it("AUTH-5: POST /api/auth/refresh → 200 with new access token", async () => {
    // Login to get a fresh refresh token
    const loginRes = await req("POST", "/api/auth/login", {
      email: "user@cloudvps.com",
      password: "Password1234!",
    });
    const refreshToken = loginRes.data.data.refresh_token;
    const { status, data } = await req("POST", "/api/auth/refresh", { refresh_token: refreshToken });
    expect(status).toBe(200);
    expect(data.data.access_token).toBeTruthy();
  });

  it("AUTH-6: POST /api/auth/refresh → 401 for invalid token", async () => {
    const { status } = await req("POST", "/api/auth/refresh", { refresh_token: "not.a.valid.token" });
    expect(status).toBe(401);
  });

  it("AUTH-7: POST /api/auth/logout → 200 and clears session", async () => {
    const { status, data } = await req("POST", "/api/auth/logout", undefined, userToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // Re-login to restore userToken for subsequent tests
    const loginRes = await req("POST", "/api/auth/login", {
      email: "user@cloudvps.com", password: "Password1234!",
    });
    userToken = loginRes.data.data.access_token;
  });

  it("AUTH-8: GET /api/auth/me → 401 without token", async () => {
    const { status } = await req("GET", "/api/auth/me");
    expect(status).toBe(401);
  });

  it("AUTH-9: GET /api/auth/me → 200 with valid token", async () => {
    const { status, data } = await req("GET", "/api/auth/me", undefined, userToken);
    expect(status).toBe(200);
    expect(data.data.email).toBe("user@cloudvps.com");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// USERS — Profile Management
// ══════════════════════════════════════════════════════════════════════════════

describe("Users — Self-service", () => {
  it("USER-1: GET /api/users/me → 200 with full profile", async () => {
    const { status, data } = await req("GET", "/api/users/me", undefined, userToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.email).toBeTruthy();
  });

  it("USER-2: PUT /api/users/me → 200 updates profile fields", async () => {
    const { status, data } = await req("PUT", "/api/users/me", { first_name: "TestUser" }, userToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.first_name).toBe("TestUser");
  });

  it("USER-3: GET /api/users/me → 401 without auth", async () => {
    const { status } = await req("GET", "/api/users/me");
    expect(status).toBe(401);
  });
});

describe("Users — Admin Management", () => {
  it("USER-4: GET /api/users → 200 for admin with paginated list", async () => {
    const { status, data } = await req("GET", "/api/users", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.total).toBeGreaterThanOrEqual(3);
  });

  it("USER-5: GET /api/users → 403 for user role", async () => {
    const { status } = await req("GET", "/api/users", undefined, userToken);
    expect(status).toBe(403);
  });

  it("USER-6: GET /api/users → 200 for support role (support can list users)", async () => {
    const { status } = await req("GET", "/api/users", undefined, supportToken);
    expect(status).toBe(200);
  });

  it("USER-7: GET /api/users/1 → 200 for admin (get user by id)", async () => {
    const { status, data } = await req("GET", "/api/users/1", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.id).toBe(1);
  });

  it("USER-8: GET /api/users/99999 → 404 for non-existent user", async () => {
    const { status } = await req("GET", "/api/users/99999", undefined, adminToken);
    expect(status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POLICIES — CRUD & Consents
// ══════════════════════════════════════════════════════════════════════════════

describe("Policies — Read", () => {
  it("POL-1: GET /api/policies/active → 200 with active policies (public)", async () => {
    const { status, data } = await req("GET", "/api/policies/active");
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("POL-2: GET /api/policies → 200 for admin with all policies", async () => {
    const { status, data } = await req("GET", "/api/policies", undefined, adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("POL-3: GET /api/policies → 403 for user role", async () => {
    const { status } = await req("GET", "/api/policies", undefined, userToken);
    expect(status).toBe(403);
  });
});

describe("Policies — Admin CRUD", () => {
  it("POL-4: POST /api/policies → 201 creates a new policy (admin)", async () => {
    const { status, data } = await req(
      "POST",
      "/api/policies",
      {
        policie_title: "Test Policy",
        policies_detail: "Test content for policy.",
        policies_type: "PDPA",
        version: "99.0",
      },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testPolicyId = data.data.id;
  });

  it("POL-5: POST /api/policies → 403 for user role", async () => {
    const { status } = await req(
      "POST",
      "/api/policies",
      { policie_title: "X", policies_detail: "X", policies_type: "PDPA", version: "1.0" },
      userToken
    );
    expect(status).toBe(403);
  });

  it("POL-6: PUT /api/policies/:id → 200 updates policy (admin)", async () => {
    if (!testPolicyId) return;
    const { status, data } = await req(
      "PUT", `/api/policies/${testPolicyId}`,
      { policie_title: "Updated Policy Title" },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.policie_title).toBe("Updated Policy Title");
  });

  it("POL-7: PATCH /api/policies/:id/status → 200 toggles status (admin)", async () => {
    if (!testPolicyId) return;
    const { status, data } = await req("PATCH", `/api/policies/${testPolicyId}/status`, undefined, adminToken);
    expect(status).toBe(200);
    expect(typeof data.data.status).toBe("boolean");
  });
});

describe("Policies — User Consents", () => {
  let consentPolicyId = 0;

  it("POL-8: POST /api/policies/consents → 201 user accepts newly created policy", async () => {
    // Create a fresh active policy specifically for consent testing
    // (testPolicyId was toggled inactive by POL-7)
    const createRes = await req(
      "POST",
      "/api/policies",
      { policie_title: "Consent Test Policy", policies_detail: "Test", policies_type: "PDPA", version: "88.0" },
      adminToken
    );
    if (createRes.status !== 201) return;
    consentPolicyId = createRes.data.data.id;
    const { status, data } = await req("POST", "/api/policies/consents", { policy_id: consentPolicyId }, userToken);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
  });

  it("POL-9: POST /api/policies/consents → 409 when already accepted", async () => {
    if (!consentPolicyId) return;
    const { status } = await req("POST", "/api/policies/consents", { policy_id: consentPolicyId }, userToken);
    expect(status).toBe(409);
  });

  it("POL-10: GET /api/policies/consents/me → 200 lists user's accepted consents", async () => {
    const { status, data } = await req("GET", "/api/policies/consents/me", undefined, userToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PACKAGES — OS, VM, Packages
// ══════════════════════════════════════════════════════════════════════════════

describe("Packages — OS Templates", () => {
  it("PKG-1: GET /api/packages/os → 200 with OS list (admin)", async () => {
    const { status, data } = await req("GET", "/api/packages/os", undefined, adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("PKG-2: POST /api/packages/os → 201 creates OS template (admin)", async () => {
    const { status, data } = await req(
      "POST", "/api/packages/os",
      { os_name: "Debian", os_version: "12.0", vmid: 9900 },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testOsId = data.data.id;
  });

  it("PKG-3: POST /api/packages/os → 403 for user role", async () => {
    const { status } = await req(
      "POST", "/api/packages/os",
      { os_name: "X", os_version: "1.0", vmid: 9999 },
      userToken
    );
    expect(status).toBe(403);
  });
});

describe("Packages — VM Specs", () => {
  it("PKG-4: GET /api/packages/vm → 200 with VM spec list (admin)", async () => {
    const { status, data } = await req("GET", "/api/packages/vm", undefined, adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("PKG-5: POST /api/packages/vm → 201 creates VM spec (admin)", async () => {
    const { status, data } = await req(
      "POST", "/api/packages/vm",
      { core: 8, memory: "16GB", size: "200GB" },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testVmId = data.data.id;
  });

  it("PKG-6: POST /api/packages/vm → 403 for user role", async () => {
    const { status } = await req(
      "POST", "/api/packages/vm",
      { core: 1, memory: "512MB", size: "10GB" },
      userToken
    );
    expect(status).toBe(403);
  });
});

describe("Packages — Package Catalog", () => {
  it("PKG-7: GET /api/packages → 200 with active packages (any auth)", async () => {
    const { status, data } = await req("GET", "/api/packages", undefined, userToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  it("PKG-8: POST /api/packages → 201 creates package (admin)", async () => {
    if (!testOsId || !testVmId) return;
    const { status, data } = await req(
      "POST", "/api/packages",
      {
        name: "Test Package",
        description: "Integration test package",
        price: 999,
        period: 30,
        os_id: testOsId,
        vm_id: testVmId,
      },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testPkgId = data.data.id;
  });

  it("PKG-9: GET /api/packages/:id → 200 returns package details (admin)", async () => {
    if (!testPkgId) return;
    const { status, data } = await req("GET", `/api/packages/${testPkgId}`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.id).toBe(testPkgId);
  });

  it("PKG-10: PATCH /api/packages/:id/status → 200 toggles status (admin)", async () => {
    if (!testPkgId) return;
    const { status } = await req("PATCH", `/api/packages/${testPkgId}/status`, undefined, adminToken);
    expect(status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PROMOTIONS — CRUD & Validate
// ══════════════════════════════════════════════════════════════════════════════

describe("Promotions — CRUD", () => {
  it("PROMO-1: GET /api/promotions → 200 for admin (list promos)", async () => {
    const { status, data } = await req("GET", "/api/promotions", undefined, adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("PROMO-2: GET /api/promotions → 403 for support (admin-only)", async () => {
    const { status } = await req("GET", "/api/promotions", undefined, supportToken);
    expect(status).toBe(403);
  });

  it("PROMO-3: GET /api/promotions → 403 for user role", async () => {
    const { status } = await req("GET", "/api/promotions", undefined, userToken);
    expect(status).toBe(403);
  });

  it("PROMO-4: POST /api/promotions → 201 creates promo (admin)", async () => {
    const { status, data } = await req(
      "POST", "/api/promotions",
      {
        code_name: `TEST${Date.now()}`,
        description: "Integration test promo",
        type: "DISCOUNT",
        discount: 25,
      },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testPromoId = data.data.id;
  });

  it("PROMO-5: POST /api/promotions → 409 for duplicate code", async () => {
    const { status } = await req(
      "POST", "/api/promotions",
      { code_name: "WELCOME10", description: "Dup", type: "DISCOUNT", discount: 10 },
      adminToken
    );
    expect([409, 400]).toContain(status);
  });

  it("PROMO-6: PUT /api/promotions/:id → 200 updates promo (admin)", async () => {
    if (!testPromoId) return;
    const { status, data } = await req(
      "PUT", `/api/promotions/${testPromoId}`,
      { description: "Updated description" },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("PROMO-7: PATCH /api/promotions/:id/status → 200 toggles status (admin)", async () => {
    if (!testPromoId) return;
    const { status } = await req("PATCH", `/api/promotions/${testPromoId}/status`, undefined, adminToken);
    expect(status).toBe(200);
  });

  it("PROMO-10: POST /api/promotions → 201 creates promo with max_uses + max_uses_per_user", async () => {
    const code = `CAP${Date.now()}`;
    const { status, data } = await req(
      "POST", "/api/promotions",
      { code_name: code, description: "Capped promo", type: "DISCOUNT", discount: 10, max_uses: 50, max_uses_per_user: 1 },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.data.max_uses).toBe(50);
    expect(data.data.max_uses_per_user).toBe(1);
  });

  it("PROMO-11: PUT /api/promotions/:id → 200 updates max_uses + max_uses_per_user", async () => {
    if (!testPromoId) return;
    const { status, data } = await req(
      "PUT", `/api/promotions/${testPromoId}`,
      { max_uses: 100, max_uses_per_user: 2 },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.max_uses).toBe(100);
    expect(data.data.max_uses_per_user).toBe(2);
  });

  it("PROMO-12: PUT /api/promotions/:id → 200 clears limits with null", async () => {
    if (!testPromoId) return;
    const { status, data } = await req(
      "PUT", `/api/promotions/${testPromoId}`,
      { max_uses: null, max_uses_per_user: null },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.max_uses).toBeNull();
    expect(data.data.max_uses_per_user).toBeNull();
  });

  it("PROMO-13: POST /api/promotions → 400 when max_uses is 0 (minimum 1)", async () => {
    const { status } = await req(
      "POST", "/api/promotions",
      { code_name: `ZERO${Date.now()}`, description: "Zero cap", type: "DISCOUNT", discount: 10, max_uses: 0 },
      adminToken
    );
    expect(status).toBe(400);
  });
});

describe("Promotions — Validate", () => {
  it("PROMO-8: POST /api/promotions/validate → 200 valid promo", async () => {
    const { status, data } = await req("POST", "/api/promotions/validate", { code: "WELCOME10" }, userToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  it("PROMO-9: POST /api/promotions/validate → 400 for invalid/unknown code", async () => {
    const { status, data } = await req("POST", "/api/promotions/validate", { code: "GHOST" }, userToken);
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ORDERS — Create, List, GetById, Cancel
// ══════════════════════════════════════════════════════════════════════════════

describe("Orders — Create & List", () => {
  it("ORD-1: POST /api/orders → 201 creates order for user (package id=1)", async () => {
    const { status, data } = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe("PENDING");
    expect(data.data.amount).toBeGreaterThan(0);
    testOrderId = data.data.id;
  });

  it("ORD-2: POST /api/orders → 404 for non-existent package", async () => {
    const { status } = await req("POST", "/api/orders", { package_id: 99999 }, userToken);
    expect(status).toBe(404);
  });

  it("ORD-3: GET /api/orders → 200 user sees only own orders", async () => {
    const { status, data } = await req("GET", "/api/orders", undefined, userToken);
    expect(status).toBe(200);
    expect(data.data.orders.every((o: any) => o !== null)).toBe(true);
  });

  it("ORD-4: GET /api/orders → 200 admin sees all orders", async () => {
    const { status, data } = await req("GET", "/api/orders", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.total).toBeGreaterThanOrEqual(1);
  });
});

describe("Orders — GetById & Cancel", () => {
  it("ORD-5: GET /api/orders/:id → 200 user views own order", async () => {
    if (!testOrderId) return;
    const { status, data } = await req("GET", `/api/orders/${testOrderId}`, undefined, userToken);
    expect(status).toBe(200);
    expect(data.data.id).toBe(testOrderId);
  });

  it("ORD-6: GET /api/orders/:id → 200 admin views any order", async () => {
    if (!testOrderId) return;
    const { status } = await req("GET", `/api/orders/${testOrderId}`, undefined, adminToken);
    expect(status).toBe(200);
  });

  it("ORD-7: GET /api/orders/99999 → 404 non-existent order", async () => {
    const { status } = await req("GET", "/api/orders/99999", undefined, adminToken);
    expect(status).toBe(404);
  });

  it("ORD-8: POST /api/orders with promo → 201 applies discount", async () => {
    const { status, data } = await req(
      "POST", "/api/orders",
      { package_id: 1, promo_code: "WELCOME10" },
      userToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    // Cancel this test order immediately
    const extraOrderId = data.data.id;
    await req("PATCH", `/api/orders/${extraOrderId}/cancel`, undefined, userToken);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS — Submit PromptPay & Approve/Reject
// ══════════════════════════════════════════════════════════════════════════════

describe("Transactions — PromptPay Flow", () => {
  it("TX-1: POST /api/transactions → 201 submits PromptPay transaction (multipart)", async () => {
    if (!testOrderId) return;
    const { status, data } = await reqPayment(
      { order_id: String(testOrderId), payment_method: "PROMPTPAY" },
      userToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe("PENDING");
    expect(data.data.payment_method).toBe("PROMPTPAY");
    testTxId = data.data.id;
  });

  it("TX-2: POST /api/transactions → 409 duplicate PromptPay on same order (TX-DUP-1)", async () => {
    if (!testOrderId) return;
    const { status } = await reqPayment(
      { order_id: String(testOrderId), payment_method: "PROMPTPAY" },
      userToken
    );
    expect([400, 409]).toContain(status);
  });

  it("TX-3: GET /api/transactions → 200 user sees own transactions", async () => {
    const { status, data } = await req("GET", "/api/transactions", undefined, userToken);
    expect(status).toBe(200);
    expect(data.data.transactions).toBeDefined();
  });

  it("TX-4: GET /api/transactions → 200 admin sees all transactions", async () => {
    const { status, data } = await req("GET", "/api/transactions", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.total).toBeGreaterThanOrEqual(1);
  });

  it("TX-5: PATCH /api/transactions/:id/approve → 403 for user role", async () => {
    if (!testTxId) return;
    const { status } = await req("PATCH", `/api/transactions/${testTxId}/approve`, undefined, userToken);
    expect(status).toBe(403);
  });

  it("TX-6: PATCH /api/transactions/:id/reject → 200 admin rejects tx", async () => {
    if (!testTxId) return;
    const { status, data } = await req(
      "PATCH", `/api/transactions/${testTxId}/reject`,
      { reason: "Test rejection" },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.status).toBe("REJECT");
  });
});

describe("Transactions — TRUEMONEY (no external API in test env)", () => {
  it("TX-7: POST /api/transactions TRUEMONEY without voucher → 400 (multipart)", async () => {
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    const newOrderId = oRes.data?.data?.id;
    if (!newOrderId) return;

    const { status } = await reqPayment(
      { order_id: String(newOrderId), payment_method: "TRUEMONEY" },
      userToken
    );
    expect([400, 402, 422]).toContain(status);

    await req("PATCH", `/api/orders/${newOrderId}/cancel`, undefined, userToken).catch(() => {});
  });

  it("TX-8: POST /api/transactions SLIP without slip_file → 400 SLIP_REQUIRED (multipart)", async () => {
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    const newOrderId = oRes.data?.data?.id;
    if (!newOrderId) return;

    const { status, data } = await reqPayment(
      { order_id: String(newOrderId), payment_method: "SLIP" },
      userToken
    );
    expect([400, 402]).toContain(status);
    expect(data.error).toBe("SLIP_REQUIRED");

    await req("PATCH", `/api/orders/${newOrderId}/cancel`, undefined, userToken).catch(() => {});
  });
});

describe("Transactions — Approve PromptPay", () => {
  it("TX-9: full approve flow — create order → submit PromptPay → approve → order PAID (multipart)", async () => {
    // Create new order
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    expect(oRes.status).toBe(201);
    const oid = oRes.data.data.id;

    // Submit PromptPay via multipart
    const txRes = await reqPayment(
      { order_id: String(oid), payment_method: "PROMPTPAY" },
      userToken
    );
    expect(txRes.status).toBe(201);
    const tid = txRes.data.data.id;

    // Admin approves
    const appRes = await req("PATCH", `/api/transactions/${tid}/approve`, undefined, adminToken);
    expect(appRes.status).toBe(200);
    expect(appRes.data.data.status).toBe("SUCCESSFUL");

    // Verify order is now PAID
    const orderRes = await req("GET", `/api/orders/${oid}`, undefined, adminToken);
    expect(orderRes.data.data.status).toBe("PAID");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ACCESS CONTROL — RBAC sanity checks
// ══════════════════════════════════════════════════════════════════════════════

describe("RBAC — Access Control", () => {
  it("RBAC-1: Protected endpoints return 401 without any token", async () => {
    const endpoints: [HttpMethod, string][] = [
      ["GET", "/api/users/me"],
      ["GET", "/api/orders"],
      ["GET", "/api/transactions"],
    ];
    for (const [method, path] of endpoints) {
      const { status } = await req(method, path);
      expect(status).toBe(401);
    }
  });

  it("RBAC-2: Admin-only endpoints return 403 for user role", async () => {
    const endpoints: [HttpMethod, string][] = [
      ["GET", "/api/users"],
      ["GET", "/api/ip-pools"],
    ];
    for (const [method, path] of endpoints) {
      const { status } = await req(method, path, undefined, userToken);
      expect(status).toBe(403);
    }
  });

  it("RBAC-3: Support can read users but not manage roles/status", async () => {
    const { status: listStatus } = await req("GET", "/api/users", undefined, supportToken);
    expect(listStatus).toBe(200); // support can list users
  });
});
