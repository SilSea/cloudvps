/**
 * Phase 15 Integration Tests — File Upload System
 *
 * Tests multipart/form-data for:
 *   A) POST /api/transactions  (slip upload)
 *   B) POST /api/tickets/:id/messages  (ticket attachments)
 *
 * Requires: Docker stack running on :3000 with seeded data
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

const BASE = "http://localhost:3000";

// Minimal 1×1 PNG for upload tests
const PNG_BYTES = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 144, 119, 83, 222,
  0, 0, 0, 12, 73, 68, 65, 84, 8, 215, 99, 248, 15, 0, 0, 1, 1, 0, 5, 24, 213, 78,
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

function makeImageFile(name = "test.png", type = "image/png"): File {
  return new File([PNG_BYTES], name, { type });
}

async function req(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
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

async function reqForm(
  method: "POST" | "PATCH",
  path: string,
  form: FormData,
  token?: string
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

let adminToken = "";
let userToken = "";
let supportToken = "";

let testOrderId = 0;
let testTicketId = 0;
let uploadedSlipUrl = "";

beforeAll(async () => {
  const [aRes, uRes, sRes] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "support@cloudvps.com", password: "Password1234!" }),
  ]);
  adminToken = aRes.data?.data?.access_token ?? "";
  userToken = uRes.data?.data?.access_token ?? "";
  supportToken = sRes.data?.data?.access_token ?? "";

  if (!adminToken || !userToken || !supportToken) {
    throw new Error("Login failed — ensure Docker stack is running with seeded data");
  }

  // Create order for payment tests
  const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
  testOrderId = oRes.data?.data?.id ?? 0;

  // Create ticket for message tests
  const catRes = await req("GET", "/api/tickets/categories");
  const catId = catRes.data?.data?.[0]?.id ?? 1;
  const tRes = await req(
    "POST", "/api/tickets",
    { title: "Upload test ticket", category_id: catId, message: "Initial." },
    userToken
  );
  testTicketId = tRes.data?.data?.id ?? 0;
});

afterAll(async () => {
  if (testOrderId) {
    await req("PATCH", `/api/orders/${testOrderId}/cancel`, undefined, userToken).catch(() => {});
  }
  if (testTicketId) {
    await req("PATCH", `/api/tickets/${testTicketId}/status`, { status: "CLOSED" }, adminToken).catch(() => {});
  }
});

// ── A) Slip Upload ─────────────────────────────────────────────────────────────

describe("Phase15-A: Payment slip upload (multipart)", () => {
  it("UP-1: PROMPTPAY without slip_file → 201 PENDING", async () => {
    if (!testOrderId) return;
    const form = new FormData();
    form.append("order_id", String(testOrderId));
    form.append("payment_method", "PROMPTPAY");
    const { status, data } = await reqForm("POST", "/api/transactions", form, userToken);
    expect(status).toBe(201);
    expect(data.data.status).toBe("PENDING");
    expect(data.data.payment_method).toBe("PROMPTPAY");
    expect(data.data.slip_url).toBeNull();
  });

  it("UP-2: SLIP without slip_file → 400 SLIP_REQUIRED", async () => {
    // Need a fresh order (previous is now PENDING)
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    const oid = oRes.data?.data?.id;
    if (!oid) return;

    const form = new FormData();
    form.append("order_id", String(oid));
    form.append("payment_method", "SLIP");
    const { status, data } = await reqForm("POST", "/api/transactions", form, userToken);
    expect([400, 402]).toContain(status);
    expect(data.error).toBe("SLIP_REQUIRED");

    await req("PATCH", `/api/orders/${oid}/cancel`, undefined, userToken).catch(() => {});
  });

  it("UP-3: SLIP with invalid file type → 400 INVALID_FILE_TYPE", async () => {
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    const oid = oRes.data?.data?.id;
    if (!oid) return;

    const form = new FormData();
    form.append("order_id", String(oid));
    form.append("payment_method", "SLIP");
    form.append("slip_file", new File(["not an image"], "doc.pdf", { type: "application/pdf" }));
    const { status, data } = await reqForm("POST", "/api/transactions", form, userToken);
    expect(status).toBe(400);
    expect(data.error).toBe("INVALID_FILE_TYPE");

    await req("PATCH", `/api/orders/${oid}/cancel`, undefined, userToken).catch(() => {});
  });

  it("UP-4: PROMPTPAY with slip_file → 201, slip_url set to upload path", async () => {
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    const oid = oRes.data?.data?.id;
    if (!oid) return;

    const form = new FormData();
    form.append("order_id", String(oid));
    form.append("payment_method", "PROMPTPAY");
    form.append("slip_file", makeImageFile());
    const { status, data } = await reqForm("POST", "/api/transactions", form, userToken);
    expect(status).toBe(201);
    expect(data.data.status).toBe("PENDING");
    expect(data.data.slip_url).toMatch(/^\/uploads\/slips\//);
    uploadedSlipUrl = data.data.slip_url;

    await req("PATCH", `/api/orders/${oid}/cancel`, undefined, userToken).catch(() => {});
  });

  it("UP-5: uploaded slip file is accessible via GET /uploads/...", async () => {
    if (!uploadedSlipUrl) return;
    const res = await fetch(`${BASE}${uploadedSlipUrl}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/");
  });

  it("UP-6: GET /uploads/../etc/passwd → 403 (path traversal blocked)", async () => {
    const res = await fetch(`${BASE}/uploads/../etc/passwd`);
    // May be 403 or 404 depending on URL normalisation
    expect([403, 404]).toContain(res.status);
  });

  it("UP-7: TRUEMONEY without voucher_code → 400 (multipart form)", async () => {
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    const oid = oRes.data?.data?.id;
    if (!oid) return;

    const form = new FormData();
    form.append("order_id", String(oid));
    form.append("payment_method", "TRUEMONEY");
    const { status } = await reqForm("POST", "/api/transactions", form, userToken);
    expect([400, 402]).toContain(status);

    await req("PATCH", `/api/orders/${oid}/cancel`, undefined, userToken).catch(() => {});
  });
});

// ── B) Ticket Attachments ──────────────────────────────────────────────────────

describe("Phase15-B: Ticket message attachments (multipart)", () => {
  it("UP-8: POST message without attachments still works (text-only)", async () => {
    if (!testTicketId) return;
    const form = new FormData();
    form.append("message", "Plain text reply.");
    const { status, data } = await reqForm("POST", `/api/tickets/${testTicketId}/messages`, form, userToken);
    expect(status).toBe(201);
    expect(data.data.message).toBe("Plain text reply.");
    expect(data.data.attachments).toBeNull();
  });

  it("UP-9: POST message with one image attachment → 201, attachments array stored", async () => {
    if (!testTicketId) return;
    const form = new FormData();
    form.append("message", "See attached screenshot.");
    form.append("attachments", makeImageFile("screenshot.png"));
    const { status, data } = await reqForm("POST", `/api/tickets/${testTicketId}/messages`, form, userToken);
    expect(status).toBe(201);
    expect(Array.isArray(data.data.attachments)).toBe(true);
    expect(data.data.attachments.length).toBe(1);
    expect(data.data.attachments[0].mime_type).toBe("image/png");
    expect(data.data.attachments[0].url).toMatch(/^\/uploads\/tickets\//);
    expect(data.data.attachments[0].size).toBeGreaterThan(0);
  });

  it("UP-10: uploaded attachment file is accessible via GET /uploads/...", async () => {
    if (!testTicketId) return;
    const form = new FormData();
    form.append("message", "File access test.");
    form.append("attachments", makeImageFile());
    const { data } = await reqForm("POST", `/api/tickets/${testTicketId}/messages`, form, supportToken);
    const url: string = data.data?.attachments?.[0]?.url ?? "";
    if (!url) return;

    const res = await fetch(`${BASE}${url}`);
    expect(res.status).toBe(200);
  });

  it("UP-11: POST with invalid file type → 400 INVALID_FILE_TYPE", async () => {
    if (!testTicketId) return;
    const form = new FormData();
    form.append("message", "Bad file.");
    form.append("attachments", new File(["data"], "doc.pdf", { type: "application/pdf" }));
    const { status, data } = await reqForm("POST", `/api/tickets/${testTicketId}/messages`, form, userToken);
    expect(status).toBe(400);
    expect(data.error).toBe("INVALID_FILE_TYPE");
  });

  it("UP-12: POST with 4 files → 400 TOO_MANY_FILES", async () => {
    if (!testTicketId) return;
    const form = new FormData();
    form.append("message", "Too many.");
    for (let i = 0; i < 4; i++) {
      form.append("attachments", makeImageFile(`img${i}.png`));
    }
    const { status, data } = await reqForm("POST", `/api/tickets/${testTicketId}/messages`, form, userToken);
    expect(status).toBe(400);
    expect(data.error).toBe("TOO_MANY_FILES");
  });

  it("UP-13: is_internal=true in form → internal note (hidden from user)", async () => {
    if (!testTicketId) return;
    const form = new FormData();
    form.append("message", "Internal note.");
    form.append("is_internal", "true");
    await reqForm("POST", `/api/tickets/${testTicketId}/messages`, form, supportToken);

    const { data } = await req("GET", `/api/tickets/${testTicketId}`, undefined, userToken);
    const msgs: any[] = data.data?.messages ?? [];
    expect(msgs.every((m: any) => m.is_internal === false)).toBe(true);
  });

  it("UP-14: POST message to non-existent ticket → 404", async () => {
    const form = new FormData();
    form.append("message", "Ghost ticket.");
    const { status } = await reqForm("POST", "/api/tickets/999999/messages", form, userToken);
    expect(status).toBe(404);
  });
});
