import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _findUniqueVps: any = null;

const vpsUpdateFn      = mock(async () => ({}));
const txVpsUpdateFn    = mock(async () => ({}));
const txOrdersUpdateFn = mock(async () => ({}));
const transactionFn    = mock(async (cb: any) =>
  cb({ vps: { update: txVpsUpdateFn }, orders: { update: txOrdersUpdateFn } })
);

let _proxmoxPollResult: { ok: boolean; error?: string } = { ok: true };
let _liveVmStatus: { status: string } | null = null;
const stopVmFn     = mock(async () => "UPID:stop");
const startVmFn    = mock(async () => "UPID:start");
const deleteVmFn   = mock(async () => {});
const pollTaskFn   = mock(async () => _proxmoxPollResult);
const getVmStatusFn = mock(async () => _liveVmStatus);

const releaseFn     = mock(async () => {});
const sendExpiredFn = mock(async () => {});
const loggerVpsFn   = mock((..._args: any[]) => {});
const loggerErrorFn = mock((..._args: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    vps: {
      findUnique: mock(async () => _findUniqueVps),
      update: vpsUpdateFn,
    },
    $transaction: transactionFn,
  },
}));

mock.module("../../src/services/proxmox.service", () => ({
  proxmoxService: {
    stopVm: stopVmFn,
    startVm: startVmFn,
    deleteVm: deleteVmFn,
    pollTask: pollTaskFn,
    getVmStatus: getVmStatusFn,
    cloneVm: mock(async () => "UPID:clone"),
    configureVm: mock(async () => {}),
  },
  parseMemoryMiB: () => 1024,
}));

mock.module("../../src/services/ip.service", () => ({
  ipService: { allocate: mock(async () => null), release: releaseFn },
}));

mock.module("../../src/services/nat.service", () => ({
  natService: { releaseAll: mock(async () => {}), allocateBlock: mock(async () => {}), getInfo: mock(async () => null) },
}));

mock.module("../../src/services/email.service", () => ({
  emailService: {
    sendExpired: sendExpiredFn,
    sendExpiryWarning: mock(async () => {}),
    sendRaw: mock(async () => {}),
    sendVerification: mock(async () => {}),
  },
}));

mock.module("../../src/config/redis", () => ({
  redis: {
    set: mock(async () => "OK"),
    del: mock(async () => 1),
    get: mock(async () => null),
  },
}));

mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: { get: mock(async () => null) },
}));

mock.module("../../src/config/env", () => ({
  env: {
    proxmox: {
      host: "10.0.0.1", tokenId: "t", tokenSecret: "s", node: "pve",
      storage: "local-lvm", gatewayPublic: "1.2.3.254", gatewayPrivate: "10.0.0.254",
      subnet: "24", defaultUser: "ubuntu",
    },
    port: 3000,
  },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    vps: loggerVpsFn, error: loggerErrorFn,
    info: mock(() => {}), warn: mock(() => {}),
    auth: mock(() => {}), payment: mock(() => {}), admin: mock(() => {}),
  },
}));

const { vpsService } = await import("../../src/services/vps.service");

// ── Helpers ───────────────────────────────────────────────────────────────────
const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDate   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

const makeVpsForExpire = (overrides: any = {}) => ({
  id: 1, vmid: 10001, name: "qc-1",
  deleted_at: null, orders_id: 1,
  expired_at: pastDate,
  order: { user: { email: "user@example.com" } },
  ...overrides,
});

const makeVpsForDelete = (overrides: any = {}) => ({
  id: 1, vmid: 10001, deleted_at: null, ip_assignments_id: 5,
  ...overrides,
});

const makeVpsForRenew = (overrides: any = {}) => ({
  id: 1, vmid: 10001, deleted_at: null,
  expired_at: futureDate,
  status: true,
  order: { status: "PAID" },
  ...overrides,
});

