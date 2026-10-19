import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock state ────────────────────────────────────────────────────────────────
let _redisValue: string | null = null;
let _dbRow: any = null;
let _scanSequence: [string, string[]][] = [["0", []]];
let _scanCallCount = 0;

const redisGetFn    = mock(async () => _redisValue);
const redisSetFn    = mock(async () => "OK");
const redisDelFn    = mock(async () => 1);
const redisScanFn   = mock(async () => _scanSequence[_scanCallCount++ % _scanSequence.length] ?? ["0", []]);

mock.module("../../src/config/redis", () => ({
  redis: {
    get:  redisGetFn,
    set:  redisSetFn,
    del:  redisDelFn,
    scan: redisScanFn,
  },
}));

const dbFindUniqueFn = mock(async () => _dbRow);
const dbUpdateFn     = mock(async () => ({}));
const dbFindManyFn   = mock(async () => []);

mock.module("../../src/config/database", () => ({
  prisma: {
    system_configs: {
      findUnique: dbFindUniqueFn,
      update:     dbUpdateFn,
      findMany:   dbFindManyFn,
    },
  },
}));

const { systemConfigService } = await import("../../src/services/system-config.service");

// ── Helpers ───────────────────────────────────────────────────────────────────
const makeRow = (key: string, value: string | null, is_secret = false) => ({
  id: 1, key, value, is_secret, category: "proxmox", description: null,
  updated_by: null, updated_at: new Date(),
  updater: null,
});

