import { mock, describe, it, expect, beforeEach } from "bun:test";

// Inline parseMemoryMiB so we can control resolution without a stub constant
const parseMemMiB = (memory: string): number => {
  const m = memory.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!m) return 1024;
  const v = parseFloat(m[1]);
  return m[2].toUpperCase() === "GB" ? Math.round(v * 1024) : Math.round(v);
};

const mockRedisGet    = mock(() => Promise.resolve(null as string | null));
const mockRedisSetex  = mock(() => Promise.resolve("OK"));
const mockTempVps     = mock(() => Promise.resolve([] as any[]));
const mockPkgFind     = mock(() => Promise.resolve(null as any));
const mockNodeStatus  = mock(() => Promise.resolve({
  maxmem: 16 * 1024 ** 3, mem: 6 * 1024 ** 3, cpu: 0.4, maxcpu: 4,
}));
// 2 VMs with 4 GB allocated each = 8 GB allocated total
const mockVmList      = mock(() => Promise.resolve([
  { vmid: 100, maxmem: 4 * 1024 ** 3, status: "running" },
  { vmid: 101, maxmem: 4 * 1024 ** 3, status: "running" },
]));
const mockStorage     = mock(() => Promise.resolve({
  avail: 500 * 1024 ** 3, total: 1000 * 1024 ** 3, used: 500 * 1024 ** 3,
}));
const mockCfgGet      = mock(() => Promise.resolve(null as string | null));
const mockAudit       = mock((_: any) => undefined);

mock.module("../../src/config/redis", () => ({
  redis: { get: mockRedisGet, setex: mockRedisSetex },
}));

mock.module("../../src/config/database", () => ({
  prisma: {
    temp_vps: { findMany: mockTempVps },
    packages:  { findUnique: mockPkgFind },
  },
}));

mock.module("../../src/services/proxmox.service", () => ({
  proxmoxService: {
    getNodeStatus:    mockNodeStatus,
    getStorageStatus: mockStorage,
    getVmList:        mockVmList,
  },
  parseMemoryMiB: parseMemMiB,
}));

mock.module("../../src/services/system-config.service", () => ({
  systemConfigService: { get: mockCfgGet },
}));

mock.module("../../src/services/audit.service", () => ({
  auditService: { record: mockAudit },
}));

import { capacityService, type NodeSnapshot } from "../../src/services/capacity.service";

// 16 GB total, 6 GB actual used, 8 GB allocated (2 VMs × 4 GB) → 8 GB effective free; 500 GB disk free; 0 reserved
const defaultSnap: NodeSnapshot = {
  maxmem_mb: 16384, mem_mb: 6144, allocated_ram_mb: 8192, cpu_pct: 0.4,
  total_disk_gb: 1000, avail_disk_gb: 500,
  reserved_ram_mb: 0, reserved_disk_gb: 0,
  effective_free_ram_mb: 8192,   // 16384 - 8192 - 0
  effective_free_disk_gb: 500,
};

const defaultVmList = [
  { vmid: 100, maxmem: 4 * 1024 ** 3, status: "running" },
  { vmid: 101, maxmem: 4 * 1024 ** 3, status: "running" },
];

beforeEach(() => {
  mockRedisGet.mockResolvedValue(null);
  mockRedisSetex.mockResolvedValue("OK");
  mockTempVps.mockResolvedValue([]);
  mockPkgFind.mockResolvedValue(null);
  mockCfgGet.mockResolvedValue(null);
  mockNodeStatus.mockClear(); mockStorage.mockClear();
  mockVmList.mockClear(); mockRedisSetex.mockClear(); mockAudit.mockClear();
  mockNodeStatus.mockResolvedValue({ maxmem: 16 * 1024 ** 3, mem: 6 * 1024 ** 3, cpu: 0.4, maxcpu: 4 });
  mockStorage.mockResolvedValue({ avail: 500 * 1024 ** 3, total: 1000 * 1024 ** 3, used: 500 * 1024 ** 3 });
  mockVmList.mockResolvedValue(defaultVmList);
  mockRedisSetex.mockResolvedValue("OK");
});

