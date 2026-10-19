import { mock, describe, it, expect, beforeEach } from "bun:test";

// Named mock functions so $transaction can delegate to the same instances.
const mockOrdersCreate = mock(() => Promise.resolve({
  id: 1, ref_no: "QC-20260101-ABC123", amount: 500,
  package: { id: 1, name: "Starter", price: 500, period: 30, os: {}, vm: {} },
  promotion: null,
}));
const mockPromoUsagesCreate = mock(() => Promise.resolve({}));
const mockPromoUsagesCount = mock(() => Promise.resolve(0));
const mockPromotionsUpdate = mock(() => Promise.resolve({}));
const mockPromotionsFindUnique = mock(() => Promise.resolve(null));
const mockPackagesFindUnique = mock(() => Promise.resolve(null));
const mockOrdersFindFirst = mock(() => Promise.resolve(null));
const mockOrdersFindMany = mock(() => Promise.resolve([]));
const mockOrdersFindUnique = mock(() => Promise.resolve(null));
const mockOrdersUpdate = mock(() => Promise.resolve({ id: 1, status: "CANCEL" }));
const mockOrdersCount = mock(() => Promise.resolve(0));
const mockUpgradeLogsUpdateMany = mock(() => Promise.resolve({ count: 1 }));

mock.module("../../src/config/database", () => ({
  prisma: {
    packages: { findUnique: mockPackagesFindUnique },
    promotions: {
      findUnique: mockPromotionsFindUnique,
      update: mockPromotionsUpdate,
    },
    promo_usages: {
      count: mockPromoUsagesCount,
      create: mockPromoUsagesCreate,
    },
    orders: {
      create: mockOrdersCreate,
      findFirst: mockOrdersFindFirst,
      findMany: mockOrdersFindMany,
      findUnique: mockOrdersFindUnique,
      update: mockOrdersUpdate,
      count: mockOrdersCount,
    },
    // $transaction executes the callback with a tx that delegates to the same mock fns.
    $transaction: mock(async (cb: any) =>
      cb({
        orders: { create: mockOrdersCreate, update: mockOrdersUpdate },
        promo_usages: { create: mockPromoUsagesCreate, count: mockPromoUsagesCount },
        promotions: { update: mockPromotionsUpdate },
        vps_upgrade_logs: { updateMany: mockUpgradeLogsUpdateMany },
      })
    ),
  },
}));

// Capacity service mock — prevents capacity check from hitting redis/proxmox in order tests
mock.module("../../src/services/capacity.service", () => ({
  capacityService: {
    check: mock(() => Promise.resolve({})),
    getSnapshot: mock(() => Promise.resolve(null)),
    isPackageFit: mock(() => true),
    getNodeSnapshot: mock(() => Promise.reject(new Error("not configured"))),
  },
}));

import { orderService } from "../../src/services/order.service";
import { prisma } from "../../src/config/database";

const asMock = (fn: unknown) => fn as ReturnType<typeof mock<() => unknown>>;

const basePackage = {
  id: 1,
  name: "Starter",
  description: "Entry VPS",
  price: 500,
  period: 30,
  status: true,
  os: { id: 1, os_name: "Ubuntu", os_version: "22.04" },
  vm: { id: 1, core: 1, memory: "1GB", size: "20GB" },
};

// Promo with Phase 7 usage-limit fields
const basePromo = {
  id: 2, code_name: "SAVE100", status: true, type: "DISCOUNT" as const, discount: 100,
  expired_at: null, max_uses: null, max_uses_per_user: null, used_count: 0,
};

beforeEach(() => {
  mockPackagesFindUnique.mockResolvedValue(null);
  mockPromotionsFindUnique.mockResolvedValue(null);
  mockPromoUsagesCount.mockResolvedValue(0);
  mockPromoUsagesCreate.mockResolvedValue({});
  mockPromotionsUpdate.mockResolvedValue({});
  mockOrdersCreate.mockClear();
  mockOrdersCreate.mockResolvedValue({
    id: 1, ref_no: "QC-20260101-ABC123", amount: 500,
    package: basePackage, promotion: null,
  });
  mockOrdersFindFirst.mockResolvedValue(null);
  mockOrdersFindMany.mockResolvedValue([]);
  mockOrdersFindUnique.mockResolvedValue(null);
  mockOrdersUpdate.mockResolvedValue({ id: 1, status: "CANCEL" });
  mockOrdersCount.mockResolvedValue(0);
  mockUpgradeLogsUpdateMany.mockClear();
  mockUpgradeLogsUpdateMany.mockResolvedValue({ count: 1 });
});

