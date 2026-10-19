import { emailTemplateService } from "../services/email-template.service";
import type { EmailTemplateType } from "@prisma/client";

const VALID_TYPES = new Set<string>([
  "VERIFICATION", "EXPIRY_WARNING", "EXPIRED", "FORCE_DELETED",
  "AUTO_RENEWAL_REMINDER", "BROADCAST_MAINTENANCE", "BROADCAST_EMERGENCY",
  "BROADCAST_ANNOUNCEMENT", "WELCOME", "TICKET_REPLY", "TICKET_CLOSED",
]);

function parseType(raw: string, set: any): EmailTemplateType | null {
  const t = raw.toUpperCase();
  if (!VALID_TYPES.has(t)) {
    set.status = 400;
    return null;
  }
  return t as EmailTemplateType;
}

export const emailTemplateController = {
  async list({ set }: any) {
    try {
      const data = await emailTemplateService.listTemplates();
      return { success: true, data };
    } catch (err) {
      set.status = 500;
      return { success: false, message: "Failed to list templates." };
    }
  },

  async getOne({ params, set }: any) {
    const type = parseType(params.type, set);
    if (!type) return { success: false, message: "Invalid template type." };

    const data = await emailTemplateService.getByType(type);
    return { success: true, data };
  },

  async update({ params, body, user, set, request }: any) {
    const type = parseType(params.type, set);
    if (!type) return { success: false, message: "Invalid template type." };

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    const record = await emailTemplateService.upsertTemplate(
      type,
      { subject: body.subject, body_html: body.body_html, is_active: body.is_active },
      user.id,
      user.role,
      ip
    );
    return { success: true, data: record };
  },

  async toggleActive({ params, body, user, set, request }: any) {
    const type = parseType(params.type, set);
    if (!type) return { success: false, message: "Invalid template type." };

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    try {
      const record = await emailTemplateService.toggleActive(
        type,
        body.is_active,
        user.id,
        user.role,
        ip
      );
      return { success: true, data: record };
    } catch (err: any) {
      if (err.message === "TEMPLATE_NOT_FOUND") {
        set.status = 404;
        return { success: false, message: "Template not found. Use PUT to create it first." };
      }
      set.status = 500;
      return { success: false, message: "Failed to update template status." };
    }
  },
};
