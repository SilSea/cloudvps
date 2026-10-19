import { prisma } from "../config/database";
import { systemConfigService } from "../services/system-config.service";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const systemConfigController = {
  async list({ set }: any) {
    const configs = await systemConfigService.list();
    return { success: true, data: configs };
  },

  async getOne({ params, set }: any) {
    const config = await systemConfigService.getOne(params.key);
    if (!config) {
      set.status = 404;
      return { success: false, message: "Config key not found." };
    }
    return { success: true, data: config };
  },

  async update({ user, params, body, set, request }: any) {
    const existing = await prisma.system_configs.findUnique({ where: { key: params.key } });
    if (!existing) {
      set.status = 404;
      return { success: false, message: "Config key not found." };
    }

    await systemConfigService.set(params.key, body.value ?? null, user.id);

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "UPDATE",
      entity: "SYSTEM_CONFIG",
      entityId: existing.id,
      metadata: { key: params.key, category: existing.category, is_secret: existing.is_secret },
      ipAddress: getIp(request),
    });

    return { success: true, message: "Config updated." };
  },

  async getPaymentInfo() {
    const [promptpayId, bankCode, bankAccountNo, bankAccountName] = await Promise.all([
      systemConfigService.get("payment.promptpay_id"),
      systemConfigService.get("payment.bank_code"),
      systemConfigService.get("payment.bank_account_no"),
      systemConfigService.get("payment.bank_account_name"),
    ]);
    return {
      success: true,
      data: {
        promptpay_id: promptpayId || null,
        bank: bankCode || bankAccountNo || bankAccountName
          ? { code: bankCode || null, account_no: bankAccountNo || null, account_name: bankAccountName || null }
          : null,
      },
    };
  },

  async getPricing() {
    const [cpu, ram, disk] = await Promise.all([
      systemConfigService.get("pricing.cpu_per_core"),
      systemConfigService.get("pricing.ram_per_gib"),
      systemConfigService.get("pricing.disk_per_gb"),
    ]);
    return {
      success: true,
      data: {
        cpu_per_core: cpu != null ? parseFloat(cpu) : null,
        ram_per_gib:  ram != null ? parseFloat(ram)  : null,
        disk_per_gb:  disk != null ? parseFloat(disk) : null,
      },
    };
  },

  async flushCache({ user, request }: any) {
    const result = await systemConfigService.flushCache();
    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "UPDATE",
      entity: "SYSTEM_CONFIG",
      entityId: 0,
      metadata: { action: "redis_flush", deleted: result.deleted, patterns: result.patterns },
      ipAddress: getIp(request),
    });
    return { success: true, message: `Flushed ${result.deleted} Redis key(s).`, data: result };
  },
};
