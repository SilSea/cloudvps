import { promotionService } from "../services/promotion.service";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const promotionController = {
  async list({ set }: any) {
    return { success: true, data: await promotionService.list() };
  },

  async create({ user, body, set, request }: any) {
    const result = await promotionService.create(body);
    if (result.error) { set.status = 409; return { success: false, message: result.error }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "CREATE", entity: "PROMOTION", entityId: result.data!.id,
      metadata: { code_name: result.data!.code_name, type: result.data!.type, discount: result.data!.discount },
      ipAddress: getIp(request),
    });
    set.status = 201;
    return { success: true, data: result.data };
  },

  async update({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid promotion ID." }; }
    const promo = await promotionService.update(id, body);
    if (!promo) { set.status = 404; return { success: false, message: "Promotion not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: "UPDATE", entity: "PROMOTION", entityId: id,
      metadata: body, ipAddress: getIp(request),
    });
    return { success: true, data: promo };
  },

  async toggleStatus({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) { set.status = 400; return { success: false, message: "Invalid promotion ID." }; }
    const promo = await promotionService.toggleStatus(id);
    if (!promo) { set.status = 404; return { success: false, message: "Promotion not found." }; }
    auditService.record({
      actorId: user.id, actorRole: user.role,
      action: promo.status ? "ENABLE" : "DISABLE", entity: "PROMOTION", entityId: id,
      metadata: { code_name: promo.code_name, status: promo.status },
      ipAddress: getIp(request),
    });
    return { success: true, data: promo };
  },

  async validate({ body, set }: any) {
    const result = await promotionService.validate(body.code);
    if (!result.valid) { set.status = 400; return { success: false, message: result.error }; }
    return { success: true, data: result.promotion };
  },
};
