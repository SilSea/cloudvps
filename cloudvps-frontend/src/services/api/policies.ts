import { ApiClient } from "./client"
import type { Policy, Consent, SubmitConsentInput, PolicyType } from "@/types/policy"

export interface CreatePolicyInput {
  policie_title: string
  policies_detail: string
  policies_type: PolicyType
  version: string
}

export class PolicyService extends ApiClient {
  static async getActive(): Promise<Policy[]> {
    return this.get<Policy[]>("/api/policies/active")
  }

  static async list(token: string): Promise<Policy[]> {
    return this.get<Policy[]>("/api/policies", { token })
  }

  static async create(data: CreatePolicyInput, token: string): Promise<Policy> {
    return this.post<Policy>("/api/policies", data, { token })
  }

  static async update(id: number, data: Partial<Pick<CreatePolicyInput, "policie_title" | "policies_detail" | "version">>, token: string): Promise<Policy> {
    return this.put<Policy>(`/api/policies/${id}`, data, { token })
  }

  static async toggleStatus(id: number, token: string): Promise<void> {
    return this.patch<void>(`/api/policies/${id}/status`, undefined, { token })
  }

  // Backend accepts one policy_id at a time
  static async submitConsent(data: SubmitConsentInput, token: string): Promise<void> {
    return this.post<void>("/api/policies/consents", data, { token })
  }

  // Submit multiple consents sequentially
  static async submitConsents(policyIds: number[], token: string): Promise<void> {
    for (const policy_id of policyIds) {
      await this.submitConsent({ policy_id }, token)
    }
  }

  static async getMyConsents(token: string): Promise<Consent[]> {
    return this.get<Consent[]>("/api/policies/consents/me", { token })
  }
}