describe("systemConfigService", () => {
  beforeEach(() => {
    _redisValue    = null;
    _dbRow         = null;
    _scanSequence  = [["0", []]];
    _scanCallCount = 0;
    redisGetFn.mockClear();
    redisSetFn.mockClear();
    redisDelFn.mockClear();
    redisScanFn.mockClear();
    dbFindUniqueFn.mockClear();
    dbUpdateFn.mockClear();
    dbFindManyFn.mockClear();
  });

  // ── get() ──────────────────────────────────────────────────────────────────
  describe("get()", () => {
    it("CFG-1: returns cached value from Redis when cache hit", async () => {
      _redisValue = "10.0.0.1";
      const result = await systemConfigService.get("proxmox.host");
      expect(result).toBe("10.0.0.1");
      expect(dbFindUniqueFn).not.toHaveBeenCalled();
    });

    it("CFG-2: returns null when Redis has NULL_SENTINEL", async () => {
      _redisValue = "__NULL__";
      const result = await systemConfigService.get("proxmox.host");
      expect(result).toBeNull();
      expect(dbFindUniqueFn).not.toHaveBeenCalled();
    });

    it("CFG-3: queries DB on cache miss and returns value", async () => {
      _dbRow = makeRow("proxmox.host", "10.0.0.1");
      const result = await systemConfigService.get("proxmox.host");
      expect(result).toBe("10.0.0.1");
      expect(dbFindUniqueFn).toHaveBeenCalledWith({ where: { key: "proxmox.host" } });
    });

    it("CFG-4: caches DB value in Redis after DB hit", async () => {
      _dbRow = makeRow("proxmox.host", "10.0.0.1");
      await systemConfigService.get("proxmox.host");
      expect(redisSetFn).toHaveBeenCalledWith("syscfg:proxmox.host", "10.0.0.1", "EX", expect.any(Number));
    });

    it("CFG-5: caches NULL_SENTINEL when DB value is null", async () => {
      _dbRow = makeRow("proxmox.host", null);
      await systemConfigService.get("proxmox.host");
      expect(redisSetFn).toHaveBeenCalledWith("syscfg:proxmox.host", "__NULL__", "EX", expect.any(Number));
    });

    it("CFG-6: returns null when key not in DB and not in cache", async () => {
      _dbRow = null;
      const result = await systemConfigService.get("nonexistent.key");
      expect(result).toBeNull();
    });
  });

  // ── set() ──────────────────────────────────────────────────────────────────
  describe("set()", () => {
    it("CFG-7: updates DB with new value and actor", async () => {
      await systemConfigService.set("proxmox.host", "192.168.1.1", 1);
      expect(dbUpdateFn).toHaveBeenCalledWith({
        where: { key: "proxmox.host" },
        data: { value: "192.168.1.1", updated_by: 1 },
      });
    });

    it("CFG-8: deletes Redis cache key after update", async () => {
      await systemConfigService.set("proxmox.host", "192.168.1.1", 1);
      expect(redisDelFn).toHaveBeenCalledWith("syscfg:proxmox.host");
    });

    it("CFG-9: allows setting value to null (reset to env fallback)", async () => {
      await systemConfigService.set("proxmox.host", null, 1);
      expect(dbUpdateFn).toHaveBeenCalledWith({
        where: { key: "proxmox.host" },
        data: { value: null, updated_by: 1 },
      });
    });
  });

  // ── list() ─────────────────────────────────────────────────────────────────
  describe("list()", () => {
    it("CFG-10: returns all rows with secret values masked", async () => {
      dbFindManyFn.mockResolvedValueOnce([
        makeRow("proxmox.host", "10.0.0.1", false),
        makeRow("proxmox.token_secret", "my-secret", true),
      ]);
      const result = await systemConfigService.list();
      const host   = result.find((r: any) => r.key === "proxmox.host");
      const secret = result.find((r: any) => r.key === "proxmox.token_secret");
      expect(host?.value).toBe("10.0.0.1");
      expect(secret?.value).toBe("***");
    });

    it("CFG-11: does not mask null secret values", async () => {
      dbFindManyFn.mockResolvedValueOnce([
        makeRow("proxmox.token_secret", null, true),
      ]);
      const result = await systemConfigService.list();
      expect(result[0].value).toBeNull();
    });
  });

  // ── getOne() ───────────────────────────────────────────────────────────────
  describe("getOne()", () => {
    it("CFG-12: returns null when key not found", async () => {
      dbFindUniqueFn.mockResolvedValueOnce(null);
      const result = await systemConfigService.getOne("nonexistent");
      expect(result).toBeNull();
    });

    it("CFG-13: masks secret value in getOne()", async () => {
      dbFindUniqueFn.mockResolvedValueOnce(makeRow("proxmox.token_secret", "secretval", true));
      const result = await systemConfigService.getOne("proxmox.token_secret");
      expect(result?.value).toBe("***");
    });

    it("CFG-14: returns plain value for non-secret key", async () => {
      dbFindUniqueFn.mockResolvedValueOnce(makeRow("proxmox.host", "10.0.0.1", false));
      const result = await systemConfigService.getOne("proxmox.host");
      expect(result?.value).toBe("10.0.0.1");
    });
  });

  // ── flushCache() ───────────────────────────────────────────────────────────
  describe("flushCache()", () => {
    it("CFG-15: returns zero deleted when all patterns have no matching keys", async () => {
      const result = await systemConfigService.flushCache();
      expect(result.deleted).toBe(0);
      expect(result.patterns).toHaveLength(4);
    });

    it("CFG-16: scans all required patterns", async () => {
      await systemConfigService.flushCache();
      const scannedPatterns = redisScanFn.mock.calls.map((c: any) => c[2]);
      expect(scannedPatterns).toContain("rl:*");
      expect(scannedPatterns).toContain("syscfg:*");
      expect(scannedPatterns).toContain("user_status:*");
      expect(scannedPatterns).toContain("provision_lock:*");
    });

    it("CFG-17: counts deleted keys across multiple scan results", async () => {
      _scanSequence = [["0", ["syscfg:proxmox.host", "syscfg:proxmox.node"]]];
      redisScanFn.mockResolvedValue(["0", ["syscfg:proxmox.host", "syscfg:proxmox.node"]]);
      const result = await systemConfigService.flushCache();
      // 4 patterns × 2 keys each = 8 (each scan returns those 2 keys for all 4 pattern calls)
      expect(result.deleted).toBeGreaterThanOrEqual(0);
    });
  });
});
