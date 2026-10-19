import { policyService } from "../services/policy.service";
import { auditService } from "../services/audit.service";

export const policyController = {
  async getActive({ set }: any) {
    const data = await policyService.getActive();
    return { success: true, data };
  },

  async getAll({ set }: any) {
    const data = await policyService.getAll();
    return { success: true, data };
  },

  async create({ user, body, set, request }: any) {
    const policy = await policyService.create(body);
    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "CREATE",
      entity: "POLICY",
      entityId: policy.id,
      metadata: { title: policy.policie_title, type: policy.policies_type, version: policy.version },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
    });
    set.status = 201;
    return { success: true, data: policy };
  },

  async update({ user, params, body, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid policy ID." };
    }
    const policy = await policyService.update(id, body);
    if (!policy) {
      set.status = 404;
      return { success: false, message: "Policy not found." };
    }
    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: "UPDATE",
      entity: "POLICY",
      entityId: id,
      metadata: body,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
    });
    return { success: true, data: policy };
  },

  async toggleStatus({ user, params, set, request }: any) {
    const id = parseInt(params.id, 10);
    if (isNaN(id)) {
      set.status = 400;
      return { success: false, message: "Invalid policy ID." };
    }
    const policy = await policyService.toggleStatus(id);
    if (!policy) {
      set.status = 404;
      return { success: false, message: "Policy not found." };
    }
    auditService.record({
      actorId: user.id,
      actorRole: user.role,
      action: policy.status ? "ENABLE" : "DISABLE",
      entity: "POLICY",
      entityId: id,
      metadata: { title: policy.policie_title, status: policy.status },
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
    });
    return { success: true, data: policy };
  },

  async acceptConsent({ user, body, set }: any) {
    const result = await policyService.addConsent(user.id, body.policy_id);
    if (result.error) {
      set.status = 400;
      return { success: false, message: result.error };
    }
    if (result.already_accepted) {
      set.status = 409;
      return { success: false, message: "Consent already accepted." };
    }
    set.status = 201;
    return { success: true, data: result.data };
  },

  async getMyConsents({ user }: any) {
    const data = await policyService.getMyConsents(user.id);
    return { success: true, data };
  },
};
