import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _findUniqueVps: any = null;
let _updateVps: any = {};
let _findManyVps: any[] = [];
let _countVps: number = 0;
let _findManyTempVps: any[] = [];

let _proxmoxStartResult: string = "UPID:pve:00001:start";
let _proxmoxStopResult: string = "UPID:pve:00002:stop";
let _proxmoxRebootResult: string = "UPID:pve:00003:reboot";
let _proxmoxPollResult: { ok: boolean; error?: string } = { ok: true };

const vpsUpdateFn = mock(async () => _updateVps);
const startVmFn = mock(async () => _proxmoxStartResult);
const stopVmFn = mock(async () => _proxmoxStopResult);
const rebootVmFn = mock(async () => _proxmoxRebootResult);
const pollTaskFn = mock(async () => _proxmoxPollResult);
const loggerVpsFn = mock((..._args: any[]) => {});
const loggerErrorFn = mock((..._args: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    vps: {
      findUnique: mock(async () => _findUniqueVps),
      update: vpsUpdateFn,
      findMany: mock(async () => _findManyVps),
      count: mock(async () => _countVps),
    },
    temp_vps: {
      findMany: mock(async () => _findManyTempVps),
    },
  },
}));

mock.module("../../src/services/proxmox.service", () => ({
  proxmoxService: {
    startVm: startVmFn,
    stopVm: stopVmFn,
    rebootVm: rebootVmFn,
    pollTask: pollTaskFn,
    getVmStatus: mock(async () => null),
    cloneVm: mock(async () => "UPID:clone"),
    configureVm: mock(async () => {}),
    deleteVm: mock(async () => {}),
  },
  parseMemoryMiB: (mem: string) => 1024,
}));

mock.module("../../src/config/redis", () => ({
  redis: {
    set: mock(async () => "OK"),
    del: mock(async () => 1),
    get: mock(async () => null),
  },
}));

mock.module("../../src/services/ip.service", () => ({
  ipService: { allocate: mock(async () => null), release: mock(async () => {}) },
}));

mock.module("../../src/services/nat.service", () => ({
  natService: { getInfo: mock(async () => null), releaseAll: mock(async () => {}), allocateBlock: mock(async () => {}) },
}));

mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: { get: mock(async () => null) },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    vps: loggerVpsFn,
    error: loggerErrorFn,
    info: mock(() => {}),
    warn: mock(() => {}),
    auth: mock(() => {}),
    payment: mock(() => {}),
  },
}));

mock.module("../../src/config/env", () => ({
  env: {
    proxmox: {
      host: "10.0.0.1",
      tokenId: "user@realm!token",
      tokenSecret: "secret",
      node: "pve",
      storage: "local-lvm",
      gatewayPublic: "198.51.100.254",
      gatewayPrivate: "172.16.1.254",
      subnet: "24",
      defaultUser: "ubuntu",
    },
    email: {
      host: "smtp.test.local",
      port: 587,
      user: "test@cloudvps.com",
      pass: "test-pass",
    },
    appUrl: "http://localhost:3000",
    port: 3000,
  },
}));

const { vpsService } = await import("../../src/services/vps.service");

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeVps = (overrides: any = {}) => ({
  id: 1,
  vmid: 10001,
  name: "qc-1",
  status: true,
  deleted_at: null,
  ip_assignments_id: 1,
  orders_id: 1,
  expired_at: new Date(),
  created_at: new Date(),
  order: { users_id: 10, package: {}, user: { id: 10, email: "u@example.com" } },
  ip_assignment: { ip_pool: { ip: "1.2.3.4" } },
  ...overrides,
});

