/**
 * CloudVPS Backend — Full QA Test Suite (Phase 1–9)
 * Run: bun tests/test_api.ts
 *
 * Covers: Auth, RBAC, Policies, Packages, Promotions, Orders, Transactions,
 *         SlipOK, IP Pools, System Configs, VPS Management, Email Broadcasts,
 *         Admin Audit Logs, Auto-Renew, NAT Port Rules, VM Upgrade
 */

import { readFileSync } from "fs";

const BASE = "http://localhost:3000";
const VOUCHER_HASH = "019af9c7f1fc7567bfa63fb6183da73011z";

type Result = {
  testId: string;
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  expected: string;
  actual: string;
  note?: string;
};

const results: Result[] = [];

function log(r: Result) {
  results.push(r);
  const icon = r.status === "PASS" ? "✅" : r.status === "FAIL" ? "❌" : r.status === "WARN" ? "🟡" : "⏭️";
  console.log(`${icon} [${r.testId}] ${r.name} — ${r.status}`);
  if (r.status !== "PASS") {
    console.log(`     Expected: ${r.expected}`);
    console.log(`     Actual:   ${r.actual}`);
    if (r.note) console.log(`     Note:     ${r.note}`);
  }
}

async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  opts?: { noContentType?: boolean }
): Promise<{ status: number; data: any; raw: string }> {
  const headers: Record<string, string> = {};
  if (!opts?.noContentType) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await res.text();
  let data: any = {};
  try { data = JSON.parse(raw); } catch { }
  return { status: res.status, data, raw };
}

// ─── Helper state ────────────────────────────────────────────────────────────
let userToken: string | null = null;
let adminToken: string | null = null;
let refreshToken: string | null = null;
let userId: number | null = null;
let adminUserId: number | null = null;
let testEmail = `qa_${Date.now()}@cloudvps.dev`;
let policyIds: number[] = [];
let packageId: number | null = null;
let promoId: number | null = null;
let orderId: number | null = null;
let txId: number | null = null;
let osId: number | null = null;
let vmId: number | null = null;
let testVpsId: number | null = null;
let broadcastId: number | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1 — Foundation
// ═══════════════════════════════════════════════════════════════════════════════

async function phase1_health() {
  console.log("\n━━━ PHASE 1: Health & Public ━━━");

  const r = await req("GET", "/health");
  log({
    testId: "H-1", name: "GET /health",
    status: r.status === 200 && r.data?.status === "ok" ? "PASS" : "FAIL",
    expected: "200 { status: 'ok' }",
    actual: `${r.status} ${r.raw.slice(0, 80)}`,
  });

  const r2 = await req("GET", "/docs");
  log({
    testId: "H-2", name: "GET /docs (Swagger)",
    status: r2.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r2.status}`,
  });
}

async function phase1_auth_register() {
  console.log("\n━━━ AUTH: Register ━━━");

  const pp = await req("GET", "/api/policies/active");
  if (pp.data?.success && Array.isArray(pp.data?.data) && pp.data.data.length > 0) {
    policyIds = pp.data.data.map((x: any) => x.id);
  } else {
    policyIds = [1];
  }

  // R-1: Invalid email format → 400
  const r1 = await req("POST", "/api/auth/register", { email: "notanemail", password: "Test1234!" });
  log({
    testId: "R-1", name: "Register — invalid email format",
    status: r1.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r1.status}`,
    note: r1.data?.message,
  });

  // R-2: Missing required fields → 400
  const r2 = await req("POST", "/api/auth/register", { email: testEmail });
  log({
    testId: "R-2", name: "Register — missing fields",
    status: r2.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r2.status}`,
  });

  // R-3: Password too short → 400
  const r3 = await req("POST", "/api/auth/register", {
    email: testEmail, password: "short",
    first_name: "QA", last_name: "Test", phone: "0812345678",
    address1: "123 St", address3: "Bangkok", address4: "Bangkok",
    address5: "10110", address6: "Thailand", policy_ids: policyIds,
  });
  log({
    testId: "R-3", name: "Register — password too short (<8 chars)",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status} ${r3.data?.message || ""}`,
  });

  // R-4: Invalid phone format → 400
  const r4 = await req("POST", "/api/auth/register", {
    email: testEmail, password: "Test1234!",
    first_name: "QA", last_name: "Test", phone: "081234",
    address1: "123 St", address3: "Bangkok", address4: "Bangkok",
    address5: "10110", address6: "Thailand", policy_ids: policyIds,
  });
  log({
    testId: "R-4", name: "Register — invalid phone format",
    status: r4.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r4.status} ${r4.data?.message || ""}`,
  });

  // R-5: Invalid postal code → 400
  const r5 = await req("POST", "/api/auth/register", {
    email: testEmail, password: "Test1234!",
    first_name: "QA", last_name: "Test", phone: "0812345678",
    address1: "123 St", address3: "Bangkok", address4: "Bangkok",
    address5: "ABCDE", address6: "Thailand", policy_ids: policyIds,
  });
  log({
    testId: "R-5", name: "Register — invalid postal code (non-digit)",
    status: r5.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r5.status} ${r5.data?.message || ""}`,
  });

  // R-6: Empty policy_ids → 400
  const r6 = await req("POST", "/api/auth/register", {
    email: testEmail, password: "Test1234!",
    first_name: "QA", last_name: "Test", phone: "0812345678",
    address1: "123 St", address3: "Bangkok", address4: "Bangkok",
    address5: "10110", address6: "Thailand", policy_ids: [],
  });
  log({
    testId: "R-6", name: "Register — empty policy_ids array",
    status: r6.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r6.status} ${r6.data?.message || ""}`,
  });

  // R-7: Valid registration → 201
  const r7 = await req("POST", "/api/auth/register", {
    email: testEmail, password: "Test1234!",
    first_name: "QA", last_name: "Tester", phone: "0812345678",
    address1: "123 Test Street", address3: "Bangkok", address4: "Bangkok",
    address5: "10110", address6: "Thailand", policy_ids: policyIds,
  });
  log({
    testId: "R-7", name: "Register — valid (BLK-3: no crash on SMTP fail)",
    status: r7.status === 200 || r7.status === 201 ? "PASS" : "FAIL",
    expected: "200 or 201",
    actual: `${r7.status} ${r7.data?.message || ""}`,
  });

  // R-8: Duplicate email → 409
  const r8 = await req("POST", "/api/auth/register", {
    email: testEmail, password: "Test1234!",
    first_name: "QA", last_name: "Tester", phone: "0812345678",
    address1: "123 Test Street", address3: "Bangkok", address4: "Bangkok",
    address5: "10110", address6: "Thailand", policy_ids: policyIds,
  });
  log({
    testId: "R-8", name: "Register — duplicate email → 409",
    status: r8.status === 409 ? "PASS" : "FAIL",
    expected: "409",
    actual: `${r8.status} ${r8.data?.message || ""}`,
  });
}

async function phase1_auth_login() {
  console.log("\n━━━ AUTH: Login ━━━");

  // L-1: Wrong credentials → 401
  const r1 = await req("POST", "/api/auth/login", { email: testEmail, password: "WrongPass!" });
  log({
    testId: "L-1", name: "Login — wrong password → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r1.status}`,
  });

  // L-2: Non-existent email → 401
  const r2 = await req("POST", "/api/auth/login", { email: "ghost@nowhere.com", password: "Test1234!" });
  log({
    testId: "L-2", name: "Login — unknown email → 401",
    status: r2.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r2.status}`,
  });

  // L-3: Missing body → 400
  const r3 = await req("POST", "/api/auth/login", {});
  log({
    testId: "L-3", name: "Login — empty body → 400",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status}`,
  });

  // L-4: Valid login
  const r4 = await req("POST", "/api/auth/login", { email: testEmail, password: "Test1234!" });
  const loginOk = r4.status === 200 && r4.data?.data?.access_token;
  if (loginOk) {
    userToken = r4.data.data.access_token;
    refreshToken = r4.data.data.refresh_token;
    userId = r4.data.data.user?.id ?? null;
  }
  log({
    testId: "L-4", name: "Login — valid (unverified user)",
    status: r4.status === 200 ? "PASS" : "FAIL",
    expected: "200 with access_token + refresh_token",
    actual: `${r4.status} token=${loginOk ? "present" : "missing"} pending_policies=${JSON.stringify(r4.data?.data?.pending_policy_ids)}`,
    note: r4.data?.message,
  });

  // L-4b: pending_policy_ids in response
  log({
    testId: "L-4b", name: "Login response — pending_policy_ids field present",
    status: "pending_policy_ids" in (r4.data?.data ?? {}) ? "PASS" : "FAIL",
    expected: "pending_policy_ids in response",
    actual: JSON.stringify(r4.data?.data?.pending_policy_ids),
  });

  // L-5: Admin login
  const adminR = await req("POST", "/api/auth/login", { email: "admin@cloudvps.com", password: "Password1234!" });
  if (adminR.status === 200 && adminR.data?.data?.access_token) {
    adminToken = adminR.data.data.access_token;
    adminUserId = adminR.data.data.user?.id ?? null;
  }
  log({
    testId: "L-5", name: "Login — admin account",
    status: adminR.status === 200 && adminToken ? "PASS" : "WARN",
    expected: "200 with admin token",
    actual: `${adminR.status} token=${adminToken ? "present" : "missing"}`,
    note: adminR.data?.message || "Check admin credentials or seed data",
  });
}

