// Matches backend DB/Prisma field names exactly
export type PolicyType = "PDPA" | "TERMSERVICE"

export interface Policy {
  id: number
  policie_title: string
  policies_detail: string
  policies_type: PolicyType
  version: string
  status: boolean
  created_at: string
  updated_at?: string | null
}

export interface Consent {
  id: number
  users_id: number
  policies_id: number
  accepted_at: string
  policy: Policy
}

export interface SubmitConsentInput {
  policy_id: number
}
