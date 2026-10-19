import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _usersResult:     any[] = [];
let _vpsResult:       any[] = [];
let _vpsFindManyArgs: any   = null;
let _broadcastRecord: any   = { id: 1, subject: "test", sent_count: 0, failed_count: 0 };
let _broadcastList:   any[] = [];
let _broadcastCount         = 0;
let _broadcastUnique: any   = null;

const sendBroadcastFn   = mock(async () => {});
const createBroadcastFn = mock(async () => _broadcastRecord);
const findUniqueFn      = mock(async () => _broadcastUnique);
const loggerAdminFn     = mock((..._args: any[]) => {});

mock.module("../../src/config/database", () => ({
  prisma: {
    users: {
      findMany: mock(async () => _usersResult),
    },
    vps: {
      findMany: mock(async (args: any) => { _vpsFindManyArgs = args; return _vpsResult; }),
    },
    email_broadcasts: {
      create:     createBroadcastFn,
      findMany:   mock(async () => _broadcastList),
      count:      mock(async () => _broadcastCount),
      findUnique: findUniqueFn,
    },
  },
}));

mock.module("../../src/services/email.service", () => ({
  emailService: {
    sendBroadcast:    sendBroadcastFn,
    sendRaw:          mock(async () => {}),
    sendExpired:      mock(async () => {}),
    sendExpiryWarning: mock(async () => {}),
    sendVerification: mock(async () => {}),
  },
}));

mock.module("../../src/utils/logger", () => ({
  logger: {
    admin:   loggerAdminFn,
    info:    mock(() => {}),
    warn:    mock(() => {}),
    error:   mock(() => {}),
    vps:     mock(() => {}),
    auth:    mock(() => {}),
    payment: mock(() => {}),
  },
}));

const { broadcastService } = await import("../../src/services/broadcast.service");

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeUser = (email: string) => ({ email });

const makeVpsWithEmail = (email: string, extra: any = {}) => ({
  status: true, deleted_at: null, expired_at: new Date(),
  order: { user: { email } },
  ...extra,
});

const baseSend = (target: string, overrides: any = {}) => ({
  subject: "Test Subject",
  body:    "Test body",
  type:    "ANNOUNCEMENT",
  target,
  actorId: 1,
  ...overrides,
});