describe("vpsService — expire / deleteExpired / renew", () => {
  beforeEach(() => {
    _findUniqueVps = null;
    _proxmoxPollResult = { ok: true };
    _liveVmStatus = null;
    vpsUpdateFn.mockClear();
    txVpsUpdateFn.mockClear();
    txOrdersUpdateFn.mockClear();
    transactionFn.mockClear();
    stopVmFn.mockClear();
    startVmFn.mockClear();
    deleteVmFn.mockClear();
    pollTaskFn.mockClear();
    getVmStatusFn.mockClear();
    releaseFn.mockClear();
    sendExpiredFn.mockClear();
    loggerVpsFn.mockClear();
    loggerErrorFn.mockClear();
  });

  // ── expire() ───────────────────────────────────────────────────────────────
  describe("expire()", () => {
    it("VPS-EXP-1: skips when VPS not found", async () => {
      _findUniqueVps = null;
      await vpsService.expire(999);
      expect(stopVmFn).not.toHaveBeenCalled();
      expect(transactionFn).not.toHaveBeenCalled();
    });

    it("VPS-EXP-2: skips when VPS is soft-deleted", async () => {
      _findUniqueVps = makeVpsForExpire({ deleted_at: new Date() });
      await vpsService.expire(1);
      expect(stopVmFn).not.toHaveBeenCalled();
      expect(transactionFn).not.toHaveBeenCalled();
    });

    it("VPS-EXP-3: stops VM, runs DB transaction, sends email", async () => {
      _findUniqueVps = makeVpsForExpire();
      await vpsService.expire(1);
      expect(stopVmFn).toHaveBeenCalledWith(10001);
      expect(transactionFn).toHaveBeenCalledTimes(1);
      expect(txVpsUpdateFn).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: false } });
      expect(txOrdersUpdateFn).toHaveBeenCalledWith({ where: { id: 1 }, data: { status: "EXPIRE" } });
      expect(sendExpiredFn).toHaveBeenCalledWith("user@example.com", "qc-1", expect.any(Date));
    });

    it("VPS-EXP-4: Proxmox stop throws — DB transaction and email still execute", async () => {
      _findUniqueVps = makeVpsForExpire();
      stopVmFn.mockRejectedValueOnce(new Error("Proxmox unreachable"));
      await vpsService.expire(1);
      expect(transactionFn).toHaveBeenCalledTimes(1);
      expect(sendExpiredFn).toHaveBeenCalledTimes(1);
      expect(loggerVpsFn).toHaveBeenCalledWith("expire_stop_failed", expect.anything());
    });

    it("VPS-EXP-5: email send throws — logs error and does not rethrow", async () => {
      _findUniqueVps = makeVpsForExpire();
      sendExpiredFn.mockRejectedValueOnce(new Error("SMTP down"));
      await expect(vpsService.expire(1)).resolves.toBeUndefined();
      expect(loggerVpsFn).toHaveBeenCalledWith("expire_email_failed", expect.anything());
    });

    it("VPS-EXP-6: grace period is exactly 7 days after expired_at", async () => {
      const expiredAt = new Date("2026-05-10T00:00:00Z");
      _findUniqueVps = makeVpsForExpire({ expired_at: expiredAt });
      await vpsService.expire(1);
      const graceArg = sendExpiredFn.mock.calls[0][2] as Date;
      expect(graceArg.getTime()).toBe(expiredAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    });
  });

  // ── deleteExpired() ────────────────────────────────────────────────────────
  describe("deleteExpired()", () => {
    it("VPS-DEL-1: skips when VPS not found", async () => {
      _findUniqueVps = null;
      await vpsService.deleteExpired(999);
      expect(deleteVmFn).not.toHaveBeenCalled();
      expect(releaseFn).not.toHaveBeenCalled();
    });

    it("VPS-DEL-2: skips when VPS already soft-deleted", async () => {
      _findUniqueVps = makeVpsForDelete({ deleted_at: new Date() });
      await vpsService.deleteExpired(1);
      expect(deleteVmFn).not.toHaveBeenCalled();
      expect(releaseFn).not.toHaveBeenCalled();
    });

    it("VPS-DEL-3: deletes VM, releases IP, sets deleted_at", async () => {
      _findUniqueVps = makeVpsForDelete();
      await vpsService.deleteExpired(1);
      expect(deleteVmFn).toHaveBeenCalledWith(10001);
      expect(releaseFn).toHaveBeenCalledWith(5);
      expect(vpsUpdateFn).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deleted_at: expect.any(Date) },
      });
    });

    it("VPS-DEL-4: Proxmox deleteVm failure does not block IP release or soft-delete", async () => {
      _findUniqueVps = makeVpsForDelete();
      deleteVmFn.mockRejectedValueOnce(new Error("VM already gone"));
      await vpsService.deleteExpired(1);
      expect(releaseFn).toHaveBeenCalledWith(5);
      expect(vpsUpdateFn).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { deleted_at: expect.any(Date) },
      });
      expect(loggerVpsFn).toHaveBeenCalledWith("delete_expired_proxmox_failed", expect.anything());
    });
  });

  // ── renew() ────────────────────────────────────────────────────────────────
  describe("renew()", () => {
    it("VPS-REN-1: skips when VPS not found", async () => {
      _findUniqueVps = null;
      await vpsService.renew(999, 30);
      expect(vpsUpdateFn).not.toHaveBeenCalled();
    });

    it("VPS-REN-2: skips when VPS is soft-deleted", async () => {
      _findUniqueVps = makeVpsForRenew({ deleted_at: new Date() });
      await vpsService.renew(1, 30);
      expect(vpsUpdateFn).not.toHaveBeenCalled();
    });

    it("VPS-REN-3: extends expired_at from current expired_at when not yet expired", async () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      _findUniqueVps = makeVpsForRenew({ expired_at: future });
      await vpsService.renew(1, 30);
      const newExpiry = vpsUpdateFn.mock.calls[0][0].data.expired_at as Date;
      const expected = new Date(future.getTime() + 30 * 24 * 60 * 60 * 1000);
      expect(newExpiry.getTime()).toBe(expected.getTime());
      expect(startVmFn).not.toHaveBeenCalled();
    });

    it("VPS-REN-4: extends expired_at from now when VPS already expired", async () => {
      const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      _findUniqueVps = makeVpsForRenew({ expired_at: past, status: false, order: { status: "EXPIRE" } });
      const before = Date.now();
      await vpsService.renew(1, 30);
      const after = Date.now();
      const newExpiry = vpsUpdateFn.mock.calls[0][0].data.expired_at as Date;
      const expectedMin = before + 30 * 24 * 60 * 60 * 1000;
      const expectedMax = after  + 30 * 24 * 60 * 60 * 1000;
      expect(newExpiry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(newExpiry.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it("VPS-REN-5: restarts VM when order is EXPIRE and VPS is stopped live in Proxmox", async () => {
      _liveVmStatus = { status: "stopped" };
      _findUniqueVps = makeVpsForRenew({ status: false, order: { status: "EXPIRE" } });
      await vpsService.renew(1, 30);
      expect(startVmFn).toHaveBeenCalledWith(10001);
      const statusUpdate = vpsUpdateFn.mock.calls.find((c: any) => c[0].data.status === true);
      expect(statusUpdate).toBeDefined();
    });

    it("VPS-REN-6: does NOT restart when VPS is already running live in Proxmox (status=true)", async () => {
      _liveVmStatus = { status: "running" };
      _findUniqueVps = makeVpsForRenew({ status: true, order: { status: "EXPIRE" } });
      await vpsService.renew(1, 30);
      expect(startVmFn).not.toHaveBeenCalled();
    });

    it("VPS-REN-6b: syncs DB status when live Proxmox is running but DB says stopped", async () => {
      _liveVmStatus = { status: "running" };
      _findUniqueVps = makeVpsForRenew({ status: false, order: { status: "EXPIRE" } });
      await vpsService.renew(1, 30);
      expect(startVmFn).not.toHaveBeenCalled();
      const statusUpdate = vpsUpdateFn.mock.calls.find((c: any) => c[0].data.status === true);
      expect(statusUpdate).toBeDefined();
    });

    it("VPS-REN-7: does NOT restart when order status is not EXPIRE", async () => {
      _findUniqueVps = makeVpsForRenew({ status: false, order: { status: "PAID" } });
      await vpsService.renew(1, 30);
      expect(startVmFn).not.toHaveBeenCalled();
    });

    it("VPS-REN-8: startVm throws — logs and does not rethrow", async () => {
      _findUniqueVps = makeVpsForRenew({ status: false, order: { status: "EXPIRE" } });
      startVmFn.mockRejectedValueOnce(new Error("Proxmox error"));
      await expect(vpsService.renew(1, 30)).resolves.toBeUndefined();
      expect(loggerVpsFn).toHaveBeenCalledWith("renew_restart_failed", expect.anything());
    });

    it("VPS-REN-9: pollTask fail on restart — skips DB status update, logs warning", async () => {
      _findUniqueVps = makeVpsForRenew({ status: false, order: { status: "EXPIRE" } });
      _proxmoxPollResult = { ok: false, error: "timeout" };
      await vpsService.renew(1, 30);
      const statusUpdate = vpsUpdateFn.mock.calls.find((c: any) => c[0]?.data?.status === true);
      expect(statusUpdate).toBeUndefined();
      expect(loggerVpsFn).toHaveBeenCalledWith("renew_restart_failed", expect.anything());
    });
  });
});
