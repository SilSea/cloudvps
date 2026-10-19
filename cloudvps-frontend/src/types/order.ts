import type { Transaction } from "./transaction"

// Status matches backend DB enum exactly
export type OrderStatus = "PENDING" | "PAID" | "CANCEL" | "EXPIRE"
export type OrderType = "NEW" | "RENEWAL" | "UPGRADE"

export interface Order {
  id: number
  ref_no: string
  users_id: number
  packages_id: number
  renewal_vps_id?: number | null
  upgrade_vps_id?: number | null
  promotions_id?: number | null
  type?: OrderType
  status: OrderStatus
  amount: number
  created_at: string
  expired_at?: string | null
  // nested relations (from include)
  package?: {
    name: string
    os?: { os_name: string; os_version: string }
    vm?: { core: number; memory: string; size: string }
    price?: number
    period?: number
    port_count?: number | null
  }
  promotion?: {
    code_name: string
    type: string
    discount: number
  } | null
  // Newest first (backend orders by created_at desc) — GET /api/orders/:id only
  transactions?: Transaction[]
}

export interface OrderListResponse {
  orders: Order[]
  total: number
  page: number
  limit: number
}

export interface CreateOrderInput {
  package_id: number
  promo_code?: string
  type?: OrderType
  vps_id?: number
}
