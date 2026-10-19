import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _findUniqueVps: any = null;
let _findUniquePackage: any = null;
let _findFirstOrder: any = null;
let _findUniqueUpgradeLog: any = null;
let _redisSetResult: string | null = "OK";

const mockVpsUpdate      = mock(async () => ({}));
const mockOrdersCreate   = mock(async () => ({ id: 10, ref_no: "QC-20260101-UPTEST", amount: 100, users_id: 1, packages_id: 2, upgrade_vps_id: 1, status: "PENDING" }));
const mockUpgradeLogCreate = mock(async () => ({ id: 1 }));
const mockUpgradeLogUpdate = mock(async () => ({}));
const mockUpgradeLogFindUnique = mock(async () => _findUniqueUpgradeLog);
const mockUpgradeLogFindMany   = mock(async () => []);
const mockUpgradeLogCount      = mock(async () => 0);
const mockRedisSet = mock(async () => _redisSetResult);
const mockRedisDel = mock(async () => 1);
const mockAuditRecord = mock((..._args: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    vps: {
      findUnique: mock(async () => _findUniqueVps),
      update: mockVpsUpdate,
    },
    orders: {
      findFirst: mock(async () => _findFirstOrder),
      create: mockOrdersCreate,
    },
    packages: {
      findUnique: mock(async () => _findUniquePackage),
    },
    vps_upgrade_logs: {
      create: mockUpgradeLogCreate,
      update: mockUpgradeLogUpdate,
      findUnique: mockUpgradeLogFindUnique,
      findMany: mockUpgradeLogFindMany,
      count: mockUpgradeLogCount,
    },
    $transaction: mock(async (cb: any) =>
      cb({
        orders: { create: mockOrdersCreate },
        vps_upgrade_logs: { create: mockUpgradeLogCreate, update: mockUpgradeLogUpdate },
        vps: { update: mockVpsUpdate },
      })
    ),
  },
}));

mock.module("../../src/config/redis", () => ({
  redis: {
    set: mockRedisSet,
    del: mockRedisDel,
  },
}));

mock.module("../../src/services/proxmox.service", () => ({
  proxmoxService: {
    updateVmResources: mock(async () => {}),
    resizeDisk: mock(async () => {}),
    rebootVm: mock(async () => {}),
    stopVm: mock(async () => "UPID:stop"),
    startVm: mock(async () => "UPID:start"),
    pollTask: mock(async () => {}),
  },
}));

mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: {
    get: mock(async (key: string) => {
      const configs: Record<string, string> = {
        "pricing.cpu_per_core": "100",
        "pricing.ram_per_gib":  "50",
        "pricing.disk_per_gb":  "2",
      };
      return configs[key] ?? null;
    }),
  },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mockAuditRecord },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    vps: mock(() => {}),
    error: mock(() => {}),
    info: mock(() => {}),
  },
}));

// Must import AFTER mocks
import { upgradeService } from "../../src/services/upgrade.service";

// ── Helpers ───────────────────────────────────────────────────────────────────
const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now

const makeVps = (overrides: any = {}) => ({
  id: 1,
  vmid: 100,
  deleted_at: null,
  expired_at: futureDate,
  current_cores: 2,
  current_memory_gib: 4,
  current_disk_gb: 50,
  monthly_price: 500,
  order: {
    users_id: 1,
    packages_id: 1,
    package: {
      id: 1, price: 500, period: 30, os_id: 1,
      vm: { core: 2, memory: "4GB", size: "50GB" },
      os: { id: 1, os_name: "Ubuntu", os_version: "22.04 LTS" },
    },
  },
  ...overrides,
});

const makePackage = (overrides: any = {}) => ({
  id: 2, name: "Pro", price: 800, period: 30, status: true, os_id: 1,
  vm: { core: 4, memory: "8GB", size: "100GB" },
  os: { id: 1, os_name: "Ubuntu", os_version: "22.04 LTS" },
  ...overrides,
});

beforeEach(() => {
  _findUniqueVps      = makeVps();
  _findUniquePackage  = makePackage();
  _findFirstOrder     = null;
  _findUniqueUpgradeLog = null;
  _redisSetResult     = "OK";
  mockVpsUpdate.mockClear();
  mockOrdersCreate.mockClear();
  mockUpgradeLogCreate.mockClear();
  mockUpgradeLogUpdate.mockClear();
  mockAuditRecord.mockClear();
  mockRedisSet.mockClear();
  mockRedisDel.mockClear();
});