// =============================================================================
// isPackageFit (pure sync — no mocks needed)
// =============================================================================

describe("capacityService.isPackageFit", () => {
  const snap = defaultSnap; // effective_free: 8192 MB RAM, 500 GB disk
  const minRam = 1024;       // 1 GB buffer
  const minDisk = 10;        // 10 GB buffer

  it("returns true when RAM and disk both sufficient", () => {
    // 4096 + 1024 = 5120 <= 8192 RAM; 80 + 10 = 90 <= 500 disk
    expect(capacityService.isPackageFit({ memory: "4GB", size: "80GB" }, snap, minRam, minDisk)).toBe(true);
  });

  it("returns false when RAM insufficient", () => {
    // 8192 + 1024 = 9216 > 8192 → fail
    expect(capacityService.isPackageFit({ memory: "8GB", size: "80GB" }, snap, minRam, minDisk)).toBe(false);
  });

  it("returns false when disk insufficient", () => {
    // 495 + 10 = 505 > 500 → fail
    expect(capacityService.isPackageFit({ memory: "4GB", size: "495GB" }, snap, minRam, minDisk)).toBe(false);
  });

  it("returns false when both RAM and disk insufficient", () => {
    expect(capacityService.isPackageFit({ memory: "8GB", size: "495GB" }, snap, minRam, minDisk)).toBe(false);
  });

  it("fits exactly at boundary (required + buffer === effective_free)", () => {
    // 7168 + 1024 = 8192 === 8192 → >= passes → true
    expect(capacityService.isPackageFit({ memory: "7168MB", size: "10GB" }, snap, minRam, minDisk)).toBe(true);
  });

  it("fails when required + buffer exceeds effective_free by 1 MB", () => {
    // 7169 + 1024 = 8193 > 8192 → false
    expect(capacityService.isPackageFit({ memory: "7169MB", size: "10GB" }, snap, minRam, minDisk)).toBe(false);
  });

  it("zero buffer: fits when required equals effective_free", () => {
    // 8192 + 0 = 8192 <= 8192; 500 + 0 <= 500 → true
    expect(capacityService.isPackageFit({ memory: "8192MB", size: "500GB" }, snap, 0, 0)).toBe(true);
  });
});

// =============================================================================
// getSnapshot
// =============================================================================

