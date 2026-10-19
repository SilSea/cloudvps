import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { auditService } from "./audit.service";
import { truemoneyService } from "./payment/truemoney.service";
import { slipokService } from "./payment/slipok.service";
import { promptpayService } from "./payment/promptpay.service";
import { vpsService } from "./vps.service";
import { upgradeService } from "./upgrade.service";
import { systemConfigService } from "./system-config.service";

interface SubmitData {
  userId: number;
  orderId: number;
  paymentMethod: "TRUEMONEY" | "SLIP" | "PROMPTPAY";
  voucherCode?: string;    // required for TRUEMONEY
  slipFilePath?: string;   // FILE mode: path on disk for SlipOK verify
  slipUrl?: string;        // FILE mode: URL to store in transactions.slip_url
  slipBase64?: string;     // BASE64 mode: raw base64 string (verify + store directly)
}

// Shared logic: mark order as PAID. Skip temp_vps for renewal and upgrade orders.
const completePaidOrder = async (
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  orderId: number,
  isRenewal = false,
  isUpgrade = false
) => {
  await tx.orders.update({ where: { id: orderId }, data: { status: "PAID" } });
  if (!isRenewal && !isUpgrade) {
    await tx.temp_vps.create({ data: { order_id: orderId } });
  }
};

export const transactionService = {
  async submit(data: SubmitData) {
    // 1. Validate order ownership and state
    const order = await prisma.orders.findUnique({
      where: { id: data.orderId },
      include: { package: { select: { period: true } } },
    });
    if (!order) return { error: "ORDER_NOT_FOUND" as const };
    if (order.users_id !== data.userId) return { error: "FORBIDDEN" as const };
    if (order.status !== "PENDING") return { error: "ORDER_NOT_PENDING" as const };
    if (order.expired_at && order.expired_at < new Date()) return { error: "ORDER_EXPIRED" as const };

    // 2. Prevent double payment (SEC-6.4)
    const existingSuccess = await prisma.transactions.findFirst({
      where: { order_id: data.orderId, status: "SUCCESSFUL" },
    });
    if (existingSuccess) return { error: "ALREADY_PAID" as const };

    // TX-DUP-1: for PROMPTPAY, also block a second PENDING submission so users
    // cannot queue multiple manual-verify requests on the same order.
    if (data.paymentMethod === "PROMPTPAY") {
      const existingPending = await prisma.transactions.findFirst({
        where: { order_id: data.orderId, status: "PENDING" },
      });
      if (existingPending) return { error: "ALREADY_PAID" as const };
    }

    // ── TRUEMONEY ──────────────────────────────────────────────────────────
    if (data.paymentMethod === "TRUEMONEY") {
      if (!data.voucherCode) return { error: "VOUCHER_REQUIRED" as const };

      const result = await truemoneyService.redeem(data.voucherCode);
      if (!result.success) return { error: "PAYMENT_FAILED" as const, detail: result.error };

      // Validate redeemed amount covers the order total
      if (result.amount !== undefined && Math.round(result.amount) < order.amount) {
        return { error: "AMOUNT_MISMATCH" as const };
      }

      const txRecord = await prisma.$transaction(async (t) => {
        const created = await t.transactions.create({
          data: {
            provider_ref_id: result.ref_id ?? data.voucherCode!,
            amount: order.amount,
            payment_method: "TRUEMONEY",
            order_id: data.orderId,
            status: "SUCCESSFUL",
          },
        });
        await completePaidOrder(t, data.orderId, !!order.renewal_vps_id, !!order.upgrade_vps_id);
        return created;
      });

      logger.payment("truemoney_paid", { orderId: data.orderId, userId: data.userId, amount: order.amount });
      if (order.upgrade_vps_id) {
        upgradeService.applyUpgrade(data.orderId); // fire-and-forget
      } else if (order.renewal_vps_id) {
        vpsService.renew(order.renewal_vps_id, order.package.period); // fire-and-forget
      } else {
        vpsService.provision(data.orderId); // fire-and-forget
      }
      return { data: txRecord };
    }

    // ── SLIP ───────────────────────────────────────────────────────────────
    if (data.paymentMethod === "SLIP") {
      const slipMode = (await systemConfigService.get("payment.slip_mode")) ?? "FILE";

      let verifyResult: Awaited<ReturnType<typeof slipokService.verify>>;
      let storedSlipUrl: string | null;

      if (slipMode === "BASE64") {
        if (!data.slipBase64) return { error: "SLIP_REQUIRED" as const };
        verifyResult = await slipokService.verifyBase64(data.slipBase64, order.amount);
        storedSlipUrl = data.slipBase64;
      } else {
        if (!data.slipFilePath) return { error: "SLIP_REQUIRED" as const };
        verifyResult = await slipokService.verify(data.slipFilePath, order.amount);
        storedSlipUrl = data.slipUrl ?? null;
      }

      if (!verifyResult.success) {
        if (verifyResult.error === "AMOUNT_MISMATCH") return { error: "AMOUNT_MISMATCH" as const };
        if (verifyResult.error === "DUPLICATE_SLIP") return { error: "PAYMENT_FAILED" as const, detail: "Duplicate slip." };
        if (verifyResult.error === "WRONG_RECEIVER") return { error: "PAYMENT_FAILED" as const, detail: "Slip receiver does not match." };
        return { error: "PAYMENT_FAILED" as const, detail: verifyResult.error };
      }

      const txRecord = await prisma.$transaction(async (t) => {
        const created = await t.transactions.create({
          data: {
            provider_ref_id: verifyResult.ref_id ?? `SLIP-${Date.now()}`,
            amount: order.amount,
            payment_method: "SLIP",
            slip_url: storedSlipUrl,
            order_id: data.orderId,
            status: "SUCCESSFUL",
          },
        });
        await completePaidOrder(t, data.orderId, !!order.renewal_vps_id, !!order.upgrade_vps_id);
        return created;
      });

      logger.payment("slip_paid", { orderId: data.orderId, userId: data.userId, amount: order.amount });
      if (order.upgrade_vps_id) {
        upgradeService.applyUpgrade(data.orderId); // fire-and-forget
      } else if (order.renewal_vps_id) {
        vpsService.renew(order.renewal_vps_id, order.package.period); // fire-and-forget
      } else {
        vpsService.provision(data.orderId); // fire-and-forget
      }
      return { data: txRecord };
    }

    // ── PROMPTPAY ──────────────────────────────────────────────────────────
    if (data.paymentMethod === "PROMPTPAY") {
      // slip_url is optional for PROMPTPAY — user may attach a slip as proof for manual approval.
      const txRecord = await prisma.transactions.create({
        data: {
          provider_ref_id: promptpayService.generateRef(),
          amount: order.amount,
          payment_method: "PROMPTPAY",
          slip_url: data.slipUrl ?? data.slipBase64 ?? null,
          order_id: data.orderId,
          status: "PENDING",
        },
      });

      logger.payment("promptpay_submitted", { orderId: data.orderId, userId: data.userId });
      return { data: txRecord };
    }

    return { error: "INVALID_METHOD" as const };
  },

  async approve(txId: number, actorId: number, actorRole: string, ipAddress?: string) {
    const tx = await prisma.transactions.findUnique({
      where: { id: txId },
      include: { order: { include: { package: { select: { period: true } } } } },
    });
    if (!tx) return { error: "NOT_FOUND" as const };
    if (tx.status !== "PENDING") return { error: "NOT_PENDING" as const };
    if (tx.payment_method !== "PROMPTPAY") return { error: "NOT_PROMPTPAY" as const };

    // Guard against race condition: re-check inside transaction so two concurrent approvals
    // cannot both pass and double-mark the order as PAID.
    let updated: any;
    try {
      updated = await prisma.$transaction(async (t) => {
        const existingSuccess = await t.transactions.findFirst({
          where: { order_id: tx.order_id, status: "SUCCESSFUL", id: { not: txId } },
        });
        if (existingSuccess) {
          throw Object.assign(new Error("ALREADY_PAID"), { code: "ALREADY_PAID" });
        }
        const result = await t.transactions.update({
          where: { id: txId },
          data: { status: "SUCCESSFUL" },
        });
        await completePaidOrder(t, tx.order_id, !!tx.order.renewal_vps_id, !!tx.order.upgrade_vps_id);
        return result;
      });
    } catch (e: any) {
      if (e.code === "ALREADY_PAID") return { error: "ALREADY_PAID" as const };
      throw e;
    }

    auditService.record({
      actorId,
      actorRole,
      action: "APPROVE",
      entity: "TRANSACTION",
      entityId: txId,
      targetUserId: tx.order.users_id,
      metadata: {
        payment_method: tx.payment_method,
        amount: tx.amount,
        order_ref: tx.order.ref_no,
      },
      ipAddress,
    });

    logger.payment("promptpay_approved", { txId, orderId: tx.order_id, actorId });
    if (tx.order.upgrade_vps_id) {
      upgradeService.applyUpgrade(tx.order_id); // fire-and-forget
    } else if (tx.order.renewal_vps_id) {
      vpsService.renew(tx.order.renewal_vps_id, tx.order.package.period); // fire-and-forget
    } else {
      vpsService.provision(tx.order_id); // fire-and-forget
    }
    return { data: updated };
  },

  async reject(txId: number, actorId: number, actorRole: string, reason: string, ipAddress?: string) {
    const tx = await prisma.transactions.findUnique({
      where: { id: txId },
      include: { order: true },
    });
    if (!tx) return { error: "NOT_FOUND" as const };
    if (tx.status !== "PENDING") return { error: "NOT_PENDING" as const };
    if (tx.payment_method !== "PROMPTPAY") return { error: "NOT_PROMPTPAY" as const };

    const updated = await prisma.transactions.update({
      where: { id: txId },
      data: { status: "REJECT" },
    });

    auditService.record({
      actorId,
      actorRole,
      action: "REJECT",
      entity: "TRANSACTION",
      entityId: txId,
      targetUserId: tx.order.users_id,
      metadata: {
        reason,
        payment_method: tx.payment_method,
        amount: tx.amount,
        order_ref: tx.order.ref_no,
      },
      ipAddress,
    });

    logger.payment("promptpay_rejected", { txId, orderId: tx.order_id, actorId, reason });
    return { data: updated };
  },

  async list(params: { userId: number; role: string; page: number; limit: number }) {
    const { userId, role, page, limit } = params;
    const skip = (page - 1) * limit;
    // USER sees own transactions (through orders); ADMIN/SUPPORT see all
    const where = role === "users" ? { order: { users_id: userId } } : {};

    const [transactions, total] = await Promise.all([
      prisma.transactions.findMany({
        where,
        skip,
        take: limit,
        include: {
          order: { select: { ref_no: true, users_id: true, status: true } },
        },
        orderBy: { created_at: "desc" },
      }),
      prisma.transactions.count({ where }),
    ]);

    return { data: { transactions, total, page, limit } };
  },
};