// ── createPackageUpgrade ──────────────────────────────────────────────────────
describe("createPackageUpgrade", () => {
  it("returns VPS_NOT_FOUND when vps missing", async () => {
    _findUniqueVps = null;
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("VPS_NOT_FOUND");
  });

  it("returns VPS_NOT_FOUND when vps deleted", async () => {
    _findUniqueVps = makeVps({ deleted_at: new Date() });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("VPS_NOT_FOUND");
  });

  it("returns FORBIDDEN when user does not own vps", async () => {
    _findUniqueVps = makeVps({ order: { users_id: 99, packages_id: 1, package: makeVps().order.package } });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("FORBIDDEN");
  });

  it("returns UPGRADE_PENDING when pending upgrade exists", async () => {
    _findFirstOrder = { id: 5, status: "PENDING" };
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("UPGRADE_PENDING");
  });

  it("returns PACKAGE_NOT_FOUND when package missing", async () => {
    _findUniquePackage = null;
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("PACKAGE_NOT_FOUND");
  });

  it("returns PACKAGE_INACTIVE when package not active", async () => {
    _findUniquePackage = makePackage({ status: false });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("PACKAGE_INACTIVE");
  });

  it("returns OS_MISMATCH when new package has different os", async () => {
    _findUniquePackage = makePackage({ os_id: 99, os: { id: 99, os_name: "Debian", os_version: "12" } });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("OS_MISMATCH");
  });

  it("does not flag OS_MISMATCH when os_name+os_version match but os_id differs (duplicate os row, different vmid template)", async () => {
    _findUniquePackage = makePackage({ os_id: 42, os: { id: 42, os_name: "Ubuntu", os_version: "22.04 LTS" } });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).not.toBe("OS_MISMATCH");
  });

  it("returns NO_CHANGE when specs identical", async () => {
    _findUniquePackage = makePackage({ vm: { core: 2, memory: "4GB", size: "50GB" } });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("NO_CHANGE");
  });

  it("creates PENDING order with amount when upgrading", async () => {
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBeUndefined();
    expect(r.data?.direction).toBe("UPGRADE");
    expect(r.data?.amount_charged).toBeGreaterThan(0);
    expect(r.data?.auto_approved).toBe(false);
  });

  it("creates PAID order with amount=0 when downgrading", async () => {
    _findUniquePackage = makePackage({ price: 300, vm: { core: 1, memory: "2GB", size: "50GB" } });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBeUndefined();
    expect(r.data?.direction).toBe("DOWNGRADE");
    expect(r.data?.amount_charged).toBe(0);
    expect(r.data?.auto_approved).toBe(true);
  });

  it("admin can upgrade any user vps", async () => {
    _findUniqueVps = makeVps({ order: { users_id: 99, packages_id: 1, package: makeVps().order.package } });
    const r = await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "admins" });
    expect(r.error).toBeUndefined();
  });

  it("records audit log", async () => {
    await upgradeService.createPackageUpgrade({ vpsId: 1, newPackageId: 2, requestedByUserId: 1, requestedByRole: "users" });
    expect(mockAuditRecord.mock.calls.length).toBeGreaterThan(0);
  });
});

// ── createCustomUpgrade ───────────────────────────────────────────────────────
describe("createCustomUpgrade", () => {
  it("returns VPS_NOT_FOUND when vps missing", async () => {
    _findUniqueVps = null;
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newCores: 4, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("VPS_NOT_FOUND");
  });

  it("returns FORBIDDEN when user does not own vps", async () => {
    _findUniqueVps = makeVps({ order: { users_id: 99, packages_id: 1, package: makeVps().order.package } });
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newCores: 4, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("FORBIDDEN");
  });

  it("returns NO_CHANGE when no spec changes", async () => {
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newCores: 2, newMemoryGib: 4, newDiskGb: 50, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("NO_CHANGE");
  });

  it("returns DISK_SHRINK_NOT_ALLOWED when disk decreases", async () => {
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newDiskGb: 20, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("DISK_SHRINK_NOT_ALLOWED");
  });

  it("returns CONFIG_MISSING when pricing keys absent", async () => {
    const { systemConfigService } = await import("../../src/services/system-config.service");
    (systemConfigService.get as any).mockImplementation(async () => null);
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newCores: 4, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBe("CONFIG_MISSING");
    // Restore
    (systemConfigService.get as any).mockImplementation(async (key: string) => {
      const m: Record<string, string> = { "pricing.cpu_per_core": "100", "pricing.ram_per_gib": "50", "pricing.disk_per_gb": "2" };
      return m[key] ?? null;
    });
  });

  it("computes charge for cpu upgrade", async () => {
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newCores: 4, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBeUndefined();
    expect(r.data?.amount_charged).toBeGreaterThan(0);
    // +2 cores * 100/mo * (15/30) = 100
    expect(r.data?.amount_charged).toBe(100);
  });

  it("disk only upgrade has no refund and correct amount", async () => {
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newDiskGb: 100, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBeUndefined();
    // +50GB * 2/mo * (15/30) = 50
    expect(r.data?.amount_charged).toBe(50);
  });

  it("cpu downgrade is free (amount=0) and auto-approved", async () => {
    const r = await upgradeService.createCustomUpgrade({ vpsId: 1, newCores: 1, requestedByUserId: 1, requestedByRole: "users" });
    expect(r.error).toBeUndefined();
    expect(r.data?.amount_charged).toBe(0);
    expect(r.data?.auto_approved).toBe(true);
  });
});

