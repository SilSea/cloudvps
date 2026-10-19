import { mock, describe, it, expect, beforeEach } from "bun:test";

mock.module("../../src/config/database", () => ({
  prisma: {
    promotions: {
      findMany: mock(() => Promise.resolve([])),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: 1, code_name: "NEW10", status: true })),
      update: mock(() => Promise.resolve({ id: 1 })),
    },
  },
}));

import { promotionService } from "../../src/services/promotion.service";
import { prisma } from "../../src/config/database";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

const activePromo = {
  id: 1,
  code_name: "SAVE50",
  description: "Save 50 THB",
  type: "DISCOUNT",
  discount: 50,
  status: true,
  expired_at: null,
};

beforeEach(() => {
  asMock((prisma as any).promotions.findMany).mockResolvedValue([]);
  asMock((prisma as any).promotions.findUnique).mockResolvedValue(null);
  asMock((prisma as any).promotions.create).mockResolvedValue({ id: 1, code_name: "NEW10", status: true });
  asMock((prisma as any).promotions.update).mockResolvedValue({ id: 1 });
});

// =============================================================================
// promotionService.list
// =============================================================================

describe("promotionService.list", () => {
  it("calls findMany ordered by created_at desc", async () => {
    await promotionService.list();
    const callArg = asMock((prisma as any).promotions.findMany).mock.calls.at(-1)![0];
    expect(callArg.orderBy).toEqual({ created_at: "desc" });
  });
});

// =============================================================================
// promotionService.create
// =============================================================================

describe("promotionService.create", () => {
  it("returns error when promo code already exists", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce(activePromo);
    const result = await promotionService.create({
      code_name: "SAVE50", description: "Dup", type: "DISCOUNT", discount: 50,
    });
    expect((result as any).error).toBe("Promotion code already exists");
  });

  it("creates promotion with correct data on happy path", async () => {
    asMock((prisma as any).promotions.create).mockResolvedValueOnce({
      id: 2, code_name: "NEW20", status: true, type: "DISCOUNT", discount: 20,
    });
    const result = await promotionService.create({
      code_name: "NEW20", description: "20 off", type: "DISCOUNT", discount: 20,
    }) as any;
    expect(result.data).toBeDefined();
    expect(result.data.code_name).toBe("NEW20");
  });

  it("converts expired_at string to Date object", async () => {
    await promotionService.create({
      code_name: "EXPTEST", description: "Exp", type: "DISCOUNT", discount: 10,
      expired_at: "2030-12-31",
    });
    const callArg = asMock((prisma as any).promotions.create).mock.calls.at(-1)![0];
    expect(callArg.data.expired_at).toBeInstanceOf(Date);
  });

  it("sets expired_at to null when not provided", async () => {
    await promotionService.create({
      code_name: "NOEXP", description: "No expiry", type: "PERCENT", discount: 10,
    });
    const callArg = asMock((prisma as any).promotions.create).mock.calls.at(-1)![0];
    expect(callArg.data.expired_at).toBeNull();
  });

  it("PROMO-U-5: passes max_uses and max_uses_per_user to create", async () => {
    await promotionService.create({
      code_name: "LIMITED", description: "Capped promo", type: "DISCOUNT", discount: 10,
      max_uses: 100, max_uses_per_user: 1,
    });
    const callArg = asMock((prisma as any).promotions.create).mock.calls.at(-1)![0];
    expect(callArg.data.max_uses).toBe(100);
    expect(callArg.data.max_uses_per_user).toBe(1);
  });

  it("PROMO-U-6: sets max_uses/max_uses_per_user to null when omitted", async () => {
    await promotionService.create({
      code_name: "UNLIMITED", description: "No cap", type: "PERCENT", discount: 5,
    });
    const callArg = asMock((prisma as any).promotions.create).mock.calls.at(-1)![0];
    expect(callArg.data.max_uses).toBeNull();
    expect(callArg.data.max_uses_per_user).toBeNull();
  });

  it("PROMO-U-7: sets max_uses/max_uses_per_user to null when explicitly null", async () => {
    await promotionService.create({
      code_name: "NULLCAP", description: "Explicit null", type: "DISCOUNT", discount: 10,
      max_uses: null, max_uses_per_user: null,
    });
    const callArg = asMock((prisma as any).promotions.create).mock.calls.at(-1)![0];
    expect(callArg.data.max_uses).toBeNull();
    expect(callArg.data.max_uses_per_user).toBeNull();
  });
});

// =============================================================================
// promotionService.update
// =============================================================================

describe("promotionService.update", () => {
  it("returns null when promotion does not exist", async () => {
    const result = await promotionService.update(999, { description: "New" });
    expect(result).toBeNull();
  });

  it("calls update on happy path", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce(activePromo);
    await promotionService.update(1, { description: "Updated description" });
    expect(asMock((prisma as any).promotions.update)).toHaveBeenCalled();
  });

  it("PROMO-U-8: passes max_uses and max_uses_per_user in update", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce(activePromo);
    await promotionService.update(1, { max_uses: 50, max_uses_per_user: 2 });
    const callArg = asMock((prisma as any).promotions.update).mock.calls.at(-1)![0];
    expect(callArg.data.max_uses).toBe(50);
    expect(callArg.data.max_uses_per_user).toBe(2);
  });

  it("PROMO-U-9: can clear limits by passing null in update", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce(activePromo);
    await promotionService.update(1, { max_uses: null, max_uses_per_user: null });
    const callArg = asMock((prisma as any).promotions.update).mock.calls.at(-1)![0];
    expect(callArg.data.max_uses).toBeNull();
    expect(callArg.data.max_uses_per_user).toBeNull();
  });
});

// =============================================================================
// promotionService.toggleStatus
// =============================================================================

describe("promotionService.toggleStatus", () => {
  it("returns null when promotion does not exist", async () => {
    const result = await promotionService.toggleStatus(999);
    expect(result).toBeNull();
  });

  it("flips status from true to false", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce({ id: 1, status: true });
    await promotionService.toggleStatus(1);
    const callArg = asMock((prisma as any).promotions.update).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(false);
  });

  it("flips status from false to true", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce({ id: 1, status: false });
    await promotionService.toggleStatus(1);
    const callArg = asMock((prisma as any).promotions.update).mock.calls.at(-1)![0];
    expect(callArg.data.status).toBe(true);
  });
});

// =============================================================================
// promotionService.validate
// =============================================================================

describe("promotionService.validate", () => {
  it("returns not valid when promo code not found", async () => {
    const result = await promotionService.validate("GHOST");
    expect(result.valid).toBe(false);
    expect((result as any).error).toMatch(/not found/i);
  });

  it("returns not valid when promo is inactive", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce({ ...activePromo, status: false });
    const result = await promotionService.validate("SAVE50");
    expect(result.valid).toBe(false);
    expect((result as any).error).toMatch(/inactive/i);
  });

  it("returns not valid when promo is expired", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce({
      ...activePromo, expired_at: new Date("2020-01-01"),
    });
    const result = await promotionService.validate("SAVE50");
    expect(result.valid).toBe(false);
    expect((result as any).error).toMatch(/expired/i);
  });

  it("returns valid promo with details on happy path", async () => {
    asMock((prisma as any).promotions.findUnique).mockResolvedValueOnce(activePromo);
    const result = await promotionService.validate("SAVE50") as any;
    expect(result.valid).toBe(true);
    expect(result.promotion.code_name).toBe("SAVE50");
    expect(result.promotion.discount).toBe(50);
  });
});