// =============================================================================
// orderService.create
// =============================================================================

describe("orderService.create", () => {
  it("returns PACKAGE_NOT_FOUND when package does not exist", async () => {
    const result = await orderService.create({ userId: 1, packageId: 999 });
    expect(result).toEqual({ error: "PACKAGE_NOT_FOUND" });
  });

  it("returns PACKAGE_INACTIVE when package is disabled", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce({ ...basePackage, status: false });
    const result = await orderService.create({ userId: 1, packageId: 1 });
    expect(result).toEqual({ error: "PACKAGE_INACTIVE" });
  });

  it("returns INVALID_PROMO when promo code not found", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    // promotions.findUnique already returns null
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "NOPE" });
    expect(result).toEqual({ error: "INVALID_PROMO" });
  });

  it("returns INVALID_PROMO when promo is inactive", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    mockPromotionsFindUnique.mockResolvedValueOnce({
      ...basePromo, id: 1, code_name: "OFF50", status: false,
    });
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "OFF50" });
    expect(result).toEqual({ error: "INVALID_PROMO" });
  });

  it("returns PROMO_EXPIRED when promo is past expiry", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    mockPromotionsFindUnique.mockResolvedValueOnce({
      ...basePromo, id: 1, code_name: "OLD", expired_at: new Date("2020-01-01"),
    });
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "OLD" });
    expect(result).toEqual({ error: "PROMO_EXPIRED" });
  });

  it("returns PROMO_LIMIT_REACHED when promo has hit global cap", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    mockPromotionsFindUnique.mockResolvedValueOnce({
      ...basePromo, id: 3, code_name: "CAPPED", max_uses: 10, used_count: 10,
    });
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "CAPPED" });
    expect(result).toEqual({ error: "PROMO_LIMIT_REACHED" });
  });

  it("returns PROMO_USER_LIMIT_REACHED when user has hit per-user cap", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    mockPromotionsFindUnique.mockResolvedValueOnce({
      ...basePromo, id: 4, code_name: "PERCAP", max_uses_per_user: 2,
    });
    mockPromoUsagesCount.mockResolvedValueOnce(2); // user already used 2 times
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "PERCAP" });
    expect(result).toEqual({ error: "PROMO_USER_LIMIT_REACHED" });
  });

  it("applies DISCOUNT promo — subtracts fixed amount from price", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage); // price = 500
    mockPromotionsFindUnique.mockResolvedValueOnce({ ...basePromo, discount: 100 });
    mockOrdersCreate.mockImplementationOnce(async ({ data }: any) => ({
      id: 2, ref_no: "QC-20260101-XYZ", amount: data.amount, package: basePackage, promotion: null,
    }));
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "SAVE100" }) as any;
    expect(result.data.amount).toBe(400); // 500 - 100
  });

  it("applies PERCENT promo — deducts percentage of price", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage); // price = 500
    mockPromotionsFindUnique.mockResolvedValueOnce({
      ...basePromo, id: 3, code_name: "PCT20", type: "PERCENT", discount: 20,
    });
    mockOrdersCreate.mockImplementationOnce(async ({ data }: any) => ({
      id: 3, ref_no: "QC-20260101-PCT", amount: data.amount, package: basePackage, promotion: null,
    }));
    const result = await orderService.create({ userId: 1, packageId: 1, promoCode: "PCT20" }) as any;
    expect(result.data.amount).toBe(400); // 500 * (1 - 0.20) = 400
  });

  it("creates order with correct amount on happy path (no promo)", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    const result = await orderService.create({ userId: 1, packageId: 1 }) as any;
    expect(result.data).toBeDefined();
    expect(mockOrdersCreate).toHaveBeenCalled();
  });

  it("passes renewalVpsId to orders.create when provided", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    await orderService.create({ userId: 1, packageId: 1, renewalVpsId: 42 });
    const createArg = mockOrdersCreate.mock.calls.at(-1)![0];
    expect((createArg as any).data.renewal_vps_id).toBe(42);
  });

  it("returns RENEWAL_PENDING when a PENDING renewal order already exists for the VPS", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    mockOrdersFindFirst.mockResolvedValueOnce({ id: 99, status: "PENDING" });
    const result = await orderService.create({ userId: 1, packageId: 1, renewalVpsId: 42 }) as any;
    expect(result.error).toBe("RENEWAL_PENDING");
    expect(mockOrdersCreate).not.toHaveBeenCalled();
  });

  it("sets renewal_vps_id to null when renewalVpsId is not provided", async () => {
    mockPackagesFindUnique.mockResolvedValueOnce(basePackage);
    await orderService.create({ userId: 1, packageId: 1 });
    const createArg = mockOrdersCreate.mock.calls.at(-1)![0];
    expect((createArg as any).data.renewal_vps_id).toBeNull();
  });
});

