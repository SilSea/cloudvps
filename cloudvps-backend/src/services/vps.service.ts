import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { proxmoxService, parseMemoryMiB } from "./proxmox.service";
import { ipService } from "./ip.service";
import { natService } from "./nat.service";
import { systemConfigService } from "./system-config.service";
import { emailService } from "./email.service";
import { parseGib, parseDiskGb } from "../utils/specs";
import { auditService } from "./audit.service";

function generateVpsPassword(): string {
  // Alphanumeric only — safe for cloud-init and chpasswd stdin input
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

function generateOtp(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
}

async function hashOtp(otp: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(otp));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

const OTP_TTL = 300;        // 5 minutes
const OTP_MAX_TRIES = 5;
const otpKey  = (u: number, v: number) => `vps_pwd_otp:${u}:${v}`;
const triesKey = (u: number, v: number) => `vps_pwd_otp_tries:${u}:${v}`;

async function getProvisionConfig() {
  const [gwPub, gwPriv, subnet, defaultUserLinux, defaultUserWindows, bridgePub, bridgePriv] = await Promise.all([
    systemConfigService.get("proxmox.gateway_public"),
    systemConfigService.get("proxmox.gateway_private"),
    systemConfigService.get("proxmox.subnet"),
    systemConfigService.get("proxmox.default_user.linux"),
    systemConfigService.get("proxmox.default_user.windows"),
    systemConfigService.get("proxmox.bridge.public"),
    systemConfigService.get("proxmox.bridge.private"),
  ]);
  return {
    gatewayPublic: gwPub || env.proxmox.gatewayPublic,
    gatewayPrivate: gwPriv || env.proxmox.gatewayPrivate,
    subnet: subnet || env.proxmox.subnet,
    defaultUserLinux: defaultUserLinux || "root",
    defaultUserWindows: defaultUserWindows || "Administrator",
    bridgePublic: bridgePub || env.proxmox.bridgePublic,
    bridgePrivate: bridgePriv || env.proxmox.bridgePrivate,
  };
}

function resolveDefaultUser(osName: string, cfg: { defaultUserLinux: string; defaultUserWindows: string }): string {
  return /windows/i.test(osName) ? cfg.defaultUserWindows : cfg.defaultUserLinux;
}

function resolveOsType(osName: string): "linux" | "windows" {
  return /windows/i.test(osName) ? "windows" : "linux";
}

export const vpsService = {
  // Orchestrates: temp_vps → allocate IP → clone → configure → start → create vps record.
  // Fire-and-forget: called without await from transaction.service after order → PAID.
  async provision(orderId: number): Promise<void> {
    try {
      const tempVps = await prisma.temp_vps.findUnique({
        where: { order_id: orderId },
        include: {
          order: { include: { package: { include: { os: true, vm: true } } } },
        },
      });

      if (!tempVps) {
        logger.vps("provision_skip", { orderId, reason: "no temp_vps" });
        return;
      }

      const alreadyDone = await prisma.vps.findUnique({ where: { orders_id: orderId } });
      if (alreadyDone) {
        logger.vps("provision_skip", { orderId, reason: "already provisioned" });
        return;
      }

      // Prevent concurrent provision for the same order (auto-provision + manual retry race).
      const lockKey = `provision_lock:${orderId}`;
      const locked = await redis.set(lockKey, "1", "EX", 600, "NX");
      if (!locked) {
        logger.vps("provision_skipped", { orderId, reason: "already_in_progress" });
        return;
      }

      try {
        const { os, vm, period, price, port_count } = tempVps.order.package;
        const newVmid = 10000 + tempVps.id;
        const vmName = `qc-${orderId}`;

        const isNatPackage = (port_count ?? 0) > 0;
        const ipAlloc = await ipService.allocate(isNatPackage ? "PRIVATE" : "PUBLIC");
        if (!ipAlloc) {
          logger.error("provision_failed", { orderId, reason: "no available IPs in pool" });
          logger.vps("provision_failed", { orderId, reason: "no_ip" });
          return;
        }

        logger.vps("provision_start", { orderId, templateVmid: os.vmid, newVmid, ip: ipAlloc.ip });

        // Step 1: Clone template
        let cloneUpid: string;
        try {
          cloneUpid = await proxmoxService.cloneVm(os.vmid, newVmid, vmName);
        } catch (e: any) {
          logger.error("provision_failed", { orderId, step: "clone", error: e.message });
          await ipService.release(ipAlloc.assignmentId);
          return;
        }

        const cloneResult = await proxmoxService.pollTask(cloneUpid);
        if (!cloneResult.ok) {
          logger.error("provision_failed", { orderId, step: "clone_poll", error: cloneResult.error });
          await ipService.release(ipAlloc.assignmentId);
          return;
        }

        // Step 2: Configure VM (cloud-init: CPU, RAM, network, user, password)
        const proxCfg = await getProvisionConfig();
        const isPublic = ipAlloc.type === "PUBLIC";
        const gateway = isPublic ? proxCfg.gatewayPublic : proxCfg.gatewayPrivate;
        const bridge = isPublic ? proxCfg.bridgePublic : proxCfg.bridgePrivate;
        const vpsPassword = generateVpsPassword();
        const targetDiskGb = parseDiskGb(vm.size);
        const defaultUser = resolveDefaultUser(os.os_name, proxCfg);
        try {
          await proxmoxService.configureVm(newVmid, {
            cores: vm.core,
            memoryMiB: parseMemoryMiB(vm.memory),
            ipconfig0: `ip=${ipAlloc.ip}/${proxCfg.subnet},gw=${gateway}`,
            ciuser: defaultUser,
            cipassword: vpsPassword,
            bridge,
          });
        } catch (e: any) {
          logger.error("provision_failed", { orderId, step: "configure", error: e.message });
          await ipService.release(ipAlloc.assignmentId);
          try { await proxmoxService.deleteVm(newVmid); } catch {}
          return;
        }

        // Step 2b: Resize disk to package-defined size (clone inherits template size, not package size)
        try {
          await proxmoxService.resizeDisk(newVmid, targetDiskGb);
        } catch (e: any) {
          logger.error("provision_failed", { orderId, step: "resize_disk", error: e.message });
          await ipService.release(ipAlloc.assignmentId);
          try { await proxmoxService.deleteVm(newVmid); } catch {}
          return;
        }

        // Step 3: Start VM
        let started = false;
        try {
          const startUpid = await proxmoxService.startVm(newVmid);
          const startResult = await proxmoxService.pollTask(startUpid, 120);
          started = startResult.ok;
          if (!startResult.ok) {
            logger.error("provision_start_failed", { orderId, error: startResult.error });
          }
        } catch (e: any) {
          logger.error("provision_start_failed", { orderId, error: e.message });
        }

        // Step 4: Persist vps record and remove temp_vps atomically
        const expiredAt = new Date();
        expiredAt.setDate(expiredAt.getDate() + period);

        try {
          await prisma.$transaction(async (t) => {
            await t.vps.create({
              data: {
                name: vmName,
                vmid: newVmid,
                ip_assignments_id: ipAlloc.assignmentId,
                orders_id: orderId,
                status: started,
                expired_at: expiredAt,
                current_cores: vm.core,
                current_memory_gib: parseGib(vm.memory),
                current_disk_gb: parseDiskGb(vm.size),
                monthly_price: price,
              },
            });
            await t.temp_vps.delete({ where: { order_id: orderId } });
          });
        } catch (e: any) {
          logger.error("provision_failed", { orderId, step: "persist_vps", error: e.message });
          try { await proxmoxService.stopVm(newVmid); } catch {}
          try { await proxmoxService.deleteVm(newVmid); } catch {}
          await ipService.release(ipAlloc.assignmentId);
          return;
        }

        // Fire-and-forget NAT block allocation for Private IP packages
        if (isNatPackage) {
          const vpsRecord = await prisma.vps.findUnique({ where: { orders_id: orderId }, select: { id: true } });
          if (vpsRecord) {
            natService.allocateBlock({
              vpsId: vpsRecord.id,
              portCount: port_count!,
              privateIp: ipAlloc.ip,
              osName: os.os_name,
            }).catch((e: any) => logger.error("nat_allocate_block_failed", { orderId, error: e.message }));
          }
        }

        logger.vps("provision_complete", { orderId, vmid: newVmid, ip: ipAlloc.ip, started });

        // Send credentials email — fire-and-forget; log failure but don't fail provision
        prisma.orders.findUnique({
          where: { id: orderId },
          include: { user: { select: { email: true } } },
        }).then((o) => {
          if (!o?.user?.email) return;
          return emailService.sendVpsProvisioned(o.user.email, vmName, ipAlloc.ip, defaultUser, vpsPassword);
        }).catch((e: any) => logger.error("provision_email_failed", { orderId, error: e.message }));
      } finally {
        await redis.del(lockKey);
      }
    } catch (error: any) {
      logger.error("provision_exception", { orderId, error: error.message });
      logger.vps("provision_exception", { orderId, error: error.message });
    }
  },

  async list(userId: number, role: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const where =
      role === "users"
        ? { order: { users_id: userId }, deleted_at: null }
        : { deleted_at: null };

    const [vpsList, total] = await Promise.all([
      prisma.vps.findMany({
        where,
        skip,
        take: limit,
        include: {
          ip_assignment: { include: { ip_pool: true } },
          order: {
            select: {
              ref_no: true,
              users_id: true,
              package: { select: { name: true, period: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.vps.count({ where }),
    ]);

    return { data: { vps: vpsList, total, page, limit } };
  },

  async getById(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: {
        ip_assignment: { include: { ip_pool: true } },
        order: {
          include: {
            package: { include: { os: true, vm: true } },
            user: { select: { id: true, email: true } },
          },
        },
      },
    });

    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    // VPS-L4: augment with live Proxmox status (null if Proxmox unreachable)
    const [liveStatus, natInfo] = await Promise.all([
      proxmoxService.getVmStatus(vps.vmid),
      natService.getInfo(vps.id),
    ]);

    // Passive sync — keep DB status aligned with actual Proxmox state
    if (liveStatus) {
      const liveRunning = liveStatus.status === "running";
      if (liveRunning !== vps.status) {
        prisma.vps.update({ where: { id: vps.id }, data: { status: liveRunning } }).catch(() => {});
        logger.vps("vps_status_synced", { vpsId: vps.id, dbStatus: vps.status, proxmoxStatus: liveRunning });
      }
    }

    return { data: { ...vps, live_status: liveStatus, nat: natInfo } };
  },

  // Returns all temp_vps entries — these are unprovisioned or failed provisioning attempts.
  async getQueue() {
    const queue = await prisma.temp_vps.findMany({
      include: {
        order: {
          include: {
            package: { include: { os: true, vm: true } },
            user: { select: { id: true, email: true } },
          },
        },
      },
      orderBy: { created_at: "asc" },
    });
    return { data: queue };
  },

  async start(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    try {
      const upid = await proxmoxService.startVm(vps.vmid);
      const result = await proxmoxService.pollTask(upid, 60);
      if (!result.ok) {
        logger.vps("vps_start_failed", { vpsId, vmid: vps.vmid, error: result.error });
        return { error: "PROXMOX_ERROR" as const, detail: result.error };
      }
      await prisma.vps.update({ where: { id: vpsId }, data: { status: true } });
      logger.vps("vps_started", { vpsId, vmid: vps.vmid, userId });
      return { data: { id: vpsId, vmid: vps.vmid, status: "running", ownerId: vps.order.users_id } };
    } catch (e: any) {
      return { error: "PROXMOX_ERROR" as const, detail: e.message };
    }
  },

  async stop(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    try {
      const upid = await proxmoxService.stopVm(vps.vmid);
      const result = await proxmoxService.pollTask(upid, 120);
      if (!result.ok) {
        logger.vps("vps_stop_failed", { vpsId, vmid: vps.vmid, error: result.error });
        return { error: "PROXMOX_ERROR" as const, detail: result.error };
      }
      await prisma.vps.update({ where: { id: vpsId }, data: { status: false } });
      logger.vps("vps_stopped", { vpsId, vmid: vps.vmid, userId });
      return { data: { id: vpsId, vmid: vps.vmid, status: "stopped", ownerId: vps.order.users_id } };
    } catch (e: any) {
      return { error: "PROXMOX_ERROR" as const, detail: e.message };
    }
  },

  async reboot(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    try {
      const upid = await proxmoxService.rebootVm(vps.vmid);
      const result = await proxmoxService.pollTask(upid, 60);
      if (!result.ok) {
        logger.vps("vps_reboot_failed", { vpsId, vmid: vps.vmid, error: result.error });
        return { error: "PROXMOX_ERROR" as const, detail: result.error };
      }
      logger.vps("vps_rebooted", { vpsId, vmid: vps.vmid, userId });
      return { data: { id: vpsId, vmid: vps.vmid, status: "running", ownerId: vps.order.users_id } };
    } catch (e: any) {
      return { error: "PROXMOX_ERROR" as const, detail: e.message };
    }
  },

  async reset(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    try {
      const upid = await proxmoxService.resetVm(vps.vmid);
      const result = await proxmoxService.pollTask(upid, 30);
      if (!result.ok) {
        logger.vps("vps_reset_failed", { vpsId, vmid: vps.vmid, error: result.error });
        return { error: "PROXMOX_ERROR" as const, detail: result.error };
      }
      logger.vps("vps_reset", { vpsId, vmid: vps.vmid, userId });
      return { data: { id: vpsId, vmid: vps.vmid, status: "running", ownerId: vps.order.users_id } };
    } catch (e: any) {
      return { error: "PROXMOX_ERROR" as const, detail: e.message };
    }
  },

  async getLiveStatus(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    const [live, diskUsage] = await Promise.all([
      proxmoxService.getVmStatus(vps.vmid),
      proxmoxService.getVmDiskUsage(vps.vmid),
    ]);
    if (!live) return { error: "PROXMOX_ERROR" as const, detail: "Could not reach Proxmox" };

    // Passive sync
    const liveRunning = live.status === "running";
    if (liveRunning !== vps.status) {
      prisma.vps.update({ where: { id: vps.id }, data: { status: liveRunning } }).catch(() => {});
      logger.vps("vps_status_synced", { vpsId, dbStatus: vps.status, proxmoxStatus: liveRunning });
    }

    return {
      data: {
        vpsId,
        vmid: vps.vmid,
        status: live.status,
        cpu_pct: Math.round(live.cpu * 100 * 100) / 100,
        mem_mb: Math.floor(live.mem / (1024 * 1024)),
        maxmem_mb: Math.floor(live.maxmem / (1024 * 1024)),
        uptime_sec: live.uptime,
        // disk_used_gb / disk_total_gb = null when guest agent not running or VM stopped
        disk_used_gb: diskUsage?.used_gb ?? null,
        disk_total_gb: diskUsage?.total_gb ?? null,
      },
    };
  },

  async requestPasswordChange(vpsId: number, userId: number, role: string) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { include: { user: { select: { email: true } } } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    const otp = generateOtp();
    const hash = await hashOtp(otp);
    await redis.set(otpKey(userId, vpsId), hash, "EX", OTP_TTL);
    await redis.del(triesKey(userId, vpsId));

    try {
      await emailService.sendVpsPasswordOtp(vps.order.user.email, vps.name, otp);
    } catch (e: any) {
      logger.error("vps_password_otp_email_failed", { vpsId, error: e.message });
      return { error: "EMAIL_FAILED" as const };
    }

    logger.vps("vps_password_otp_sent", { vpsId, userId });
    return { data: { message: "OTP sent" } };
  },

  async confirmPasswordChange(vpsId: number, userId: number, role: string, otp: string, newPassword: string) {
    // Password validation — only newline/null forbidden (chpasswd reads via stdin, colon splits only first occurrence)
    if (newPassword.length < 8 || newPassword.length > 64) return { error: "INVALID_PASSWORD" as const };
    if (/[\n\r\0]/.test(newPassword)) return { error: "INVALID_PASSWORD" as const };

    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { include: { user: { select: { email: true } }, package: { include: { os: { select: { os_name: true } } } } } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    // Check attempt count
    const tries = parseInt((await redis.get(triesKey(userId, vpsId))) ?? "0", 10);
    if (tries >= OTP_MAX_TRIES) return { error: "OTP_MAX_TRIES" as const };

    const storedHash = await redis.get(otpKey(userId, vpsId));
    if (!storedHash) return { error: "OTP_EXPIRED" as const };

    const inputHash = await hashOtp(otp);
    if (inputHash !== storedHash) {
      await redis.incr(triesKey(userId, vpsId));
      await redis.expire(triesKey(userId, vpsId), OTP_TTL);
      return { error: "OTP_INVALID" as const };
    }

    // OTP valid — resolve default user based on OS type
    const [defaultUserLinux, defaultUserWindows] = await Promise.all([
      systemConfigService.get("proxmox.default_user.linux"),
      systemConfigService.get("proxmox.default_user.windows"),
    ]);
    const osName = vps.order.package.os.os_name;
    const defaultUser = resolveDefaultUser(osName, {
      defaultUserLinux: defaultUserLinux || "root",
      defaultUserWindows: defaultUserWindows || "Administrator",
    });
    try {
      await proxmoxService.changeVmPassword(vps.vmid, defaultUser, newPassword, resolveOsType(osName));
    } catch (e: any) {
      logger.error("vps_password_change_failed", { vpsId, vmid: vps.vmid, error: e.message });
      return { error: "AGENT_ERROR" as const, detail: e.message };
    }

    // Clean up OTP
    await redis.del(otpKey(userId, vpsId));
    await redis.del(triesKey(userId, vpsId));

    // Audit log
    auditService.record({
      actorId: userId,
      actorRole: role,
      action: "UPDATE",
      entity: "VPS_TERMINAL",
      entityId: vpsId,
      targetUserId: vps.order.users_id,
      metadata: { action: "password_change" },
    });

    // Confirmation email — fire-and-forget
    emailService.sendVpsPasswordChanged(vps.order.user.email, vps.name)
      .catch((e: any) => logger.error("vps_password_changed_email_failed", { vpsId, error: e.message }));

    logger.vps("vps_password_changed", { vpsId, vmid: vps.vmid, userId });
    return { data: { message: "Password changed" } };
  },

  // Called by cron: stop VM, mark order EXPIRE, send email, set status=false.
  async expire(vpsId: number): Promise<void> {
    try {
      const vps = await prisma.vps.findUnique({
        where: { id: vpsId },
        include: { order: { include: { user: { select: { email: true } } } } },
      });
      if (!vps || vps.deleted_at) return;

      try {
        const upid = await proxmoxService.stopVm(vps.vmid);
        await proxmoxService.pollTask(upid, 120);
      } catch (e: any) {
        logger.vps("expire_stop_failed", { vpsId, vmid: vps.vmid, error: e.message });
      }

      await prisma.$transaction(async (t) => {
        await t.vps.update({ where: { id: vpsId }, data: { status: false } });
        await t.orders.update({ where: { id: vps.orders_id }, data: { status: "EXPIRE" } });
      });

      const graceUntil = new Date(vps.expired_at.getTime() + 7 * 24 * 60 * 60 * 1000);
      try {
        await emailService.sendExpired(vps.order.user.email, vps.name, graceUntil);
      } catch (e: any) {
        logger.vps("expire_email_failed", { vpsId, error: e.message });
      }

      logger.vps("vps_expired", { vpsId, vmid: vps.vmid });
    } catch (e: any) {
      logger.error("expire_exception", { vpsId, error: e.message });
      logger.vps("expire_exception", { vpsId, error: e.message });
    }
  },

  // Called by cron after 7-day grace: delete VM from Proxmox, release IP, soft-delete record.
  async deleteExpired(vpsId: number): Promise<void> {
    try {
      const vps = await prisma.vps.findUnique({ where: { id: vpsId } });
      if (!vps || vps.deleted_at) return;

      try {
        await proxmoxService.deleteVm(vps.vmid);
      } catch (e: any) {
        logger.vps("delete_expired_proxmox_failed", { vpsId, vmid: vps.vmid, error: e.message });
      }

      await natService.releaseAll(vpsId);
      await ipService.release(vps.ip_assignments_id);
      await prisma.vps.update({ where: { id: vpsId }, data: { deleted_at: new Date() } });
      logger.vps("vps_deleted_expired", { vpsId, vmid: vps.vmid });
    } catch (e: any) {
      logger.error("delete_expired_exception", { vpsId, error: e.message });
      logger.vps("delete_expired_exception", { vpsId, error: e.message });
    }
  },

  // Admin force-delete: stop+delete VM immediately, release IP, soft-delete record, notify user.
  async forceDelete(vpsId: number): Promise<{ error?: "NOT_FOUND"; data?: { ownerId: number; vmid: number } }> {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { include: { user: { select: { id: true, email: true } } } } },
    });

    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" };

    // Stop VM (best-effort — VM may already be stopped or unreachable)
    try {
      const upid = await proxmoxService.stopVm(vps.vmid);
      await proxmoxService.pollTask(upid, 60);
    } catch (e: any) {
      logger.vps("force_delete_stop_failed", { vpsId, vmid: vps.vmid, error: e.message });
    }

    // Delete VM from Proxmox (best-effort)
    try {
      await proxmoxService.deleteVm(vps.vmid);
    } catch (e: any) {
      logger.vps("force_delete_proxmox_failed", { vpsId, vmid: vps.vmid, error: e.message });
    }

    // Release NAT rules (best-effort — no MikroTik = no-op)
    await natService.releaseAll(vpsId);

    // Release IP (must succeed — throw lets controller return 500 and avoids IP leak)
    await ipService.release(vps.ip_assignments_id);

    // Soft-delete + mark order EXPIRE (atomic)
    await prisma.$transaction(async (t) => {
      await t.vps.update({ where: { id: vpsId }, data: { deleted_at: new Date(), status: false } });
      if (vps.order.status !== "EXPIRE") {
        await t.orders.update({ where: { id: vps.orders_id }, data: { status: "EXPIRE" } });
      }
    });

    // Notify user (best-effort)
    try {
      await emailService.sendForceDeleted(vps.order.user.email, vps.name);
    } catch (e: any) {
      logger.vps("force_delete_email_failed", { vpsId, error: e.message });
    }

    logger.vps("vps_force_deleted", { vpsId, vmid: vps.vmid });
    return { data: { ownerId: vps.order.user.id, vmid: vps.vmid } };
  },

  // F2: set auto_renew flag and optionally lock a promo code for cron-created renewal orders.
  async toggleAutoRenew(
    vpsId: number,
    userId: number,
    role: string,
    autoRenew: boolean,
    lockedPromoId?: number | null,
  ) {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" as const };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" as const };

    if (lockedPromoId != null) {
      const promo = await prisma.promotions.findUnique({ where: { id: lockedPromoId } });
      if (!promo || !promo.status) return { error: "INVALID_PROMO" as const };
    }

    const updated = await prisma.vps.update({
      where: { id: vpsId },
      data: { auto_renew: autoRenew, locked_promo_id: lockedPromoId ?? null },
    });
    logger.vps("vps_auto_renew_toggled", { vpsId, autoRenew, lockedPromoId });
    return { data: updated };
  },

  // Called fire-and-forget after renewal order paid: extend expired_at, restart if was EXPIRE.
  async renew(vpsId: number, periodDays: number): Promise<void> {
    try {
      const vps = await prisma.vps.findUnique({
        where: { id: vpsId },
        include: { order: { select: { status: true } } },
      });
      if (!vps || vps.deleted_at) {
        logger.vps("renew_skip", { vpsId, reason: "not_found_or_deleted" });
        return;
      }

      const base = vps.expired_at > new Date() ? vps.expired_at : new Date();
      const newExpiredAt = new Date(base.getTime() + periodDays * 24 * 60 * 60 * 1000);
      await prisma.vps.update({ where: { id: vpsId }, data: { expired_at: newExpiredAt } });

      if (vps.order.status === "EXPIRE") {
        // Check live Proxmox state — DB status may be stale if VM was manually started/stopped in Proxmox
        const live = await proxmoxService.getVmStatus(vps.vmid).catch(() => null);
        const isActuallyRunning = live?.status === "running";

        if (!isActuallyRunning) {
          try {
            const upid = await proxmoxService.startVm(vps.vmid);
            const result = await proxmoxService.pollTask(upid, 120);
            if (result.ok) {
              await prisma.vps.update({ where: { id: vpsId }, data: { status: true } });
            } else {
              logger.vps("renew_restart_failed", { vpsId, vmid: vps.vmid, error: result.error });
            }
          } catch (e: any) {
            logger.vps("renew_restart_failed", { vpsId, vmid: vps.vmid, error: e.message });
          }
        } else if (!vps.status) {
          // VM already running (manually started in Proxmox) — sync DB
          await prisma.vps.update({ where: { id: vpsId }, data: { status: true } }).catch(() => {});
          logger.vps("vps_status_synced", { vpsId, dbStatus: false, proxmoxStatus: true });
        }
      }

      logger.vps("vps_renewed", { vpsId, vmid: vps.vmid, periodDays, newExpiredAt });
    } catch (e: any) {
      logger.error("renew_exception", { vpsId, error: e.message });
      logger.vps("renew_exception", { vpsId, error: e.message });
    }
  },
};
