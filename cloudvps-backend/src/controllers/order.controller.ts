import { orderService } from "../services/order.service";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const orderController = {
  async create({ user, body, set }: any) {
    const result = await orderService.create({
      userId: user.id,
      userRole: user.role,
      packageId: body.package_id,
      promoCode: body.promo_code,
      force: body.force,
    });

    if (result.error) {
      const statusMap: Record<string, number> = {
        PACKAGE_NOT_FOUND: 404,
        PACKAGE_INACTIVE: 400,
        INVALID_PROMO: 400,
        PROMO_EXPIRED: 400,
        PROMO_LIMIT_REACHED: 409,
        PROMO_USER_LIMIT_REACHED: 409,
        RENEWAL_PENDING: 409,
        INSUFFICIENT_RESOURCES: 409,
      };
      const msgMap: Record<string, string> = {
        PACKAGE_NOT_FOUND: "Package not found.",
        PACKAGE_INACTIVE: "Package is not available.",
        INVALID_PROMO: "Invalid or inactive promotion code.",
        PROMO_EXPIRED: "Promotion code has expired.",
        PROMO_LIMIT_REACHED: "Promotion code has reached its usage limit.",
        PROMO_USER_LIMIT_REACHED: "You have reached the usage limit for this promotion code.",
        RENEWAL_PENDING: "A renewal order for this VPS is already pending.",
        INSUFFICIENT_RESOURCES: "Insufficient Proxmox node resources for this package.",
      };
      set.status = statusMap[result.error] ?? 400;
      if (result.error === "INSUFFICIENT_RESOURCES") {
        return { success: false, message: msgMap[result.error], error: result.error, detail: (result as any).detail };
      }
      return { success: false, message: msgMap[result.error] ?? "Error." };
    }

    set.status = 201;
    return { success: true, data: result.data };
  },

  async list({ user, query }: any) {
    const page = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));
    const result = await orderService.list({ userId: user.id, role: user.role, page, limit });
    return { success: true, ...result };
  },

  async getById({ user, params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid order ID." };
    }

    const result = await orderService.getById(id, user.id, user.role);
    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "Order not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }

    return { success: true, data: result.data };
  },

  async cancel({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid order ID." };
    }

    const result = await orderService.cancel(id, user.id, user.role);

    if (result.error) {
      const statusMap: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, CANNOT_CANCEL_UPGRADE: 403, ALREADY_PAID: 400, ALREADY_CANCELLED: 400, EXPIRED: 400 };
      const msgMap: Record<string, string> = {
        NOT_FOUND: "Order not found.",
        FORBIDDEN: "Access denied.",
        CANNOT_CANCEL_UPGRADE: "This upgrade has already been applied and cannot be cancelled.",
        ALREADY_PAID: "Cannot cancel a paid order.",
        ALREADY_CANCELLED: "Order is already cancelled.",
        EXPIRED: "Cannot cancel an expired order.",
      };
      set.status = statusMap[result.error] ?? 400;
      return { success: false, message: msgMap[result.error] ?? "Error." };
    }

    // Record audit — only ADMIN cancels on behalf of user; user self-cancel is not audited
    if (user.role !== "users") {
      auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "CANCEL",
        entity: "ORDER",
        entityId: id,
        targetUserId: result.data!.users_id,
        metadata: { ref_no: result.data!.ref_no, amount: result.data!.amount },
        ipAddress: getIp(request),
      });
    }

    return { success: true, data: result.data };
  },
};
