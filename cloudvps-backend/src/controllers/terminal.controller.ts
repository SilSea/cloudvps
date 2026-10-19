import { terminalService } from "../services/terminal.service";

const getIp = (req: Request) => req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? undefined;

export const terminalController = {
  async getToken({ user, params, set, request }: any) {
    const vpsId = parseInt(params.vps_id, 10);
    if (isNaN(vpsId)) { set.status = 400; return { success: false, message: "Invalid VPS ID." }; }

    const result = await terminalService.getToken(vpsId, user.id, user.role, getIp(request));

    if ("error" in result) {
      if (result.error === "NOT_FOUND") { set.status = 404; return { success: false, message: "VPS not found." }; }
      if (result.error === "FORBIDDEN") { set.status = 403; return { success: false, message: "Access denied." }; }
      set.status = 502;
      return { success: false, message: "Could not reach Proxmox." };
    }

    return { success: true, data: result.data };
  },
};