describe("capacityService.getSnapshot", () => {
  it("returns parsed snapshot from Redis on cache hit", async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(defaultSnap));
    const result = await capacityService.getSnapshot();
    expect(result).toEqual(defaultSnap);
    expect(mockNodeStatus).not.toHaveBeenCalled();
  });

  it("builds from Proxmox on cache miss and caches it", async () => {
    const result = await capacityService.getSnapshot();
    expect(result).not.toBeNull();
    expect(result!.maxmem_mb).toBe(16384);       // 16 GB total
    expect(result!.allocated_ram_mb).toBe(8192); // 2 VMs × 4 GB
    expect(result!.mem_mb).toBe(6144);           // actual used (display only)
    expect(result!.avail_disk_gb).toBe(500);
    expect(mockRedisSetex).toHaveBeenCalledTimes(1);
  });

  it("computes effective_free_ram_mb = maxmem - allocated - reserved", async () => {
    mockTempVps.mockResolvedValueOnce([
      { order: { package: { vm: { memory: "2GB", size: "40GB" } } } },
    ]);
    const result = await capacityService.getSnapshot();
    // reserved_ram = 2048; effective = 16384 - 8192(allocated) - 2048 = 6144
    expect(result!.reserved_ram_mb).toBe(2048);
    expect(result!.effective_free_ram_mb).toBe(6144);
  });

  it("uses VM allocated RAM (not actual used) for effective_free_ram_mb", async () => {
    // VM list: 1 VM with 12 GB allocated, node actual used = 6 GB
    mockVmList.mockResolvedValueOnce([{ vmid: 100, maxmem: 12 * 1024 ** 3, status: "running" }]);
    const result = await capacityService.getSnapshot();
    // effective = 16384 - 12288(allocated) - 0 = 4096 (not 16384 - 6144 = 10240)
    expect(result!.allocated_ram_mb).toBe(12288);
    expect(result!.effective_free_ram_mb).toBe(4096);
  });

  it("effective_free_ram_mb is 0 when over-allocated (no negative)", async () => {
    // VMs allocated more than total node RAM (e.g. memory overcommit scenario)
    mockVmList.mockResolvedValueOnce([{ vmid: 100, maxmem: 20 * 1024 ** 3, status: "running" }]);
    const result = await capacityService.getSnapshot();
    expect(result!.effective_free_ram_mb).toBe(0);
  });

  it("handles null/undefined fields from Proxmox without producing NaN", async () => {
    mockNodeStatus.mockResolvedValueOnce({ maxmem: undefined, mem: null, cpu: undefined, maxcpu: 4 });
    mockVmList.mockResolvedValueOnce([]);
    const result = await capacityService.getSnapshot();
    expect(result).not.toBeNull();
    expect(result!.maxmem_mb).toBe(0);
    expect(result!.mem_mb).toBe(0);
    expect(result!.cpu_pct).toBe(0);
    expect(Number.isNaN(result!.maxmem_mb)).toBe(false);
    expect(Number.isNaN(result!.effective_free_ram_mb)).toBe(false);
  });

  it("getVmList returns empty array → allocated_ram_mb = 0", async () => {
    mockVmList.mockResolvedValueOnce([]);
    const result = await capacityService.getSnapshot();
    expect(result!.allocated_ram_mb).toBe(0);
    expect(result!.effective_free_ram_mb).toBe(16384); // 16384 - 0 - 0
  });

  it("computes effective_free_disk_gb = avail_disk - reserved_disk", async () => {
    mockTempVps.mockResolvedValueOnce([
      { order: { package: { vm: { memory: "1GB", size: "100GB" } } } },
    ]);
    const result = await capacityService.getSnapshot();
    expect(result!.reserved_disk_gb).toBe(100);
    expect(result!.effective_free_disk_gb).toBe(400); // 500 - 100
  });

  it("skips temp_vps rows with missing vm or missing order", async () => {
    mockTempVps.mockResolvedValueOnce([
      { order: { package: { vm: null } } },
      { order: null },
    ]);
    const result = await capacityService.getSnapshot();
    expect(result!.reserved_ram_mb).toBe(0);
    expect(result!.reserved_disk_gb).toBe(0);
  });

  it("returns null when Proxmox throws", async () => {
    mockNodeStatus.mockRejectedValueOnce(new Error("Proxmox unreachable"));
    const result = await capacityService.getSnapshot();
    expect(result).toBeNull();
  });

  it("returns null when Redis throws", async () => {
    mockRedisGet.mockRejectedValueOnce(new Error("Redis gone"));
    const result = await capacityService.getSnapshot();
    expect(result).toBeNull();
  });
});

// =============================================================================
// check
// =============================================================================

