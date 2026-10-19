import { prisma } from "../config/database";
import { capacityService } from "./capacity.service";

// ref_no format: QC-YYYYMMDD-XXXXXX (6 random uppercase alphanumeric chars)
const generateRefNo = (): string => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `QC-${date}-${rand}`;
};

export const orderService = {
  async create(data: { userId: number; userRole: string; packageId: number; promoCode?: string; renewalVpsId?: number; force?: boolean }) {
    // 1. Validate package exists and is active
    const pkg = await prisma.packages.findUnique({
      where: { id: data.packageId },
      include: { os: true, vm: true },
    });
    if (!pkg) return { error: "PACKAGE_NOT_FOUND" as const };
    if (!pkg.status) return { error: "PACKAGE_INACTIVE" as const };

    // 2. Capacity check — skip for renewals (existing VM, no new provisioning needed)
    if (!data.renewalVpsId) {
      const capResult = await capacityService.check(
        data.packageId,
        data.force ?? false,
        data.userId,
        data.userRole
      );
      if (capResult.error) return { error: capResult.error, detail: capResult.detail };
    }

    let finalAmount = pkg.price;
    let promotionId: number | null = null;

    // 2. Validate and apply promo code if provided
    let promoRecord: { id: number; max_uses: number | null; max_uses_per_user: number | null; used_count: number } | null = null;
    if (data.promoCode) {
      const promo = await prisma.promotions.findUnique({ where: { code_name: data.promoCode } });
      if (!promo || !promo.status) return { error: "INVALID_PROMO" as const };
      if (promo.expired_at && promo.expired_at < new Date()) return { error: "PROMO_EXPIRED" as const };

      // F1: global usage cap
      if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
        return { error: "PROMO_LIMIT_REACHED" as const };
      }

      // F1: per-user cap
      if (promo.max_uses_per_user !== null) {
        const userUsage = await prisma.promo_usages.count({
          where: { promotion_id: promo.id, user_id: data.userId },
        });
        if (userUsage >= promo.max_uses_per_user) {
          return { error: "PROMO_USER_LIMIT_REACHED" as const };
        }
      }

      if (promo.type === "DISCOUNT") {
        finalAmount = Math.max(0, pkg.price - promo.discount);
      } else {
        // PERCENT: deduct percentage of the original price
        finalAmount = Math.max(0, pkg.price * (1 - promo.discount / 100));
      }
      promotionId = promo.id;
      promoRecord = promo;
    }

    // RNW-DUP-1: block creating a second PENDING renewal order for the same VPS
    if (data.renewalVpsId) {
      const existingRenewal = await prisma.orders.findFirst({
        where: { renewal_vps_id: data.renewalVpsId, status: "PENDING" },
      });
      if (existingRenewal) return { error: "RENEWAL_PENDING" as const };
    }

    // 3. Create order + promo_usage + increment used_count atomically.
    // Re-check promo caps inside the transaction to guard against concurrent order creation
    // racing past the outer checks above (TOCTOU). The outer checks remain for fast early-return.
    let order: any;
    try {
      order = await prisma.$transaction(async (tx) => {
        if (promoRecord) {
          // Re-count usages inside transaction to guard concurrent order creation (TOCTOU).
          // Use promo_usages.count (tx-scoped) rather than re-fetching the promo row so that
          // the count reflects any inserts made by concurrent transactions in this session.
          if (promoRecord.max_uses !== null) {
            const totalUsages = await tx.promo_usages.count({
              where: { promotion_id: promoRecord.id },
            });
            if (totalUsages >= promoRecord.max_uses) {
              throw Object.assign(new Error("PROMO_LIMIT_REACHED"), { code: "PROMO_LIMIT_REACHED" });
            }
          }
          if (promoRecord.max_uses_per_user !== null) {
            const userUsage = await tx.promo_usages.count({
              where: { promotion_id: promoRecord.id, user_id: data.userId },
            });
            if (userUsage >= promoRecord.max_uses_per_user) {
              throw Object.assign(new Error("PROMO_USER_LIMIT_REACHED"), { code: "PROMO_USER_LIMIT_REACHED" });
            }
          }
        }

        const created = await tx.orders.create({
          data: {
            ref_no: generateRefNo(),
            amount: Math.round(finalAmount),
            users_id: data.userId,
            packages_id: data.packageId,
            promotions_id: promotionId,
            renewal_vps_id: data.renewalVpsId ?? null,
            status: "PENDING",
            expired_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
          include: {
            package: { include: { os: true, vm: true } },
            promotion: { select: { code_name: true, type: true, discount: true } },
          },
        });

        if (promoRecord) {
          await tx.promo_usages.create({
            data: { promotion_id: promoRecord.id, user_id: data.userId, order_id: created.id },
          });
          await tx.promotions.update({
            where: { id: promoRecord.id },
            data: { used_count: { increment: 1 } },
          });
        }

        return created;
      });
    } catch (e: any) {
      if (e.code === "PROMO_LIMIT_REACHED") return { error: "PROMO_LIMIT_REACHED" as const };
      if (e.code === "PROMO_USER_LIMIT_REACHED") return { error: "PROMO_USER_LIMIT_REACHED" as const };
      throw e;
    }

    return { data: order };
  },

  async list(params: { userId: number; role: string; page: number; limit: number }) {
    const { userId, role, page, limit } = params;
    const skip = (page - 1) * limit;
    // USER sees only own orders; ADMIN/SUPPORT see all
    const where = role === "users" ? { users_id: userId } : {};

    const [orders, total] = await Promise.all([
      prisma.orders.findMany({
        where,
        skip,
        take: limit,
        include: {
          package: { select: { name: true, price: true, period: true } },
          promotion: { select: { code_name: true, type: true, discount: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.orders.count({ where }),
    ]);

    return { data: { orders, total, page, limit } };
  },

  async getById(orderId: number, userId: number, role: string) {
    const order = await prisma.orders.findUnique({
      where: { id: orderId },
      include: {
        package: { include: { os: true, vm: true } },
        promotion: true,
        transactions: { orderBy: { created_at: "desc" } },
      },
    });

    if (!order) return { error: "NOT_FOUND" as const };
    // USER can only view their own order
    if (role === "users" && order.users_id !== userId) return { error: "FORBIDDEN" as const };

    return { data: order };
  },

  async cancel(orderId: number, userId: number, role: string) {
    const order = await prisma.orders.findUnique({ where: { id: orderId } });
    if (!order) return { error: "NOT_FOUND" as const };
    if (role === "users" && order.users_id !== userId) return { error: "FORBIDDEN" as const };
    // Upgrade orders that are already PAID have been applied to the VPS — cannot reverse
    if (order.upgrade_vps_id != null && order.status === "PAID") return { error: "CANNOT_CANCEL_UPGRADE" as const };
    if (order.status === "PAID") return { error: "ALREADY_PAID" as const };
    if (order.status === "CANCEL") return { error: "ALREADY_CANCELLED" as const };
    if (order.status === "EXPIRE") return { error: "EXPIRED" as const };

    const updated = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.orders.update({
        where: { id: orderId },
        data: { status: "CANCEL" },
        include: { package: { select: { name: true } } },
      });

      // If cancelling a pending upgrade order, mark the upgrade log as cancelled too
      if (order.upgrade_vps_id != null && order.status === "PENDING") {
        await tx.vps_upgrade_logs.updateMany({
          where: { order_id: orderId, applied_at: null },
          data: { failed_at: new Date(), fail_reason: "Cancelled by user" },
        });
      }

      return cancelled;
    });

    return { data: updated };
  },
};
