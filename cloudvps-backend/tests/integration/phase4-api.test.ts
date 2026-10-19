/**
 * Phase 4 Integration Tests — VPS Provisioning, IP Pools, System Config
 *
 * Requires: Docker stack running (cloudvps-api on :3000)
 * OS constraint: only os.id=1 (Ubuntu 22.04 LTS, vmid=21024) available
 * Proxmox: not configured — provision will fail in background (expected)
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

// ── Auth tokens ───────────────────────────────────────────────────────────────
let adminToken = "";
let supportToken = "";
let userToken = "";

// ── Test-created IDs (for cleanup / cross-test reference) ─────────────────────
let testIpPoolId = 0;
let testIpPoolId2 = 0;
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
    throw new Error("Login failed — ensure Docker is running with seeded data");
  }
});

afterAll(async () => {
  // Cancel test order if created
  if (testOrderId) {
    await req("PATCH", `/api/orders/${testOrderId}/cancel`, undefined, userToken).catch(() => {});
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// IP POOLS — CRUD
// ══════════════════════════════════════════════════════════════════════════════

describe("IP Pools — CRUD", () => {
  // ── LIST ──────────────────────────────────────────────────────────────────
  it("IP-1: GET /api/ip-pools → 200 with seeded IP list (admin)", async () => {
    const { status, data } = await req("GET", "/api/ip-pools", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.total).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(data.data.pools)).toBe(true);
  });

  it("IP-2: GET /api/ip-pools → 403 for user role", async () => {
    const { status } = await req("GET", "/api/ip-pools", undefined, userToken);
    expect(status).toBe(403);
  });

  it("IP-3: GET /api/ip-pools → 403 for support role", async () => {
    const { status } = await req("GET", "/api/ip-pools", undefined, supportToken);
    expect(status).toBe(403);
  });

  it("IP-4: GET /api/ip-pools → 401 without token", async () => {
    const { status } = await req("GET", "/api/ip-pools");
    expect(status).toBe(401);
  });

  // ── CREATE ────────────────────────────────────────────────────────────────
  it("IP-5: POST /api/ip-pools → 201 creates PUBLIC IP (admin)", async () => {
    const { status, data } = await req(
      "POST",
      "/api/ip-pools",
      { ip: "10.88.88.88", type: "PUBLIC" },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.ip).toBe("10.88.88.88");
    expect(data.data.type).toBe("PUBLIC");
    expect(data.data.status).toBe(true);
    testIpPoolId = data.data.id;
  });

  it("IP-6: POST /api/ip-pools → 201 creates PRIVATE IP (admin)", async () => {
    const { status, data } = await req(
      "POST",
      "/api/ip-pools",
      { ip: "192.168.99.99", type: "PRIVATE" },
      adminToken
    );
    expect(status).toBe(201);
    expect(data.data.type).toBe("PRIVATE");
    testIpPoolId2 = data.data.id;
  });

  it("IP-7: POST /api/ip-pools → 400 for invalid IP format", async () => {
    const { status } = await req(
      "POST",
      "/api/ip-pools",
      { ip: "not-an-ip", type: "PUBLIC" },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("IP-8: POST /api/ip-pools → 400 for invalid type", async () => {
    const { status } = await req(
      "POST",
      "/api/ip-pools",
      { ip: "10.0.0.1", type: "INVALID" },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("IP-9: POST /api/ip-pools → 400 missing required fields", async () => {
    const { status } = await req("POST", "/api/ip-pools", { type: "PUBLIC" }, adminToken);
    expect(status).toBe(400);
  });

  // ── UPDATE (PATCH) ────────────────────────────────────────────────────────
  it("IP-10: PATCH /api/ip-pools/:id → 200 updates type (admin)", async () => {
    const { status, data } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId}`,
      { type: "PRIVATE" },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.type).toBe("PRIVATE");
  });

  it("IP-11: PATCH /api/ip-pools/:id → 200 updates IP address (admin)", async () => {
    const { status, data } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId}`,
      { ip: "10.88.88.89" },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.ip).toBe("10.88.88.89");
  });

  it("IP-12: PATCH /api/ip-pools/:id → 400 for invalid IP in update", async () => {
    const { status } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId}`,
      { ip: "bad-ip" },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("IP-13: PATCH /api/ip-pools/:id → 404 for non-existent pool", async () => {
    const { status } = await req(
      "PATCH",
      "/api/ip-pools/999999",
      { type: "PUBLIC" },
      adminToken
    );
    expect(status).toBe(404);
  });

  it("IP-14: PATCH /api/ip-pools/abc → 400 for invalid ID format", async () => {
    const { status } = await req(
      "PATCH",
      "/api/ip-pools/abc",
      { type: "PUBLIC" },
      adminToken
    );
    expect(status).toBe(400);
  });

  // ── TOGGLE STATUS ─────────────────────────────────────────────────────────
  it("IP-15: PATCH /api/ip-pools/:id/status → 200 disables pool (admin)", async () => {
    const { status, data } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId}/status`,
      undefined,
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.status).toBe(false);
  });

  it("IP-16: PATCH /api/ip-pools/:id/status → 200 re-enables pool (admin)", async () => {
    const { status, data } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId}/status`,
      undefined,
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.status).toBe(true);
  });

  it("IP-17: PATCH /api/ip-pools/:id/status → 404 non-existent pool", async () => {
    const { status } = await req(
      "PATCH",
      "/api/ip-pools/999999/status",
      undefined,
      adminToken
    );
    expect(status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS — Read Endpoints
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS — Read Endpoints", () => {
  it("VPS-1: GET /api/vps → 200 for user (own list)", async () => {
    const { status, data } = await req("GET", "/api/vps", undefined, userToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.vps)).toBe(true);
  });

  it("VPS-2: GET /api/vps → 200 for admin (all list)", async () => {
    const { status, data } = await req("GET", "/api/vps", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("VPS-3: GET /api/vps → 200 for support (all list)", async () => {
    const { status, data } = await req("GET", "/api/vps", undefined, supportToken);
    expect(status).toBe(200);
  });

  it("VPS-4: GET /api/vps → 401 without token", async () => {
    const { status } = await req("GET", "/api/vps");
    expect(status).toBe(401);
  });

  it("VPS-5: GET /api/vps?page=1&limit=5 → 200 with pagination", async () => {
    const { status, data } = await req("GET", "/api/vps?page=1&limit=5", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.page).toBe(1);
    expect(data.data.limit).toBe(5);
  });

  it("VPS-6: GET /api/vps/:id → 404 for non-existent VPS", async () => {
    const { status } = await req("GET", "/api/vps/999999", undefined, userToken);
    expect(status).toBe(404);
  });

  it("VPS-7: GET /api/vps/:id → 400 for invalid ID (letters)", async () => {
    const { status } = await req("GET", "/api/vps/abc", undefined, userToken);
    expect(status).toBe(400);
  });

  it("VPS-8: GET /api/vps/:id → 401 without token", async () => {
    const { status } = await req("GET", "/api/vps/1");
    expect(status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS — Queue (Admin/Support only)
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS — Queue", () => {
  it("VPS-9: GET /api/vps/queue → 200 for admin", async () => {
    const { status, data } = await req("GET", "/api/vps/queue", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("VPS-10: GET /api/vps/queue → 200 for support", async () => {
    const { status } = await req("GET", "/api/vps/queue", undefined, supportToken);
    expect(status).toBe(200);
  });

  it("VPS-11: GET /api/vps/queue → 403 for user role", async () => {
    const { status } = await req("GET", "/api/vps/queue", undefined, userToken);
    expect(status).toBe(403);
  });

  it("VPS-12: GET /api/vps/queue → 401 without token", async () => {
    const { status } = await req("GET", "/api/vps/queue");
    expect(status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS — Actions (start/stop/reboot)
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS — Actions (start/stop/reboot)", () => {
  it("VPS-13: POST /api/vps/999/start → 404 non-existent VPS", async () => {
    const { status } = await req("POST", "/api/vps/999999/start", undefined, userToken);
    expect(status).toBe(404);
  });

  it("VPS-14: POST /api/vps/abc/start → 400 invalid VPS ID", async () => {
    const { status } = await req("POST", "/api/vps/abc/start", undefined, userToken);
    expect(status).toBe(400);
  });

  it("VPS-15: POST /api/vps/999/stop → 404 non-existent VPS", async () => {
    const { status } = await req("POST", "/api/vps/999999/stop", undefined, userToken);
    expect(status).toBe(404);
  });

  it("VPS-16: POST /api/vps/abc/stop → 400 invalid VPS ID", async () => {
    const { status } = await req("POST", "/api/vps/abc/stop", undefined, userToken);
    expect(status).toBe(400);
  });

  it("VPS-17: POST /api/vps/999/reboot → 404 non-existent VPS", async () => {
    const { status } = await req("POST", "/api/vps/999999/reboot", undefined, userToken);
    expect(status).toBe(404);
  });

  it("VPS-18: POST /api/vps/abc/reboot → 400 invalid VPS ID", async () => {
    const { status } = await req("POST", "/api/vps/abc/reboot", undefined, userToken);
    expect(status).toBe(400);
  });

  it("VPS-19: POST /api/vps/1/start → 401 without token", async () => {
    const { status } = await req("POST", "/api/vps/1/start");
    expect(status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS — Provision (manual retry)
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS — Manual Provision", () => {
  it("VPS-20: POST /api/vps/provision/999 → 202 accepted (fire-and-forget)", async () => {
    const { status, data } = await req(
      "POST",
      "/api/vps/provision/999999",
      undefined,
      adminToken
    );
    expect(status).toBe(202);
    expect(data.success).toBe(true);
  });

  it("VPS-21: POST /api/vps/provision/abc → 400 invalid order ID", async () => {
    const { status } = await req("POST", "/api/vps/provision/abc", undefined, adminToken);
    expect(status).toBe(400);
  });

  it("VPS-22: POST /api/vps/provision/1 → 403 for user role", async () => {
    const { status } = await req("POST", "/api/vps/provision/1", undefined, userToken);
    expect(status).toBe(403);
  });

  it("VPS-23: POST /api/vps/provision/1 → 401 without token", async () => {
    const { status } = await req("POST", "/api/vps/provision/1");
    expect(status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FULL PROVISION FLOW (Order → PAID → temp_vps → queue)
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS — Full Provision Flow (Proxmox not configured → expected failure)", () => {
  it("VPS-FLOW-1: create order with package_id=1 (os_id=1, Ubuntu 22.04)", async () => {
    const { status, data } = await req(
      "POST",
      "/api/orders",
      { package_id: 1 },
      userToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testOrderId = data.data.id;
    expect(testOrderId).toBeGreaterThan(0);
  });

  it("VPS-FLOW-2: submit PROMPTPAY transaction for order", async () => {
    const { status, data } = await req(
      "POST",
      "/api/transactions",
      { order_id: testOrderId, payment_method: "PROMPTPAY" },
      userToken
    );
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    testTxId = data.data.id;
    expect(testTxId).toBeGreaterThan(0);
  });

  it("VPS-FLOW-3: admin approves PROMPTPAY → order PAID → temp_vps created", async () => {
    const { status, data } = await req(
      "PATCH",
      `/api/transactions/${testTxId}/approve`,
      undefined,
      adminToken
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("VPS-FLOW-4: provision queue shows temp_vps after provision fails (no Proxmox)", async () => {
    // Wait for fire-and-forget provision to fail (should be fast: no Proxmox config)
    await Bun.sleep(2000);
    const { status, data } = await req("GET", "/api/vps/queue", undefined, adminToken);
    expect(status).toBe(200);
    // temp_vps should still exist because provision fails (no vps record created = no delete)
    const inQueue = data.data.some((entry: any) => entry.order_id === testOrderId);
    expect(inQueue).toBe(true);
  });

  it("VPS-FLOW-5: manual retry provision returns 202 immediately", async () => {
    const { status, data } = await req(
      "POST",
      `/api/vps/provision/${testOrderId}`,
      undefined,
      adminToken
    );
    expect(status).toBe(202);
    expect(data.success).toBe(true);
  });

  it("VPS-FLOW-6: no vps record created (provision failed due to no Proxmox config)", async () => {
    // Provision fails immediately because Proxmox config is null → env fallback also null
    await Bun.sleep(1000);
    const { data } = await req("GET", "/api/vps", undefined, adminToken);
    // The test order's VPS should NOT exist
    const provisioned = data.data.vps.some((v: any) => v.orders_id === testOrderId);
    expect(provisioned).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM CONFIG
// ══════════════════════════════════════════════════════════════════════════════

describe("System Config", () => {
  // ── READ (admin + support) ────────────────────────────────────────────────
  it("SYSCFG-1: GET /api/system-configs → 200 returns 18 seeded keys (admin)", async () => {
    const { status, data } = await req("GET", "/api/system-configs", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBe(18);
  });

  it("SYSCFG-2: GET /api/system-configs → 200 for support role", async () => {
    const { status, data } = await req("GET", "/api/system-configs", undefined, supportToken);
    expect(status).toBe(200);
    expect(data.data.length).toBe(18);
  });

  it("SYSCFG-3: GET /api/system-configs → 403 for user role", async () => {
    const { status } = await req("GET", "/api/system-configs", undefined, userToken);
    expect(status).toBe(403);
  });

  it("SYSCFG-4: GET /api/system-configs → 401 without token", async () => {
    const { status } = await req("GET", "/api/system-configs");
    expect(status).toBe(401);
  });

  it("SYSCFG-5: GET /api/system-configs/:key → 200 returns specific key (admin)", async () => {
    const { status, data } = await req(
      "GET",
      "/api/system-configs/proxmox.host",
      undefined,
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.key).toBe("proxmox.host");
  });

  it("SYSCFG-6: GET /api/system-configs/:key → 200 returns specific key (support)", async () => {
    const { status, data } = await req(
      "GET",
      "/api/system-configs/proxmox.node",
      undefined,
      supportToken
    );
    expect(status).toBe(200);
    expect(data.data.key).toBe("proxmox.node");
  });

  it("SYSCFG-7: GET /api/system-configs/:key → 404 for non-existent key", async () => {
    const { status } = await req(
      "GET",
      "/api/system-configs/nonexistent.key",
      undefined,
      adminToken
    );
    expect(status).toBe(404);
  });

  // ── SECRET MASKING ────────────────────────────────────────────────────────
  it("SYSCFG-8: secret key (proxmox.token_secret) value is null → masked as null not ***", async () => {
    const { data } = await req(
      "GET",
      "/api/system-configs/proxmox.token_secret",
      undefined,
      adminToken
    );
    // Value is null (not set) → returned as null (not masked with ***)
    expect(data.data.value).toBeNull();
    expect(data.data.is_secret).toBe(true);
  });

  // ── UPDATE (admin only) ───────────────────────────────────────────────────
  it("SYSCFG-9: PUT /api/system-configs/:key → 200 sets value (admin)", async () => {
    const { status, data } = await req(
      "PUT",
      "/api/system-configs/proxmox.node",
      { value: "pve-test" },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("SYSCFG-10: GET /api/system-configs/proxmox.node → value updated", async () => {
    const { data } = await req(
      "GET",
      "/api/system-configs/proxmox.node",
      undefined,
      adminToken
    );
    expect(data.data.value).toBe("pve-test");
  });

  it("SYSCFG-11: PUT /api/system-configs/:key → 200 resets value to null (admin)", async () => {
    const { status } = await req(
      "PUT",
      "/api/system-configs/proxmox.node",
      { value: null },
      adminToken
    );
    expect(status).toBe(200);
  });

  it("SYSCFG-12: GET /api/system-configs/proxmox.node → null after reset", async () => {
    const { data } = await req(
      "GET",
      "/api/system-configs/proxmox.node",
      undefined,
      adminToken
    );
    expect(data.data.value).toBeNull();
  });

  it("SYSCFG-13: PUT /api/system-configs/:key → 403 for support role", async () => {
    const { status } = await req(
      "PUT",
      "/api/system-configs/proxmox.host",
      { value: "10.0.0.1" },
      supportToken
    );
    expect(status).toBe(403);
  });

  it("SYSCFG-14: PUT /api/system-configs/:key → 403 for user role", async () => {
    const { status } = await req(
      "PUT",
      "/api/system-configs/proxmox.host",
      { value: "10.0.0.1" },
      userToken
    );
    expect(status).toBe(403);
  });

  it("SYSCFG-15: PUT /api/system-configs/nonexistent → 404", async () => {
    const { status } = await req(
      "PUT",
      "/api/system-configs/nonexistent.key",
      { value: "test" },
      adminToken
    );
    expect(status).toBe(404);
  });

  it("SYSCFG-16: PUT /api/system-configs/:key → 400 empty string value", async () => {
    const { status } = await req(
      "PUT",
      "/api/system-configs/proxmox.host",
      { value: "" },
      adminToken
    );
    expect(status).toBe(400);
  });

  // ── CATEGORY GROUPING ─────────────────────────────────────────────────────
  it("SYSCFG-17: keys span Proxmox/Provisioning, mikrotik, and pricing categories", async () => {
    const { data } = await req("GET", "/api/system-configs", undefined, adminToken);
    const categories = new Set<string>(data.data.map((c: any) => c.category));
    // Proxmox keys use "Proxmox" or "Provisioning" categories
    const hasProxmox = categories.has("Proxmox") || categories.has("Provisioning");
    expect(hasProxmox).toBe(true);
    expect(categories.has("mikrotik")).toBe(true);
    expect(categories.has("pricing")).toBe(true);
  });

  it("SYSCFG-18: secret masking — token_secret set → returns *** (admin)", async () => {
    // Set a value first
    await req(
      "PUT",
      "/api/system-configs/proxmox.token_secret",
      { value: "super-secret-uuid" },
      adminToken
    );
    const { data } = await req(
      "GET",
      "/api/system-configs/proxmox.token_secret",
      undefined,
      adminToken
    );
    expect(data.data.value).toBe("***");
    // Reset
    await req("PUT", "/api/system-configs/proxmox.token_secret", { value: null }, adminToken);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// IP POOL — Active Assignment Guard (VPS-M1 + IP-M1 fixes)
// ══════════════════════════════════════════════════════════════════════════════

describe("IP Pool — Active Assignment Guards", () => {
  it("IP-GUARD-1: PATCH IP in use → 409 (only testable after provision creates assignment)", async () => {
    // Without a real VPS provisioned, we verify the endpoint behavior for a free IP
    // This tests the "no active assignment" path (should succeed)
    if (!testIpPoolId) return;
    const { status } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId}`,
      { ip: "10.88.88.90" },
      adminToken
    );
    // testIpPoolId was created fresh and has no active assignment → should succeed
    expect(status).toBe(200);
  });

  it("IP-GUARD-2: disable IP pool with no active VPS → 200", async () => {
    if (!testIpPoolId2) return;
    const { status } = await req(
      "PATCH",
      `/api/ip-pools/${testIpPoolId2}/status`,
      undefined,
      adminToken
    );
    expect(status).toBe(200);
  });
});
