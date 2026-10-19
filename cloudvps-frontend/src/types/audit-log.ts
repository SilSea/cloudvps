export interface AuditLogActor {
  id: number
  email: string
}

export interface AuditLog {
  id: number
  actor_id: number
  actor_role: string
  action: string
  entity: string
  entity_id: number | null
  target_user_id: number | null
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
  actor: AuditLogActor | null
  target_user: AuditLogActor | null
}

export interface AuditLogListResponse {
  logs: AuditLog[]
  total: number
  page: number
  limit: number
}

export interface AuditLogFilters {
  page?: number
  limit?: number
  actor_id?: number
  target_user_id?: number
  entity?: string
  action?: string
  from?: string
  to?: string
}
