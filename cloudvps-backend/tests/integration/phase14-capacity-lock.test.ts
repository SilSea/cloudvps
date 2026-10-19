/**
 * Phase 14 Integration Tests — Capacity Lock
 *
 * Requires: Docker stack running on :3000 with seeded data
 *   admin@cloudvps.com / Password1234!
 *   support@cloudvps.com / Password1234!
 *   user@cloudvps.com / Password1234!
 *
 * Proxmox NOT required — fail-open paths are tested.
 */

import { describe, it, expect, beforeAll } from "bun:test";

const BASE = "http://localhost:3000";
type HttpMethod = "GET" | "POST";

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

let adminToken   = "";
let supportToken = "";
let userToken    = "";

beforeAll(async () => {
  const [a, s, u] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com",   password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "support@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com",    password: "Password1234!" }),
  ]);
  adminToken   = a.data?.data?.access_token ?? "";
  supportToken = s.data?.data?.access_token ?? "";
  userToken    = u.data?.data?.access_token ?? "";
  if (!adminToken) throw new Error("Admin login failed — ensure Docker is running with seeded data");
});

// =============================================================================
// GET /api/packages — available field
// =============================================================================

describe("GET /api/packages — available field (F18)", () => {
  it("CAP-INT-1: returns 200 with package list", async () => {
    const { status, data } = await req("GET", "/api/packages");
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("CAP-INT-2: each package has boolean 'available' field", async () => {
    const { data } = await req("GET", "/api/packages");
    expect(data.data.length).toBeGreaterThan(0);
    for (const pkg of data.data) {
      expect(typeof pkg.available).toBe("boolean");
    }
  });

  it("CAP-INT-3: packages are available=true when Proxmox unreachable (fail open)", async () => {
    // In test env Proxmox is not configured → getSnapshot() returns null → all true
    const { data } = await req("GET", "/api/packages");
    for (const pkg of data.data) {
      expect(pkg.available).toBe(true);
    }
  });
});

// =============================================================================
// GET /api/system/capacity — RBAC
// =============================================================================

describe("GET /api/system/capacity — RBAC (F18)", () => {
  it("CAP-INT-4: returns 401 without auth token", async () => {
    const { status } = await req("GET", "/api/system/capacity");
    expect(status).toBe(401);
  });

  it("CAP-INT-5: returns 403 for USER role", async () => {
    const { status } = await req("GET", "/api/system/capacity", undefined, userToken);
    expect(status).toBe(403);
  });

  it("CAP-INT-6: returns 503 for ADMIN when Proxmox unreachable", async () => {
    // 503 = getNodeSnapshot() threw (Proxmox not configured in test env)
    const { status } = await req("GET", "/api/system/capacity", undefined, adminToken);
    expect(status).toBe(503);
  });

  it("CAP-INT-7: returns 503 for SUPPORT when Proxmox unreachable", async () => {
    const { status } = await req("GET", "/api/system/capacity", undefined, supportToken);
    expect(status).toBe(503);
  });

  it("CAP-INT-8: 503 response has success=false and message", async () => {
    const { data } = await req("GET", "/api/system/capacity", undefined, adminToken);
    expect(data.success).toBe(false);
    expect(typeof data.message).toBe("string");
  });
});

// =============================================================================
// GET /health — extended shape
// =============================================================================

describe("GET /health — deep health check", () => {
  it("CAP-INT-9: returns services object with db, redis, proxmox keys", async () => {
    const { data } = await req("GET", "/health");
    expect(data.services).toBeDefined();
    expect(typeof data.services.db.status).toBe("string");
    expect(typeof data.services.redis.status).toBe("string");
    expect(typeof data.services.proxmox.status).toBe("string");
  });

  it("CAP-INT-10: db and redis report latencyMs as number", async () => {
    const { data } = await req("GET", "/health");
    expect(typeof data.services.db.latencyMs).toBe("number");
    expect(typeof data.services.redis.latencyMs).toBe("number");
  });

  it("CAP-INT-11: returns 503 when Proxmox is down (test env)", async () => {
    // Proxmox not configured in test env → proxmox.status = 'error' → HTTP 503
    const { status, data } = await req("GET", "/health");
    expect(status).toBe(503);
    expect(data.status).toBe("degraded");
    expect(data.services.proxmox.status).toBe("error");
  });
});

// =============================================================================
// POST /api/orders — force field accepted by schema
// =============================================================================

describe("POST /api/orders — force field (F18)", () => {
  it("CAP-INT-12: schema accepts force=true without 422", async () => {
    // package_id 9999 → PACKAGE_NOT_FOUND (404) — not a schema rejection
    const { status, data } = await req(
      "POST", "/api/orders",
      { package_id: 9999, force: true },
      userToken
    );
    expect(status).not.toBe(422);
    expect(data.error).toBe("PACKAGE_NOT_FOUND");
  });

  it("CAP-INT-13: order creation works normally when capacity check fails open", async () => {
    // Get first active package from the list
    const { data: pkgList } = await req("GET", "/api/packages");
    const firstPkg = pkgList.data?.[0];
    if (!firstPkg) return; // skip if no packages seeded

    // Create order — capacity check fails open (Proxmox unreachable) → proceeds to normal flow
    const { status, data } = await req(
      "POST", "/api/orders",
      { package_id: firstPkg.id },
      userToken
    );
    // Either 201 (order created) or some domain error — NOT a capacity block (409 INSUFFICIENT)
    expect(data.error).not.toBe("INSUFFICIENT_RESOURCES");
    expect([201, 400, 404, 409].includes(status)).toBe(true);
  });
});
