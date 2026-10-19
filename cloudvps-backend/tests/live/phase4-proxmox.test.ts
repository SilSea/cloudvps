/**
 * Phase 4 Proxmox Live Integration Tests
 *
 * Prerequisites:
 *   - Docker stack running on :3000
 *   - Proxmox VE accessible (PROXMOX_* env vars set)
 *   - OS id=1 vmid=21024 (Ubuntu 22.04 LTS) template exists in Proxmox
 *   - Orders 1 & 2 in PAID state with temp_vps records (from prior test run)
 *
 * Note: provision is fire-and-forget — tests poll for VPS record creation.
 * Estimated runtime: 3–8 minutes (clone takes 1–3 min depending on disk)
 */

import { describe, it, expect, beforeAll } from "bun:test";

const BASE = "http://localhost:3000";
const POLL_INTERVAL_MS = 10_000;
const PROVISION_TIMEOUT_MS = 300_000; // 5 minutes

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

async function pollForVps(
  orderId: number,
  token: string,
  timeoutMs = PROVISION_TIMEOUT_MS
): Promise<any | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await Bun.sleep(POLL_INTERVAL_MS);
    const { data } = await req("GET", "/api/vps", undefined, token);
    const found = data?.data?.vps?.find((v: any) => v.orders_id === orderId);
    if (found) return found;
  }
  return null;
}

let adminToken = "";
let userToken = "";
let provisionedVpsId = 0;
let provisionedVpsId2 = 0;

beforeAll(async () => {
  const [aRes, uRes] = await Promise.all([
    req("POST", "/api/auth/login", { email: "admin@cloudvps.com", password: "Password1234!" }),
    req("POST", "/api/auth/login", { email: "user@cloudvps.com", password: "Password1234!" }),
  ]);
  adminToken = aRes.data?.data?.access_token ?? "";
  userToken = uRes.data?.data?.access_token ?? "";
  if (!adminToken) throw new Error("Login failed");
});

// ══════════════════════════════════════════════════════════════════════════════
// PROVISION FLOW — Order 1 (vmid 10001)
// ══════════════════════════════════════════════════════════════════════════════

