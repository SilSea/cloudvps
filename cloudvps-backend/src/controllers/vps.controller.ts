import { vpsService } from "../services/vps.service";
import { orderService } from "../services/order.service";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const vpsController = {
  async list({ user, query }: any) {
    const page = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));
    const result = await vpsService.list(user.id, user.role, page, limit);
    return { success: true, ...result };
  },

  async getById({ user, params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid VPS ID." };
    }
    const result = await vpsService.getById(id, user.id, user.role);
    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    return { success: true, data: result.data };
  },

  async getQueue({ set }: any) {
    const result = await vpsService.getQueue();
    return { success: true, ...result };
  },

  async provision({ params, set }: any) {
    const orderId = parseInt(params.orderId, 10);
    if (isNaN(orderId)) {
      set.status = 400;
      return { success: false, message: "Invalid order ID." };
    }
    // Fire-and-forget — do not await, respond immediately
    vpsService.provision(orderId);
    set.status = 202;
    return { success: true, message: "Provisioning started." };
  },

  async start({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.start(id, user.id, user.role);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "PROXMOX_ERROR") {
      set.status = 502;
      return { success: false, message: "Proxmox error.", detail: result.detail };
    }

    if (user.role !== "users") {
      auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "START",
        entity: "VPS",
        entityId: id,
        targetUserId: result.data!.ownerId,
        ipAddress: getIp(request),
      });
    }

    return { success: true, data: result.data };
  },

  async stop({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.stop(id, user.id, user.role);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "PROXMOX_ERROR") {
      set.status = 502;
      return { success: false, message: "Proxmox error.", detail: result.detail };
    }

    if (user.role !== "users") {
      auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "STOP",
        entity: "VPS",
        entityId: id,
        targetUserId: result.data!.ownerId,
        ipAddress: getIp(request),
      });
    }

    return { success: true, data: result.data };
  },

  async reboot({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.reboot(id, user.id, user.role);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "PROXMOX_ERROR") {
      set.status = 502;
      return { success: false, message: "Proxmox error.", detail: result.detail };
    }

    if (user.role !== "users") {
      auditService.record({
        actorId: user.id,
        actorRole: user.role,
        action: "REBOOT",
        entity: "VPS",
        entityId: id,
        targetUserId: result.data!.ownerId,
        ipAddress: getIp(request),
      });
    }

    return { success: true, data: result.data };
  },

  async reset({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.reset(id, user.id, user.role);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "PROXMOX_ERROR") {
      set.status = 502;
      return { success: false, message: "Proxmox error.", detail: result.detail };
    }

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "RESET",
      entity: "VPS",
      entityId: id,
      targetUserId: result.data!.ownerId,
      ipAddress: getIp(request),
      metadata: { action: "reset" },
    });

    return { success: true, data: result.data };
  },

  async liveStatus({ user, params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.getLiveStatus(id, user.id, user.role);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "PROXMOX_ERROR") {
      set.status = 502;
      return { success: false, message: "Proxmox error.", detail: result.detail };
    }

    return { success: true, data: result.data };
  },

  async requestPasswordChange({ user, params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.requestPasswordChange(id, user.id, user.role);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "EMAIL_FAILED") { set.status = 502; return { success: false, message: "Failed to send OTP email." }; }

    return { success: true, data: result.data };
  },

  async confirmPasswordChange({ user, params, body, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.confirmPasswordChange(id, user.id, user.role, body.otp, body.new_password);

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "INVALID_PASSWORD") { set.status = 400; return { success: false, message: "Password must be 8-64 characters with no newline characters." }; }
    if (result.error === "OTP_EXPIRED") { set.status = 400; return { success: false, message: "OTP expired. Please request a new one." }; }
    if (result.error === "OTP_INVALID") { set.status = 400; return { success: false, message: "Invalid OTP." }; }
    if (result.error === "OTP_MAX_TRIES") { set.status = 429; return { success: false, message: "Too many incorrect OTP attempts. Request a new OTP." }; }
    if (result.error === "AGENT_ERROR") { set.status = 502; return { success: false, message: "Failed to change password in VM.", detail: result.detail }; }

    return { success: true, data: result.data };
  },

  async forceDelete({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await vpsService.forceDelete(id);

    if (result.error === "NOT_FOUND") {
      set.status = 404;
      return { success: false, message: "VPS not found." };
    }

    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "EXPIRE",
      entity: "VPS",
      entityId: id,
      targetUserId: result.data!.ownerId,
      metadata: { reason: "force_delete", vmid: result.data!.vmid },
      ipAddress: getIp(request),
    });

    return { success: true, message: "VPS deleted successfully." };
  },

  async renewVps({ user, params, body, set }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) {
      set.status = 400;
      return { success: false, message: "Invalid VPS ID." };
    }

    const check = await vpsService.getById(vpsId, user.id, user.role);
    if (check.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (check.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }

    const vps = check.data!;
    const result = await orderService.create({
      userId: vps.order.users_id,
      userRole: user.role,
      packageId: vps.order.packages_id,
      renewalVpsId: vpsId,
      promoCode: body?.promo_code,
    });

    if (result.error === "RENEWAL_PENDING") {
      set.status = 409;
      return { success: false, message: "A pending renewal order already exists for this VPS." };
    }
    if (result.error === "INVALID_PROMO" || result.error === "PROMO_EXPIRED") {
      set.status = 400;
      return { success: false, message: result.error };
    }
    if (result.error === "PROMO_LIMIT_REACHED" || result.error === "PROMO_USER_LIMIT_REACHED") {
      set.status = 409;
      return { success: false, message: result.error };
    }
    if (result.error) {
      set.status = 400;
      return { success: false, message: result.error };
    }

    set.status = 201;
    return { success: true, data: result.data };
  },

  async toggleAutoRenew({ user, params, body, set }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) {
      set.status = 400;
      return { success: false, message: "Invalid VPS ID." };
    }

    const result = await vpsService.toggleAutoRenew(
      vpsId,
      user.id,
      user.role,
      body.auto_renew,
      body.locked_promo_id,
    );

    if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
    if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
    if (result.error === "INVALID_PROMO") { set.status = 400; return { success: false, message: "Promo not found or inactive." }; }

    return { success: true, data: result.data };
  },
};
