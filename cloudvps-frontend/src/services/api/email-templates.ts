import { ApiClient } from "./client"
import type { EmailTemplate, UpdateEmailTemplateInput, EmailTemplateType } from "@/types/email-template"

export class EmailTemplateService extends ApiClient {
  static async list(token: string): Promise<EmailTemplate[]> {
    return this.get<EmailTemplate[]>("/api/email-templates", { token })
  }

  static async getOne(type: EmailTemplateType, token: string): Promise<EmailTemplate> {
    return this.get<EmailTemplate>(`/api/email-templates/${type}`, { token })
  }

  static async update(type: EmailTemplateType, data: UpdateEmailTemplateInput, token: string): Promise<EmailTemplate> {
    return this.put<EmailTemplate>(`/api/email-templates/${type}`, data, { token })
  }

  static async toggleActive(type: EmailTemplateType, is_active: boolean, token: string): Promise<EmailTemplate> {
    return this.patch<EmailTemplate>(`/api/email-templates/${type}/status`, { is_active }, { token })
  }
}
