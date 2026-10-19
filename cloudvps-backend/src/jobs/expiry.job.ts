import { schedule } from "node-cron";
import { prisma } from "../config/database";
import { vpsService } from "../services/vps.service";
import { orderService } from "../services/order.service";
import { emailService } from "../services/email.service";
import { logger } from "../utils/logger";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startExpiryJobs(): void {
  // notify_7d — email 7-day expiry warning (daily 02:00 Asia/Bangkok)
  // Staggered 5 min apart to avoid DB thundering herd (JOB-M1)
  schedule("0 2 * * *", async () => {
    const now = new Date();
    const from = new Date(now.getTime() + 6 * DAY_MS);
    const to = new Date(now.getTime() + 7 * DAY_MS);
    const vpsList = await prisma.vps.findMany({
      where: { expired_at: { gte: from, lte: to }, deleted_at: null },
      include: { order: { include: { user: { select: { email: true } } } } },
    });
    for (const vps of vpsList) {
      try {
        await emailService.sendExpiryWarning(vps.order.user.email, vps.name, 7);
      } catch (e: any) {
        logger.vps("notify_7d_failed", { vpsId: vps.id, error: e.message });
      }
    }
    logger.vps("cron_notify_7d", { count: vpsList.length });
  }, { timezone: "Asia/Bangkok" });

  // notify_1d — email 1-day expiry warning (daily 02:05 Asia/Bangkok)
  schedule("5 2 * * *", async () => {
    const now = new Date();
    const to = new Date(now.getTime() + DAY_MS);
    const vpsList = await prisma.vps.findMany({
      where: { expired_at: { gte: now, lte: to }, deleted_at: null },
      include: { order: { include: { user: { select: { email: true } } } } },
    });
    for (const vps of vpsList) {
      try {
        await emailService.sendExpiryWarning(vps.order.user.email, vps.name, 1);
      } catch (e: any) {
        logger.vps("notify_1d_failed", { vpsId: vps.id, error: e.message });
      }
    }
    logger.vps("cron_notify_1d", { count: vpsList.length });
  }, { timezone: "Asia/Bangkok" });

  // stop_expired — stop VPS that passed expired_at and are still running (daily 02:10 Asia/Bangkok)
  schedule("10 2 * * *", async () => {
    const now = new Date();
    const vpsList = await prisma.vps.findMany({
      where: {
        expired_at: { lte: now },
        deleted_at: null,
        status: true,
      },
      select: { id: true },
    });
    for (const vps of vpsList) {
      try {
        await vpsService.expire(vps.id);
      } catch (e: any) {
        logger.vps("cron_stop_expired_failed", { vpsId: vps.id, error: e.message });
      }
    }
    logger.vps("cron_stop_expired", { count: vpsList.length });
  }, { timezone: "Asia/Bangkok" });

  // delete_grace — delete VPS that are 7+ days past expired_at (daily 02:15 Asia/Bangkok)
  schedule("15 2 * * *", async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);
    const vpsList = await prisma.vps.findMany({
      where: {
        expired_at: { lte: sevenDaysAgo },
        deleted_at: null,
        order: { status: "EXPIRE" },
      },
      select: { id: true },
    });
    for (const vps of vpsList) {
      try {
        await vpsService.deleteExpired(vps.id);
      } catch (e: any) {
        logger.vps("cron_delete_grace_failed", { vpsId: vps.id, error: e.message });
      }
    }
    logger.vps("cron_delete_grace", { count: vpsList.length });
  }, { timezone: "Asia/Bangkok" });

  // auto_renew — create renewal orders for VPS with auto_renew=true expiring within 3 days (daily 02:20 Asia/Bangkok)
  // F4: passes locked_promo_id (if set and still active) as promoCode so the locked rate is preserved.
  schedule("20 2 * * *", async () => {
    const now = new Date();
    const threeDaysLater = new Date(now.getTime() + 3 * DAY_MS);
    const vpsList = await prisma.vps.findMany({
      where: {
        auto_renew: true,
        deleted_at: null,
        expired_at: { gte: now, lte: threeDaysLater },
      },
      include: {
        order: { select: { users_id: true, packages_id: true } },
        locked_promo: { select: { code_name: true, status: true } },
      },
    });

    let created = 0;
    for (const vps of vpsList) {
      try {
        const promoCode = vps.locked_promo?.status ? vps.locked_promo.code_name : undefined;
        const result = await orderService.create({
          userId: vps.order.users_id,
          userRole: "users",
          packageId: vps.order.packages_id,
          renewalVpsId: vps.id,
          promoCode,
        });
        if (result.error === "RENEWAL_PENDING") continue; // already has pending renewal — skip
        if (result.error) {
          logger.vps("cron_auto_renew_order_failed", { vpsId: vps.id, error: result.error });
          continue;
        }
        // Fetch user email for notification
        const user = await prisma.users.findUnique({
          where: { id: vps.order.users_id },
          select: { email: true },
        });
        if (user) {
          try {
            await emailService.sendAutoRenewalReminder(user.email, vps.name);
          } catch (e: any) {
            logger.vps("cron_auto_renew_email_failed", { vpsId: vps.id, error: e.message });
          }
        }
        created++;
      } catch (e: any) {
        logger.vps("cron_auto_renew_failed", { vpsId: vps.id, error: e.message });
      }
    }
    logger.vps("cron_auto_renew", { checked: vpsList.length, created });
  }, { timezone: "Asia/Bangkok" });

  logger.info("Expiry cron jobs started", { jobs: ["notify_7d", "notify_1d", "stop_expired", "delete_grace", "auto_renew"] });
}
