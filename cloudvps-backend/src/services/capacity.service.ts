import { prisma } from "../config/database";
import { redis } from "../config/redis";
import { proxmoxService, parseMemoryMiB } from "./proxmox.service";
import { systemConfigService } from "./system-config.service";
import { parseDiskGb } from "../utils/specs";
import { auditService } from "./audit.service";

const CACHE_KEY = "capacity:snapshot";
const CACHE_TTL_SEC = 30;

export interface NodeSnapshot {
  maxmem_mb: number;
  mem_mb: number;           // actual RAM in use (balloon driver — display only)
  allocated_ram_mb: number; // sum of maxmem across all VMs — used for capacity check
  cpu_pct: number;
  total_disk_gb: number;
  avail_disk_gb: number;
  reserved_ram_mb: number;
  reserved_disk_gb: number;
  effective_free_ram_mb: number;
  effective_free_disk_gb: number;
}

function safeFloorMb(bytes: unknown): number {
  const n = Number(bytes);
  return isNaN(n) ? 0 : Math.floor(n / (1024 * 1024));
}

function safeFloorGb(bytes: unknown): number {
  const n = Number(bytes);
  return isNaN(n) ? 0 : Math.floor(n / (1024 * 1024 * 1024));
}

async function getReserved(): Promise<{ ram_mb: number; disk_gb: number }> {
  const rows = await prisma.temp_vps.findMany({
    include: { order: { include: { package: { include: { vm: true } } } } },
  });
  let ram_mb = 0;
  let disk_gb = 0;
  for (const row of rows) {
    const vm = row.order?.package?.vm;
    if (vm) {
      ram_mb += parseMemoryMiB(vm.memory);
      disk_gb += parseDiskGb(vm.size);
    }
  }
  return { ram_mb, disk_gb };
}

async function buildSnapshot(): Promise<NodeSnapshot> {
  const [nodeStatus, storageStatus, vmList, reserved] = await Promise.all([
    proxmoxService.getNodeStatus(),
    proxmoxService.getStorageStatus(),
    proxmoxService.getVmList(),
    getReserved(),
  ]);

  const maxmem_mb = safeFloorMb(nodeStatus.maxmem);
  const mem_mb = safeFloorMb(nodeStatus.mem);
  const allocated_ram_mb = vmList.reduce((sum, vm) => sum + safeFloorMb(vm.maxmem), 0);
  const avail_disk_gb = safeFloorGb(storageStatus.avail);
  const total_disk_gb = safeFloorGb(storageStatus.total);

  return {
    maxmem_mb,
    mem_mb,
    allocated_ram_mb,
    cpu_pct: Number(nodeStatus.cpu) || 0,
    total_disk_gb,
    avail_disk_gb,
    reserved_ram_mb: reserved.ram_mb,
    reserved_disk_gb: reserved.disk_gb,
    effective_free_ram_mb: Math.max(0, maxmem_mb - allocated_ram_mb - reserved.ram_mb),
    effective_free_disk_gb: Math.max(0, avail_disk_gb - reserved.disk_gb),
  };
}

export const capacityService = {
  // Returns null if Proxmox unreachable or config missing — callers degrade gracefully
  async getSnapshot(): Promise<NodeSnapshot | null> {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as NodeSnapshot;
      const snapshot = await buildSnapshot();
      await redis.setex(CACHE_KEY, CACHE_TTL_SEC, JSON.stringify(snapshot));
      return snapshot;
    } catch {
      return null;
    }
  },

  isPackageFit(
    vm: { memory: string; size: string },
    snapshot: NodeSnapshot,
    minFreeRamMb: number,
    minFreeDiskGb: number
  ): boolean {
    const requiredRamMb = parseMemoryMiB(vm.memory);
    const requiredDiskGb = parseDiskGb(vm.size);
    return (
      snapshot.effective_free_ram_mb >= requiredRamMb + minFreeRamMb &&
      snapshot.effective_free_disk_gb >= requiredDiskGb + minFreeDiskGb
    );
  },

  // Used at order creation — returns error object or {} on success
  async check(
    packageId: number,
    force: boolean,
    actorId: number,
    actorRole: string
  ): Promise<{ error?: "INSUFFICIENT_RESOURCES"; detail?: Record<string, number> }> {
    const checkEnabled = await systemConfigService.get("capacity.check_enabled");
    if (checkEnabled === "false") return {};

    if (force && actorRole === "admin") {
      const snapshot = await this.getSnapshot();
      auditService.record({
        actorId,
        actorRole,
        action: "BYPASS",
        entity: "CAPACITY_CHECK",
        entityId: packageId,
        metadata: { package_id: packageId, node_snapshot: snapshot },
      });
      return {};
    }

    const snapshot = await this.getSnapshot();
    if (!snapshot) return {}; // Proxmox unreachable → fail open

    const pkg = await prisma.packages.findUnique({
      where: { id: packageId },
      include: { vm: true },
    });
    if (!pkg?.vm) return {};

    const [minRamRaw, minDiskRaw] = await Promise.all([
      systemConfigService.get("capacity.min_free_ram_mb"),
      systemConfigService.get("capacity.min_free_disk_gb"),
    ]);
    const minFreeRamMb = parseInt(minRamRaw ?? "1024", 10);
    const minFreeDiskGb = parseInt(minDiskRaw ?? "10", 10);

    const requiredRamMb = parseMemoryMiB(pkg.vm.memory);
    const requiredDiskGb = parseDiskGb(pkg.vm.size);

    if (!this.isPackageFit(pkg.vm, snapshot, minFreeRamMb, minFreeDiskGb)) {
      return {
        error: "INSUFFICIENT_RESOURCES",
        detail: {
          required_ram_mb: requiredRamMb,
          available_ram_mb: Math.max(0, snapshot.effective_free_ram_mb - minFreeRamMb),
          required_disk_gb: requiredDiskGb,
          available_disk_gb: Math.max(0, snapshot.effective_free_disk_gb - minFreeDiskGb),
        },
      };
    }

    return {};
  },

  // For admin snapshot view — throws if Proxmox unreachable
  async getNodeSnapshot(): Promise<NodeSnapshot> {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as NodeSnapshot;
    const snapshot = await buildSnapshot();
    await redis.setex(CACHE_KEY, CACHE_TTL_SEC, JSON.stringify(snapshot));
    return snapshot;
  },
};