async function phase1_auth_protected() {
  console.log("\n━━━ AUTH: Protected Endpoints (BLK-1) ━━━");

  // P-1: No token → 401
  const r1 = await req("GET", "/api/auth/me");
  log({
    testId: "P-1", name: "GET /api/auth/me — no token → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r1.status}`,
  });

  if (!userToken) { console.log("  [SKIP] No user token available"); return; }

  // P-2: Valid token → 200
  const r2 = await req("GET", "/api/auth/me", undefined, userToken);
  log({
    testId: "P-2", name: "GET /api/auth/me — with token → 200 (BLK-1)",
    status: r2.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r2.status} ${r2.data?.data?.email || ""}`,
  });

  // P-3: Malformed token → 401
  const r3 = await req("GET", "/api/auth/me", undefined, "bad.token.here");
  log({
    testId: "P-3", name: "GET /api/auth/me — malformed token → 401",
    status: r3.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r3.status}`,
  });

  // P-4: Wrong signature → 401
  const r4 = await req("GET", "/api/auth/me", undefined, "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.fakesignature");
  log({
    testId: "P-4", name: "GET /api/auth/me — wrong signature → 401",
    status: r4.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r4.status}`,
  });
}

async function phase1_auth_refresh() {
  console.log("\n━━━ AUTH: Refresh Token ━━━");

  if (!refreshToken) {
    log({ testId: "RF-1", name: "Refresh Token — valid", status: "SKIP", expected: "200", actual: "No refresh token" });
    return;
  }

  // RF-1: Valid refresh → 200
  const r1 = await req("POST", "/api/auth/refresh", { refresh_token: refreshToken });
  log({
    testId: "RF-1", name: "POST /api/auth/refresh — valid token",
    status: r1.status === 200 && r1.data?.data?.access_token ? "PASS" : "FAIL",
    expected: "200 with new access_token",
    actual: `${r1.status} token=${r1.data?.data?.access_token ? "present" : "missing"}`,
  });
  if (r1.data?.data?.access_token) userToken = r1.data.data.access_token;

  // RF-2: Invalid token → 401
  const r2 = await req("POST", "/api/auth/refresh", { refresh_token: "bad.refresh.token" });
  log({
    testId: "RF-2", name: "POST /api/auth/refresh — invalid token → 401",
    status: r2.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r2.status}`,
  });

  // RF-3: Missing body → 400
  const r3 = await req("POST", "/api/auth/refresh", {});
  log({
    testId: "RF-3", name: "POST /api/auth/refresh — missing body → 400",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status}`,
  });
}

async function phase1_user_me() {
  console.log("\n━━━ USERS: Self-service ━━━");

  if (!userToken) { console.log("  [SKIP] No user token"); return; }

  // U-1: GET profile
  const r1 = await req("GET", "/api/users/me", undefined, userToken);
  log({
    testId: "U-1", name: "GET /api/users/me",
    status: r1.status === 200 ? "PASS" : "FAIL",
    expected: "200 with profile data",
    actual: `${r1.status}`,
  });

  // U-2: Update profile
  const r2 = await req("PUT", "/api/users/me", { first_name: "QAUpdated" }, userToken);
  log({
    testId: "U-2", name: "PUT /api/users/me — valid update",
    status: r2.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r2.status} ${r2.data?.message || ""}`,
  });

  // U-3: Invalid phone → 400
  const r3 = await req("PUT", "/api/users/me", { phone: "123" }, userToken);
  log({
    testId: "U-3", name: "PUT /api/users/me — invalid phone → 400",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status}`,
  });

  // U-4: Change password — wrong current → 401
  const r4 = await req("PUT", "/api/users/me/password", {
    current_password: "WrongPass!",
    new_password: "NewPass1234!",
  }, userToken);
  log({
    testId: "U-4", name: "PUT /api/users/me/password — wrong current_password → 401",
    status: r4.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r4.status} ${r4.data?.message || ""}`,
  });

  // U-5: Change password — valid
  const r5 = await req("PUT", "/api/users/me/password", {
    current_password: "Test1234!",
    new_password: "NewPass1234!",
  }, userToken);
  log({
    testId: "U-5", name: "PUT /api/users/me/password — valid",
    status: r5.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r5.status} ${r5.data?.message || ""}`,
  });

  // U-6: Change email — already in use
  const r6 = await req("PUT", "/api/users/me/email", { email: "admin@cloudvps.dev" }, userToken);
  log({
    testId: "U-6", name: "PUT /api/users/me/email — email in use → 409",
    status: r6.status === 409 ? "PASS" : "WARN",
    expected: "409",
    actual: `${r6.status} ${r6.data?.message || ""}`,
    note: "Only fails if admin@cloudvps.dev exists in DB",
  });

  // Re-login with new password
  const newLogin = await req("POST", "/api/auth/login", { email: testEmail, password: "NewPass1234!" });
  if (newLogin.status === 200 && newLogin.data?.data?.access_token) {
    userToken = newLogin.data.data.access_token;
    refreshToken = newLogin.data.data.refresh_token;
  }
}

async function phase1_user_rbac() {
  console.log("\n━━━ USERS: Admin/Support RBAC ━━━");

  // RBAC-1: User cannot list all users → 403
  if (userToken) {
    const r1 = await req("GET", "/api/users", undefined, userToken);
    log({
      testId: "RBAC-1", name: "GET /api/users — user (non-admin) → 403",
      status: r1.status === 403 ? "PASS" : "FAIL",
      expected: "403",
      actual: `${r1.status}`,
    });
  }

  if (!adminToken) {
    log({ testId: "RBAC-2", name: "Admin list users", status: "SKIP", expected: "200", actual: "No admin token" });
    return;
  }

  // RBAC-2: Admin list users → 200
  const r2 = await req("GET", "/api/users", undefined, adminToken);
  log({
    testId: "RBAC-2", name: "GET /api/users — admin → 200",
    status: r2.status === 200 ? "PASS" : "FAIL",
    expected: "200 with paginated users",
    actual: `${r2.status} total=${r2.data?.data?.total ?? "?"}`,
  });

  // RBAC-3: Get user by ID
  if (userId) {
    const r3 = await req("GET", `/api/users/${userId}`, undefined, adminToken);
    log({
      testId: "RBAC-3", name: "GET /api/users/:id — admin",
      status: r3.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r3.status}`,
    });
  }

  // RBAC-4: Invalid ID → 400
  const r4 = await req("GET", "/api/users/abc", undefined, adminToken);
  log({
    testId: "RBAC-4", name: "GET /api/users/abc — invalid ID → 400",
    status: r4.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r4.status}`,
  });

  // RBAC-5: Not found → 404
  const r5 = await req("GET", "/api/users/999999", undefined, adminToken);
  log({
    testId: "RBAC-5", name: "GET /api/users/999999 — not found → 404",
    status: r5.status === 404 ? "PASS" : "FAIL",
    expected: "404",
    actual: `${r5.status}`,
  });

  // RBAC-6: Toggle user status
  if (userId) {
    const r6 = await req("PATCH", `/api/users/${userId}/status`, undefined, adminToken);
    log({
      testId: "RBAC-6", name: "PATCH /api/users/:id/status — admin (toggle)",
      status: r6.status === 200 ? "PASS" : "FAIL",
      expected: "200 with toggled status",
      actual: `${r6.status} status=${r6.data?.data?.status ?? "?"}`,
    });
    await req("PATCH", `/api/users/${userId}/status`, undefined, adminToken);
  }

  // RBAC-7: User cannot toggle status → 403
  if (userToken && userId) {
    const r7 = await req("PATCH", `/api/users/${userId}/status`, undefined, userToken);
    log({
      testId: "RBAC-7", name: "PATCH /api/users/:id/status — user (non-admin) → 403",
      status: r7.status === 403 ? "PASS" : "FAIL",
      expected: "403",
      actual: `${r7.status}`,
    });
  }

  // RBAC-8: Change user role
  if (userId) {
    const r8 = await req("PATCH", `/api/users/${userId}/role`, { role_name: "users" }, adminToken);
    log({
      testId: "RBAC-8", name: "PATCH /api/users/:id/role — admin (role change)",
      status: r8.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r8.status} role=${r8.data?.data?.role?.role_name ?? "?"}`,
    });
  }

  // RBAC-9: Invalid role → 400
  if (userId) {
    const r9 = await req("PATCH", `/api/users/${userId}/role`, { role_name: "superuser" }, adminToken);
    log({
      testId: "RBAC-9", name: "PATCH /api/users/:id/role — invalid role → 400",
      status: r9.status === 400 ? "PASS" : "FAIL",
      expected: "400",
      actual: `${r9.status}`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2 — Legal & Packages
// ═══════════════════════════════════════════════════════════════════════════════

async function phase2_policies() {
  console.log("\n━━━ PHASE 2: Policies ━━━");

  // PL-1: Public active policies
  const r1 = await req("GET", "/api/policies/active");
  log({
    testId: "PL-1", name: "GET /api/policies/active — public",
    status: r1.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r1.status} count=${Array.isArray(r1.data?.data) ? r1.data.data.length : "?"}`,
  });

  if (!adminToken) { console.log("  [SKIP] No admin token — skipping admin policy tests"); return; }

  // PL-2: Admin list all
  const r2 = await req("GET", "/api/policies", undefined, adminToken);
  log({
    testId: "PL-2", name: "GET /api/policies — admin",
    status: r2.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r2.status}`,
  });

  // PL-3: Create policy
  const r3 = await req("POST", "/api/policies", {
    policie_title: "QA Test Policy",
    policies_detail: "This is a test policy for QA.",
    policies_type: "PDPA",
    version: "1.0",
  }, adminToken);
  const newPolicyId = r3.data?.data?.id;
  log({
    testId: "PL-3", name: "POST /api/policies — admin create",
    status: r3.status === 201 ? "PASS" : "FAIL",
    expected: "201",
    actual: `${r3.status} id=${newPolicyId ?? "?"}`,
  });

  // PL-4: Missing required field → 400
  const r4 = await req("POST", "/api/policies", { policie_title: "Incomplete" }, adminToken);
  log({
    testId: "PL-4", name: "POST /api/policies — missing fields → 400",
    status: r4.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r4.status}`,
  });

  if (!newPolicyId) return;

  // PL-5: Update
  const r5 = await req("PUT", `/api/policies/${newPolicyId}`, { policie_title: "QA Test Policy Updated" }, adminToken);
  log({
    testId: "PL-5", name: "PUT /api/policies/:id — admin update",
    status: r5.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r5.status}`,
  });

  // PL-6: Toggle status
  const r6 = await req("PATCH", `/api/policies/${newPolicyId}/status`, undefined, adminToken);
  log({
    testId: "PL-6", name: "PATCH /api/policies/:id/status — toggle",
    status: r6.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r6.status} active=${r6.data?.data?.is_active ?? "?"}`,
  });

  // PL-7: User accept consent
  if (userToken && policyIds.length > 0) {
    const r7 = await req("POST", "/api/policies/consents", { policy_id: policyIds[0] }, userToken);
    log({
      testId: "PL-7", name: "POST /api/policies/consents — user accept (duplicate → 409)",
      status: r7.status === 201 || r7.status === 409 ? "PASS" : "FAIL",
      expected: "201 (new) or 409 (duplicate)",
      actual: `${r7.status} ${r7.data?.message || ""}`,
    });
  }

  // PL-8: Duplicate consent → 409
  if (userToken && policyIds.length > 0) {
    const r8 = await req("POST", "/api/policies/consents", { policy_id: policyIds[0] }, userToken);
    log({
      testId: "PL-8", name: "POST /api/policies/consents — duplicate → 409 (P2-M4)",
      status: r8.status === 409 ? "PASS" : "FAIL",
      expected: "409",
      actual: `${r8.status} ${r8.data?.message || ""}`,
    });
  }

  // PL-9: Get own consent history
  if (userToken) {
    const r9 = await req("GET", "/api/policies/consents/me", undefined, userToken);
    log({
      testId: "PL-9", name: "GET /api/policies/consents/me — user",
      status: r9.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r9.status} count=${Array.isArray(r9.data?.data) ? r9.data.data.length : "?"}`,
    });
  }

  // PL-10: User cannot list all → 403
  if (userToken) {
    const r10 = await req("GET", "/api/policies", undefined, userToken);
    log({
      testId: "PL-10", name: "GET /api/policies — user (non-admin) → 403",
      status: r10.status === 403 ? "PASS" : "FAIL",
      expected: "403",
      actual: `${r10.status}`,
    });
  }
}

