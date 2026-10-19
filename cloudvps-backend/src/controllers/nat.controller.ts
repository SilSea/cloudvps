import { natService } from "../services/nat.service";

export const natController = {
  async listRules({ params, store }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) return new Response(JSON.stringify({ success: false, error: "INVALID_ID" }), { status: 400 });

    const info = await natService.getInfo(vpsId);
    if (!info) return new Response(JSON.stringify({ success: false, error: "NAT_NOT_FOUND" }), { status: 404 });

    const userId: number = store.user.id;
    const role: string = store.user.role;

    if (role === "users") {
      const { prisma } = await import("../config/database");
      const vps = await prisma.vps.findUnique({
        where: { id: vpsId },
        select: { order: { select: { users_id: true } } },
      });
      if (!vps || !vps.order || vps.order.users_id !== userId) {
        return new Response(JSON.stringify({ success: false, error: "FORBIDDEN" }), { status: 403 });
      }
    }

    return new Response(JSON.stringify({ success: true, data: info }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },

  async addRule({ params, body, store }: any) {
    const vpsId = parseInt(params.id, 10);
    if (isNaN(vpsId)) return new Response(JSON.stringify({ success: false, error: "INVALID_ID" }), { status: 400 });

    const userId: number = store.user.id;
    const role: string = store.user.role;

    if (role === "users") {
      const { prisma } = await import("../config/database");
      const vps = await prisma.vps.findUnique({
        where: { id: vpsId },
        select: { order: { select: { users_id: true } } },
      });
      if (!vps || !vps.order || vps.order.users_id !== userId) {
        return new Response(JSON.stringify({ success: false, error: "FORBIDDEN" }), { status: 403 });
      }
    }

    const { privateIp, privatePort, protocol } = body;
    const result = await natService.addRule({ vpsId, privateIp, privatePort, protocol });

    if (result.error === "NAT_NOT_FOUND") return new Response(JSON.stringify({ success: false, error: "NAT_NOT_FOUND" }), { status: 404 });
    if (result.error === "PORT_LIMIT_REACHED") return new Response(JSON.stringify({ success: false, error: "PORT_LIMIT_REACHED" }), { status: 409 });

    return new Response(JSON.stringify({ success: true, data: result.data }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  },

  async deleteRule({ params, store }: any) {
    const vpsId = parseInt(params.id, 10);
    const ruleId = parseInt(params.ruleId, 10);
    if (isNaN(vpsId) || isNaN(ruleId)) return new Response(JSON.stringify({ success: false, error: "INVALID_ID" }), { status: 400 });

    const userId: number = store.user.id;
    const role: string = store.user.role;

    const result = await natService.deleteRule({ ruleId, vpsId, userId, role });

    if (result.error === "NOT_FOUND") return new Response(JSON.stringify({ success: false, error: "NOT_FOUND" }), { status: 404 });
    if (result.error === "SYSTEM_RULE") return new Response(JSON.stringify({ success: false, error: "SYSTEM_RULE" }), { status: 403 });
    if (result.error === "FORBIDDEN") return new Response(JSON.stringify({ success: false, error: "FORBIDDEN" }), { status: 403 });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  },
};
