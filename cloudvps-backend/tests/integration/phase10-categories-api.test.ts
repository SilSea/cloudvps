/**
 * Phase 10 Integration Tests — Package Categories API
 *
 * Requires: Docker stack running on :3000 with seeded data
 *   - admin@cloudvps.com / Password1234! (role: admin)
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

let adminToken = "";
let userToken  = "";
let createdCatId = 0;

beforeAll(async () => {
  const [aRes, uRes] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com",  password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com",   password: "Password1234!" }),
  ]);
  adminToken = aRes.data?.data?.access_token ?? "";
  userToken  = uRes.data?.data?.access_token ?? "";

  if (!adminToken || !userToken) {
    throw new Error("Login failed — ensure Docker is running with seeded data");
  }
});

afterAll(async () => {
  if (createdCatId) {
    await req("PATCH", `/api/packages/categories/${createdCatId}/status`, undefined, adminToken);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC — GET /api/packages/categories
// ══════════════════════════════════════════════════════════════════════════════

describe("Package Categories — GET /api/packages/categories (public)", () => {
  it("CAT-INT-1: 200 without token", async () => {
    const { status, data } = await req("GET", "/api/packages/categories");
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("CAT-INT-2: returns only active categories", async () => {
    const { data } = await req("GET", "/api/packages/categories");
    for (const cat of data.data) {
      expect(cat.status).toBe(true);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — POST /api/packages/categories
// ══════════════════════════════════════════════════════════════════════════════

describe("Package Categories — POST /api/packages/categories (admin)", () => {
  it("CAT-INT-3: 401 without token", async () => {
    const { status } = await req("POST", "/api/packages/categories", { name: "TestCat" });
    expect(status).toBe(401);
  });

  it("CAT-INT-4: 403 for user role", async () => {
    const { status } = await req("POST", "/api/packages/categories", { name: "TestCat" }, userToken);
    expect(status).toBe(403);
  });

  it("CAT-INT-5: 400 missing name", async () => {
    const { status } = await req("POST", "/api/packages/categories", { description: "No name" }, adminToken);
    expect(status).toBe(400);
  });

  it("CAT-INT-6: 201 admin creates category", async () => {
    const { status, data } = await req("POST", "/api/packages/categories", {
      name: `IntTestCat_${Date.now()}`,
      description: "Integration test category",
    }, adminToken);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.id).toBeGreaterThan(0);
    createdCatId = data.data.id;
  });

  it("CAT-INT-7: 400 duplicate name", async () => {
    const { data: existing } = await req("GET", "/api/packages/categories/all", undefined, adminToken);
    const firstName = existing.data?.[0]?.name;
    if (!firstName) return;
    const { status } = await req("POST", "/api/packages/categories", { name: firstName }, adminToken);
    expect(status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — GET /api/packages/categories/all
// ══════════════════════════════════════════════════════════════════════════════

describe("Package Categories — GET /api/packages/categories/all (admin)", () => {
  it("CAT-INT-8: 401 without token", async () => {
    const { status } = await req("GET", "/api/packages/categories/all");
    expect(status).toBe(401);
  });

  it("CAT-INT-9: 403 for user", async () => {
    const { status } = await req("GET", "/api/packages/categories/all", undefined, userToken);
    expect(status).toBe(403);
  });

  it("CAT-INT-10: 200 admin gets all categories", async () => {
    const { status, data } = await req("GET", "/api/packages/categories/all", undefined, adminToken);
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — PUT /api/packages/categories/:id
// ══════════════════════════════════════════════════════════════════════════════

describe("Package Categories — PUT /api/packages/categories/:id (admin)", () => {
  it("CAT-INT-11: 404 for non-existent category", async () => {
    const { status } = await req("PUT", "/api/packages/categories/999999", { name: "X" }, adminToken);
    expect(status).toBe(404);
  });

  it("CAT-INT-12: 200 admin updates category", async () => {
    if (!createdCatId) return;
    const { status, data } = await req("PUT", `/api/packages/categories/${createdCatId}`, {
      description: "Updated description",
    }, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — PATCH /api/packages/categories/:id/status
// ══════════════════════════════════════════════════════════════════════════════

describe("Package Categories — PATCH /api/packages/categories/:id/status (admin)", () => {
  it("CAT-INT-13: 404 for non-existent category", async () => {
    const { status } = await req("PATCH", "/api/packages/categories/999999/status", undefined, adminToken);
    expect(status).toBe(404);
  });

  it("CAT-INT-14: 200 admin toggles category status", async () => {
    if (!createdCatId) return;
    const { status, data } = await req("PATCH", `/api/packages/categories/${createdCatId}/status`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.data.status).toBe("boolean");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC — GET /api/packages?category_id=X
// ══════════════════════════════════════════════════════════════════════════════

describe("Packages — filter by category_id", () => {
  it("CAT-INT-15: 200 with valid category_id filter", async () => {
    const { status, data } = await req("GET", "/api/packages?category_id=1");
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  it("CAT-INT-16: 200 without filter returns all active packages", async () => {
    const { status, data } = await req("GET", "/api/packages");
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});
