import { prisma } from "../config/database";

export const auditController = {
  async list({ query, set }: any) {
    const page = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.actor_id) {
      const id = parseInt(query.actor_id, 10);
      if (!isNaN(id)) where.actor_id = id;
    }
    if (query?.target_user_id) {
      const id = parseInt(query.target_user_id, 10);
      if (!isNaN(id)) where.target_user_id = id;
    }
    if (query?.entity) where.entity = query.entity;
    if (query?.action) where.action = query.action;
    if (query?.from || query?.to) {
      where.created_at = {};
      if (query?.from) {
        const d = new Date(query.from);
        if (isNaN(d.getTime())) {
          set.status = 400;
          return { success: false, message: "Invalid 'from' date format. Use YYYY-MM-DD." };
        }
        where.created_at.gte = d;
      }
      if (query?.to) {
        const d = new Date(query.to);
        if (isNaN(d.getTime())) {
          set.status = 400;
          return { success: false, message: "Invalid 'to' date format. Use YYYY-MM-DD." };
        }
        where.created_at.lte = d;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.admin_audit_logs.findMany({
        where,
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, email: true } },
          target_user: { select: { id: true, email: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.admin_audit_logs.count({ where }),
    ]);

    return { success: true, data: { logs, total, page, limit } };
  },
};
