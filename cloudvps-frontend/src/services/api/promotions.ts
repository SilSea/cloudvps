import { ApiClient } from "./client"
import type { PromoValidateInput, PromoValidateResult, Promotion, PromoType } from "@/types/promotion"

export interface CreatePromotionInput {
  code_name: string
  description: string
  type: PromoType
  discount: number
  expired_at?: string | null
  max_uses?: number | null
  max_uses_per_user?: number | null
}

export type UpdatePromotionInput = Partial<Omit<CreatePromotionInput, "code_name">>

export class PromotionService extends ApiClient {
  static async validate(data: PromoValidateInput, token: string): Promise<PromoValidateResult> {
    return this.post<PromoValidateResult>("/api/promotions/validate", data, { token })
  }

  static async list(token: string): Promise<Promotion[]> {
    return this.get<Promotion[]>("/api/promotions", { token })
  }

  static async create(data: CreatePromotionInput, token: string): Promise<Promotion> {
    return this.post<Promotion>("/api/promotions", data, { token })
  }

  // Backend PATCH /:id/status has no body — it toggles
  static async toggleStatus(id: number, token: string): Promise<void> {
    return this.patch<void>(`/api/promotions/${id}/status`, undefined, { token })
  }

  static async update(id: number, data: UpdatePromotionInput, token: string): Promise<Promotion> {
    return this.put<Promotion>(`/api/promotions/${id}`, data, { token })
  }
}
