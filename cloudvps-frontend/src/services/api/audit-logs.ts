import { ApiClient } from "./client"
import type { AuditLogListResponse, AuditLogFilters } from "@/types/audit-log"

export class AuditLogService extends ApiClient {
  static async list(filters: AuditLogFilters, token: string): Promise<AuditLogListResponse> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v))
    }
    const qs = params.toString()
    return this.get<AuditLogListResponse>(`/api/audit-logs${qs ? `?${qs}` : ""}`, { token })
  }
}
