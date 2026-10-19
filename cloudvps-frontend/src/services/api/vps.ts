import { ApiClient } from "./client"
import type { Vps, VpsListResponse, AutoRenewInput, VpsQueueItem, VpsLiveStatus, ConfirmVpsPasswordChangeInput } from "@/types/vps"

export class VpsService extends ApiClient {
  // Returns { data: { vps, total, page, limit } } — extract .data
  static async list(token: string, page = 1, limit = 20): Promise<VpsListResponse> {
    const res = await this.get<{ vps: Vps[]; total: number; page: number; limit: number }>(
      `/api/vps?page=${page}&limit=${limit}`,
      { token },
    )
    return res
  }

  static async getById(id: number, token: string): Promise<Vps> {
    return this.get<Vps>(`/api/vps/${id}`, { token })
  }

  static async start(id: number, token: string): Promise<void> {
    return this.post<void>(`/api/vps/${id}/start`, undefined, { token })
  }

  static async stop(id: number, token: string): Promise<void> {
    return this.post<void>(`/api/vps/${id}/stop`, undefined, { token })
  }

  static async reboot(id: number, token: string): Promise<void> {
    return this.post<void>(`/api/vps/${id}/reboot`, undefined, { token })
  }

  static async toggleAutoRenew(id: number, data: AutoRenewInput, token: string): Promise<void> {
    return this.patch<void>(`/api/vps/${id}/auto-renew`, data, { token })
  }

  static async renew(id: number, promoCode: string | undefined, token: string): Promise<void> {
    return this.post<void>(`/api/vps/${id}/renew`, { promo_code: promoCode }, { token })
  }

  static async forceDelete(id: number, token: string): Promise<void> {
    return this.delete<void>(`/api/vps/${id}`, { token })
  }

  static async getStatus(id: number, token: string): Promise<VpsLiveStatus> {
    return this.get<VpsLiveStatus>(`/api/vps/${id}/status`, { token })
  }

  static async forceReset(id: number, token: string): Promise<void> {
    return this.post<void>(`/api/vps/${id}/reset`, undefined, { token })
  }

  static async requestPasswordChange(id: number, token: string): Promise<{ message: string }> {
    return this.post<{ message: string }>(`/api/vps/${id}/change-password/request`, undefined, { token })
  }

  static async confirmPasswordChange(id: number, data: ConfirmVpsPasswordChangeInput, token: string): Promise<{ message: string }> {
    return this.post<{ message: string }>(`/api/vps/${id}/change-password/confirm`, data, { token })
  }

  static async getQueue(token: string): Promise<VpsQueueItem[]> {
    return this.get<VpsQueueItem[]>("/api/vps/queue", { token })
  }

  static async provision(orderId: number, token: string): Promise<void> {
    return this.post<void>(`/api/vps/provision/${orderId}`, undefined, { token })
  }
}
