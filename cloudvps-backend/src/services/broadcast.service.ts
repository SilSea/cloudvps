import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { emailService } from "./email.service";

const DAY_MS = 24 * 60 * 60 * 1000;

async function resolveTargetEmails(target: string): Promise<string[]> {
  if (target === "ALL") {
    const users = await prisma.users.findMany({
      where: { status: true, is_verify: true },
      select: { email: true },
    });
    return users.map((u) => u.email);
  }

  if (target === "ACTIVE_VPS") {
    const vpsList = await prisma.vps.findMany({
      where: { status: true, deleted_at: null },
      include: { order: { include: { user: { select: { email: true } } } } },
    });
    return [...new Set(vpsList.map((v) => v.order.user.email))];
  }

  if (target === "EXPIRING_SOON") {
    const now = new Date();
    const in14Days = new Date(Date.now() + 14 * DAY_MS);
    const vpsList = await prisma.vps.findMany({
      where: { deleted_at: null, expired_at: { gte: now, lte: in14Days } },
      include: { order: { include: { user: { select: { email: true } } } } },
    });
    return [...new Set(vpsList.map((v) => v.order.user.email))];
  }

  return [];
}

export const broadcastService = {
  async send(data: {
    subject: string;
    body: string;
    type: string;
    target: string;
    actorId: number;
  }): Promise<{ broadcastId: number; sentCount: number; failedCount: number }> {
    const emails = await resolveTargetEmails(data.target);

    const results = await Promise.allSettled(
      emails.map((email) =>
        emailService.sendBroadcast(
          email,
          data.subject,
          data.body,
          data.type as "MAINTENANCE" | "EMERGENCY" | "ANNOUNCEMENT"
        )
      )
    );

    const sentCount = results.filter((r) => r.status === "fulfilled").length;
    const failedCount = results.filter((r) => r.status === "rejected").length;

    const record = await prisma.email_broadcasts.create({
      data: {
        subject:      data.subject,
        body:         data.body,
        type:         data.type as any,
        target:       data.target as any,
        sent_by:      data.actorId,
        sent_count:   sentCount,
        failed_count: failedCount,
      },
    });

    logger.admin("broadcast_sent", {
      broadcastId: record.id,
      type:        data.type,
      target:      data.target,
      sentCount,
      failedCount,
      actorId:     data.actorId,
    });

    return { broadcastId: record.id, sentCount, failedCount };
  },

  async list(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [broadcasts, total] = await Promise.all([
      prisma.email_broadcasts.findMany({
        skip,
        take: limit,
        include: { sender: { select: { id: true, email: true } } },
        orderBy: { created_at: "desc" },
      }),
      prisma.email_broadcasts.count(),
    ]);
    return { data: { broadcasts, total, page, limit } };
  },

  async getById(id: number) {
    return prisma.email_broadcasts.findUnique({
      where: { id },
      include: { sender: { select: { id: true, email: true } } },
    });
  },
};
