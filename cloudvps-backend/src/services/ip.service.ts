import { prisma } from "../config/database";

export const ipService = {
  // Atomically find and reserve an available IP using SELECT FOR UPDATE SKIP LOCKED
  // to prevent two concurrent provisions from receiving the same IP address.
  // Pass type="PUBLIC"|"PRIVATE" to restrict allocation to that pool.
  async allocate(type?: "PUBLIC" | "PRIVATE"): Promise<{ assignmentId: number; ip: string; type: string } | null> {
    return prisma.$transaction(async (tx) => {
      const rows = type
        ? await tx.$queryRaw<Array<{ id: number; ip: string; type: string }>>`
            SELECT id, ip, type::text FROM ip_pools
            WHERE status = true
              AND type::text = ${type}
              AND id NOT IN (SELECT ip_id FROM ip_assignments WHERE status = true)
            ORDER BY id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `
        : await tx.$queryRaw<Array<{ id: number; ip: string; type: string }>>`
            SELECT id, ip, type::text FROM ip_pools
            WHERE status = true
              AND id NOT IN (SELECT ip_id FROM ip_assignments WHERE status = true)
            ORDER BY id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;
      if (!rows.length) return null;
      const pool = rows[0];
      const assignment = await tx.ip_assignments.create({
        data: { ip_id: pool.id, status: true },
      });
      return { assignmentId: assignment.id, ip: pool.ip, type: pool.type };
    });
  },

  async release(assignmentId: number): Promise<void> {
    await prisma.ip_assignments.update({
      where: { id: assignmentId },
      data: { status: false },
    });
  },
};