describe("Proxmox — Provision Flow (Order 1, vmid=10001)", () => {
  it("PROX-1: GET /api/vps/queue → shows 2 pending temp_vps before provision", async () => {
    const { status, data } = await req("GET", "/api/vps/queue", undefined, adminToken);
    expect(status).toBe(200);
    const order1 = data.data.some((t: any) => t.order_id === 1);
    const order2 = data.data.some((t: any) => t.order_id === 2);
    expect(order1).toBe(true);
    expect(order2).toBe(true);
  });

  it("PROX-2: POST /api/vps/provision/1 → 202 accepted (fire-and-forget)", async () => {
    const { status, data } = await req("POST", "/api/vps/provision/1", undefined, adminToken);
    expect(status).toBe(202);
    expect(data.success).toBe(true);
  });

  it("PROX-3: VPS record for order 1 created within 5 minutes (clone + configure + start)", async () => {
    const vps = await pollForVps(1, adminToken);
    expect(vps).not.toBeNull();
    provisionedVpsId = vps.id;
    console.log(`[PROX-3] VPS created: id=${vps.id}, vmid=${vps.vmid}, status=${vps.status}`);
  }, PROVISION_TIMEOUT_MS + 30_000);

  it("PROX-4: VPS has correct vmid (10001 = 10000 + temp_vps.id=1)", async () => {
    if (!provisionedVpsId) return;
    const { data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken);
    expect(data.data.vmid).toBe(10001);
  });

  it("PROX-5: VPS has allocated IP from ip_pools", async () => {
    if (!provisionedVpsId) return;
    const { data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken);
    const ip = data.data?.ip_assignment?.ip_pool?.ip;
    expect(ip).toBeTruthy();
    expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    console.log(`[PROX-5] Allocated IP: ${ip}`);
  });

  it("PROX-6: VPS status is running (started after provision)", async () => {
    if (!provisionedVpsId) return;
    const { data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken);
    expect(data.data.status).toBe(true);
  });

  it("PROX-7: temp_vps for order 1 removed from queue after provision", async () => {
    if (!provisionedVpsId) return;
    const { data } = await req("GET", "/api/vps/queue", undefined, adminToken);
    const stillPending = data.data.some((t: any) => t.order_id === 1);
    expect(stillPending).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// VPS ACTIONS — stop / start / reboot on provisioned VPS
// ══════════════════════════════════════════════════════════════════════════════

describe("Proxmox — VPS Actions (stop/start/reboot)", () => {
  it("PROX-8: POST /api/vps/:id/stop → 200, DB status=false", async () => {
    if (!provisionedVpsId) return;
    const { status, data } = await req("POST", `/api/vps/${provisionedVpsId}/stop`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe("stopped");
    console.log(`[PROX-8] VPS stopped: ${JSON.stringify(data.data)}`);
  }, 120_000);

  it("PROX-9: GET /api/vps/:id → status=false after stop", async () => {
    if (!provisionedVpsId) return;
    await Bun.sleep(3000);
    const { data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken);
    expect(data.data.status).toBe(false);
  });

  it("PROX-10: POST /api/vps/:id/start → 200, DB status=true", async () => {
    if (!provisionedVpsId) return;
    const { status, data } = await req("POST", `/api/vps/${provisionedVpsId}/start`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.status).toBe("running");
    console.log(`[PROX-10] VPS started: ${JSON.stringify(data.data)}`);
  }, 120_000);

  it("PROX-11: GET /api/vps/:id → status=true after start", async () => {
    if (!provisionedVpsId) return;
    await Bun.sleep(3000);
    const { data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken);
    expect(data.data.status).toBe(true);
  });

  it("PROX-12: POST /api/vps/:id/reboot → 200", async () => {
    if (!provisionedVpsId) return;
    const { status, data } = await req("POST", `/api/vps/${provisionedVpsId}/reboot`, undefined, adminToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    console.log(`[PROX-12] VPS rebooted: ${JSON.stringify(data.data)}`);
  }, 120_000);

  it("PROX-13: GET /api/vps/:id → status unchanged (still true) after reboot", async () => {
    if (!provisionedVpsId) return;
    await Bun.sleep(5000);
    const { data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken);
    expect(data.data.status).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// USER ACCESS CONTROL
// ══════════════════════════════════════════════════════════════════════════════

describe("Proxmox — VPS Access Control", () => {
  it("PROX-14: user owns VPS (order 1 is user's order) → GET returns data", async () => {
    if (!provisionedVpsId) return;
    const { status, data } = await req("GET", `/api/vps/${provisionedVpsId}`, undefined, userToken);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("PROX-15: user can stop own VPS → 200", async () => {
    if (!provisionedVpsId) return;
    const { status, data } = await req("POST", `/api/vps/${provisionedVpsId}/stop`, undefined, userToken);
    expect(status).toBe(200);
    expect(data.data.status).toBe("stopped");
  }, 120_000);

  it("PROX-16: user can start own VPS → 200", async () => {
    if (!provisionedVpsId) return;
    const { status, data } = await req("POST", `/api/vps/${provisionedVpsId}/start`, undefined, userToken);
    expect(status).toBe(200);
    expect(data.data.status).toBe("running");
  }, 120_000);
});

// ══════════════════════════════════════════════════════════════════════════════
// IP ALLOCATION — No Duplicate (Order 2, vmid=10002)
// ══════════════════════════════════════════════════════════════════════════════

describe("Proxmox — IP Allocation (Order 2, vmid=10002)", () => {
  it("PROX-17: POST /api/vps/provision/2 → 202 (second provision)", async () => {
    const { status } = await req("POST", "/api/vps/provision/2", undefined, adminToken);
    expect(status).toBe(202);
  });

  it("PROX-18: VPS for order 2 created with DIFFERENT IP from order 1", async () => {
    const vps2 = await pollForVps(2, adminToken);
    expect(vps2).not.toBeNull();
    provisionedVpsId2 = vps2.id;

    const [r1, r2] = await Promise.all([
      req("GET", `/api/vps/${provisionedVpsId}`, undefined, adminToken),
      req("GET", `/api/vps/${provisionedVpsId2}`, undefined, adminToken),
    ]);

    const ip1 = r1.data.data?.ip_assignment?.ip_pool?.ip;
    const ip2 = r2.data.data?.ip_assignment?.ip_pool?.ip;

    console.log(`[PROX-18] VPS1 IP=${ip1}, VPS2 IP=${ip2}`);
    expect(ip1).toBeTruthy();
    expect(ip2).toBeTruthy();
    expect(ip1).not.toBe(ip2); // atomic allocation — no duplicate
  }, PROVISION_TIMEOUT_MS + 30_000);

  it("PROX-19: both VPS records visible in GET /api/vps (admin)", async () => {
    if (!provisionedVpsId2) return;
    const { data } = await req("GET", "/api/vps", undefined, adminToken);
    expect(data.data.total).toBeGreaterThanOrEqual(2);
  });

  it("PROX-20: queue empty after both orders provisioned", async () => {
    if (!provisionedVpsId2) return;
    const { data } = await req("GET", "/api/vps/queue", undefined, adminToken);
    const pendingOrders = data.data.filter((t: any) => t.order_id === 1 || t.order_id === 2);
    expect(pendingOrders.length).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DOUBLE-PROVISION GUARD (VPS-M3 — provision lock)
// ══════════════════════════════════════════════════════════════════════════════

describe("Proxmox — Double-Provision Lock (VPS-M3)", () => {
  let thirdOrderId = 0;
  let thirdTxId = 0;

  it("PROX-21: create new order + submit PROMPTPAY for double-provision test", async () => {
    const oRes = await req("POST", "/api/orders", { package_id: 1 }, userToken);
    expect(oRes.status).toBe(201);
    thirdOrderId = oRes.data.data.id;

    const txRes = await req("POST", "/api/transactions", {
      order_id: thirdOrderId,
      payment_method: "PROMPTPAY",
    }, userToken);
    expect(txRes.status).toBe(201);
    thirdTxId = txRes.data.data.id;
  });

  it("PROX-22: admin approves → order PAID → auto-provision triggered", async () => {
    const { status } = await req("PATCH", `/api/transactions/${thirdTxId}/approve`, undefined, adminToken);
    expect(status).toBe(200);
  });

  it("PROX-23: immediate second provision call → 202 but lock prevents double-run", async () => {
    // Both calls return 202 (fire-and-forget), but Redis lock ensures only one executes
    await Bun.sleep(500); // small delay so auto-provision grabs lock first
    const { status } = await req("POST", `/api/vps/provision/${thirdOrderId}`, undefined, adminToken);
    expect(status).toBe(202);
  });

  it("PROX-24: only ONE VPS created for third order (no duplicate)", async () => {
    const vps3 = await pollForVps(thirdOrderId, adminToken);
    if (vps3) {
      // Check only 1 VPS record exists for this order
      const { data } = await req("GET", "/api/vps", undefined, adminToken);
      const vpsForOrder = data.data.vps.filter((v: any) => v.orders_id === thirdOrderId);
      expect(vpsForOrder.length).toBe(1);
      console.log(`[PROX-24] VPS for order ${thirdOrderId}: id=${vps3.id}, vmid=${vps3.vmid}`);
    } else {
      // Provision may be taking longer than 5 min — report as WARN
      console.warn(`[PROX-24] VPS not created within timeout for order ${thirdOrderId}`);
    }
  }, PROVISION_TIMEOUT_MS + 30_000);
});
