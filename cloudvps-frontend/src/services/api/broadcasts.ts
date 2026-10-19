import { ApiClient } from "./client"

export type BroadcastType = "MAINTENANCE" | "EMERGENCY" | "ANNOUNCEMENT"
export type BroadcastScope = "ALL" | "ACTIVE_VPS" | "EXPIRING_SOON"

export interface Broadcast {
  id: number
  type: BroadcastType
  scope: BroadcastScope
  subject: string
  body: string
  sent_count: number
  failed_count: number
  created_at: string
}

export interface CreateBroadcastInput {
  type: BroadcastType
  scope: BroadcastScope
  subject: string
  body: string
}

export interface BroadcastListResponse {
  broadcasts: Broadcast[]
  total: number
  page: number
  limit: number
}

export class BroadcastService extends ApiClient {
  static async send(data: CreateBroadcastInput, token: string): Promise<Broadcast> {
    return this.post<Broadcast>("/api/broadcasts", data, { token })
  }

  static async list(token: string): Promise<BroadcastListResponse> {
    return this.get<BroadcastListResponse>("/api/broadcasts", { token })
  }
}
