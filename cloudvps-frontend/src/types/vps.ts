import type { NatInfo } from "./nat"

// status: boolean — true = running, false = stopped/expired
export interface Vps {
  id: number
  name: string
  vmid: number
  ip_assignments_id: number
  orders_id: number
  status: boolean
  expired_at: string
  current_cores: number
  current_memory_gib: number
  current_disk_gb: number
  monthly_price: number
  auto_renew: boolean
  locked_promo_id?: number | null
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
  // nested from include
  ip_assignment: {
    ip_pool: { ip: string; type: "PUBLIC" | "PRIVATE" }
  }
  order: {
    ref_no: string
    users_id: number
    packages_id: number
    package: {
      name: string
      period: number
      os?: { os_name: string; os_version: string }
      vm?: { core: number; memory: string; size: string }
    }
    user?: { id: number; email: string }
  }
  // only present in getById response
  live_status?: {
    status: string
    uptime?: number
    cpu?: number
    mem?: number
    maxmem?: number
  } | null
  nat?: NatInfo | null
}

export interface VpsListResponse {
  vps: Vps[]
  total: number
  page: number
  limit: number
}

export interface VpsQueueItem {
  id: number
  name: string | null
  order_id: number
  created_at: string
  order: {
    ref_no: string
    amount: number
    users_id: number
    package: { name: string; os?: { os_name: string; os_version: string } | null }
    user: { id: number; email: string }
  }
}

export interface AutoRenewInput {
  auto_renew: boolean
  locked_promo_id?: number | null
}

export interface VpsLiveStatus {
  vpsId: number
  vmid: number
  status: "running" | "stopped" | "paused" | string
  cpu_pct: number
  mem_mb: number
  maxmem_mb: number
  uptime_sec: number
  // From QEMU guest agent (get-fsinfo) — null when VM stopped, agent not installed, or not ready yet.
  disk_used_gb: number | null
  disk_total_gb: number | null
}

export interface TerminalTokenResponse {
  token: string
  expires_in: number
  vnc_password: string
}

export interface ConfirmVpsPasswordChangeInput {
  otp: string
  new_password: string
}
