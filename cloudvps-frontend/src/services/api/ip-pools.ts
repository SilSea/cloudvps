import { ApiClient } from "./client"

export type IpType = "PUBLIC" | "PRIVATE"

export interface IpPool {
  id: number
  ip: string
  type: IpType
  status: boolean
  ip_assignments: { id: number }[]
}

export interface IpPoolListResponse {
  pools: IpPool[]
  total: number
  page: number
  limit: number
}

export class IpPoolService extends ApiClient {
  static async list(token: string, page = 1, limit = 50): Promise<IpPoolListResponse> {
    return this.get<IpPoolListResponse>(`/api/ip-pools?page=${page}&limit=${limit}`, { token })
  }

  static async create(data: { ip: string; type: IpType }, token: string): Promise<IpPool> {
    return this.post<IpPool>("/api/ip-pools", data, { token })
  }

  static async createRange(
    data: { ip_start: string; ip_end: string; type: IpType },
    token: string,
  ): Promise<{ added: number; skipped: number; ips: string[] }> {
    return this.post<{ added: number; skipped: number; ips: string[] }>("/api/ip-pools/range", data, { token })
  }

  static async update(id: number, data: { ip?: string; type?: IpType }, token: string): Promise<IpPool> {
    return this.patch<IpPool>(`/api/ip-pools/${id}`, data, { token })
  }

  static async toggleStatus(id: number, token: string): Promise<IpPool> {
    return this.patch<IpPool>(`/api/ip-pools/${id}/status`, undefined, { token })
  }
}