// =============================================================================
// orderService.list
// =============================================================================

describe("orderService.list", () => {
  it("filters by userId for USER role", async () => {
    await orderService.list({ userId: 5, role: "users", page: 1, limit: 10 });
    const callArg = mockOrdersFindMany.mock.calls.at(-1)![0];
    expect((callArg as any).where).toEqual({ users_id: 5 });
  });

  it("returns all orders for ADMIN role (no where filter)", async () => {
    await orderService.list({ userId: 1, role: "admin", page: 1, limit: 10 });
    const callArg = mockOrdersFindMany.mock.calls.at(-1)![0];
    expect((callArg as any).where).toEqual({});
  });

  it("applies pagination correctly", async () => {
    await orderService.list({ userId: 1, role: "admin", page: 3, limit: 5 });
    const callArg = mockOrdersFindMany.mock.calls.at(-1)![0];
    expect((callArg as any).skip).toBe(10); // (3-1)*5
    expect((callArg as any).take).toBe(5);
  });
});

// =============================================================================
// orderService.getById
// =============================================================================

describe("orderService.getById", () => {
  it("returns NOT_FOUND when order does not exist", async () => {
    const result = await orderService.getById(999, 1, "users");
    expect(result).toEqual({ error: "NOT_FOUND" });
  });

  it("returns FORBIDDEN when USER requests another user's order", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 99 });
    const result = await orderService.getById(1, 1, "users"); // userId=1, order.users_id=99
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("returns data when USER requests own order", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1 });
    const result = await orderService.getById(1, 1, "users");
    expect((result as any).data).toBeDefined();
  });

  it("returns data for ADMIN viewing any order", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 99 });
    const result = await orderService.getById(1, 1, "admin");
    expect((result as any).data).toBeDefined();
  });
});

// =============================================================================
// orderService.cancel
// =============================================================================

describe("orderService.cancel", () => {
  it("returns NOT_FOUND when order does not exist", async () => {
    const result = await orderService.cancel(999, 1, "users");
    expect(result).toEqual({ error: "NOT_FOUND" });
  });

  it("returns FORBIDDEN when USER tries to cancel another's order", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 99, status: "PENDING" });
    const result = await orderService.cancel(1, 1, "users");
    expect(result).toEqual({ error: "FORBIDDEN" });
  });

  it("returns ALREADY_PAID for PAID orders", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1, status: "PAID" });
    const result = await orderService.cancel(1, 1, "users");
    expect(result).toEqual({ error: "ALREADY_PAID" });
  });

  it("returns ALREADY_CANCELLED for CANCEL orders", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1, status: "CANCEL" });
    const result = await orderService.cancel(1, 1, "users");
    expect(result).toEqual({ error: "ALREADY_CANCELLED" });
  });

  it("returns EXPIRED for EXPIRE orders", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1, status: "EXPIRE" });
    const result = await orderService.cancel(1, 1, "users");
    expect(result).toEqual({ error: "EXPIRED" });
  });

  it("cancels PENDING order successfully", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1, status: "PENDING" });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 1, status: "CANCEL", package: { name: "Starter" } });
    const result = await orderService.cancel(1, 1, "users") as any;
    expect(result.data.status).toBe("CANCEL");
  });

  it("returns CANNOT_CANCEL_UPGRADE for PAID upgrade orders", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1, status: "PAID", upgrade_vps_id: 7 });
    const result = await orderService.cancel(1, 1, "users");
    expect(result).toEqual({ error: "CANNOT_CANCEL_UPGRADE" });
  });

  it("cancels PENDING upgrade order and marks the upgrade log as cancelled", async () => {
    mockOrdersFindUnique.mockResolvedValueOnce({ id: 1, users_id: 1, status: "PENDING", upgrade_vps_id: 7 });
    mockOrdersUpdate.mockResolvedValueOnce({ id: 1, status: "CANCEL", package: { name: "Starter" } });
    const result = await orderService.cancel(1, 1, "users") as any;
    expect(result.data.status).toBe("CANCEL");
    expect(mockUpgradeLogsUpdateMany).toHaveBeenCalledWith({
      where: { order_id: 1, applied_at: null },
      data: { failed_at: expect.any(Date), fail_reason: "Cancelled by user" },
    });
  });
});
