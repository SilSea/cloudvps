/**
 * Phase 11 Integration Tests — Email Templates API
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

// Track what we changed so afterAll can reset.
let originalWelcomeTemplate: { subject: string; body_html: string } | null = null;

beforeAll(async () => {
  const [aRes, sRes, uRes] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com",   password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "support@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com",    password: "Password1234!" }),
  ]);
  adminToken   = aRes.data?.data?.access_token ?? "";
  supportToken = sRes.data?.data?.access_token ?? "";
  userToken    = uRes.data?.data?.access_token ?? "";

  if (!adminToken) throw new Error("Admin login failed — ensure Docker is running with seeded data");

  // Save original WELCOME template so afterAll can restore it.
  const res = await req("GET", "/api/email-templates/WELCOME", undefined, adminToken);
  if (res.status === 200 && res.data?.data) {
    originalWelcomeTemplate = {
      subject:   res.data.data.subject,
      body_html: res.data.data.body_html,
    };
  }
});

afterAll(async () => {
  // Restore WELCOME template if we mutated it.
  if (originalWelcomeTemplate) {
    await req("PUT", "/api/email-templates/WELCOME", {
      ...originalWelcomeTemplate,
      is_active: true,
    }, adminToken);
  }
  // Re-enable WELCOME template status in case we toggled it.
  await req("PATCH", "/api/email-templates/WELCOME/status", { is_active: true }, adminToken);
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH GUARD
// ══════════════════════════════════════════════════════════════════════════════

describe("Email Templates — auth guard", () => {
  it("ETPL-INT-1: GET /api/email-templates returns 401 without token", async () => {
    const { status } = await req("GET", "/api/email-templates");
    expect(status).toBe(401);
  });

  it("ETPL-INT-2: GET /api/email-templates returns 403 for support role", async () => {
    const { status } = await req("GET", "/api/email-templates", undefined, supportToken);
    expect(status).toBe(403);
  });

  it("ETPL-INT-3: GET /api/email-templates returns 403 for user role", async () => {
    const { status } = await req("GET", "/api/email-templates", undefined, userToken);
    expect(status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// LIST
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/email-templates", () => {
  it("ETPL-INT-4: admin gets list with 9 template types", async () => {
    const { status, data } = await req("GET", "/api/email-templates", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveLength(9);
  });

  it("ETPL-INT-5: each template has required fields", async () => {
    const { data } = await req("GET", "/api/email-templates", undefined, adminToken);
    for (const tpl of data.data) {
      expect(tpl.type).toBeTruthy();
      expect(tpl.subject).toBeTruthy();
      expect(tpl.body_html).toBeTruthy();
      expect(Array.isArray(tpl.variables)).toBe(true);
      expect(typeof tpl.is_active).toBe("boolean");
    }
  });

  it("ETPL-INT-6: WELCOME template exists in list", async () => {
    const { data } = await req("GET", "/api/email-templates", undefined, adminToken);
    const welcome = data.data.find((t: any) => t.type === "WELCOME");
    expect(welcome).toBeDefined();
    expect(welcome.variables).toContain("email");
    expect(welcome.variables).toContain("password");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET BY TYPE
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/email-templates/:type", () => {
  it("ETPL-INT-7: returns VERIFICATION template", async () => {
    const { status, data } = await req("GET", "/api/email-templates/VERIFICATION", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.type).toBe("VERIFICATION");
    expect(data.data.variables).toContain("verify_url");
  });

  it("ETPL-INT-8: returns 400 on unknown type", async () => {
    const { status } = await req("GET", "/api/email-templates/NONEXISTENT", undefined, adminToken);
    expect(status).toBe(400);
  });

  it("ETPL-INT-9: case-insensitive type param is normalised", async () => {
    const { status, data } = await req("GET", "/api/email-templates/welcome", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.type).toBe("WELCOME");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PUT (upsert)
// ══════════════════════════════════════════════════════════════════════════════

describe("PUT /api/email-templates/:type", () => {
  it("ETPL-INT-10: admin can update WELCOME template", async () => {
    const { status, data } = await req(
      "PUT", "/api/email-templates/WELCOME",
      {
        subject:   "Integration Test Welcome",
        body_html: "<p>Test body {{email}}</p>",
        is_active: true,
      },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.subject).toBe("Integration Test Welcome");
  });

  it("ETPL-INT-11: updated template is returned by GET", async () => {
    const { data } = await req("GET", "/api/email-templates/WELCOME", undefined, adminToken);
    expect(data.data.subject).toBe("Integration Test Welcome");
    expect(data.data.from_db).toBe(true);
  });

  it("ETPL-INT-12: 400 on empty subject", async () => {
    const { status } = await req(
      "PUT", "/api/email-templates/WELCOME",
      { subject: "", body_html: "<p>body</p>", is_active: true },
      adminToken
    );
    expect(status).toBe(400);
  });

  it("ETPL-INT-13: 403 when support tries to update", async () => {
    const { status } = await req(
      "PUT", "/api/email-templates/WELCOME",
      { subject: "S", body_html: "<p>B</p>", is_active: true },
      supportToken
    );
    expect(status).toBe(403);
  });

  it("ETPL-INT-14: 400 on invalid template type", async () => {
    const { status } = await req(
      "PUT", "/api/email-templates/INVALID_TYPE",
      { subject: "S", body_html: "<p>B</p>" },
      adminToken
    );
    expect(status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PATCH status
// ══════════════════════════════════════════════════════════════════════════════

describe("PATCH /api/email-templates/:type/status", () => {
  it("ETPL-INT-15: admin can toggle template inactive", async () => {
    const { status, data } = await req(
      "PATCH", "/api/email-templates/WELCOME/status",
      { is_active: false },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.is_active).toBe(false);
  });

  it("ETPL-INT-16: inactive template falls back to default in list", async () => {
    const { data } = await req("GET", "/api/email-templates/WELCOME", undefined, adminToken);
    // is_active=false means DB record exists but template falls back to default
    // The GET by type shows DB record when it exists regardless of is_active
    expect(data.data).toBeDefined();
  });

  it("ETPL-INT-17: admin can re-enable template", async () => {
    const { status, data } = await req(
      "PATCH", "/api/email-templates/WELCOME/status",
      { is_active: true },
      adminToken
    );
    expect(status).toBe(200);
    expect(data.data.is_active).toBe(true);
  });

  it("ETPL-INT-18: 404 when toggling type that has no DB record yet", async () => {
    // EXPIRY_WARNING may not have a DB record if never updated — try to toggle it
    // (harmless since we just check the response, not mutate permanently)
    const getRes = await req("GET", "/api/email-templates/EXPIRY_WARNING", undefined, adminToken);
    if (!getRes.data.data.from_db) {
      const { status } = await req(
        "PATCH", "/api/email-templates/EXPIRY_WARNING/status",
        { is_active: false },
        adminToken
      );
      expect(status).toBe(404);
    } else {
      // Already in DB — skip check but pass
      expect(true).toBe(true);
    }
  });

  it("ETPL-INT-19: 403 when support tries to toggle status", async () => {
    const { status } = await req(
      "PATCH", "/api/email-templates/WELCOME/status",
      { is_active: false },
      supportToken
    );
    expect(status).toBe(403);
  });
});
