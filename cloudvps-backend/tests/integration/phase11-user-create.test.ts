/**
 * Phase 11 Integration Tests — Admin/Support Create User API
 *
 * Requires: Docker stack running on :3000 with seeded data
 *   - admin@cloudvps.com / Password1234! (role: admin)
 *   - support@cloudvps.com / Password1234! (role: support)
 *   - user@cloudvps.com / Password1234! (role: users)
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

let adminToken   = "";
let supportToken = "";
let userToken    = "";
const createdUserEmails: string[] = [];

const baseUserBody = (suffix: string) => ({
  email:      `test-created-${suffix}@integration.test`,
  first_name: "Integration",
  last_name:  "Test",
  phone:      "0812345678",
  address1:   "1 Test Street",
  address3:   "District",
  address4:   "City",
  address5:   "10100",
  address6:   "Thailand",
});

beforeAll(async () => {
  const [aRes, sRes, uRes] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com",   password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "support@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com",    password: "Password1234!" }),
  ]);
  adminToken   = aRes.data?.data?.access_token ?? "";
  supportToken = sRes.data?.data?.access_token ?? "";
  userToken    = uRes.data?.data?.access_token ?? "";

  if (!adminToken || !supportToken || !userToken) {
    throw new Error("Login failed — ensure Docker is running with seeded data");
  }
});

afterAll(async () => {
  // Disable created test accounts so they don't pollute other tests.
  if (createdUserEmails.length === 0) return;
  const listRes = await req("GET", "/api/users?limit=100", undefined, adminToken);
  const users: any[] = listRes.data?.data?.users ?? [];
  await Promise.all(
    createdUserEmails
      .map((email) => users.find((u: any) => u.email === email))
      .filter(Boolean)
      .map((u: any) => req("PATCH", `/api/users/${u.id}/status`, undefined, adminToken))
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH GUARD
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/users — auth guard", () => {
  it("UC-INT-1: 401 without token", async () => {
    const { status } = await req("POST", "/api/users", baseUserBody("noauth"));
    expect(status).toBe(401);
  });

  it("UC-INT-2: 403 for users role", async () => {
    const { status } = await req("POST", "/api/users", baseUserBody("userauth"), userToken);
    expect(status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — success paths
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/users — admin success", () => {
  it("UC-INT-3: admin creates user — returns 200 with new user data", async () => {
    const email = baseUserBody("admin-create").email;
    const { status, data } = await req("POST", "/api/users", baseUserBody("admin-create"), adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.email).toBe(email);
    createdUserEmails.push(email);
  });

  it("UC-INT-4: created user has is_verify=true", async () => {
    const email = baseUserBody("admin-verify").email;
    const { data } = await req("POST", "/api/users", baseUserBody("admin-verify"), adminToken);
    expect(data.data.is_verify).toBe(true);
    createdUserEmails.push(email);
  });

  it("UC-INT-5: created user has role users", async () => {
    const email = baseUserBody("admin-role").email;
    const { data } = await req("POST", "/api/users", baseUserBody("admin-role"), adminToken);
    expect(data.data.role.role_name).toBe("users");
    createdUserEmails.push(email);
  });

  it("UC-INT-6: password_generated=true when no password in body", async () => {
    const body = baseUserBody("admin-genpw");
    const { data } = await req("POST", "/api/users", body, adminToken);
    expect(data.password_generated).toBe(true);
    createdUserEmails.push(body.email);
  });

  it("UC-INT-7: password_generated=false when password provided", async () => {
    const body = { ...baseUserBody("admin-custpw"), password: "MyPassw0rd!" };
    const { data } = await req("POST", "/api/users", body, adminToken);
    expect(data.password_generated).toBe(false);
    createdUserEmails.push(body.email);
  });

  it("UC-INT-8: created user can login with provided password", async () => {
    const body = { ...baseUserBody("admin-logintest"), password: "TestLogin9!" };
    const createRes = await req("POST", "/api/users", body, adminToken);
    expect(createRes.status).toBe(200);
    createdUserEmails.push(body.email);

    const loginRes = await req("POST", "/api/auth/login", {
      email:    body.email,
      password: body.password,
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.data.data?.access_token).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORT — success paths
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/users — support success", () => {
  it("UC-INT-9: support can create user", async () => {
    const email = baseUserBody("support-create").email;
    const { status, data } = await req("POST", "/api/users", baseUserBody("support-create"), supportToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    createdUserEmails.push(email);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATION
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/users — validation", () => {
  it("UC-INT-10: 400 on invalid email format", async () => {
    const { status } = await req(
      "POST", "/api/users",
      { ...baseUserBody("invalid"), email: "not-an-email" },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("UC-INT-11: 400 on phone with wrong format", async () => {
    const { status } = await req(
      "POST", "/api/users",
      { ...baseUserBody("badphone"), phone: "123" },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("UC-INT-12: 400 on missing required field (first_name)", async () => {
    const body = baseUserBody("missing-name");
    const { first_name, ...withoutName } = body as any;
    const { status } = await req("POST", "/api/users", withoutName, adminToken);
    expect(status).toBe(400);
  });

  it("UC-INT-13: 400 on password shorter than 8 chars", async () => {
    const { status } = await req(
      "POST", "/api/users",
      { ...baseUserBody("shortpw"), password: "abc" },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("UC-INT-14: 409 on duplicate email", async () => {
    const body = baseUserBody("dup-email");
    // First create
    const first = await req("POST", "/api/users", body, adminToken);
    expect(first.status).toBe(200);
    createdUserEmails.push(body.email);

    // Second create with same email
    const second = await req("POST", "/api/users", body, adminToken);
    expect(second.status).toBe(409);
    expect(second.data.success).toBe(false);
  });

  it("UC-INT-15: 400 on postcode not 5 digits", async () => {
    const { status } = await req(
      "POST", "/api/users",
      { ...baseUserBody("badzip"), address5: "1234" },
      adminToken
    );
    expect(status).toBe(400);
  });
});
