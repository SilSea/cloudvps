import { prisma } from "../config/database";
import { systemConfigService } from "./system-config.service";
import { mikrotikService } from "./mikrotik.service";
import { logger } from "../utils/logger";

function defaultPrivatePort(osName: string): number {
  return osName.toLowerCase().includes("windows") ? 3389 : 22;
}

export const natService = {
  // Called after VPS provision for Private IP packages.
  // Allocates consecutive port block, creates system rule (SSH/RDP) in MikroTik.
  async allocateBlock(params: {
    vpsId: number;
    portCount: number;
    privateIp: string;
    osName: string;
  }): Promise<void> {
    const [publicIp, basePortStr] = await Promise.all([
      systemConfigService.get("mikrotik.nat_public_ip"),
      systemConfigService.get("mikrotik.nat_base_port"),
    ]);

    if (!publicIp) {
      logger.error("nat_allocate_failed", { vpsId: params.vpsId, reason: "mikrotik.nat_public_ip not configured" });
      return;
    }

    const basePort = parseInt(basePortStr ?? "20000", 10);

    // Wrap findFirst + create in a transaction so concurrent provisions for the same
    // public_ip cannot read the same port_end and create overlapping port blocks.
    const { allocation, portStart, portEnd } = await prisma.$transaction(async (tx) => {
      const lastAlloc = await tx.nat_allocations.findFirst({
        where: { public_ip: publicIp, is_active: true },
        orderBy: { port_end: "desc" },
        select: { port_end: true },
      });

      const pStart = lastAlloc ? lastAlloc.port_end + 1 : basePort;
      const pEnd = pStart + params.portCount - 1;

      const alloc = await tx.nat_allocations.create({
        data: { vps_id: params.vpsId, public_ip: publicIp, port_start: pStart, port_end: pEnd },
      });
      return { allocation: alloc, portStart: pStart, portEnd: pEnd };
    });

    // System rule — SSH (22) or RDP (3389)
    const privatePort = defaultPrivatePort(params.osName);
    const mikrotikIds: string[] = [];
    try {
      const id = await mikrotikService.createNatRule({
        publicIp,
        publicPort: portStart,
        privateIp: params.privateIp,
        privatePort,
        protocol: "tcp",
        comment: `qc-sys-${params.vpsId}`,
      });
      mikrotikIds.push(id);
    } catch (e: any) {
      logger.error("nat_system_rule_failed", { vpsId: params.vpsId, error: e.message });
    }

    await prisma.nat_port_rules.create({
      data: {
        allocation_id: allocation.id,
        public_port: portStart,
        private_port: privatePort,
        protocol: "TCP",
        is_system: true,
        mikrotik_ids: mikrotikIds,
      },
    });

    logger.vps("nat_allocated", { vpsId: params.vpsId, publicIp, portStart, portEnd });
  },

  async addRule(params: {
    vpsId: number;
    privateIp: string;
    privatePort: number;
    protocol: "TCP" | "UDP" | "BOTH";
  }): Promise<{ error?: "NAT_NOT_FOUND" | "PORT_LIMIT_REACHED"; data?: any }> {
    const allocation = await prisma.nat_allocations.findUnique({
      where: { vps_id: params.vpsId },
      include: {
        port_rules: { where: { is_active: true }, select: { public_port: true } },
      },
    });

    if (!allocation || !allocation.is_active) return { error: "NAT_NOT_FOUND" };

    const portCount = allocation.port_end - allocation.port_start + 1;
    if (allocation.port_rules.length >= portCount) return { error: "PORT_LIMIT_REACHED" };

    const usedPorts = new Set(allocation.port_rules.map((r) => r.public_port));
    let nextPort: number | undefined;
    for (let p = allocation.port_start; p <= allocation.port_end; p++) {
      if (!usedPorts.has(p)) { nextPort = p; break; }
    }
    if (!nextPort) return { error: "PORT_LIMIT_REACHED" };

    const protocols = params.protocol === "BOTH" ? ["tcp", "udp"] : [params.protocol.toLowerCase()];
    const mikrotikIds: string[] = [];

    for (const proto of protocols) {
      try {
        const id = await mikrotikService.createNatRule({
          publicIp: allocation.public_ip,
          publicPort: nextPort,
          privateIp: params.privateIp,
          privatePort: params.privatePort,
          protocol: proto as "tcp" | "udp",
          comment: `qc-${params.vpsId}-${nextPort}`,
        });
        mikrotikIds.push(id);
      } catch (e: any) {
        logger.error("nat_add_rule_mikrotik_failed", { vpsId: params.vpsId, error: e.message });
      }
    }

    const rule = await prisma.nat_port_rules.create({
      data: {
        allocation_id: allocation.id,
        public_port: nextPort,
        private_port: params.privatePort,
        protocol: params.protocol,
        is_system: false,
        mikrotik_ids: mikrotikIds,
      },
    });

    return { data: rule };
  },

  async deleteRule(params: {
    ruleId: number;
    vpsId: number;
    userId: number;
    role: string;
  }): Promise<{ error?: "NOT_FOUND" | "SYSTEM_RULE" | "FORBIDDEN" }> {
    const rule = await prisma.nat_port_rules.findUnique({
      where: { id: params.ruleId },
      include: {
        allocation: {
          select: { vps_id: true, vps: { select: { order: { select: { users_id: true } } } } },
        },
      },
    });

    if (!rule || !rule.is_active) return { error: "NOT_FOUND" };
    if (rule.allocation.vps_id !== params.vpsId) return { error: "NOT_FOUND" };
    if (rule.is_system && params.role !== "admin") return { error: "SYSTEM_RULE" };
    if (params.role === "users" && rule.allocation.vps.order.users_id !== params.userId) {
      return { error: "FORBIDDEN" };
    }

    const ids = Array.isArray(rule.mikrotik_ids) ? (rule.mikrotik_ids as string[]) : [];
    for (const id of ids) {
      try {
        await mikrotikService.deleteNatRule(id);
      } catch (e: any) {
        logger.error("nat_delete_mikrotik_failed", { ruleId: params.ruleId, error: e.message });
      }
    }

    await prisma.nat_port_rules.update({ where: { id: params.ruleId }, data: { is_active: false } });
    return {};
  },

  async releaseAll(vpsId: number): Promise<void> {
    const allocation = await prisma.nat_allocations.findUnique({
      where: { vps_id: vpsId },
      include: { port_rules: { where: { is_active: true } } },
    });

    if (!allocation || !allocation.is_active) return;

    for (const rule of allocation.port_rules) {
      const ids = Array.isArray(rule.mikrotik_ids) ? (rule.mikrotik_ids as string[]) : [];
      for (const id of ids) {
        try {
          await mikrotikService.deleteNatRule(id);
        } catch (e: any) {
          logger.error("nat_release_mikrotik_failed", { vpsId, ruleId: rule.id, error: e.message });
        }
      }
    }

    await prisma.$transaction([
      prisma.nat_port_rules.updateMany({ where: { allocation_id: allocation.id }, data: { is_active: false } }),
      prisma.nat_allocations.update({ where: { id: allocation.id }, data: { is_active: false } }),
    ]);

    logger.vps("nat_released", { vpsId });
  },

  async getInfo(vpsId: number) {
    const allocation = await prisma.nat_allocations.findUnique({
      where: { vps_id: vpsId },
      include: {
        port_rules: {
          where: { is_active: true },
          orderBy: { public_port: "asc" },
          select: { id: true, public_port: true, private_port: true, protocol: true, is_system: true },
        },
      },
    });

    if (!allocation || !allocation.is_active) return null;

    const portCount = allocation.port_end - allocation.port_start + 1;
    return {
      nat_allocation: {
        public_ip: allocation.public_ip,
        port_start: allocation.port_start,
        port_end: allocation.port_end,
        used_count: allocation.port_rules.length,
        available_count: portCount - allocation.port_rules.length,
      },
      port_rules: allocation.port_rules,
    };
  },
};
