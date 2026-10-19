import { prisma } from "../config/database";
import { proxmoxService } from "./proxmox.service";
import { auditService } from "./audit.service";
import { jwtUtils } from "../utils/jwt";
import { logger } from "../utils/logger";
import type { TerminalTokenPayload } from "../types";

export const terminalService = {
  async getToken(
    vpsId: number,
    userId: number,
    role: string,
    ipAddress?: string
  ): Promise<{ data: { token: string; expires_in: number; vnc_password: string } } | { error: string }> {
    const vps = await prisma.vps.findUnique({
      where: { id: vpsId },
      include: { order: { select: { users_id: true } } },
    });
    if (!vps || vps.deleted_at) return { error: "NOT_FOUND" };
    if (role === "users" && vps.order.users_id !== userId) return { error: "FORBIDDEN" };

    let vnc: { ticket: string; port: number };
    try {
      vnc = await proxmoxService.getVncProxy(vps.vmid);
    } catch (e: any) {
      logger.vps("terminal_vncproxy_error", { vpsId, vmid: vps.vmid, error: e.message });
      return { error: "PROXMOX_ERROR" };
    }

    const token = await jwtUtils.signTerminal({
      sub: userId,
      vpsId,
      vmid: vps.vmid,
      ticket: vnc.ticket,
      port: vnc.port,
    });

    const isAdminViewingOther = role !== "users" && vps.order.users_id !== userId;
    auditService.record({
      actorId: userId,
      actorRole: role,
      action: "VIEW",
      entity: "VPS_TERMINAL",
      entityId: vpsId,
      targetUserId: vps.order.users_id,
      ipAddress,
      metadata: isAdminViewingOther ? { admin_view: true, ownerId: vps.order.users_id } : undefined,
    });

    logger.vps("terminal_token_issued", { vpsId, vmid: vps.vmid, userId, role });
    // vnc_password = Proxmox ticket; frontend must pass this to rfb.sendCredentials()
    // during RFB security handshake. Ticket is short-lived and Proxmox is on internal
    // network only — exposing it here does not bypass the WS proxy.
    return { data: { token, expires_in: 30, vnc_password: vnc.ticket } };
  },

  async verifyToken(token: string): Promise<TerminalTokenPayload> {
    return jwtUtils.verifyTerminal(token);
  },
};
