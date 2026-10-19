import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { redis } from "../config/redis";
import { proxmoxService } from "./proxmox.service";
import { systemConfigService } from "./system-config.service";
import { auditService } from "./audit.service";
import { parseGib, parseDiskGb } from "../utils/specs";

const DAY_MS = 24 * 60 * 60 * 1000;
const generateRefNo = (): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `QC-${date}-${rand}`;
};

// Pro-rate charge: how much of `amount` to charge given days_remaining out of total period (days).
function computeProRate(amount: number, daysRemaining: number, period: number): number {
  if (period <= 0 || daysRemaining <= 0) return 0;
  return Math.ceil((amount * Math.min(daysRemaining, period)) / period);
}

// Get current effective specs for a VPS.
// Uses current_* columns if populated; falls back to provision-time package.vm.
async function getEffectiveSpecs(vps: any): Promise<{
  cores: number; memoryGib: number; diskGb: number; monthlyPrice: number; packageId: number;
}> {
  if (
    vps.current_cores != null &&
    vps.current_memory_gib != null &&
    vps.current_disk_gb != null &&
    vps.monthly_price != null
  ) {
    return {
      cores: vps.current_cores,
      memoryGib: vps.current_memory_gib,
      diskGb: vps.current_disk_gb,
      monthlyPrice: vps.monthly_price,
      packageId: vps.order.packages_id,
    };
  }
  // Legacy VPS: derive from provision-time package
  const pkg = vps.order.package;
  return {
    cores: pkg.vm.core,
    memoryGib: parseGib(pkg.vm.memory),
    diskGb: parseDiskGb(pkg.vm.size),
    monthlyPrice: pkg.price,
    packageId: pkg.id,
  };
}

