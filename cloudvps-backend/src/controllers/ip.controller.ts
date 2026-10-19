import { prisma } from "../config/database";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

function ipToNum(ip: string): number {
  return ip.split(".").reduce((acc, oct) => acc * 256 + parseInt(oct, 10), 0);
}

function numToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export const ipController = {
  async list({ query }: any) {
    const page = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "50", 10)));
    const skip = (page - 1) * limit;

    const [pools, total] = await Promise.all([
      prisma.ip_pools.findMany({
        skip,
        take: limit,
        include: { ip_assignments: { where: { status: true }, select: { id: true } } },
        orderBy: { id: "asc" },
      }),
      prisma.ip_pools.count(),
    ]);

    return { success: true, data: { pools, total, page, limit } };
  },

  async create({ user, body, set, request }: any) {
    const pool = await prisma.ip_pools.create({
      data: { ip: body.ip, type: body.type, status: true },
    });

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "CREATE",
      entity: "IP_POOL",
      entityId: pool.id,
      metadata: { ip: body.ip, type: body.type },
      ipAddress: getIp(request),
    });

    set.status = 201;
    return { success: true, data: pool };
  },

  async update({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid IP pool ID." }; }

    const existing = await prisma.ip_pools.findUnique({ where: { id } });
    if (!existing) { set.status = 404; return { success: false, message: "IP pool not found." }; }

    if (body.ip && body.ip !== existing.ip) {
      const activeAssignment = await prisma.ip_assignments.findFirst({
        where: { ip_id: id, status: true },
      });
      if (activeAssignment) {
        set.status = 409;
        return { success: false, message: "IP is currently in use by an active VPS." };
      }
    }

    const updated = await prisma.ip_pools.update({
      where: { id },
      data: {
        ip: body.ip ?? existing.ip,
        type: body.type ?? existing.type,
      },
    });

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "UPDATE",
      entity: "IP_POOL",
      entityId: id,
      metadata: { before: { ip: existing.ip, type: existing.type }, after: { ip: updated.ip, type: updated.type } },
      ipAddress: getIp(request),
    });

    return { success: true, data: updated };
  },

  async createRange({ user, body, set, request }: any) {
    const startNum = ipToNum(body.ip_start);
    const endNum = ipToNum(body.ip_end);

    if (startNum > endNum) {
      set.status = 400;
      return { success: false, message: "ip_start must be less than or equal to ip_end." };
    }

    const rangeSize = endNum - startNum + 1;
    if (rangeSize > 256) {
      set.status = 400;
      return { success: false, message: "Range too large. Maximum 256 IPs per request." };
    }

    const ips: string[] = [];
    for (let i = startNum; i <= endNum; i++) ips.push(numToIp(i));

    const existing = await prisma.ip_pools.findMany({
      where: { ip: { in: ips } },
      select: { ip: true },
    });
    const existingSet = new Set(existing.map((e) => e.ip));
    const newIps = ips.filter((ip) => !existingSet.has(ip));

    if (newIps.length > 0) {
      await prisma.ip_pools.createMany({
        data: newIps.map((ip) => ({ ip, type: body.type, status: true })),
      });
    }

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "CREATE",
      entity: "IP_POOL",
      entityId: 0,
      metadata: {
        range: `${body.ip_start} - ${body.ip_end}`,
        type: body.type,
        added: newIps.length,
        skipped: existingSet.size,
      },
      ipAddress: getIp(request),
    });

    set.status = 201;
    return {
      success: true,
      data: { added: newIps.length, skipped: ips.length - newIps.length, ips: newIps },
    };
  },

  async toggleStatus({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid IP pool ID." }; }

    const existing = await prisma.ip_pools.findUnique({ where: { id } });
    if (!existing) { set.status = 404; return { success: false, message: "IP pool not found." }; }

    const newStatus = !existing.status;

    if (!newStatus) {
      const active = await prisma.ip_assignments.findFirst({ where: { ip_id: id, status: true } });
      if (active) {
        set.status = 409;
        return { success: false, message: "Cannot disable IP pool: IP is currently assigned to an active VPS." };
      }
    }

    const updated = await prisma.ip_pools.update({
      where: { id },
      data: { status: newStatus },
    });

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: newStatus ? "ENABLE" : "DISABLE",
      entity: "IP_POOL",
      entityId: id,
      metadata: { ip: existing.ip },
      ipAddress: getIp(request),
    });

    return { success: true, data: updated };
  },
};