describe("vpsService", () => {
  beforeEach(() => {
    _findUniqueVps = null;
    _updateVps = {};
    _findManyVps = [];
    _countVps = 0;
    _findManyTempVps = [];
    _proxmoxPollResult = { ok: true };
    startVmFn.mockClear();
    stopVmFn.mockClear();
    rebootVmFn.mockClear();
    pollTaskFn.mockClear();
    vpsUpdateFn.mockClear();
    loggerVpsFn.mockClear();
    loggerErrorFn.mockClear();
  });

  // ── getById() ──────────────────────────────────────────────────────────────
  describe("getById()", () => {
    it("VPS-U-1: returns NOT_FOUND when vps does not exist", async () => {
      _findUniqueVps = null;
      const result = await vpsService.getById(999, 1, "users");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("VPS-U-2: returns NOT_FOUND for soft-deleted vps", async () => {
      _findUniqueVps = makeVps({ deleted_at: new Date() });
      const result = await vpsService.getById(1, 1, "users");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("VPS-U-3: returns FORBIDDEN when user accesses another user's vps", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 99 } });
      const result = await vpsService.getById(1, 1, "users");
      expect(result).toEqual({ error: "FORBIDDEN" });
    });

    it("VPS-U-4: returns data when owner accesses own vps", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 10 } });
      const result = await vpsService.getById(1, 10, "users");
      expect("data" in result).toBe(true);
    });

    it("VPS-U-5: admin can access any vps regardless of owner", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 99 } });
      const result = await vpsService.getById(1, 1, "admin");
      expect("data" in result).toBe(true);
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────
  describe("list()", () => {
    it("VPS-U-6: returns pagination data", async () => {
      _findManyVps = [makeVps()];
      _countVps = 1;
      const result = await vpsService.list(1, "admin", 1, 20);
      expect(result.data.total).toBe(1);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
      expect(result.data.vps).toHaveLength(1);
    });

    it("VPS-U-7: returns empty list when no VPS", async () => {
      _findManyVps = [];
      _countVps = 0;
      const result = await vpsService.list(1, "users", 1, 20);
      expect(result.data.vps).toHaveLength(0);
      expect(result.data.total).toBe(0);
    });
  });

  // ── start() ────────────────────────────────────────────────────────────────
  describe("start()", () => {
    it("VPS-U-8: returns NOT_FOUND when vps does not exist", async () => {
      _findUniqueVps = null;
      const result = await vpsService.start(999, 1, "admin");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("VPS-U-9: returns FORBIDDEN when user starts another user's vps", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 99 } });
      const result = await vpsService.start(1, 1, "users");
      expect(result).toEqual({ error: "FORBIDDEN" });
    });

    it("VPS-U-10: returns PROXMOX_ERROR when pollTask fails", async () => {
      _findUniqueVps = makeVps();
      _proxmoxPollResult = { ok: false, error: "task failed" };
      const result = await vpsService.start(1, 10, "users");
      expect(result).toEqual({ error: "PROXMOX_ERROR", detail: "task failed" });
      expect(vpsUpdateFn).not.toHaveBeenCalled();
    });

    it("VPS-U-11: updates DB status to true on success", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 10 } });
      _proxmoxPollResult = { ok: true };
      _updateVps = { id: 1, status: true };
      const result = await vpsService.start(1, 10, "users");
      expect(result.error).toBeUndefined();
      expect(vpsUpdateFn).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: true },
      });
    });
  });

  // ── stop() ─────────────────────────────────────────────────────────────────
  describe("stop()", () => {
    it("VPS-U-12: returns NOT_FOUND when vps does not exist", async () => {
      _findUniqueVps = null;
      const result = await vpsService.stop(999, 1, "admin");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("VPS-U-13: returns PROXMOX_ERROR and does NOT update DB when pollTask fails", async () => {
      _findUniqueVps = makeVps();
      _proxmoxPollResult = { ok: false, error: "timeout" };
      const result = await vpsService.stop(1, 10, "users");
      expect(result.error).toBe("PROXMOX_ERROR");
      expect(vpsUpdateFn).not.toHaveBeenCalled();
    });

    it("VPS-U-14: updates DB status to false on success", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 10 } });
      _proxmoxPollResult = { ok: true };
      _updateVps = { id: 1, status: false };
      await vpsService.stop(1, 10, "users");
      expect(vpsUpdateFn).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: false },
      });
    });
  });

  // ── reboot() ───────────────────────────────────────────────────────────────
  describe("reboot()", () => {
    it("VPS-U-15: returns NOT_FOUND when vps does not exist", async () => {
      _findUniqueVps = null;
      const result = await vpsService.reboot(999, 1, "admin");
      expect(result).toEqual({ error: "NOT_FOUND" });
    });

    it("VPS-U-16: returns PROXMOX_ERROR and does NOT update DB when pollTask fails", async () => {
      _findUniqueVps = makeVps();
      _proxmoxPollResult = { ok: false, error: "QEMU error" };
      const result = await vpsService.reboot(1, 10, "users");
      expect(result.error).toBe("PROXMOX_ERROR");
      expect(vpsUpdateFn).not.toHaveBeenCalled();
    });

    it("VPS-U-17: succeeds and does NOT change DB status (only restarts)", async () => {
      _findUniqueVps = makeVps({ order: { users_id: 10 } });
      _proxmoxPollResult = { ok: true };
      const result = await vpsService.reboot(1, 10, "users");
      expect(result.error).toBeUndefined();
      expect(vpsUpdateFn).not.toHaveBeenCalled();
    });
  });

  // ── getQueue() ─────────────────────────────────────────────────────────────
  describe("getQueue()", () => {
    it("VPS-U-18: returns empty queue when no temp_vps", async () => {
      _findManyTempVps = [];
      const result = await vpsService.getQueue();
      expect(result.data).toHaveLength(0);
    });

    it("VPS-U-19: returns all temp_vps entries", async () => {
      _findManyTempVps = [{ id: 1, order_id: 1 }, { id: 2, order_id: 2 }];
      const result = await vpsService.getQueue();
      expect(result.data).toHaveLength(2);
    });
  });
});
