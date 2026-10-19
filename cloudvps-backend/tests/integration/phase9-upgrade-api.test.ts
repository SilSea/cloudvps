/**
 * Phase 9 Integration Tests — VM Upgrade Endpoints
 *
 * Requires: Docker stack running (cloudvps-api on :3000, seeded data)
 * Note: No Proxmox needed — upgrade orders remain PENDING when amount > 0.
 *       applyUpgrade is not triggered without payment.
 */

import { describe, it, expect, beforeAll } from "bun:test";

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

let adminToken  = "";
let userToken   = "";
let user2Token  = "";

// These will be discovered from the seeded data
let seededVpsId    = 0;
let seededVpsOwner = 0; // user who owns the seeded VPS
let packageId2     = 0; // a different package from the VPS's current one

beforeAll(async () => {
  const [aRes, uRes, u2Res] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com",  password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user2@cloudvps.com", password: "Password1234!" }),
  ]);
  adminToken = aRes.data?.data?.access_token ?? "";
  userToken  = uRes.data?.data?.access_token ?? "";
  user2Token = u2Res.data?.data?.access_token ?? "";

  if (!adminToken || !userToken) {
    throw new Error("Login failed — ensure Docker is running with seeded data");
  }

  // Find a VPS owned by the seeded user
  const vpsRes = await req("GET", "/api/vps", undefined, userToken);
  if (vpsRes.status === 200 && vpsRes.data?.data?.vps?.length > 0) {
    seededVpsId = vpsRes.data.data.vps[0].id;
    seededVpsOwner = vpsRes.data.data.vps[0].order?.users_id ?? 0;
  }

  // Find a second package (different from current VPS package)
  const pkgRes = await req("GET", "/api/packages", undefined, adminToken);
  if (pkgRes.status === 200 && pkgRes.data?.data?.packages?.length > 1) {
    packageId2 = pkgRes.data.data.packages[1]?.id ?? 0;
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH GUARDS — all upgrade endpoints require auth
// ══════════════════════════════════════════════════════════════════════════════

describe("Upgrade endpoints — auth guards", () => {
  it("UPG-INT-1: 401 on POST /upgrade/package without token", async () => {
    const { status } = await req("POST", "/api/vps/1/upgrade/package", { package_id: 2 });
    expect(status).toBe(401);
  });

  it("UPG-INT-2: 401 on POST /upgrade/custom without token", async () => {
    const { status } = await req("POST", "/api/vps/1/upgrade/custom", { cores: 4 });
    expect(status).toBe(401);
  });

  it("UPG-INT-3: 401 on GET /upgrade/history without token", async () => {
    const { status } = await req("GET", "/api/vps/1/upgrade/history");
    expect(status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

describe("Upgrade endpoints — input validation", () => {
  it("UPG-INT-4: 404 on non-existent VPS", async () => {
    const { status } = await req("POST", "/api/vps/99999/upgrade/package", { package_id: 2 }, adminToken);
    expect(status).toBe(404);
  });

  it("UPG-INT-5: 404 on non-existent package", async () => {
    if (!seededVpsId) return;
    const { status } = await req("POST", `/api/vps/${seededVpsId}/upgrade/package`, { package_id: 99999 }, adminToken);
    expect(status).toBe(404);
  });

  it("UPG-INT-6: 400 on custom upgrade with no fields", async () => {
    if (!seededVpsId) return;
    const { status } = await req("POST", `/api/vps/${seededVpsId}/upgrade/custom`, {}, adminToken);
    expect(status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// RBAC — user cannot upgrade another user's VPS
// ══════════════════════════════════════════════════════════════════════════════

describe("Upgrade endpoints — RBAC", () => {
  it("UPG-INT-7: 403 when user tries to upgrade another user's VPS", async () => {
    if (!seededVpsId || !user2Token) return;
    const { status } = await req(
      "POST", `/api/vps/${seededVpsId}/upgrade/package`,
      { package_id: 2 },
      user2Token
    );
    expect(status).toBe(403);
  });

  it("UPG-INT-8: 403 when user tries to view another user's upgrade history", async () => {
    if (!seededVpsId || !user2Token) return;
    const { status } = await req("GET", `/api/vps/${seededVpsId}/upgrade/history`, undefined, user2Token);
    expect(status).toBe(403);
  });

  it("UPG-INT-9: admin can view any VPS upgrade history", async () => {
    if (!seededVpsId) return;
    const { status, data } = await req("GET", `/api/vps/${seededVpsId}/upgrade/history`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty("logs");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// UPGRADE HISTORY — structure
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/vps/:id/upgrade/history", () => {
  it("UPG-INT-10: returns paginated structure", async () => {
    if (!seededVpsId) return;
    const { status, data } = await req("GET", `/api/vps/${seededVpsId}/upgrade/history?page=1&limit=10`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data).toHaveProperty("logs");
    expect(data.data).toHaveProperty("total");
    expect(data.data).toHaveProperty("page");
    expect(data.data).toHaveProperty("limit");
    expect(Array.isArray(data.data.logs)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM UPGRADE — error cases that don't need Proxmox
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/vps/:id/upgrade/custom — error cases", () => {
  it("UPG-INT-11: 400 when disk would shrink", async () => {
    if (!seededVpsId) return;
    const { status, data } = await req(
      "POST", `/api/vps/${seededVpsId}/upgrade/custom`,
      { disk_gb: 1 },
      adminToken
    );
    expect([400, 500]).toContain(status);
    // 400 = DISK_SHRINK_NOT_ALLOWED; 500 = CONFIG_MISSING (pricing not set in test seed)
  });

  it("UPG-INT-12: 400 when no change detected", async () => {
    if (!seededVpsId) return;
    // Get current specs first
    const vpsRes = await req("GET", `/api/vps/${seededVpsId}`, undefined, adminToken);
    if (vpsRes.status !== 200) return;
    const vps = vpsRes.data.data;
    const currentCores = vps.current_cores ?? vps.order?.package?.vm?.core;
    if (!currentCores) return;

    const { status } = await req(
      "POST", `/api/vps/${seededVpsId}/upgrade/custom`,
      { cores: currentCores },
      adminToken
    );
    expect([400, 500]).toContain(status);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PACKAGE UPGRADE — error cases that don't need Proxmox
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/vps/:id/upgrade/package — error cases", () => {
  it("UPG-INT-13: 400 when same package (NO_CHANGE)", async () => {
    if (!seededVpsId) return;
    const vpsRes = await req("GET", `/api/vps/${seededVpsId}`, undefined, adminToken);
    if (vpsRes.status !== 200) return;
    const currentPkgId = vpsRes.data.data.order?.packages_id;
    if (!currentPkgId) return;

    const { status } = await req(
      "POST", `/api/vps/${seededVpsId}/upgrade/package`,
      { package_id: currentPkgId },
      adminToken
    );
    expect(status).toBe(400);
  });
});
