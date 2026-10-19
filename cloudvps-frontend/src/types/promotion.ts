// Matches backend DB/Prisma field names exactly
export type PromoType = "DISCOUNT" | "PERCENT"

export interface Promotion {
  id: number
  code_name: string
  description: string
  type: PromoType
  discount: number
  status: boolean
  max_uses?: number | null
  max_uses_per_user?: number | null
  used_count: number
  expired_at?: string | null
  created_at: string
  updated_at?: string | null
}

export interface PromoValidateInput {
  code: string
}

// Backend returns the promotion object when valid
export interface PromoValidateResult {
  id: number
  code_name: string
  type: PromoType
  discount: number
  status: boolean
}