// ── applyUpgrade ──────────────────────────────────────────────────────────────
describe("applyUpgrade", () => {
  const baseLog = {
    id: 1, order_id: 10, applied_at: null, failed_at: null,
    after_cores: 4, after_memory_gib: 8, after_disk_gb: 100, after_monthly_price: 800,
    before_cores: 2, before_memory_gib: 4, before_disk_gb: 50,
    vps: { id: 1, vmid: 100 },
  };

  it("skips when redis lock not acquired", async () => {
    _redisSetResult = null;
    _findUniqueUpgradeLog = baseLog;
    await upgradeService.applyUpgrade(10);
    expect(mockVpsUpdate.mock.calls.length).toBe(0);
  });

  it("skips when already applied", async () => {
    _findUniqueUpgradeLog = { ...baseLog, applied_at: new Date() };
    await upgradeService.applyUpgrade(10);
    expect(mockVpsUpdate.mock.calls.length).toBe(0);
  });

  it("skips when no upgrade log", async () => {
    _findUniqueUpgradeLog = null;
    await upgradeService.applyUpgrade(10);
    expect(mockVpsUpdate.mock.calls.length).toBe(0);
  });

  it("applies upgrade and updates vps + log", async () => {
    _findUniqueUpgradeLog = baseLog;
    await upgradeService.applyUpgrade(10);
    expect(mockVpsUpdate.mock.calls.length).toBeGreaterThan(0);
    expect(mockUpgradeLogUpdate.mock.calls.length).toBeGreaterThan(0);
    expect(mockRedisDel.mock.calls.length).toBe(1);
  });

  it("marks log failed when proxmox throws", async () => {
    _findUniqueUpgradeLog = baseLog;
    const { proxmoxService } = await import("../../src/services/proxmox.service");
    (proxmoxService.updateVmResources as any).mockImplementation(async () => { throw new Error("proxmox error"); });
    await upgradeService.applyUpgrade(10);
    expect(mockUpgradeLogUpdate.mock.calls.length).toBeGreaterThan(0);
    // First update call should set failed_at
    const firstCall = mockUpgradeLogUpdate.mock.calls[0][0] as any;
    expect(firstCall.data?.failed_at).toBeDefined();
    // Restore
    (proxmoxService.updateVmResources as any).mockImplementation(async () => {});
  });
});

// ── getUpgradeHistory ─────────────────────────────────────────────────────────
describe("getUpgradeHistory", () => {
  it("returns VPS_NOT_FOUND when vps missing", async () => {
    _findUniqueVps = null;
    const r = await upgradeService.getUpgradeHistory(1, 1, "users", 1, 20);
    expect(r.error).toBe("VPS_NOT_FOUND");
  });

  it("returns FORBIDDEN when user does not own vps", async () => {
    _findUniqueVps = { id: 1, deleted_at: null, order: { users_id: 99 } };
    const r = await upgradeService.getUpgradeHistory(1, 1, "users", 1, 20);
    expect(r.error).toBe("FORBIDDEN");
  });

  it("returns paginated logs for owner", async () => {
    _findUniqueVps = { id: 1, deleted_at: null, order: { users_id: 1 } };
    const r = await upgradeService.getUpgradeHistory(1, 1, "users", 1, 20);
    expect(r.error).toBeUndefined();
    expect(r.data?.logs).toBeDefined();
    expect(r.data?.page).toBe(1);
    expect(r.data?.limit).toBe(20);
  });

  it("admin can view any vps history", async () => {
    _findUniqueVps = { id: 1, deleted_at: null, order: { users_id: 99 } };
    const r = await upgradeService.getUpgradeHistory(1, 1, "admins", 1, 20);
    expect(r.error).toBeUndefined();
  });
});
