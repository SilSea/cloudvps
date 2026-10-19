import { mock, describe, it, expect, beforeEach } from "bun:test";

mock.module("../../src/config/database", () => ({
  prisma: {
    policies: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1, status: true })),
      update: mock(() => Promise.resolve({ id: 1 })),
    },
    consents: {
      findMany: mock(() => Promise.resolve([])),
      findFirst: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1 })),
    },
  },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    info:    mock(() => {}),
    warn:    mock(() => {}),
    error:   mock(() => {}),
    auth:    mock(() => {}),
    payment: mock(() => {}),
    vps:     mock(() => {}),
    admin:   mock(() => {}),
  },
}));

import { policyService } from "../../src/services/policy.service";
import { prisma } from "../../src/config/database";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

const activePolicy = { id: 1, policie_title: "PDPA", policies_type: "PDPA", status: true, version: "1.0" };

beforeEach(() => {
  asMock((prisma as any).policies.findMany).mockResolvedValue([]);
  asMock((prisma as any).policies.findUnique).mockResolvedValue(null);
  asMock((prisma as any).policies.create).mockResolvedValue({ id: 1, status: true });
  asMock((prisma as any).policies.update).mockResolvedValue({ id: 1 });
  asMock((prisma as any).consents.findMany).mockResolvedValue([]);
  asMock((prisma as any).consents.findFirst).mockResolvedValue(null);
  asMock((prisma as any).consents.create).mockResolvedValue({ id: 1 });
});

// =============================================================================
// policyService.getActive / getAll / getById
// =============================================================================

describe("policyService.getActive", () => {
  it("queries only active policies (status: true)", async () => {
    await policyService.getActive();
    const callArg = asMock((prisma as any).policies.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toEqual({ status: true });
  });
});

describe("policyService.getAll", () => {
  it("returns all policies without filtering", async () => {
    await policyService.getAll();
    const callArg = asMock((prisma as any).policies.findMany).mock.calls.at(-1)![0];
    expect(callArg.where).toBeUndefined();
  });
});

describe("policyService.getById", () => {
  it("calls findUnique with correct id", async () => {
    await policyService.getById(42);
    expect(asMock((prisma as any).policies.findUnique)).toHaveBeenCalledWith({ where: { id: 42 } });
  });
});

// =============================================================================
// policyService.create
// =============================================================================

describe("policyService.create", () => {
  it("creates a policy with status=true by default", async () => {
    await policyService.create({
      policie_title: "PDPA",
      policies_detail: "Details...",
      policies_type: "PDPA",
      version: "1.0",
    });
    const callArg = asMock((prisma as any).policies.create).mock.calls[0][0];
    expect(callArg.data.status).toBe(true);
  });
});

// =============================================================================
// policyService.update
// =============================================================================

describe("policyService.update", () => {
  it("returns null when policy does not exist", async () => {
    const result = await policyService.update(999, { policie_title: "New" });
    expect(result).toBeNull();
  });

  it("updates and returns policy on happy path", async () => {
    asMock((prisma as any).policies.findUnique).mockResolvedValueOnce(activePolicy);
    asMock((prisma as any).policies.update).mockResolvedValueOnce({ ...activePolicy, policie_title: "Updated" });
    const result = await policyService.update(1, { policie_title: "Updated" });
    expect(result).toBeDefined();
  });
});

// =============================================================================
// policyService.toggleStatus
// =============================================================================

describe("policyService.toggleStatus", () => {
  it("returns null when policy does not exist", async () => {
    const result = await policyService.toggleStatus(999);
    expect(result).toBeNull();
  });

  it("flips status from true to false", async () => {
    asMock((prisma as any).policies.findUnique).mockResolvedValueOnce({ id: 1, status: true });
    await policyService.toggleStatus(1);
    const callArg = asMock((prisma as any).policies.update).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(false);
  });

  it("flips status from false to true", async () => {
    asMock((prisma as any).policies.findUnique).mockResolvedValueOnce({ id: 1, status: false });
    await policyService.toggleStatus(1);
    const callArg = asMock((prisma as any).policies.update).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(true);
  });
});

// =============================================================================
// policyService.getPendingPolicyIds
// =============================================================================

describe("policyService.getPendingPolicyIds", () => {
  it("returns empty array when no active policies exist", async () => {
    asMock((prisma as any).policies.findMany).mockResolvedValueOnce([]);
    const result = await policyService.getPendingPolicyIds(1);
    expect(result).toEqual([]);
  });

  it("returns policy IDs not yet accepted by the user", async () => {
    asMock((prisma as any).policies.findMany).mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);
    // User has only accepted policy id=1
    asMock((prisma as any).consents.findMany).mockResolvedValueOnce([{ policies_id: 1 }]);
    const result = await policyService.getPendingPolicyIds(42);
    expect(result).toEqual([2, 3]);
  });

  it("returns empty array when user accepted all active policies", async () => {
    asMock((prisma as any).policies.findMany).mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
    asMock((prisma as any).consents.findMany).mockResolvedValueOnce([
      { policies_id: 1 }, { policies_id: 2 },
    ]);
    const result = await policyService.getPendingPolicyIds(1);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// policyService.addConsent
// =============================================================================

describe("policyService.addConsent", () => {
  it("returns error when policy does not exist", async () => {
    const result = await policyService.addConsent(1, 999);
    expect((result as any).error).toBe("Policy not found");
  });

  it("returns error when policy is inactive", async () => {
    asMock((prisma as any).policies.findUnique).mockResolvedValueOnce({ id: 1, status: false });
    const result = await policyService.addConsent(1, 1);
    expect((result as any).error).toBe("Policy is not active");
  });

  it("returns already_accepted flag when consent already exists", async () => {
    asMock((prisma as any).policies.findUnique).mockResolvedValueOnce({ id: 1, status: true });
    asMock((prisma as any).consents.findFirst).mockResolvedValueOnce({ id: 5 });
    const result = await policyService.addConsent(1, 1) as any;
    expect(result.already_accepted).toBe(true);
  });

  it("creates new consent and returns data on happy path", async () => {
    asMock((prisma as any).policies.findUnique).mockResolvedValueOnce({ id: 1, status: true });
    // findFirst returns null (no existing consent)
    asMock((prisma as any).consents.create).mockResolvedValueOnce({ id: 10 });
    const result = await policyService.addConsent(1, 1) as any;
    expect(result.data).toBeDefined();
    expect(asMock((prisma as any).consents.create)).toHaveBeenCalled();
  });
});