describe("capacityService.check", () => {
  beforeEach(() => {
    // Simulate cache hit so buildSnapshot isn't invoked on every check() test
    mockRedisGet.mockResolvedValue(JSON.stringify(defaultSnap));
  });

  it("returns {} immediately when capacity.check_enabled is 'false'", async () => {
    mockCfgGet.mockResolvedValueOnce("false");
    const result = await capacityService.check(1, false, 1, "users");
    expect(result).toEqual({});
    expect(mockNodeStatus).not.toHaveBeenCalled();
  });

  it("returns {} and records BYPASS audit for admin force bypass", async () => {
    const result = await capacityService.check(1, true, 42, "admin");
    expect(result).toEqual({});
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const arg = mockAudit.mock.calls[0][0];
    expect(arg.action).toBe("BYPASS");
    expect(arg.entity).toBe("CAPACITY_CHECK");
    expect(arg.actorId).toBe(42);
  });

  it("does NOT bypass for non-admin even with force=true", async () => {
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: { memory: "12GB", size: "80GB" } });
    const result = await capacityService.check(1, true, 1, "users");
    // 12288 + 1024 = 13312 > 8192 → INSUFFICIENT
    expect((result as any).error).toBe("INSUFFICIENT_RESOURCES");
  });

  it("returns {} (fail open) when snapshot is null — Proxmox unreachable", async () => {
    mockRedisGet.mockResolvedValueOnce(null); // cache miss
    mockNodeStatus.mockRejectedValueOnce(new Error("unreachable"));
    const result = await capacityService.check(1, false, 1, "users");
    expect(result).toEqual({});
  });

  it("returns {} when package not found in DB", async () => {
    // mockPkgFind already returns null by default
    const result = await capacityService.check(999, false, 1, "users");
    expect(result).toEqual({});
  });

  it("returns {} when package has no vm spec", async () => {
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: null });
    const result = await capacityService.check(1, false, 1, "users");
    expect(result).toEqual({});
  });

  it("returns INSUFFICIENT_RESOURCES with detail when RAM is too low", async () => {
    // 8192 + 1024 = 9216 > 8192 → insufficient
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: { memory: "8GB", size: "80GB" } });
    const result = await capacityService.check(1, false, 1, "users") as any;
    expect(result.error).toBe("INSUFFICIENT_RESOURCES");
    expect(result.detail.required_ram_mb).toBe(8192);
    expect(result.detail.required_disk_gb).toBe(80);
    expect(typeof result.detail.available_ram_mb).toBe("number");
  });

  it("returns INSUFFICIENT_RESOURCES when disk is too low", async () => {
    // 495 + 10 = 505 > 500 → insufficient
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: { memory: "2GB", size: "495GB" } });
    const result = await capacityService.check(1, false, 1, "users") as any;
    expect(result.error).toBe("INSUFFICIENT_RESOURCES");
    expect(result.detail.required_disk_gb).toBe(495);
  });

  it("returns {} when resources are sufficient", async () => {
    // 4096 + 1024 = 5120 <= 8192; 80 + 10 = 90 <= 500
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: { memory: "4GB", size: "80GB" } });
    const result = await capacityService.check(1, false, 1, "users");
    expect(result).toEqual({});
  });

  it("respects custom buffer from system_configs", async () => {
    // 4096 + 6144 = 10240 > 8192 → insufficient with large buffer
    mockCfgGet
      .mockResolvedValueOnce(null)    // capacity.check_enabled → enabled
      .mockResolvedValueOnce("6144")  // capacity.min_free_ram_mb
      .mockResolvedValueOnce("10");   // capacity.min_free_disk_gb
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: { memory: "4GB", size: "80GB" } });
    const result = await capacityService.check(1, false, 1, "users") as any;
    expect(result.error).toBe("INSUFFICIENT_RESOURCES");
  });

  it("detail.available_ram_mb = max(0, effective_free - minFreeRamMb)", async () => {
    // effective_free=8192, minFreeRamMb=1024 → available = 8192 - 1024 = 7168
    mockPkgFind.mockResolvedValueOnce({ id: 1, vm: { memory: "8GB", size: "80GB" } });
    const result = await capacityService.check(1, false, 1, "users") as any;
    expect(result.detail.available_ram_mb).toBe(7168);
  });
});

// =============================================================================
// getNodeSnapshot (throws on error — unlike getSnapshot)
// =============================================================================

describe("capacityService.getNodeSnapshot", () => {
  it("returns cached snapshot on cache hit", async () => {
    mockRedisGet.mockResolvedValueOnce(JSON.stringify(defaultSnap));
    const result = await capacityService.getNodeSnapshot();
    expect(result).toEqual(defaultSnap);
    expect(mockNodeStatus).not.toHaveBeenCalled();
  });

  it("builds and caches snapshot on cache miss", async () => {
    const result = await capacityService.getNodeSnapshot();
    expect(result.maxmem_mb).toBe(16384);
    expect(result.allocated_ram_mb).toBe(8192);
    expect(mockRedisSetex).toHaveBeenCalledTimes(1);
  });

  it("throws when Proxmox is unreachable (does not swallow error)", async () => {
    mockNodeStatus.mockRejectedValueOnce(new Error("Proxmox down"));
    await expect(capacityService.getNodeSnapshot()).rejects.toThrow("Proxmox down");
  });
});
