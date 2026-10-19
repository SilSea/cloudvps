import { broadcastService } from "../services/broadcast.service";
import { auditService } from "../services/audit.service";

const getIp = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0].trim();

export const broadcastController = {
  async send({ user, body, set, request }: any) {
    const result = await broadcastService.send({
      subject: body.subject,
      body:    body.body,
      type:    body.type,
      target:  body.target,
      actorId: user.id,
    });

    auditService.record({
      actorId:    user.id,
      actorRole:  user.role,
      action:     "BROADCAST",
      entity:     "EMAIL_BROADCAST",
      entityId:   result.broadcastId,
      metadata:   { type: body.type, target: body.target, sentCount: result.sentCount, failedCount: result.failedCount },
      ipAddress:  getIp(request),
    });

    set.status = 201;
    return { success: true, data: result };
  },

  async list({ query }: any) {
    const page  = Math.max(1, parseInt(query?.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query?.limit ?? "20", 10)));
    const result = await broadcastService.list(page, limit);
    return { success: true, ...result };
  },

  async getById({ params, set }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid broadcast id." };
    }
    const result = await broadcastService.getById(id);
    if (!result) {
      set.status = 404;
      return { success: false, message: "Broadcast not found." };
    }
    return { success: true, data: result };
  },
};
