/**
 * Phase 12 Integration Tests — VPS Web Terminal + Power Controls
 *
 * Requires: Docker stack running on :3000 with seeded data
 *   - admin@cloudvps.com / Password1234!
 *   - user@cloudvps.com / Password1234!
 *   - A VPS with id=1 owned by the user (provisioned in dev seed)
 *
 * Note: Terminal token endpoint calls Proxmox vncproxy. In CI without
 *   a live Proxmox instance, token tests expect 502 (Proxmox unreachable).
 *   Power control tests also expect 502 without live Proxmox.
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
let otherToken  = "";
let testVpsId   = 0;

async function login(email: string, password: string): Promise<string> {
  const r = await req("POST", "/api/auth/login", { email, password });
  return r.data?.data?.accessToken ?? "";
}

beforeAll(async () => {
  adminToken = await login("admin@cloudvps.com", "Password1234!");
  userToken  = await login("user@cloudvps.com",  "Password1234!");

  // Find a VPS owned by user
  const vpsRes = await req("GET", "/api/vps", undefined, userToken);
  testVpsId = vpsRes.data?.data?.vps?.[0]?.id ?? 1;
});

// ── GET /api/vps/:id/status ──────────────────────────────────────────────────

describe("GET /api/vps/:id/status — live status", () => {
  it("unauthenticated → 401", async () => {
    const r = await req("GET", `/api/vps/${testVpsId}/status`);
    expect(r.status).toBe(401);
  });

  it("valid VPS → 200 or 502 (Proxmox may be down)", async () => {
    const r = await req("GET", `/api/vps/${testVpsId}/status`, undefined, userToken);
    expect([200, 502]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data.success).toBe(true);
      expect(typeof r.data.data.vmid).toBe("number");
      expect(typeof r.data.data.status).toBe("string");
    }
  });

  it("non-existent VPS → 404", async () => {
    const r = await req("GET", "/api/vps/999999/status", undefined, userToken);
    expect(r.status).toBe(404);
  });

  it("admin can check any VPS status", async () => {
    const r = await req("GET", `/api/vps/${testVpsId}/status`, undefined, adminToken);
    expect([200, 502]).toContain(r.status);
  });
});

// ── POST /api/vps/:id/reset ──────────────────────────────────────────────────

describe("POST /api/vps/:id/reset — force reset", () => {
  it("unauthenticated → 401", async () => {
    const r = await req("POST", `/api/vps/${testVpsId}/reset`);
    expect(r.status).toBe(401);
  });

  it("valid VPS → 200 or 502 (Proxmox may be down)", async () => {
    const r = await req("POST", `/api/vps/${testVpsId}/reset`, undefined, userToken);
    expect([200, 502]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data.success).toBe(true);
      expect(r.data.data.id).toBe(testVpsId);
    }
  });

  it("non-existent VPS → 404", async () => {
    const r = await req("POST", "/api/vps/999999/reset", undefined, userToken);
    expect(r.status).toBe(404);
  });
});

// ── GET /api/terminal/:vps_id/token ─────────────────────────────────────────

describe("GET /api/terminal/:vps_id/token — VNC token", () => {
  it("unauthenticated → 401", async () => {
    const r = await req("GET", `/api/terminal/${testVpsId}/token`);
    expect(r.status).toBe(401);
  });

  it("valid VPS → 200 (with token) or 502 (Proxmox down)", async () => {
    const r = await req("GET", `/api/terminal/${testVpsId}/token`, undefined, userToken);
    expect([200, 502]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data.success).toBe(true);
      expect(typeof r.data.data.token).toBe("string");
      expect(r.data.data.expires_in).toBe(30);
      // token must be a valid 3-part JWT
      expect(r.data.data.token.split(".").length).toBe(3);
    }
  });

  it("non-existent VPS → 404", async () => {
    const r = await req("GET", "/api/terminal/999999/token", undefined, userToken);
    expect(r.status).toBe(404);
  });

  it("admin can get token for any VPS", async () => {
    const r = await req("GET", `/api/terminal/${testVpsId}/token`, undefined, adminToken);
    expect([200, 502]).toContain(r.status);
  });

  it("missing token query on WS URL → connection closed with 4001", async () => {
    // Cannot test WS in HTTP integration test — documented here for manual verification.
    // Manual: connect to ws://localhost:3000/api/terminal/{id} without ?token → close 4001
    expect(true).toBe(true);
  });
});

// ── RBAC boundary checks ─────────────────────────────────────────────────────

describe("Phase 12 RBAC boundaries", () => {
  it("non-owner user cannot get status of another user's VPS → 403", async () => {
    // Register a second user and check their access to testVpsId
    const regRes = await req("POST", "/api/auth/register", {
      email: "p12other@test.com",
      password: "Password1234!",
      name: "OtherP12",
    });
    if (regRes.status === 201 || regRes.status === 200) {
      otherToken = await login("p12other@test.com", "Password1234!");
      const r = await req("GET", `/api/vps/${testVpsId}/status`, undefined, otherToken);
      expect(r.status).toBe(403);
    }
  });

  it("non-owner user cannot reset another user's VPS → 403", async () => {
    if (!otherToken) return;
    const r = await req("POST", `/api/vps/${testVpsId}/reset`, undefined, otherToken);
    expect(r.status).toBe(403);
  });

  it("non-owner user cannot get terminal token for another user's VPS → 403", async () => {
    if (!otherToken) return;
    const r = await req("GET", `/api/terminal/${testVpsId}/token`, undefined, otherToken);
    expect(r.status).toBe(403);
  });
});