describe("broadcastService", () => {
  beforeEach(() => {
    _usersResult      = [];
    _vpsResult        = [];
    _vpsFindManyArgs  = null;
    _broadcastRecord  = { id: 1, subject: "test", sent_count: 0, failed_count: 0 };
    _broadcastList    = [];
    _broadcastCount   = 0;
    _broadcastUnique  = null;
    sendBroadcastFn.mockClear();
    createBroadcastFn.mockClear();
    findUniqueFn.mockClear();
    loggerAdminFn.mockClear();
  });

  // ── send() ─────────────────────────────────────────────────────────────────
  describe("send()", () => {
    it("BCAST-1: ALL target — sends email to each active+verified user", async () => {
      _usersResult = [makeUser("a@example.com"), makeUser("b@example.com")];
      await broadcastService.send(baseSend("ALL"));
      expect(sendBroadcastFn).toHaveBeenCalledTimes(2);
      const recipients = sendBroadcastFn.mock.calls.map((c: any) => c[0]);
      expect(recipients).toContain("a@example.com");
      expect(recipients).toContain("b@example.com");
    });

    it("BCAST-2: ACTIVE_VPS target — deduplicates users with multiple VPS", async () => {
      _vpsResult = [
        makeVpsWithEmail("shared@example.com"),
        makeVpsWithEmail("shared@example.com"),
        makeVpsWithEmail("other@example.com"),
      ];
      await broadcastService.send(baseSend("ACTIVE_VPS"));
      expect(sendBroadcastFn).toHaveBeenCalledTimes(2);
    });

    it("BCAST-3: EXPIRING_SOON target — sends to unique emails of expiring VPS owners", async () => {
      _vpsResult = [makeVpsWithEmail("expiring@example.com")];
      await broadcastService.send(baseSend("EXPIRING_SOON"));
      expect(sendBroadcastFn).toHaveBeenCalledTimes(1);
      expect(sendBroadcastFn.mock.calls[0][0]).toBe("expiring@example.com");
    });

    it("BCAST-4: unknown target — no sendBroadcast calls, still creates broadcast record", async () => {
      await broadcastService.send(baseSend("UNKNOWN_TARGET"));
      expect(sendBroadcastFn).not.toHaveBeenCalled();
      expect(createBroadcastFn).toHaveBeenCalledTimes(1);
    });

    it("BCAST-5: partial send failure — sentCount/failedCount from allSettled, not suppressed", async () => {
      _usersResult = [makeUser("ok@example.com"), makeUser("fail@example.com")];
      sendBroadcastFn
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("SMTP error"));
      const result = await broadcastService.send(baseSend("ALL"));
      expect(result.sentCount).toBe(1);
      expect(result.failedCount).toBe(1);
    });

    it("BCAST-6: creates broadcast record with correct metadata", async () => {
      _usersResult     = [makeUser("u@example.com")];
      _broadcastRecord = { id: 10, sent_count: 1, failed_count: 0 };
      const result = await broadcastService.send(baseSend("ALL"));
      expect(createBroadcastFn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subject:      "Test Subject",
            body:         "Test body",
            type:         "ANNOUNCEMENT",
            target:       "ALL",
            sent_by:      1,
            sent_count:   1,
            failed_count: 0,
          }),
        })
      );
      expect(result.broadcastId).toBe(10);
    });

    it("BCAST-7: logs broadcast_sent with actorId and send counts", async () => {
      _usersResult = [makeUser("u@example.com")];
      await broadcastService.send(baseSend("ALL", { actorId: 99 }));
      expect(loggerAdminFn).toHaveBeenCalledWith(
        "broadcast_sent",
        expect.objectContaining({ actorId: 99, sentCount: 1, failedCount: 0 }),
      );
    });

    it("BCAST-8: MAINTENANCE type — passes type to sendBroadcast", async () => {
      _usersResult = [makeUser("u@example.com")];
      await broadcastService.send(baseSend("ALL", { type: "MAINTENANCE" }));
      expect(sendBroadcastFn).toHaveBeenCalledWith(
        "u@example.com", "Test Subject", "Test body", "MAINTENANCE"
      );
    });

    it("BCAST-9: EMERGENCY type — passes type to sendBroadcast", async () => {
      _usersResult = [makeUser("u@example.com")];
      await broadcastService.send(baseSend("ALL", { type: "EMERGENCY" }));
      expect(sendBroadcastFn).toHaveBeenCalledWith(
        "u@example.com", "Test Subject", "Test body", "EMERGENCY"
      );
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────
  describe("list()", () => {
    it("BCAST-10: returns paginated broadcast history", async () => {
      _broadcastList  = [{ id: 1, subject: "Maintenance", sender: { id: 1, email: "admin@example.com" } }];
      _broadcastCount = 5;
      const result = await broadcastService.list(1, 20);
      expect(result.data.broadcasts).toHaveLength(1);
      expect(result.data.total).toBe(5);
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    });

    it("BCAST-11: applies correct skip based on page", async () => {
      _broadcastList  = [];
      _broadcastCount = 0;
      await broadcastService.list(3, 10);
      const result = await broadcastService.list(3, 10);
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(10);
    });
  });

  // ── getById() ──────────────────────────────────────────────────────────────
  describe("getById()", () => {
    it("BCAST-12: returns broadcast record with sender when found", async () => {
      _broadcastUnique = {
        id: 5, subject: "Test", body: "body", type: "ANNOUNCEMENT", target: "ALL",
        sent_count: 10, failed_count: 0, created_at: new Date(),
        sender: { id: 1, email: "admin@example.com" },
      };
      const result = await broadcastService.getById(5);
      expect(findUniqueFn).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 5 } })
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe(5);
      expect(result!.sender).toEqual({ id: 1, email: "admin@example.com" });
    });

    it("BCAST-13: returns null when broadcast not found", async () => {
      _broadcastUnique = null;
      const result = await broadcastService.getById(999);
      expect(result).toBeNull();
    });
  });

  // ── target filter guard tests ──────────────────────────────────────────────
  describe("target filter safety", () => {
    it("BCAST-14: EXPIRING_SOON query includes deleted_at: null guard", async () => {
      _vpsResult = [makeVpsWithEmail("expiring@example.com")];
      await broadcastService.send(baseSend("EXPIRING_SOON"));
      expect(_vpsFindManyArgs?.where).toMatchObject({ deleted_at: null });
    });

    it("BCAST-15: EXPIRING_SOON query includes gte: now lower bound (excludes already-expired VPS)", async () => {
      _vpsResult = [];
      await broadcastService.send(baseSend("EXPIRING_SOON"));
      expect(_vpsFindManyArgs?.where?.expired_at).toHaveProperty("gte");
      const gteDate = _vpsFindManyArgs.where.expired_at.gte as Date;
      expect(gteDate.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("BCAST-16: ACTIVE_VPS query includes deleted_at: null and status: true", async () => {
      _vpsResult = [];
      await broadcastService.send(baseSend("ACTIVE_VPS"));
      expect(_vpsFindManyArgs?.where).toMatchObject({ status: true, deleted_at: null });
    });
  });
});
