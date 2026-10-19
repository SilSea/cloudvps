import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _auditLogs: any[] = [];
let _auditCount = 0;

const findManyFn = mock(async () => _auditLogs);
const countFn    = mock(async () => _auditCount);

mock.module("../../src/config/database", () => ({
  prisma: {
    admin_audit_logs: {
      findMany: findManyFn,
      count:    countFn,
    },
  },
}));

const { auditController } = await import("../../src/controllers/audit.controller");

// ── Helpers ───────────────────────────────────────────────────────────────────
const call = (query: Record<string, string> = {}) =>
  auditController.list({ query, set: {} });

describe("auditController.list()", () => {
  beforeEach(() => {
    _auditLogs  = [];
    _auditCount = 0;
    findManyFn.mockClear();
    countFn.mockClear();
  });

  it("AUDIT-1: returns success=true with paginated structure", async () => {
    _auditLogs  = [{ id: 1, action: "UPDATE", entity: "USER" }];
    _auditCount = 1;
    const result = await call();
    expect(result.success).toBe(true);
    expect(result.data.logs).toHaveLength(1);
    expect(result.data.total).toBe(1);
    expect(result.data.page).toBe(1);
    expect(result.data.limit).toBe(20);
  });

  it("AUDIT-2: applies skip=(page-1)*limit for pagination", async () => {
    await call({ page: "3", limit: "5" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(5);
  });

  it("AUDIT-3: clamps limit to maximum 100", async () => {
    await call({ limit: "9999" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.take).toBe(100);
  });

  it("AUDIT-4: clamps page to minimum 1 on invalid input", async () => {
    await call({ page: "-5" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.skip).toBe(0);
  });

  it("AUDIT-5: filters by actor_id when numeric string provided", async () => {
    await call({ actor_id: "42" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where.actor_id).toBe(42);
  });

  it("AUDIT-6: ignores actor_id filter when value is NaN", async () => {
    await call({ actor_id: "notanumber" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where.actor_id).toBeUndefined();
  });

  it("AUDIT-7: filters by target_user_id when numeric string provided", async () => {
    await call({ target_user_id: "7" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where.target_user_id).toBe(7);
  });

  it("AUDIT-8: filters by entity and action strings", async () => {
    await call({ entity: "VPS", action: "START" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where.entity).toBe("VPS");
    expect(arg.where.action).toBe("START");
  });

  it("AUDIT-9: filters by date range when from/to provided", async () => {
    await call({ from: "2026-05-01", to: "2026-05-10" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where.created_at.gte).toEqual(new Date("2026-05-01"));
    expect(arg.where.created_at.lte).toEqual(new Date("2026-05-10"));
  });

  it("AUDIT-10: from-only date range sets only gte, not lte", async () => {
    await call({ from: "2026-05-01" });
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where.created_at.gte).toEqual(new Date("2026-05-01"));
    expect(arg.where.created_at.lte).toBeUndefined();
  });

  it("AUDIT-11: no filters applied when query is empty — where is empty object", async () => {
    await call();
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.where).toEqual({});
  });

  it("AUDIT-12: orders result by created_at desc", async () => {
    await call();
    const arg = findManyFn.mock.calls[0][0];
    expect(arg.orderBy).toEqual({ created_at: "desc" });
  });
});