async function phase2_packages() {
  console.log("\n━━━ PHASE 2: Packages / OS / VM ━━━");

  // PKG-1: Public list packages
  const r1 = await req("GET", "/api/packages");
  log({
    testId: "PKG-1", name: "GET /api/packages — public",
    status: r1.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r1.status} count=${Array.isArray(r1.data?.data) ? r1.data.data.length : "?"}`,
  });
  if (Array.isArray(r1.data?.data) && r1.data.data.length > 0) {
    packageId = r1.data.data[0].id;
  }

  if (packageId) {
    const r2 = await req("GET", `/api/packages/${packageId}`);
    log({
      testId: "PKG-2", name: "GET /api/packages/:id — public",
      status: r2.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r2.status}`,
    });
  }

  // PKG-3: Invalid ID → 400
  const r3 = await req("GET", "/api/packages/abc");
  log({
    testId: "PKG-3", name: "GET /api/packages/abc — invalid ID → 400",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status}`,
  });

  // PKG-4: Not found → 404
  const r4 = await req("GET", "/api/packages/999999");
  log({
    testId: "PKG-4", name: "GET /api/packages/999999 — not found → 404",
    status: r4.status === 404 ? "PASS" : "FAIL",
    expected: "404",
    actual: `${r4.status}`,
  });

  if (!adminToken) { console.log("  [SKIP] No admin token — skipping admin package tests"); return; }

  // PKG-5: Create OS
  const r5 = await req("POST", "/api/packages/os", { os_name: "Ubuntu QA", os_version: "22.04", vmid: 9001 }, adminToken);
  osId = r5.data?.data?.id ?? null;
  log({
    testId: "PKG-5", name: "POST /api/packages/os — admin create OS",
    status: r5.status === 201 ? "PASS" : "FAIL",
    expected: "201",
    actual: `${r5.status} id=${osId ?? "?"}`,
  });

  // PKG-6: Create VM spec
  const r6 = await req("POST", "/api/packages/vm", { core: 2, memory: "4GB", size: "50GB" }, adminToken);
  vmId = r6.data?.data?.id ?? null;
  log({
    testId: "PKG-6", name: "POST /api/packages/vm — admin create VM",
    status: r6.status === 201 ? "PASS" : "FAIL",
    expected: "201",
    actual: `${r6.status} id=${vmId ?? "?"}`,
  });

  if (!osId || !vmId) { console.log("  [SKIP] OS/VM not created — skip package create"); return; }

  // PKG-7: Create package
  const r7 = await req("POST", "/api/packages", {
    name: "QA Test Package", description: "QA test package",
    price: 199.00, period: 30, os_id: osId, vm_id: vmId,
  }, adminToken);
  const newPkgId = r7.data?.data?.id ?? null;
  if (newPkgId) packageId = newPkgId;
  log({
    testId: "PKG-7", name: "POST /api/packages — admin create package",
    status: r7.status === 201 ? "PASS" : "FAIL",
    expected: "201",
    actual: `${r7.status} id=${newPkgId ?? "?"}`,
  });

  if (!newPkgId) return;

  // PKG-8: Update package
  const r8 = await req("PUT", `/api/packages/${newPkgId}`, { price: 299.00 }, adminToken);
  log({
    testId: "PKG-8", name: "PUT /api/packages/:id — admin update",
    status: r8.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r8.status}`,
  });

  // PKG-9: Toggle status
  const r9 = await req("PATCH", `/api/packages/${newPkgId}/status`, undefined, adminToken);
  log({
    testId: "PKG-9", name: "PATCH /api/packages/:id/status — toggle (disable)",
    status: r9.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r9.status} active=${r9.data?.data?.is_active ?? "?"}`,
  });
  await req("PATCH", `/api/packages/${newPkgId}/status`, undefined, adminToken);

  // PKG-10: Update OS
  if (osId) {
    const r10 = await req("PUT", `/api/packages/os/${osId}`, { os_version: "22.04.1" }, adminToken);
    log({
      testId: "PKG-10", name: "PUT /api/packages/os/:id — admin update OS",
      status: r10.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r10.status}`,
    });
  }

  // PKG-11: Update VM spec
  if (vmId) {
    const r11 = await req("PUT", `/api/packages/vm/${vmId}`, { core: 4 }, adminToken);
    log({
      testId: "PKG-11", name: "PUT /api/packages/vm/:id — admin update VM",
      status: r11.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r11.status}`,
    });
  }

  // PKG-12: User cannot create → 403
  if (userToken) {
    const r12 = await req("POST", "/api/packages", {
      name: "Hack", description: "x", price: 1, period: 1, os_id: 1, vm_id: 1,
    }, userToken);
    log({
      testId: "PKG-12", name: "POST /api/packages — user (non-admin) → 403",
      status: r12.status === 403 ? "PASS" : "FAIL",
      expected: "403",
      actual: `${r12.status}`,
    });
  }
}

async function phase2_promotions() {
  console.log("\n━━━ PHASE 2: Promotions ━━━");

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // PROMO-1: Create DISCOUNT
  const r1 = await req("POST", "/api/promotions", {
    code_name: `QA_DISC_${Date.now()}`,
    description: "QA Discount Test",
    type: "DISCOUNT",
    discount: 50.00,
  }, adminToken);
  promoId = r1.data?.data?.id ?? null;
  const promoCode = r1.data?.data?.code_name ?? null;
  log({
    testId: "PROMO-1", name: "POST /api/promotions — admin create DISCOUNT",
    status: r1.status === 201 ? "PASS" : "FAIL",
    expected: "201",
    actual: `${r1.status} id=${promoId ?? "?"} code=${promoCode ?? "?"}`,
  });

  // PROMO-2: Create PERCENT
  const r2 = await req("POST", "/api/promotions", {
    code_name: `QA_PCT_${Date.now()}`,
    description: "QA Percent Test",
    type: "PERCENT",
    discount: 10,
  }, adminToken);
  log({
    testId: "PROMO-2", name: "POST /api/promotions — admin create PERCENT",
    status: r2.status === 201 ? "PASS" : "FAIL",
    expected: "201",
    actual: `${r2.status}`,
  });

  // PROMO-3: Duplicate code → 409
  if (promoCode) {
    const r3 = await req("POST", "/api/promotions", {
      code_name: promoCode, description: "Dup", type: "DISCOUNT", discount: 10,
    }, adminToken);
    log({
      testId: "PROMO-3", name: "POST /api/promotions — duplicate code → 409",
      status: r3.status === 409 ? "PASS" : "FAIL",
      expected: "409",
      actual: `${r3.status}`,
    });
  }

  // PROMO-4: List
  const r4 = await req("GET", "/api/promotions", undefined, adminToken);
  log({
    testId: "PROMO-4", name: "GET /api/promotions — admin list",
    status: r4.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r4.status}`,
  });

  if (promoId) {
    // PROMO-5: Update type (P2-M3)
    const r5 = await req("PUT", `/api/promotions/${promoId}`, { type: "PERCENT", discount: 15 }, adminToken);
    log({
      testId: "PROMO-5", name: "PUT /api/promotions/:id — update type (P2-M3)",
      status: r5.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r5.status} type=${r5.data?.data?.type ?? "?"}`,
    });
    await req("PUT", `/api/promotions/${promoId}`, { type: "DISCOUNT", discount: 50.00 }, adminToken);

    // PROMO-6: Toggle status
    const r6 = await req("PATCH", `/api/promotions/${promoId}/status`, undefined, adminToken);
    log({
      testId: "PROMO-6", name: "PATCH /api/promotions/:id/status — toggle (disable)",
      status: r6.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r6.status} active=${r6.data?.data?.is_active ?? "?"}`,
    });
  }

  // PROMO-7: Validate active code (user)
  if (userToken && promoCode) {
    if (promoId) await req("PATCH", `/api/promotions/${promoId}/status`, undefined, adminToken);
    const r7 = await req("POST", "/api/promotions/validate", { code: promoCode }, userToken);
    log({
      testId: "PROMO-7", name: "POST /api/promotions/validate — user validate active code",
      status: r7.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r7.status} discount=${r7.data?.data?.discount ?? "?"}`,
    });
  }

  // PROMO-8: Invalid code → 400
  if (userToken) {
    const r8 = await req("POST", "/api/promotions/validate", { code: "NOSUCHCODE999" }, userToken);
    log({
      testId: "PROMO-8", name: "POST /api/promotions/validate — invalid code → 400",
      status: r8.status === 400 ? "PASS" : "FAIL",
      expected: "400",
      actual: `${r8.status}`,
    });
  }

  // PROMO-9: User cannot list → 403
  if (userToken) {
    const r9 = await req("GET", "/api/promotions", undefined, userToken);
    log({
      testId: "PROMO-9", name: "GET /api/promotions — user (non-admin) → 403",
      status: r9.status === 403 ? "PASS" : "FAIL",
      expected: "403",
      actual: `${r9.status}`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — Orders & Transactions
// ═══════════════════════════════════════════════════════════════════════════════

async function phase3_orders() {
  console.log("\n━━━ PHASE 3: Orders ━━━");

  if (!userToken) { console.log("  [SKIP] No user token"); return; }

  // ORD-1: No auth → 401
  const r1 = await req("POST", "/api/orders", { package_id: 1 });
  log({
    testId: "ORD-1", name: "POST /api/orders — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r1.status}`,
  });

  // ORD-2: Non-existent package → 404
  const r2 = await req("POST", "/api/orders", { package_id: 999999 }, userToken);
  log({
    testId: "ORD-2", name: "POST /api/orders — non-existent package → 404",
    status: r2.status === 404 ? "PASS" : "FAIL",
    expected: "404",
    actual: `${r2.status} ${r2.data?.message || ""}`,
  });

  // ORD-3: Missing package_id → 400
  const r3 = await req("POST", "/api/orders", {}, userToken);
  log({
    testId: "ORD-3", name: "POST /api/orders — missing package_id → 400",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status}`,
  });

  if (!packageId) { console.log("  [SKIP] No packageId available"); return; }

  // ORD-4: Valid order (no promo)
  const r4 = await req("POST", "/api/orders", { package_id: packageId }, userToken);
  orderId = r4.data?.data?.id ?? null;
  log({
    testId: "ORD-4", name: "POST /api/orders — valid, no promo",
    status: r4.status === 201 ? "PASS" : "FAIL",
    expected: "201 with order",
    actual: `${r4.status} id=${orderId ?? "?"} amount=${r4.data?.data?.amount ?? "?"}`,
  });

  // ORD-5: List own orders
  const r5 = await req("GET", "/api/orders", undefined, userToken);
  log({
    testId: "ORD-5", name: "GET /api/orders — user (own orders)",
    status: r5.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r5.status} count=${r5.data?.data?.data?.length ?? r5.data?.data?.total ?? "?"}`,
  });

  // ORD-6: Get by ID
  if (orderId) {
    const r6 = await req("GET", `/api/orders/${orderId}`, undefined, userToken);
    log({
      testId: "ORD-6", name: "GET /api/orders/:id — owner",
      status: r6.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r6.status} status=${r6.data?.data?.status ?? "?"}`,
    });
  }

  // ORD-7: Access other user's order → 403 or 404
  const r7 = await req("GET", "/api/orders/1", undefined, userToken);
  log({
    testId: "ORD-7", name: "GET /api/orders/1 — other user's order → 403 or 404",
    status: r7.status === 403 || r7.status === 404 ? "PASS" : "WARN",
    expected: "403 or 404",
    actual: `${r7.status} ${r7.data?.message || ""}`,
    note: "If orderId=1 belongs to another user",
  });

  // ORD-8: Order with promo code
  let promoCode: string | null = null;
  if (adminToken && promoId) {
    const promoR = await req("GET", "/api/promotions", undefined, adminToken);
    const promos = promoR.data?.data ?? [];
    const found = Array.isArray(promos) ? promos.find((p: any) => p.id === promoId) : null;
    if (found) promoCode = found.code_name;
  }
  if (promoCode) {
    const r8 = await req("POST", "/api/orders", { package_id: packageId, promo_code: promoCode }, userToken);
    log({
      testId: "ORD-8", name: "POST /api/orders — with valid promo code",
      status: r8.status === 201 ? "PASS" : "FAIL",
      expected: "201 with discounted amount",
      actual: `${r8.status} original=${r8.data?.data?.original_amount ?? "?"} final=${r8.data?.data?.amount ?? "?"}`,
    });
    if (r8.data?.data?.id) {
      await req("PATCH", `/api/orders/${r8.data.data.id}/cancel`, undefined, userToken);
    }
  }

  // ORD-9: Cancel order
  if (orderId) {
    const r9 = await req("PATCH", `/api/orders/${orderId}/cancel`, undefined, userToken);
    log({
      testId: "ORD-9", name: "PATCH /api/orders/:id/cancel — user cancel PENDING order",
      status: r9.status === 200 ? "PASS" : "FAIL",
      expected: "200 with CANCELLED status",
      actual: `${r9.status} status=${r9.data?.data?.status ?? "?"}`,
    });

    // ORD-10: Double cancel → 400
    const r10 = await req("PATCH", `/api/orders/${orderId}/cancel`, undefined, userToken);
    log({
      testId: "ORD-10", name: "PATCH /api/orders/:id/cancel — already cancelled → 400",
      status: r10.status === 400 ? "PASS" : "FAIL",
      expected: "400",
      actual: `${r10.status} ${r10.data?.message || ""}`,
    });
  }

  // Fresh order for transaction tests
  const freshOrder = await req("POST", "/api/orders", { package_id: packageId }, userToken);
  if (freshOrder.status === 201 && freshOrder.data?.data?.id) {
    orderId = freshOrder.data.data.id;
    console.log(`  [INFO] Fresh order created: id=${orderId} amount=${freshOrder.data.data.amount}`);
  }

  // ORD-11: Admin sees all orders
  if (adminToken) {
    const r11 = await req("GET", "/api/orders", undefined, adminToken);
    log({
      testId: "ORD-11", name: "GET /api/orders — admin sees all",
      status: r11.status === 200 ? "PASS" : "FAIL",
      expected: "200 all orders",
      actual: `${r11.status}`,
    });
  }
}

async function phase3_transactions() {
  console.log("\n━━━ PHASE 3: Transactions ━━━");

  if (!userToken) { console.log("  [SKIP] No user token"); return; }

  // TX-1: No auth → 401
  const r1 = await req("POST", "/api/transactions", { order_id: 1, payment_method: "TRUEMONEY" });
  log({
    testId: "TX-1", name: "POST /api/transactions — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401",
    actual: `${r1.status}`,
  });

  // TX-2: Missing order_id → 400
  const r2 = await req("POST", "/api/transactions", { payment_method: "TRUEMONEY" }, userToken);
  log({
    testId: "TX-2", name: "POST /api/transactions — missing order_id → 400",
    status: r2.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r2.status}`,
  });

  // TX-3: Missing payment_method → 400
  const r3 = await req("POST", "/api/transactions", { order_id: 1 }, userToken);
  log({
    testId: "TX-3", name: "POST /api/transactions — missing payment_method → 400",
    status: r3.status === 400 ? "PASS" : "FAIL",
    expected: "400",
    actual: `${r3.status}`,
  });

  // TX-4: TRUEMONEY without voucher_code → 400
  if (orderId) {
    const r4 = await req("POST", "/api/transactions", { order_id: orderId, payment_method: "TRUEMONEY" }, userToken);
    log({
      testId: "TX-4", name: "POST /api/transactions — TRUEMONEY no voucher → 400",
      status: r4.status === 400 ? "PASS" : "FAIL",
      expected: "400 (voucher required)",
      actual: `${r4.status} ${r4.data?.message || ""}`,
    });
  }

  // TX-5: PROMPTPAY → pending (TX-SLIP-1 fix)
  if (orderId) {
    const r5 = await req("POST", "/api/transactions", {
      order_id: orderId,
      payment_method: "PROMPTPAY",
    }, userToken);
    txId = r5.data?.data?.id ?? null;
    log({
      testId: "TX-5", name: "POST /api/transactions — PROMPTPAY (pending, manual)",
      status: r5.status === 201 ? "PASS" : "FAIL",
      expected: "201 PENDING transaction",
      actual: `${r5.status} id=${txId ?? "?"} status=${r5.data?.data?.status ?? "?"}`,
    });
  }

  // TX-6: Duplicate submit → 409 (TX-DUP-1 fix)
  if (orderId) {
    const r6 = await req("POST", "/api/transactions", {
      order_id: orderId,
      payment_method: "PROMPTPAY",
    }, userToken);
    log({
      testId: "TX-6", name: "POST /api/transactions — duplicate submit → 409 (TX-DUP-1)",
      status: r6.status === 409 ? "PASS" : "FAIL",
      expected: "409",
      actual: `${r6.status} ${r6.data?.message || ""}`,
    });
  }

  // TX-7: List own transactions
  const r7 = await req("GET", "/api/transactions", undefined, userToken);
  log({
    testId: "TX-7", name: "GET /api/transactions — user (own)",
    status: r7.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r7.status}`,
  });

  // TX-8: User cannot approve → 403
  if (txId && userToken) {
    const r8 = await req("PATCH", `/api/transactions/${txId}/approve`, undefined, userToken);
    log({
      testId: "TX-8", name: "PATCH /api/transactions/:id/approve — user → 403",
      status: r8.status === 403 ? "PASS" : "FAIL",
      expected: "403",
      actual: `${r8.status}`,
    });
  }

  if (!adminToken) { console.log("  [SKIP] No admin token — skip approve/reject"); }

  // TX-9: Admin approve PROMPTPAY
  if (txId && adminToken) {
    const r9 = await req("PATCH", `/api/transactions/${txId}/approve`, undefined, adminToken);
    log({
      testId: "TX-9", name: "PATCH /api/transactions/:id/approve — admin approve PROMPTPAY",
      status: r9.status === 200 ? "PASS" : "FAIL",
      expected: "200 PAID",
      actual: `${r9.status} status=${r9.data?.data?.status ?? "?"}`,
    });
  }

  // TX-10: Admin list all
  if (adminToken) {
    const r10 = await req("GET", "/api/transactions", undefined, adminToken);
    log({
      testId: "TX-10", name: "GET /api/transactions — admin (all)",
      status: r10.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${r10.status}`,
    });
  }

  // TX-11: TrueMoney voucher
  if (packageId && userToken) {
    const freshOrd = await req("POST", "/api/orders", { package_id: packageId }, userToken);
    if (freshOrd.status === 201 && freshOrd.data?.data?.id) {
      const freshOrderId = freshOrd.data.data.id;
      const r11 = await req("POST", "/api/transactions", {
        order_id: freshOrderId,
        payment_method: "TRUEMONEY",
        voucher_code: VOUCHER_HASH,
      }, userToken);
      log({
        testId: "TX-11", name: "POST /api/transactions — TRUEMONEY voucher_hash test",
        status: r11.status === 201 || r11.status === 402 || r11.status === 400 ? "PASS" : "FAIL",
        expected: "201 (paid) | 402 (verification failed) | 400 (amount mismatch)",
        actual: `${r11.status} ${r11.data?.message || JSON.stringify(r11.data).slice(0, 100)}`,
        note: "402=TrueMoney API rejected; 400=amount mismatch; 201=success",
      });
      if (r11.status !== 201) {
        await req("PATCH", `/api/orders/${freshOrderId}/cancel`, undefined, userToken);
      }
    }
  }

  // TX-12: Admin reject
  if (packageId && userToken && adminToken) {
    const ord = await req("POST", "/api/orders", { package_id: packageId }, userToken);
    if (ord.status === 201 && ord.data?.data?.id) {
      const oid = ord.data.data.id;
      const tx = await req("POST", "/api/transactions", { order_id: oid, payment_method: "PROMPTPAY" }, userToken);
      if (tx.status === 201 && tx.data?.data?.id) {
        const tid = tx.data.data.id;
        const r12 = await req("PATCH", `/api/transactions/${tid}/reject`, { reason: "QA test reject" }, adminToken);
        log({
          testId: "TX-12", name: "PATCH /api/transactions/:id/reject — admin reject with reason",
          status: r12.status === 200 ? "PASS" : "FAIL",
          expected: "200 REJECTED",
          actual: `${r12.status} status=${r12.data?.data?.status ?? "?"}`,
        });
        await req("PATCH", `/api/orders/${oid}/cancel`, undefined, adminToken);
      }
    }
  }

  // TX-13: Approve non-PromptPay → 400
  if (adminToken) {
    const txList = await req("GET", "/api/transactions", undefined, adminToken);
    const txs = txList.data?.data?.data ?? txList.data?.data ?? [];
    const nonPP = Array.isArray(txs)
      ? txs.find((t: any) => t.payment_method !== "PROMPTPAY" && t.status === "PENDING")
      : null;
    if (nonPP) {
      const r13 = await req("PATCH", `/api/transactions/${nonPP.id}/approve`, undefined, adminToken);
      log({
        testId: "TX-13", name: "PATCH /api/transactions/:id/approve — non-PromptPay → 400",
        status: r13.status === 400 ? "PASS" : "WARN",
        expected: "400",
        actual: `${r13.status} ${r13.data?.message || ""}`,
        note: `tx id=${nonPP.id} method=${nonPP.payment_method}`,
      });
    } else {
      log({ testId: "TX-13", name: "Approve non-PromptPay → 400", status: "SKIP", expected: "400", actual: "No non-PromptPay PENDING tx found" });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — SlipOK Integration
// ═══════════════════════════════════════════════════════════════════════════════

async function phase3_slipok() {
  console.log("\n━━━ PHASE 3: SlipOK Integration ━━━");

  if (!userToken) {
    log({ testId: "SLIP-1", name: "SlipOK — create order", status: "SKIP", expected: "user token", actual: "No user token" });
    return;
  }

  let slipBase64: string;
  let slipAmount: number;
  try {
    const example = JSON.parse(readFileSync("./tests/slipok.example", "utf-8"));
    slipBase64 = example.files as string;
    slipAmount = example.amount as number;
  } catch {
    log({ testId: "SLIP-1", name: "SlipOK — read fixture file", status: "SKIP", expected: "tests/slipok.example present", actual: "File not found or invalid JSON" });
    return;
  }

  if (!packageId) {
    log({ testId: "SLIP-1", name: "SlipOK — create order", status: "SKIP", expected: "packageId set", actual: "No packageId from Phase 2" });
    return;
  }

  // SLIP-1: Create order for SLIP test
  const ordR = await req("POST", "/api/orders", { package_id: packageId }, userToken);
  const slipOrderId = ordR.data?.data?.id;
  const orderAmount = ordR.data?.data?.amount;
  log({
    testId: "SLIP-1", name: "POST /api/orders — create order for SLIP payment",
    status: ordR.status === 201 && slipOrderId ? "PASS" : "FAIL",
    expected: "201 with order",
    actual: `${ordR.status} id=${slipOrderId ?? "?"} amount=${orderAmount ?? "?"}`,
    note: `slip=${slipAmount} THB vs order=${orderAmount} THB → ${slipAmount === orderAmount ? "MATCH" : "MISMATCH"}`,
  });

  if (!slipOrderId) return;

  // SLIP-2: Submit SLIP transaction (live SlipOK call)
  const txR = await req("POST", "/api/transactions", {
    order_id: slipOrderId,
    payment_method: "SLIP",
    slip_image: slipBase64,
  }, userToken);

  const slipExpected = [201, 400, 402];
  log({
    testId: "SLIP-2", name: "POST /api/transactions — SLIP (SlipOK live API call)",
    status: slipExpected.includes(txR.status) ? "PASS" : "FAIL",
    expected: "201 success | 400 amount_mismatch | 402 duplicate/wrong_receiver/bank_error",
    actual: `${txR.status} ${txR.data?.message ?? JSON.stringify(txR.data).slice(0, 120)}`,
    note: "SlipOK checks duplicate (1012) before amount (1013) — reused slip → 402 DUPLICATE_SLIP expected",
  });

  // SLIP-3: Cleanup — cancel if not paid
  if (txR.status !== 201) {
    const cancel = await req("PATCH", `/api/orders/${slipOrderId}/cancel`, undefined, userToken);
    log({
      testId: "SLIP-3", name: "PATCH /api/orders/:id/cancel — cleanup after SLIP failure",
      status: cancel.status === 200 ? "PASS" : "FAIL",
      expected: "200",
      actual: `${cancel.status}`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4 — IP Pool Management
// ═══════════════════════════════════════════════════════════════════════════════

async function phase4_ip_pools() {
  console.log("\n━━━ PHASE 4: IP Pools ━━━");

  // IP-1: No auth → 401
  const r1 = await req("GET", "/api/ip-pools");
  log({
    testId: "IP-1", name: "GET /api/ip-pools — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // IP-2: Admin list → 200
  const r2 = await req("GET", "/api/ip-pools", undefined, adminToken);
  log({
    testId: "IP-2", name: "GET /api/ip-pools — admin → 200",
    status: r2.status === 200 ? "PASS" : "FAIL",
    expected: "200", actual: `${r2.status} total=${r2.data?.data?.total ?? "?"}`,
  });

  // IP-3: Create single IP → 201
  const testIp = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const r3 = await req("POST", "/api/ip-pools", { ip: testIp, type: "PUBLIC" }, adminToken);
  const newIpId = r3.data?.data?.id ?? null;
  log({
    testId: "IP-3", name: "POST /api/ip-pools — admin create single IP → 201",
    status: r3.status === 201 ? "PASS" : "FAIL",
    expected: "201", actual: `${r3.status} id=${newIpId ?? "?"} ip=${testIp}`,
  });

  // IP-4: Create single IP — invalid format → 422
  const r4 = await req("POST", "/api/ip-pools", { ip: "999.999.999.999", type: "PUBLIC" }, adminToken);
  log({
    testId: "IP-4", name: "POST /api/ip-pools — invalid IP format → 422",
    status: r4.status === 422 || r4.status === 400 ? "PASS" : "FAIL",
    expected: "422 or 400", actual: `${r4.status}`,
  });

  // IP-5: User (non-admin) cannot create → 403
  if (userToken) {
    const r5 = await req("POST", "/api/ip-pools", { ip: "10.0.0.1", type: "PUBLIC" }, userToken);
    log({
      testId: "IP-5", name: "POST /api/ip-pools — user (non-admin) → 403",
      status: r5.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r5.status}`,
    });
  }

  // IP-6: Create range — valid → 201
  const rangeBase = `10.88.${Math.floor(Math.random() * 200)}`;
  const r6 = await req("POST", "/api/ip-pools/range", {
    ip_start: `${rangeBase}.1`,
    ip_end: `${rangeBase}.10`,
    type: "PUBLIC",
  }, adminToken);
  log({
    testId: "IP-6", name: "POST /api/ip-pools/range — valid range (10 IPs) → 201",
    status: r6.status === 201 ? "PASS" : "FAIL",
    expected: "201 added=10 skipped=0",
    actual: `${r6.status} added=${r6.data?.data?.added ?? "?"} skipped=${r6.data?.data?.skipped ?? "?"}`,
  });

  // IP-7: Create range again (same range) — all skipped → 201 skipped=10
  const r7 = await req("POST", "/api/ip-pools/range", {
    ip_start: `${rangeBase}.1`,
    ip_end: `${rangeBase}.10`,
    type: "PUBLIC",
  }, adminToken);
  log({
    testId: "IP-7", name: "POST /api/ip-pools/range — duplicate range → 201 skipped=10",
    status: r7.status === 201 && r7.data?.data?.added === 0 && r7.data?.data?.skipped === 10 ? "PASS" : "FAIL",
    expected: "201 added=0 skipped=10",
    actual: `${r7.status} added=${r7.data?.data?.added ?? "?"} skipped=${r7.data?.data?.skipped ?? "?"}`,
  });

  // IP-8: Create range — start > end → 400
  const r8 = await req("POST", "/api/ip-pools/range", {
    ip_start: `${rangeBase}.50`,
    ip_end: `${rangeBase}.1`,
    type: "PRIVATE",
  }, adminToken);
  log({
    testId: "IP-8", name: "POST /api/ip-pools/range — start > end → 400",
    status: r8.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r8.status} ${r8.data?.message || ""}`,
  });

  // IP-9: Create range — > 256 IPs → 400
  const r9 = await req("POST", "/api/ip-pools/range", {
    ip_start: "10.77.0.0",
    ip_end: "10.77.1.10",
    type: "PUBLIC",
  }, adminToken);
  log({
    testId: "IP-9", name: "POST /api/ip-pools/range — 267 IPs > 256 limit → 400",
    status: r9.status === 400 ? "PASS" : "FAIL",
    expected: "400 Range too large", actual: `${r9.status} ${r9.data?.message || ""}`,
  });

  // IP-10: Create range — invalid IP format → 422
  const r10 = await req("POST", "/api/ip-pools/range", {
    ip_start: "not-an-ip",
    ip_end: "10.0.0.10",
    type: "PUBLIC",
  }, adminToken);
  log({
    testId: "IP-10", name: "POST /api/ip-pools/range — invalid IP format → 422",
    status: r10.status === 422 || r10.status === 400 ? "PASS" : "FAIL",
    expected: "422 or 400", actual: `${r10.status}`,
  });

  // IP-11: Update IP → 200
  if (newIpId) {
    const r11 = await req("PATCH", `/api/ip-pools/${newIpId}`, { type: "PRIVATE" }, adminToken);
    log({
      testId: "IP-11", name: "PATCH /api/ip-pools/:id — admin update type → 200",
      status: r11.status === 200 ? "PASS" : "FAIL",
      expected: "200", actual: `${r11.status} type=${r11.data?.data?.type ?? "?"}`,
    });
  }

  // IP-12: Toggle status → 200
  if (newIpId) {
    const r12 = await req("PATCH", `/api/ip-pools/${newIpId}/status`, undefined, adminToken);
    log({
      testId: "IP-12", name: "PATCH /api/ip-pools/:id/status — toggle → 200",
      status: r12.status === 200 ? "PASS" : "FAIL",
      expected: "200", actual: `${r12.status} status=${r12.data?.data?.status ?? "?"}`,
    });
    // re-enable
    await req("PATCH", `/api/ip-pools/${newIpId}/status`, undefined, adminToken);
  }

  // IP-13: Invalid ID → 400
  const r13 = await req("PATCH", "/api/ip-pools/abc", { type: "PUBLIC" }, adminToken);
  log({
    testId: "IP-13", name: "PATCH /api/ip-pools/abc — invalid ID → 400",
    status: r13.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r13.status}`,
  });

  // IP-14: Not found → 404
  const r14 = await req("PATCH", "/api/ip-pools/999999", { type: "PUBLIC" }, adminToken);
  log({
    testId: "IP-14", name: "PATCH /api/ip-pools/999999 — not found → 404",
    status: r14.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r14.status}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4b — System Config Management
// ═══════════════════════════════════════════════════════════════════════════════

async function phase4_system_configs() {
  console.log("\n━━━ PHASE 4b: System Configs ━━━");

  // SYSCFG-1: No auth → 401
  const r1 = await req("GET", "/api/system-configs");
  log({
    testId: "SYSCFG-1", name: "GET /api/system-configs — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  // SYSCFG-2: User token → 403
  if (userToken) {
    const r2 = await req("GET", "/api/system-configs", undefined, userToken);
    log({
      testId: "SYSCFG-2", name: "GET /api/system-configs — user → 403",
      status: r2.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r2.status}`,
    });
  }

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // SYSCFG-3: Admin list all → 200, array with 18 keys
  const r3 = await req("GET", "/api/system-configs", undefined, adminToken);
  log({
    testId: "SYSCFG-3", name: "GET /api/system-configs — admin → 200 array",
    status: r3.status === 200 && Array.isArray(r3.data?.data) ? "PASS" : "FAIL",
    expected: "200 data=[array]", actual: `${r3.status} count=${r3.data?.data?.length ?? "?"}`,
  });

  // SYSCFG-4: Get single key → 200
  const r4 = await req("GET", "/api/system-configs/proxmox.host", undefined, adminToken);
  log({
    testId: "SYSCFG-4", name: "GET /api/system-configs/proxmox.host — admin → 200",
    status: r4.status === 200 && r4.data?.data?.key === "proxmox.host" ? "PASS" : "FAIL",
    expected: "200 key=proxmox.host", actual: `${r4.status} key=${r4.data?.data?.key ?? "?"}`,
  });

  // SYSCFG-5: Get non-existent key → 404
  const r5 = await req("GET", "/api/system-configs/nonexistent.key", undefined, adminToken);
  log({
    testId: "SYSCFG-5", name: "GET /api/system-configs/nonexistent.key — admin → 404",
    status: r5.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r5.status}`,
  });

  // SYSCFG-6: User PUT → 403
  if (userToken) {
    const r6 = await req("PUT", "/api/system-configs/proxmox.node", { value: "pve" }, userToken);
    log({
      testId: "SYSCFG-6", name: "PUT /api/system-configs/:key — user → 403",
      status: r6.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r6.status}`,
    });
  }

  // SYSCFG-7: Admin PUT existing key → 200
  const currentNode = r3.data?.data?.find((c: any) => c.key === "proxmox.node");
  const nodeVal = currentNode?.value ?? "pve";
  const r7 = await req("PUT", "/api/system-configs/proxmox.node", { value: nodeVal }, adminToken);
  log({
    testId: "SYSCFG-7", name: "PUT /api/system-configs/proxmox.node — admin → 200",
    status: r7.status === 200 ? "PASS" : "FAIL",
    expected: "200", actual: `${r7.status} ${r7.data?.message ?? ""}`,
  });

  // SYSCFG-8: Admin PUT non-existent key → 404
  const r8 = await req("PUT", "/api/system-configs/ghost.key", { value: "test" }, adminToken);
  log({
    testId: "SYSCFG-8", name: "PUT /api/system-configs/ghost.key — not found → 404",
    status: r8.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r8.status}`,
  });

  // SYSCFG-9: Verify categories — proxmox, mikrotik, pricing all present
  const categories = new Set((r3.data?.data ?? []).map((c: any) => c.category));
  const hasCats = categories.has("proxmox") && categories.has("mikrotik") && categories.has("pricing");
  log({
    testId: "SYSCFG-9", name: "GET /api/system-configs — all 3 categories present",
    status: hasCats ? "PASS" : "FAIL",
    expected: "categories: proxmox, mikrotik, pricing", actual: `[${[...categories].join(", ")}]`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4c — VPS Management & Auto-Renew
// ═══════════════════════════════════════════════════════════════════════════════

async function phase4_vps() {
  console.log("\n━━━ PHASE 4c: VPS Management ━━━");

  // VPS-1: No auth → 401
  const r1 = await req("GET", "/api/vps");
  log({
    testId: "VPS-1", name: "GET /api/vps — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // VPS-2: User list own VPS → 200
  if (userToken) {
    const r2 = await req("GET", "/api/vps", undefined, userToken);
    log({
      testId: "VPS-2", name: "GET /api/vps — user (own VPS list) → 200",
      status: r2.status === 200 ? "PASS" : "FAIL",
      expected: "200", actual: `${r2.status} total=${r2.data?.data?.total ?? "?"}`,
    });
  }

  // VPS-3: Admin list all VPS → 200, save testVpsId
  const r3 = await req("GET", "/api/vps", undefined, adminToken);
  log({
    testId: "VPS-3", name: "GET /api/vps — admin (all VPS list) → 200",
    status: r3.status === 200 ? "PASS" : "FAIL",
    expected: "200", actual: `${r3.status} total=${r3.data?.data?.total ?? "?"}`,
  });
  if (r3.status === 200) {
    testVpsId = r3.data?.data?.vps?.[0]?.id ?? null;
    if (testVpsId) console.log(`  [INFO] testVpsId=${testVpsId} (will be used for downstream tests)`);
    else console.log("  [INFO] No VPS found — VPS-specific tests will test 404 path");
  }

  // VPS-4: GET /api/vps/queue — user → 403
  if (userToken) {
    const r4 = await req("GET", "/api/vps/queue", undefined, userToken);
    log({
      testId: "VPS-4", name: "GET /api/vps/queue — user → 403",
      status: r4.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r4.status}`,
    });
  }

  // VPS-5: GET /api/vps/queue — admin → 200
  const r5 = await req("GET", "/api/vps/queue", undefined, adminToken);
  log({
    testId: "VPS-5", name: "GET /api/vps/queue — admin → 200",
    status: r5.status === 200 ? "PASS" : "FAIL",
    expected: "200", actual: `${r5.status} count=${Array.isArray(r5.data?.data) ? r5.data.data.length : "?"}`,
  });

  // VPS-6: GET /api/vps/:id — invalid ID → 400
  const r6 = await req("GET", "/api/vps/abc", undefined, adminToken);
  log({
    testId: "VPS-6", name: "GET /api/vps/abc — invalid ID → 400",
    status: r6.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r6.status}`,
  });

  // VPS-7: GET /api/vps/999999 — not found → 404
  const r7 = await req("GET", "/api/vps/999999", undefined, adminToken);
  log({
    testId: "VPS-7", name: "GET /api/vps/999999 — not found → 404",
    status: r7.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r7.status}`,
  });

  // VPS-8: GET /api/vps/:id (if exists) → 200
  if (testVpsId) {
    const r8 = await req("GET", `/api/vps/${testVpsId}`, undefined, adminToken);
    log({
      testId: "VPS-8", name: `GET /api/vps/${testVpsId} — admin get by ID → 200`,
      status: r8.status === 200 ? "PASS" : "FAIL",
      expected: "200", actual: `${r8.status} name=${r8.data?.data?.name ?? "?"}`,
    });
  } else {
    log({ testId: "VPS-8", name: "GET /api/vps/:id — SKIP (no VPS in system)", status: "SKIP", expected: "200", actual: "no VPS" });
  }

  // AR-1: PATCH /api/vps/abc/auto-renew — invalid ID → 400
  const ar1 = await req("PATCH", "/api/vps/abc/auto-renew", { auto_renew: true }, adminToken);
  log({
    testId: "AR-1", name: "PATCH /api/vps/abc/auto-renew — invalid ID → 400",
    status: ar1.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${ar1.status}`,
  });

  // AR-2: PATCH /api/vps/999999/auto-renew — not found → 404
  const ar2 = await req("PATCH", "/api/vps/999999/auto-renew", { auto_renew: true }, adminToken);
  log({
    testId: "AR-2", name: "PATCH /api/vps/999999/auto-renew — not found → 404",
    status: ar2.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${ar2.status}`,
  });

  // AR-3: PATCH /api/vps/:id/auto-renew (if VPS exists) → 200
  if (testVpsId) {
    const ar3 = await req("PATCH", `/api/vps/${testVpsId}/auto-renew`, { auto_renew: false }, adminToken);
    log({
      testId: "AR-3", name: `PATCH /api/vps/${testVpsId}/auto-renew — admin toggle → 200`,
      status: ar3.status === 200 ? "PASS" : "FAIL",
      expected: "200", actual: `${ar3.status} auto_renew=${ar3.data?.data?.auto_renew ?? "?"}`,
    });
  } else {
    log({ testId: "AR-3", name: "PATCH /api/vps/:id/auto-renew — SKIP (no VPS)", status: "SKIP", expected: "200", actual: "no VPS" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Email Broadcasts
// ═══════════════════════════════════════════════════════════════════════════════

async function phase5_broadcasts() {
  console.log("\n━━━ PHASE 5: Broadcasts ━━━");

  // BC-1: No auth → 401
  const r1 = await req("POST", "/api/broadcasts", { subject: "Test", body: "Hello", type: "ANNOUNCEMENT", target: "ALL" });
  log({
    testId: "BC-1", name: "POST /api/broadcasts — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  // BC-2: User token → 403
  if (userToken) {
    const r2 = await req("POST", "/api/broadcasts", { subject: "Test", body: "Hello", type: "ANNOUNCEMENT", target: "ALL" }, userToken);
    log({
      testId: "BC-2", name: "POST /api/broadcasts — user → 403",
      status: r2.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r2.status}`,
    });
  }

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // BC-3: Admin send broadcast → 201
  const r3 = await req("POST", "/api/broadcasts", {
    subject: "[QA Test] Broadcast",
    body: "Automated QA test broadcast — safe to ignore.",
    type: "ANNOUNCEMENT",
    target: "ALL",
  }, adminToken);
  broadcastId = r3.data?.data?.broadcastId ?? null;
  log({
    testId: "BC-3", name: "POST /api/broadcasts — admin ANNOUNCEMENT/ALL → 201",
    status: r3.status === 201 ? "PASS" : "FAIL",
    expected: "201", actual: `${r3.status} broadcastId=${broadcastId ?? "?"}`,
  });

  // BC-4: Invalid type → 400
  const r4 = await req("POST", "/api/broadcasts", {
    subject: "Test",
    body: "Body",
    type: "INVALID_TYPE",
    target: "ALL",
  }, adminToken);
  log({
    testId: "BC-4", name: "POST /api/broadcasts — invalid type → 400",
    status: r4.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r4.status}`,
  });

  // BC-5: GET /api/broadcasts — admin → 200
  const r5 = await req("GET", "/api/broadcasts", undefined, adminToken);
  log({
    testId: "BC-5", name: "GET /api/broadcasts — admin list → 200",
    status: r5.status === 200 && Array.isArray(r5.data?.data?.broadcasts) ? "PASS" : "FAIL",
    expected: "200 data.broadcasts=[array]", actual: `${r5.status} count=${r5.data?.data?.broadcasts?.length ?? "?"}`,
  });

  // BC-6: GET /api/broadcasts/:id — existing → 200
  if (broadcastId) {
    const r6 = await req("GET", `/api/broadcasts/${broadcastId}`, undefined, adminToken);
    log({
      testId: "BC-6", name: `GET /api/broadcasts/${broadcastId} — admin → 200`,
      status: r6.status === 200 ? "PASS" : "FAIL",
      expected: "200", actual: `${r6.status} type=${r6.data?.data?.type ?? "?"}`,
    });
  }

  // BC-7: GET /api/broadcasts/999999 — not found → 404
  const r7 = await req("GET", "/api/broadcasts/999999", undefined, adminToken);
  log({
    testId: "BC-7", name: "GET /api/broadcasts/999999 — not found → 404",
    status: r7.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r7.status}`,
  });

  // BC-8: User GET broadcasts → 403
  if (userToken) {
    const r8 = await req("GET", "/api/broadcasts", undefined, userToken);
    log({
      testId: "BC-8", name: "GET /api/broadcasts — user → 403",
      status: r8.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r8.status}`,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5 — Admin Audit Logs
// ═══════════════════════════════════════════════════════════════════════════════

async function phase5_audit_logs() {
  console.log("\n━━━ PHASE 5: Audit Logs ━━━");

  // AL-1: No auth → 401
  const r1 = await req("GET", "/api/audit-logs");
  log({
    testId: "AL-1", name: "GET /api/audit-logs — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  // AL-2: User → 403
  if (userToken) {
    const r2 = await req("GET", "/api/audit-logs", undefined, userToken);
    log({
      testId: "AL-2", name: "GET /api/audit-logs — user → 403",
      status: r2.status === 403 ? "PASS" : "FAIL",
      expected: "403", actual: `${r2.status}`,
    });
  }

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // AL-3: Admin list → 200, has logs array + pagination
  const r3 = await req("GET", "/api/audit-logs", undefined, adminToken);
  log({
    testId: "AL-3", name: "GET /api/audit-logs — admin → 200 paginated",
    status: r3.status === 200 && Array.isArray(r3.data?.data?.logs) ? "PASS" : "FAIL",
    expected: "200 data.logs=[array]", actual: `${r3.status} total=${r3.data?.data?.total ?? "?"}`,
  });

  // AL-4: Filter by entity=POLICY → 200
  const r4 = await req("GET", "/api/audit-logs?entity=POLICY", undefined, adminToken);
  log({
    testId: "AL-4", name: "GET /api/audit-logs?entity=POLICY — admin → 200 filtered",
    status: r4.status === 200 ? "PASS" : "FAIL",
    expected: "200", actual: `${r4.status} total=${r4.data?.data?.total ?? "?"}`,
  });

  // AL-5: Invalid from date → 400
  const r5 = await req("GET", "/api/audit-logs?from=not-a-date", undefined, adminToken);
  log({
    testId: "AL-5", name: "GET /api/audit-logs?from=not-a-date — invalid date → 400",
    status: r5.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r5.status}`,
  });

  // AL-6: page + limit query → 200
  const r6 = await req("GET", "/api/audit-logs?page=1&limit=5", undefined, adminToken);
  log({
    testId: "AL-6", name: "GET /api/audit-logs?page=1&limit=5 — admin → 200, max 5 logs",
    status: r6.status === 200 && (r6.data?.data?.logs?.length ?? 0) <= 5 ? "PASS" : "FAIL",
    expected: "200 logs.length <= 5", actual: `${r6.status} count=${r6.data?.data?.logs?.length ?? "?"}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 8 — NAT / Port Rules
// ═══════════════════════════════════════════════════════════════════════════════

async function phase8_nat() {
  console.log("\n━━━ PHASE 8: NAT Port Rules ━━━");

  // NAT-1: No auth → 401
  const r1 = await req("GET", "/api/vps/1/port-rules");
  log({
    testId: "NAT-1", name: "GET /api/vps/1/port-rules — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // NAT-2: Invalid VPS ID → 400
  const r2 = await req("GET", "/api/vps/abc/port-rules", undefined, adminToken);
  log({
    testId: "NAT-2", name: "GET /api/vps/abc/port-rules — invalid ID → 400",
    status: r2.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r2.status}`,
  });

  // NAT-3: VPS 999999 → 404 (VPS not found)
  const r3 = await req("GET", "/api/vps/999999/port-rules", undefined, adminToken);
  log({
    testId: "NAT-3", name: "GET /api/vps/999999/port-rules — VPS not found → 404",
    status: r3.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r3.status}`,
  });

  // NAT-4: GET port-rules for existing public-IP VPS → 404 NAT_NOT_FOUND
  if (testVpsId) {
    const r4 = await req("GET", `/api/vps/${testVpsId}/port-rules`, undefined, adminToken);
    log({
      testId: "NAT-4", name: `GET /api/vps/${testVpsId}/port-rules — public VPS → 404 NAT_NOT_FOUND or 200`,
      status: r4.status === 404 || r4.status === 200 ? "PASS" : "FAIL",
      expected: "404 (NAT_NOT_FOUND if public IP) or 200 (if NAT VPS)",
      actual: `${r4.status} ${r4.data?.message ?? ""}`,
    });
  } else {
    log({ testId: "NAT-4", name: "GET /api/vps/:id/port-rules — SKIP (no VPS)", status: "SKIP", expected: "404 or 200", actual: "no VPS" });
  }

  // NAT-5: POST /api/vps/999999/port-rules — no auth → 401
  const r5 = await req("POST", "/api/vps/999999/port-rules", { privateIp: "10.0.0.1", privatePort: 8080, protocol: "TCP" });
  log({
    testId: "NAT-5", name: "POST /api/vps/999999/port-rules — no auth → 401",
    status: r5.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r5.status}`,
  });

  // NAT-6: DELETE /api/vps/999999/port-rules/1 — admin → 404 (VPS not found)
  const r6 = await req("DELETE", "/api/vps/999999/port-rules/1", undefined, adminToken);
  log({
    testId: "NAT-6", name: "DELETE /api/vps/999999/port-rules/1 — admin, VPS not found → 404",
    status: r6.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r6.status}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 9 — VM Upgrade
// ═══════════════════════════════════════════════════════════════════════════════

async function phase9_upgrade() {
  console.log("\n━━━ PHASE 9: VM Upgrade ━━━");

  // UPG-1: No auth → 401
  const r1 = await req("POST", "/api/vps/1/upgrade/package", { package_id: 1 });
  log({
    testId: "UPG-1", name: "POST /api/vps/1/upgrade/package — no auth → 401",
    status: r1.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r1.status}`,
  });

  if (!adminToken) { console.log("  [SKIP] No admin token"); return; }

  // UPG-2: Invalid VPS ID → 400
  const r2 = await req("POST", "/api/vps/abc/upgrade/package", { package_id: 1 }, adminToken);
  log({
    testId: "UPG-2", name: "POST /api/vps/abc/upgrade/package — invalid ID → 400",
    status: r2.status === 400 ? "PASS" : "FAIL",
    expected: "400", actual: `${r2.status}`,
  });

  // UPG-3: VPS not found → 404
  const r3 = await req("POST", "/api/vps/999999/upgrade/package", { package_id: 1 }, adminToken);
  log({
    testId: "UPG-3", name: "POST /api/vps/999999/upgrade/package — VPS not found → 404",
    status: r3.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r3.status} ${r3.data?.message ?? ""}`,
  });

  // UPG-4: Custom upgrade — invalid VPS → 404
  const r4 = await req("POST", "/api/vps/999999/upgrade/custom", { cores: 4 }, adminToken);
  log({
    testId: "UPG-4", name: "POST /api/vps/999999/upgrade/custom — VPS not found → 404",
    status: r4.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r4.status}`,
  });

  // UPG-5: GET upgrade history — no auth → 401
  const r5 = await req("GET", "/api/vps/1/upgrade/history");
  log({
    testId: "UPG-5", name: "GET /api/vps/1/upgrade/history — no auth → 401",
    status: r5.status === 401 ? "PASS" : "FAIL",
    expected: "401", actual: `${r5.status}`,
  });

  // UPG-6: GET upgrade history for VPS 999999 → 404
  const r6 = await req("GET", "/api/vps/999999/upgrade/history", undefined, adminToken);
  log({
    testId: "UPG-6", name: "GET /api/vps/999999/upgrade/history — VPS not found → 404",
    status: r6.status === 404 ? "PASS" : "FAIL",
    expected: "404", actual: `${r6.status}`,
  });

  // UPG-7: GET upgrade history for existing VPS (if any) → 200
  if (testVpsId) {
    const r7 = await req("GET", `/api/vps/${testVpsId}/upgrade/history`, undefined, adminToken);
    log({
      testId: "UPG-7", name: `GET /api/vps/${testVpsId}/upgrade/history — admin → 200`,
      status: r7.status === 200 && Array.isArray(r7.data?.data?.logs) ? "PASS" : "FAIL",
      expected: "200 data.logs=[array]", actual: `${r7.status} count=${r7.data?.data?.logs?.length ?? "?"}`,
    });
  } else {
    log({ testId: "UPG-7", name: "GET /api/vps/:id/upgrade/history — SKIP (no VPS)", status: "SKIP", expected: "200", actual: "no VPS" });
  }

  // UPG-8: Custom upgrade — missing body fields → 400
  const r8 = await req("POST", "/api/vps/999999/upgrade/custom", {}, adminToken);
  log({
    testId: "UPG-8", name: "POST /api/vps/999999/upgrade/custom — empty body → 400",
    status: r8.status === 400 || r8.status === 404 ? "PASS" : "FAIL",
    expected: "400 (validation) or 404 (VPS lookup before validation)", actual: `${r8.status}`,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH: Logout (run last — invalidates token)
// ═══════════════════════════════════════════════════════════════════════════════

async function phase1_auth_logout() {
  console.log("\n━━━ AUTH: Logout ━━━");

  if (!userToken) { console.log("  [SKIP]"); return; }

  // LO-1: Logout → 200
  const r1 = await req("POST", "/api/auth/logout", undefined, userToken);
  log({
    testId: "LO-1", name: "POST /api/auth/logout — valid token",
    status: r1.status === 200 ? "PASS" : "FAIL",
    expected: "200",
    actual: `${r1.status}`,
  });

  // LO-2: Access after logout → 401 (AUTH-SEC-1 fix)
  const r2 = await req("GET", "/api/auth/me", undefined, userToken);
  log({
    testId: "LO-2", name: "GET /api/auth/me — after logout → 401 (AUTH-SEC-1)",
    status: r2.status === 401 ? "PASS" : "FAIL",
    expected: "401 (token_block: blocklist)",
    actual: `${r2.status}`,
    note: "Redis token_block:{token} TTL = remaining JWT lifetime",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════

function printSummary() {
  console.log("\n" + "═".repeat(70));
  console.log("QA SUMMARY");
  console.log("═".repeat(70));

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const skip = results.filter((r) => r.status === "SKIP").length;

  console.log(`Total: ${results.length} | ✅ PASS: ${pass} | ❌ FAIL: ${fail} | 🟡 WARN: ${warn} | ⏭️ SKIP: ${skip}`);

  if (fail > 0 || warn > 0) {
    console.log("\n─── FAIL / WARN details ───");
    results.filter((r) => r.status === "FAIL" || r.status === "WARN").forEach((r) => {
      console.log(`  [${r.status}] ${r.testId} — ${r.name}`);
      console.log(`    Expected: ${r.expected}`);
      console.log(`    Actual:   ${r.actual}`);
      if (r.note) console.log(`    Note:     ${r.note}`);
    });
  }

  return { pass, fail, warn, skip, total: results.length, results };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  CloudVPS Backend — QA Test Suite (Phase 1–9)              ║");
  console.log(`║  Date: ${new Date().toISOString()}              ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  await phase1_health();
  await phase1_auth_register();
  await phase1_auth_login();
  await phase1_auth_protected();
  await phase1_auth_refresh();
  await phase1_user_me();
  await phase1_user_rbac();
  await phase2_policies();
  await phase2_packages();
  await phase2_promotions();
  await phase3_orders();
  await phase3_transactions();
  await phase3_slipok();
  await phase4_ip_pools();
  await phase4_system_configs();
  await phase4_vps();
  await phase5_broadcasts();
  await phase5_audit_logs();
  await phase8_nat();
  await phase9_upgrade();
  await phase1_auth_logout();

  printSummary();
  console.log("\n[Done]");
}

main().catch(console.error);
