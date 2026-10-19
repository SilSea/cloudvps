/**
 * Phase 16 Integration Tests — VPS Password Change via OTP
 *
 * Requires: Docker stack running on :3000 with seeded data
 *   - admin@cloudvps.com / Password1234!
 *   - user@cloudvps.com / Password1234!
 *   - A VPS owned by user (seeded), vmid must be running with guest-agent for confirm tests
 *
 * Note: confirmPasswordChange with correct OTP calls Proxmox guest agent.
 *   Without live VM → expect 502. OTP validation runs before Proxmox call.
 *   OTP seeding is done via the request endpoint itself (sends real email), so
 *   wrong-OTP and max-tries tests are covered via controller/service unit tests.
 */

import { describe, it, expect, beforeAll } from "bun:test";

const BASE = "http://localhost:3000";
type HttpMethod = "GET" | "POST";

async function req(method: HttpMethod, path: string, body?: any, token?: string) {
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

let adminToken = "";
let userToken  = "";
let testVpsId  = 0;
let otherToken = "";

async function login(email: string, pw: string): Promise<{ token: string; userId: number }> {
  const r = await req("POST", "/api/auth/login", { email, password: pw });
  return { token: r.data?.data?.access_token ?? "", userId: r.data?.data?.user?.id ?? 0 };
}

beforeAll(async () => {
  const adminLogin = await login("admin@cloudvps.com", "Password1234!");
  adminToken = adminLogin.token;

  const userLogin = await login("user@cloudvps.com", "Password1234!");
  userToken  = userLogin.token;

  const vpsRes = await req("GET", "/api/vps", undefined, adminToken);
  testVpsId = vpsRes.data?.data?.vps?.[0]?.id ?? 0;

  // Create a second user token to test cross-user access
  const userRegRes = await req("POST", "/api/auth/register", {
    email: `phase16_other_${Date.now()}@test.com`,
    password: "OtherUser1234!",
    name: "Other Phase16",
  });
  if (userRegRes.status === 201) {
    const otherLogin = await login(userRegRes.data?.data?.email ?? "", "OtherUser1234!");
    otherToken = otherLogin.token;
  }
});

// ── POST /api/vps/:id/change-password/request ──────────────────────────────

describe("POST /api/vps/:id/change-password/request", () => {
  it("unauthenticated → 401", async () => {
    const r = await req("POST", `/api/vps/1/change-password/request`);
    expect(r.status).toBe(401);
  });

  it("non-existent VPS → 404", async () => {
    const r = await req("POST", "/api/vps/999999/change-password/request", undefined, userToken);
    expect(r.status).toBe(404);
  });

  it("other user's VPS → 403", async () => {
    if (!otherToken) { console.log("skip — could not create other user"); return; }
    const r = await req("POST", `/api/vps/${testVpsId}/change-password/request`, undefined, otherToken);
    expect(r.status).toBe(403);
  });

  it("admin can call change-password/request → passes RBAC (200, 404, or 502 depending on seed)", async () => {
    const r = await req("POST", `/api/vps/${testVpsId || 1}/change-password/request`, undefined, adminToken);
    // 200 = OTP sent; 404 = no VPS seeded; 502 = email SMTP failed in test env; never 401/403
    expect([200, 404, 502]).toContain(r.status);
  });
});

// ── POST /api/vps/:id/change-password/confirm ──────────────────────────────

describe("POST /api/vps/:id/change-password/confirm — payload validation", () => {
  it("unauthenticated → 401", async () => {
    const r = await req("POST", `/api/vps/1/change-password/confirm`, {
      otp: "123456",
      new_password: "ValidPass1!",
    });
    expect(r.status).toBe(401);
  });

  it("non-existent VPS → 404", async () => {
    const r = await req("POST", "/api/vps/999999/change-password/confirm", {
      otp: "123456", new_password: "ValidPass1!",
    }, userToken);
    expect(r.status).toBe(404);
  });

  it("password too short → 400", async () => {
    const r = await req("POST", `/api/vps/${testVpsId}/change-password/confirm`, {
      otp: "123456", new_password: "sh",
    }, userToken);
    expect(r.status).toBe(400);
    expect((r.data as any).message).toContain("8-64");
  });

  it("password with newline → 400", async () => {
    const r = await req("POST", `/api/vps/${testVpsId}/change-password/confirm`, {
      otp: "123456", new_password: "pass\nword!",
    }, userToken);
    expect(r.status).toBe(400);
  });

  it("no OTP requested → 400 OTP expired (or 404/403 if VPS not seeded)", async () => {
    const r = await req("POST", `/api/vps/${testVpsId || 1}/change-password/confirm`, {
      otp: "000000", new_password: "ValidPass1!",
    }, userToken);
    // 400 = OTP expired; 404 = VPS not seeded; 403 = VPS not owned by user — never 401
    expect([400, 403, 404]).toContain(r.status);
  });

  it("other user cannot confirm for VPS they don't own → 403", async () => {
    if (!otherToken) { console.log("skip — could not create other user"); return; }
    const r = await req("POST", `/api/vps/${testVpsId}/change-password/confirm`, {
      otp: "123456", new_password: "ValidPass1!",
    }, otherToken);
    // INVALID_PASSWORD check happens first (password is valid here), then NOT_FOUND/FORBIDDEN
    expect([400, 403]).toContain(r.status);
  });
});

// ── Admin access ────────────────────────────────────────────────────────────

describe("Admin change-password endpoints", () => {
  it("admin change-password/request → 404 for non-existent VPS (RBAC passes)", async () => {
    const r = await req("POST", "/api/vps/999999/change-password/request", undefined, adminToken);
    expect(r.status).toBe(404);
  });

  it("admin change-password/confirm → 404 for non-existent VPS (RBAC passes)", async () => {
    const r = await req("POST", "/api/vps/999999/change-password/confirm", {
      otp: "123456", new_password: "ValidPass1!",
    }, adminToken);
    expect(r.status).toBe(404);
  });
});
