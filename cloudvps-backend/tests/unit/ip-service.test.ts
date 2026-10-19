import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mutable mock state ────────────────────────────────────────────────────────
let _queryRawRows: any[] = [];
let _createResult: any = { id: 1, ip_id: 1, status: true };
let _updateResult: any = { id: 1, ip_id: 1, status: false };

const txFn = mock(async (fn: any, _opts?: any) =>
  fn({
    $queryRaw: async () => _queryRawRows,
    ip_assignments: { create: async () => _createResult },
  })
);

const updateFn = mock(async () => _updateResult);

mock.module("../../src/config/database", () => ({
  prisma: {
    $transaction: txFn,
    ip_assignments: { update: updateFn },
  },
}));

const { ipService } = await import("../../src/services/ip.service");

describe("ipService", () => {
  beforeEach(() => {
    _queryRawRows = [];
    _createResult = { id: 1, ip_id: 1, status: true };
    _updateResult = { id: 1, ip_id: 1, status: false };
    txFn.mockClear();
    updateFn.mockClear();
  });

  // ── allocate() ─────────────────────────────────────────────────────────────
  describe("allocate()", () => {
    it("IP-U-1: returns null when no IPs available", async () => {
      _queryRawRows = [];
      const result = await ipService.allocate();
      expect(result).toBeNull();
    });

    it("IP-U-2: returns PUBLIC IP allocation on success", async () => {
      _queryRawRows = [{ id: 7, ip: "198.51.100.1", type: "PUBLIC" }];
      _createResult = { id: 42, ip_id: 7, status: true };
      const result = await ipService.allocate();
      expect(result).toEqual({ assignmentId: 42, ip: "198.51.100.1", type: "PUBLIC" });
    });

    it("IP-U-3: returns PRIVATE IP allocation on success", async () => {
      _queryRawRows = [{ id: 3, ip: "172.16.1.1", type: "PRIVATE" }];
      _createResult = { id: 10, ip_id: 3, status: true };
      const result = await ipService.allocate();
      expect(result).toEqual({ assignmentId: 10, ip: "172.16.1.1", type: "PRIVATE" });
    });

    it("IP-U-4: calls $transaction (atomic operation)", async () => {
      _queryRawRows = [{ id: 1, ip: "10.0.0.1", type: "PRIVATE" }];
      _createResult = { id: 1, ip_id: 1, status: true };
      await ipService.allocate();
      expect(txFn).toHaveBeenCalledTimes(1);
    });

    it("IP-U-5: creates assignment for first available IP only (not second)", async () => {
      const createMock = mock(async () => ({ id: 1, ip_id: 5, status: true }));
      _queryRawRows = [
        { id: 5, ip: "198.51.100.5", type: "PUBLIC" },
        { id: 6, ip: "198.51.100.6", type: "PUBLIC" },
      ];
      // The service picks LIMIT 1, so create is called once with first row
      const origCreate = _createResult;
      _createResult = { id: 1, ip_id: 5, status: true };
      const result = await ipService.allocate();
      // ip should be the first row's IP
      expect(result?.ip).toBe("198.51.100.5");
    });
  });

  // ── release() ──────────────────────────────────────────────────────────────
  describe("release()", () => {
    it("IP-U-6: updates assignment status to false", async () => {
      await ipService.release(5);
      expect(updateFn).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { status: false },
      });
    });

    it("IP-U-7: calls update exactly once per release", async () => {
      await ipService.release(1);
      expect(updateFn).toHaveBeenCalledTimes(1);
    });

    it("IP-U-8: uses correct assignment ID", async () => {
      await ipService.release(99);
      const call = updateFn.mock.calls[0][0];
      expect(call.where.id).toBe(99);
    });
  });
});
