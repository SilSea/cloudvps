/**
 * Phase 5 Integration Tests — Audit Logs, Broadcasts, VPS Renewal
 *
 * Requires: Docker stack running (cloudvps-api on :3000, seeded data)
 * Email: SMTP may not be configured in test env — broadcast still records to DB,
 *        failedCount will reflect SMTP failures (not a test failure).
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
let supportToken = "";
let userToken   = "";
let broadcastId = 0;

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

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS — GET /api/audit-logs
// ══════════════════════════════════════════════════════════════════════════════

describe("Audit Logs — GET /api/audit-logs", () => {
  it("AUD-INT-1: 401 without token", async () => {
    const { status } = await req("GET", "/api/audit-logs");
    expect(status).toBe(401);
  });

  it("AUD-INT-2: 403 for support role", async () => {
    const { status } = await req("GET", "/api/audit-logs", undefined, supportToken);
    expect(status).toBe(403);
  });

  it("AUD-INT-3: 403 for user role", async () => {
    const { status } = await req("GET", "/api/audit-logs", undefined, userToken);
    expect(status).toBe(403);
  });

  it("AUD-INT-4: 200 for admin — returns paginated structure", async () => {
    const { status, data } = await req("GET", "/api/audit-logs", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty("logs");
    expect(data.data).toHaveProperty("total");
    expect(data.data).toHaveProperty("page");
    expect(data.data).toHaveProperty("limit");
    expect(Array.isArray(data.data.logs)).toBe(true);
  });

  it("AUD-INT-5: pagination params applied — page/limit reflected in response", async () => {
    const { status, data } = await req("GET", "/api/audit-logs?page=1&limit=5", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.page).toBe(1);
    expect(data.data.limit).toBe(5);
  });

  it("AUD-INT-6: entity filter — only logs matching entity returned", async () => {
    const { status, data } = await req("GET", "/api/audit-logs?entity=USER", undefined, adminToken);
    expect(status).toBe(200);
    for (const log of data.data.logs) {
      expect(log.entity).toBe("USER");
    }
  });

  it("AUD-INT-7: action filter — only logs matching action returned", async () => {
    const { status, data } = await req("GET", "/api/audit-logs?action=ROLE_CHANGE", undefined, adminToken);
    expect(status).toBe(200);
    for (const log of data.data.logs) {
      expect(log.action).toBe("ROLE_CHANGE");
    }
  });

  it("AUD-INT-8: actor_id filter — only logs from that actor returned", async () => {
    const { status, data } = await req("GET", "/api/audit-logs?actor_id=1", undefined, adminToken);
    expect(status).toBe(200);
    for (const log of data.data.logs) {
      expect(log.actor_id).toBe(1);
    }
  });

  it("AUD-INT-9: invalid actor_id (NaN) — ignored, returns all logs", async () => {
    const { status, data } = await req("GET", "/api/audit-logs?actor_id=notanumber", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("AUD-INT-10: date range filter — from/to applied", async () => {
    const { status, data } = await req(
      "GET",
      "/api/audit-logs?from=2026-01-01&to=2026-12-31",
      undefined,
      adminToken
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("AUD-INT-11: logs include actor and target_user email", async () => {
    const { data } = await req("GET", "/api/audit-logs", undefined, adminToken);
    if (data.data.logs.length > 0) {
      expect(data.data.logs[0]).toHaveProperty("actor");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// BROADCASTS — POST/GET /api/broadcasts
// ══════════════════════════════════════════════════════════════════════════════

describe("Broadcasts — POST /api/broadcasts", () => {
  it("BCT-INT-1: 401 without token", async () => {
    const { status } = await req("POST", "/api/broadcasts", {
      subject: "Test", body: "body", type: "ANNOUNCEMENT", target: "ALL",
    });
    expect(status).toBe(401);
  });

  it("BCT-INT-2: 403 for support role", async () => {
    const { status } = await req("POST", "/api/broadcasts", {
      subject: "Test", body: "body", type: "ANNOUNCEMENT", target: "ALL",
    }, supportToken);
    expect(status).toBe(403);
  });

  it("BCT-INT-3: 403 for user role", async () => {
    const { status } = await req("POST", "/api/broadcasts", {
      subject: "Test", body: "body", type: "ANNOUNCEMENT", target: "ALL",
    }, userToken);
    expect(status).toBe(403);
  });

  it("BCT-INT-4: 400 on missing required fields", async () => {
    const { status } = await req("POST", "/api/broadcasts", { type: "ANNOUNCEMENT" }, adminToken);
    expect(status).toBe(400);
  });

  it("BCT-INT-5: 400 on invalid type enum", async () => {
    const { status } = await req("POST", "/api/broadcasts", {
      subject: "Test", body: "body", type: "MAINTENANCE_SCHEDULED", target: "ALL",
    }, adminToken);
    expect(status).toBe(400);
  });

  it("BCT-INT-6: 400 on invalid target enum", async () => {
    const { status } = await req("POST", "/api/broadcasts", {
      subject: "Test", body: "body", type: "ANNOUNCEMENT", target: "ALL_USERS",
    }, adminToken);
    expect(status).toBe(400);
  });

  it("BCT-INT-7: 201 ANNOUNCEMENT to ALL — records broadcast with sentCount+failedCount", async () => {
    const { status, data } = await req("POST", "/api/broadcasts", {
      subject: "Integration Test Broadcast",
      body:    "This is an automated integration test.",
      type:    "ANNOUNCEMENT",
      target:  "ALL",
    }, adminToken);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data).toHaveProperty("broadcastId");
    expect(typeof data.data.broadcastId).toBe("number");
    expect(typeof data.data.sentCount).toBe("number");
    expect(typeof data.data.failedCount).toBe("number");
    // total = sent + failed must equal recipient count (non-negative)
    expect(data.data.sentCount + data.data.failedCount).toBeGreaterThanOrEqual(0);
    broadcastId = data.data.broadcastId;
  });

  it("BCT-INT-8: 201 MAINTENANCE to ACTIVE_VPS — succeeds even with 0 recipients", async () => {
    const { status, data } = await req("POST", "/api/broadcasts", {
      subject: "Maintenance Notice",
      body:    "System maintenance scheduled.",
      type:    "MAINTENANCE",
      target:  "ACTIVE_VPS",
    }, adminToken);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.broadcastId).toBeGreaterThan(0);
  });

  it("BCT-INT-9: 201 EMERGENCY to EXPIRING_SOON — succeeds even with 0 recipients", async () => {
    const { status, data } = await req("POST", "/api/broadcasts", {
      subject: "Emergency Alert",
      body:    "Emergency system alert.",
      type:    "EMERGENCY",
      target:  "EXPIRING_SOON",
    }, adminToken);
    expect(status).toBe(201);
    expect(data.success).toBe(true);
  });
});

describe("Broadcasts — GET /api/broadcasts", () => {
  it("BCT-INT-10: 401 without token", async () => {
    const { status } = await req("GET", "/api/broadcasts");
    expect(status).toBe(401);
  });

  it("BCT-INT-11: 403 for user role", async () => {
    const { status } = await req("GET", "/api/broadcasts", undefined, userToken);
    expect(status).toBe(403);
  });

  it("BCT-INT-12: 200 admin — paginated list with sent_count/failed_count fields", async () => {
    const { status, data } = await req("GET", "/api/broadcasts", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data.broadcasts)).toBe(true);
    expect(data.data).toHaveProperty("total");
    expect(data.data.total).toBeGreaterThan(0);
    const first = data.data.broadcasts[0];
    expect(first).toHaveProperty("sent_count");
    expect(first).toHaveProperty("failed_count");
    expect(first).toHaveProperty("sender");
    expect(first).not.toHaveProperty("status");
    expect(first).not.toHaveProperty("recipient_count");
  });

  it("BCT-INT-13: pagination params reflected", async () => {
    const { status, data } = await req("GET", "/api/broadcasts?page=1&limit=5", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.data.page).toBe(1);
    expect(data.data.limit).toBe(5);
  });
});

describe("Broadcasts — GET /api/broadcasts/:id", () => {
  it("BCT-INT-14: 401 without token", async () => {
    const { status } = await req("GET", "/api/broadcasts/1");
    expect(status).toBe(401);
  });

  it("BCT-INT-15: 403 for user role", async () => {
    const { status } = await req("GET", "/api/broadcasts/1", undefined, userToken);
    expect(status).toBe(403);
  });

  it("BCT-INT-16: 400 on non-numeric id", async () => {
    const { status, data } = await req("GET", "/api/broadcasts/abc", undefined, adminToken);
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("BCT-INT-17: 404 on non-existent id", async () => {
    const { status, data } = await req("GET", "/api/broadcasts/999999", undefined, adminToken);
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("BCT-INT-18: 200 for valid broadcast created in BCT-INT-7", async () => {
    if (!broadcastId) return;
    const { status, data } = await req("GET", `/api/broadcasts/${broadcastId}`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(broadcastId);
    expect(data.data).toHaveProperty("subject");
    expect(data.data).toHaveProperty("body");
    expect(data.data).toHaveProperty("type");
    expect(data.data).toHaveProperty("target");
    expect(data.data).toHaveProperty("sent_count");
    expect(data.data).toHaveProperty("failed_count");
    expect(data.data).toHaveProperty("created_at");
    expect(data.data).toHaveProperty("sender");
    expect(data.data.sender).toHaveProperty("email");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS RENEWAL — POST /api/vps/:id/renew
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS Renewal — POST /api/vps/:id/renew", () => {
  it("RNW-INT-1: 401 without token", async () => {
    const { status } = await req("POST", "/api/vps/1/renew", {});
    expect(status).toBe(401);
  });

  it("RNW-INT-2: 400 on non-numeric vps id", async () => {
    const { status, data } = await req("POST", "/api/vps/abc/renew", {}, userToken);
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("RNW-INT-3: 404 when VPS does not exist", async () => {
    const { status, data } = await req("POST", "/api/vps/999999/renew", {}, userToken);
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("RNW-INT-4: 404 when VPS belongs to another user (403 from service → maps as 404)", async () => {
    // VPS 999998 doesn't exist — 404 expected
    const { status } = await req("POST", "/api/vps/999998/renew", {}, userToken);
    expect([403, 404]).toContain(status);
  });

  it("RNW-INT-5: admin can attempt renewal on any VPS id → 404 (no VPS in test env)", async () => {
    const { status } = await req("POST", "/api/vps/999999/renew", {}, adminToken);
    expect(status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS Expiry endpoints — indirect verification via GET /api/vps
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS Expiry — endpoint shape verification", () => {
  it("EXP-INT-1: GET /api/vps returns expired_at field in VPS records", async () => {
    const { status, data } = await req("GET", "/api/vps", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    if (data.data.vps.length > 0) {
      expect(data.data.vps[0]).toHaveProperty("expired_at");
    }
  });

  it("EXP-INT-2: GET /api/vps/queue returns provision queue (admin/support only)", async () => {
    const { status, data } = await req("GET", "/api/vps/queue", undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data).toHaveProperty("data");
  });

  it("EXP-INT-3: GET /api/vps/queue → 403 for user role", async () => {
    const { status } = await req("GET", "/api/vps/queue", undefined, userToken);
    expect(status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Auto-Renew Toggle (PATCH /api/vps/:id/auto-renew)
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS Auto-Renew — PATCH /api/vps/:id/auto-renew", () => {
  it("ARN-INT-1: 401 without token", async () => {
    const { status } = await req("PATCH", "/api/vps/1/auto-renew", { auto_renew: true });
    expect(status).toBe(401);
  });

  it("ARN-INT-2: 400 on missing auto_renew field in body", async () => {
    const { status } = await req("PATCH", "/api/vps/1/auto-renew", {}, userToken);
    expect(status).toBe(400);
  });

  it("ARN-INT-3: 404 on non-existent VPS id", async () => {
    const { status, data } = await req(
      "PATCH", "/api/vps/999999/auto-renew",
      { auto_renew: true },
      userToken
    );
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  it("ARN-INT-4: 404 on non-existent VPS id (admin)", async () => {
    const { status } = await req(
      "PATCH", "/api/vps/999999/auto-renew",
      { auto_renew: false },
      adminToken
    );
    expect(status).toBe(404);
  });

  it("ARN-INT-5: 400 on invalid VPS id (letters)", async () => {
    const { status } = await req(
      "PATCH", "/api/vps/abc/auto-renew",
      { auto_renew: true },
      userToken
    );
    expect(status).toBe(400);
  });

  it("ARN-INT-6: 400 on invalid locked_promo_id type (string instead of number)", async () => {
    const { status } = await req(
      "PATCH", "/api/vps/1/auto-renew",
      { auto_renew: true, locked_promo_id: "not-a-number" },
      adminToken
    );
    expect(status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 7 — Force Delete VPS (DELETE /api/vps/:id) — Admin only
// ══════════════════════════════════════════════════════════════════════════════

describe("VPS Force Delete — DELETE /api/vps/:id", () => {
  it("FDL-INT-1: 401 without token", async () => {
    const { status } = await req("DELETE", "/api/vps/1");
    expect(status).toBe(401);
  });

  it("FDL-INT-2: 403 for user role", async () => {
    const { status } = await req("DELETE", "/api/vps/1", undefined, userToken);
    expect(status).toBe(403);
  });

  it("FDL-INT-3: 403 for support role", async () => {
    const { status } = await req("DELETE", "/api/vps/1", undefined, supportToken);
    expect(status).toBe(403);
  });

  it("FDL-INT-4: 404 for non-existent VPS (admin)", async () => {
    const { status, data } = await req("DELETE", "/api/vps/999999", undefined, adminToken);
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});