export const upgradeService = {
  // MODE A: Switch to a different package (upgrade or downgrade).
  async createPackageUpgrade(data: {
    vpsId: number;
    newPackageId: number;
    requestedByUserId: number;
    requestedByRole: string;
    ipAddress?: string;
  }) {
    const vps = await prisma.vps.findUnique({
      where: { id: data.vpsId },
      include: { order: { include: { package: { include: { vm: true, os: true } } } } },
    });
    if (!vps || vps.deleted_at) return { error: "VPS_NOT_FOUND" as const };
    if (data.requestedByRole === "users" && vps.order.users_id !== data.requestedByUserId)
      return { error: "FORBIDDEN" as const };

    const pending = await prisma.orders.findFirst({
      where: { upgrade_vps_id: data.vpsId, status: "PENDING" },
    });
    if (pending) return { error: "UPGRADE_PENDING" as const };

    const newPkg = await prisma.packages.findUnique({
      where: { id: data.newPackageId },
      include: { vm: true, os: true },
    });
    if (!newPkg) return { error: "PACKAGE_NOT_FOUND" as const };
    if (!newPkg.status) return { error: "PACKAGE_INACTIVE" as const };
    const currentOs = vps.order.package.os;
    if (newPkg.os.os_name !== currentOs.os_name || newPkg.os.os_version !== currentOs.os_version)
      return { error: "OS_MISMATCH" as const };

    const current = await getEffectiveSpecs(vps);
    const afterCores = newPkg.vm.core;
    const afterMemGib = parseGib(newPkg.vm.memory);
    const afterDiskGb = parseDiskGb(newPkg.vm.size);
    const afterPrice = newPkg.price;

    if (
      afterCores === current.cores &&
      afterMemGib === current.memoryGib &&
      afterDiskGb === current.diskGb
    ) return { error: "NO_CHANGE" as const };

    const daysRemaining = Math.max(0, Math.ceil((vps.expired_at.getTime() - Date.now()) / DAY_MS));
    const direction = afterPrice > current.monthlyPrice ? "UPGRADE" : "DOWNGRADE";
    const amount =
      direction === "UPGRADE"
        ? computeProRate(afterPrice - current.monthlyPrice, daysRemaining, newPkg.period)
        : 0;

    const periodDays = newPkg.period;
    const newSubtotal = Math.round((afterPrice * daysRemaining / periodDays) * 100) / 100;
    const oldCredit = Math.round((current.monthlyPrice * daysRemaining / periodDays) * 100) / 100;

    const orderStatus = amount === 0 ? "PAID" : "PENDING";

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.create({
        data: {
          ref_no: generateRefNo(),
          amount,
          users_id: vps.order.users_id,
          packages_id: data.newPackageId,
          upgrade_vps_id: data.vpsId,
          status: orderStatus,
          expired_at: amount > 0 ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
        },
      });
      const log = await tx.vps_upgrade_logs.create({
        data: {
          vps_id: data.vpsId,
          order_id: order.id,
          upgrade_type: "PACKAGE",
          before_cores: current.cores,
          before_memory_gib: current.memoryGib,
          before_disk_gb: current.diskGb,
          before_monthly_price: current.monthlyPrice,
          after_cores: afterCores,
          after_memory_gib: afterMemGib,
          after_disk_gb: afterDiskGb,
          after_monthly_price: afterPrice,
          amount_charged: amount,
          days_remaining: daysRemaining,
          period_days: periodDays,
          new_subtotal: newSubtotal,
          old_credit: oldCredit,
        },
      });
      return { order, log };
    });

    auditService.record({
      actorId: data.requestedByUserId,
      actorRole: data.requestedByRole,
      action: "UPGRADE",
      entity: "VPS_UPGRADE",
      entityId: data.vpsId,
      targetUserId: vps.order.users_id,
      metadata: {
        upgrade_type: "PACKAGE",
        direction,
        amount,
        new_package_id: data.newPackageId,
        order_ref: result.order.ref_no,
      },
      ipAddress: data.ipAddress,
    });

    if (amount === 0) {
      upgradeService.applyUpgrade(result.order.id); // fire-and-forget
    }

    return {
      data: {
        order: result.order,
        auto_approved: amount === 0,
        direction,
        before: { cores: current.cores, memory_gib: current.memoryGib, disk_gb: current.diskGb, monthly_price: current.monthlyPrice },
        after: { cores: afterCores, memory_gib: afterMemGib, disk_gb: afterDiskGb, monthly_price: afterPrice },
        amount_charged: amount,
        billing: {
          days_remaining: daysRemaining,
          period_days: periodDays,
          new_subtotal: newSubtotal,
          old_credit: oldCredit,
          amount_charged: amount,
        },
      },
    };
  },

  // MODE B: Custom resource change — user specifies new core/ram/disk values.
  async createCustomUpgrade(data: {
    vpsId: number;
    newCores?: number;
    newMemoryGib?: number;
    newDiskGb?: number;
    requestedByUserId: number;
    requestedByRole: string;
    ipAddress?: string;
  }) {
    const vps = await prisma.vps.findUnique({
      where: { id: data.vpsId },
      include: { order: { include: { package: { include: { vm: true, os: true } } } } },
    });
    if (!vps || vps.deleted_at) return { error: "VPS_NOT_FOUND" as const };
    if (data.requestedByRole === "users" && vps.order.users_id !== data.requestedByUserId)
      return { error: "FORBIDDEN" as const };

    const pending = await prisma.orders.findFirst({
      where: { upgrade_vps_id: data.vpsId, status: "PENDING" },
    });
    if (pending) return { error: "UPGRADE_PENDING" as const };

    // Read unit prices from system_configs
    const [cpuPriceStr, ramPriceStr, diskPriceStr] = await Promise.all([
      systemConfigService.get("pricing.cpu_per_core"),
      systemConfigService.get("pricing.ram_per_gib"),
      systemConfigService.get("pricing.disk_per_gb"),
    ]);
    if (!cpuPriceStr || !ramPriceStr || !diskPriceStr)
      return { error: "CONFIG_MISSING" as const };

    const cpuUnitPrice = parseFloat(cpuPriceStr);
    const ramUnitPrice = parseFloat(ramPriceStr);
    const diskUnitPrice = parseFloat(diskPriceStr);

    const current = await getEffectiveSpecs(vps);
    const afterCores = data.newCores ?? current.cores;
    const afterMemGib = data.newMemoryGib ?? current.memoryGib;
    const afterDiskGb = data.newDiskGb ?? current.diskGb;

    if (afterCores === current.cores && afterMemGib === current.memoryGib && afterDiskGb === current.diskGb)
      return { error: "NO_CHANGE" as const };
    if (afterDiskGb < current.diskGb) return { error: "DISK_SHRINK_NOT_ALLOWED" as const };

    const daysRemaining = Math.max(0, Math.ceil((vps.expired_at.getTime() - Date.now()) / DAY_MS));
    const cpuCharge = Math.max(0, (afterCores - current.cores)) * cpuUnitPrice * (daysRemaining / 30);
    const ramCharge = Math.max(0, (afterMemGib - current.memoryGib)) * ramUnitPrice * (daysRemaining / 30);
    const diskCharge = (afterDiskGb - current.diskGb) * diskUnitPrice * (daysRemaining / 30);
    const amount = Math.ceil(cpuCharge + ramCharge + diskCharge);
    const customPeriodDays = 30;

    const deltaCores = afterCores - current.cores;
    const deltaMemGib = afterMemGib - current.memoryGib;
    const deltaDiskGb = afterDiskGb - current.diskGb;
    const afterPrice = current.monthlyPrice +
      deltaCores * cpuUnitPrice +
      deltaMemGib * ramUnitPrice +
      deltaDiskGb * diskUnitPrice;
    const customNewSubtotal = Math.round((afterPrice * daysRemaining / customPeriodDays) * 100) / 100;
    const customOldCredit = Math.round((current.monthlyPrice * daysRemaining / customPeriodDays) * 100) / 100;

    const orderStatus = amount === 0 ? "PAID" : "PENDING";

    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.orders.create({
        data: {
          ref_no: generateRefNo(),
          amount,
          users_id: vps.order.users_id,
          packages_id: current.packageId,
          upgrade_vps_id: data.vpsId,
          status: orderStatus,
          expired_at: amount > 0 ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
        },
      });
      const log = await tx.vps_upgrade_logs.create({
        data: {
          vps_id: data.vpsId,
          order_id: order.id,
          upgrade_type: "CUSTOM",
          before_cores: current.cores,
          before_memory_gib: current.memoryGib,
          before_disk_gb: current.diskGb,
          before_monthly_price: current.monthlyPrice,
          after_cores: afterCores,
          after_memory_gib: afterMemGib,
          after_disk_gb: afterDiskGb,
          after_monthly_price: Math.round(afterPrice * 100) / 100,
          amount_charged: amount,
          days_remaining: daysRemaining,
          period_days: customPeriodDays,
          new_subtotal: customNewSubtotal,
          old_credit: customOldCredit,
        },
      });
      return { order, log };
    });

    auditService.record({
      actorId: data.requestedByUserId,
      actorRole: data.requestedByRole,
      action: "UPGRADE",
      entity: "VPS_UPGRADE",
      entityId: data.vpsId,
      targetUserId: vps.order.users_id,
      metadata: {
        upgrade_type: "CUSTOM",
        amount,
        after_cores: afterCores,
        after_memory_gib: afterMemGib,
        after_disk_gb: afterDiskGb,
        order_ref: result.order.ref_no,
      },
      ipAddress: data.ipAddress,
    });

    if (amount === 0) {
      upgradeService.applyUpgrade(result.order.id); // fire-and-forget
    }

    return {
      data: {
        order: result.order,
        auto_approved: amount === 0,
        before: { cores: current.cores, memory_gib: current.memoryGib, disk_gb: current.diskGb, monthly_price: current.monthlyPrice },
        after: { cores: afterCores, memory_gib: afterMemGib, disk_gb: afterDiskGb, monthly_price: Math.round(afterPrice * 100) / 100 },
        amount_charged: amount,
        billing: {
          days_remaining: daysRemaining,
          period_days: customPeriodDays,
          new_subtotal: customNewSubtotal,
          old_credit: customOldCredit,
          amount_charged: amount,
        },
      },
    };
  },

  // Apply upgrade: called fire-and-forget after order is PAID (via transaction.service or auto-approve).
  async applyUpgrade(orderId: number): Promise<void> {
    const lockKey = `upgrade_lock:${orderId}`;
    const locked = await redis.set(lockKey, "1", "EX", 600, "NX");
    if (!locked) {
      logger.vps("upgrade_skip", { orderId, reason: "already_in_progress" });
      return;
    }
    try {
      const upgradeLog = await prisma.vps_upgrade_logs.findUnique({
        where: { order_id: orderId },
        include: { vps: true },
      });
      if (!upgradeLog) {
        logger.error("upgrade_apply_failed", { orderId, reason: "no upgrade log found" });
        return;
      }
      if (upgradeLog.applied_at) {
        logger.vps("upgrade_skip", { orderId, reason: "already applied" });
        return;
      }

      const { vps, after_cores, after_memory_gib, after_disk_gb, after_monthly_price,
              before_cores, before_memory_gib, before_disk_gb } = upgradeLog;
      const vmid = vps.vmid;

      const coresChanged = after_cores !== before_cores || after_memory_gib !== before_memory_gib;
      const diskChanged = after_disk_gb !== before_disk_gb;

      try {
        if (coresChanged) {
          // Stop VM first so new CPU/RAM config takes effect on next boot
          const stopUpid = await proxmoxService.stopVm(vmid);
          await proxmoxService.pollTask(stopUpid, 120);
          await proxmoxService.updateVmResources(vmid, after_cores, after_memory_gib * 1024);
        }
        if (diskChanged) {
          await proxmoxService.resizeDisk(vmid, after_disk_gb);
        }
        if (coresChanged) {
          const startUpid = await proxmoxService.startVm(vmid);
          await proxmoxService.pollTask(startUpid, 120);
        }
      } catch (e: any) {
        logger.error("upgrade_apply_proxmox_failed", { orderId, vmid, error: e.message });
        await prisma.vps_upgrade_logs.update({
          where: { order_id: orderId },
          data: { failed_at: new Date(), fail_reason: e.message },
        });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.vps.update({
          where: { id: vps.id },
          data: {
            current_cores: after_cores,
            current_memory_gib: after_memory_gib,
            current_disk_gb: after_disk_gb,
            monthly_price: after_monthly_price,
          },
        });
        await tx.vps_upgrade_logs.update({
          where: { order_id: orderId },
          data: { applied_at: new Date() },
        });
      });

      logger.vps("upgrade_applied", { orderId, vmid, after_cores, after_memory_gib, after_disk_gb });
    } catch (error: any) {
      logger.error("upgrade_apply_exception", { orderId, error: error.message });
    } finally {
      await redis.del(lockKey);
    }
  },

  // Get upgrade history for a VPS, paginated.
  async getUpgradeHistory(vpsId: number, userId: number, role: string, page: number, limit: number) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "VPS_NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.vps_upgrade_logs.findMany({
        where: { vps_id: vpsId },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
        include: { order: { select: { ref_no: true, status: true } } },
      }),
      prisma.vps_upgrade_logs.count({ where: { vps_id: vpsId } }),
    ]);

    const formattedLogs = logs.map((log) => ({
      ...log,
      billing: log.days_remaining != null && log.period_days != null
        ? {
            days_remaining: log.days_remaining,
            period_days: log.period_days,
            new_subtotal: log.new_subtotal,
            old_credit: log.old_credit,
            amount_charged: log.amount_charged,
          }
        : null,
    }));

    return { data: { logs: formattedLogs, total, page, limit } };
  },
};
