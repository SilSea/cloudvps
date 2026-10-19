import { ApiClient } from "./client"

export interface SystemConfig {
  key: string
  value: string | null
  is_secret: boolean
  description: string | null
  category: string
}

// Unit prices for custom VPS upgrade — readable by any authenticated role (not a secret),
// used to compute a client-side cost preview before submitting (see vps-upgrade-section.tsx).
// null = admin hasn't configured that key yet.
export interface Pricing {
  cpu_per_core: number | null
  ram_per_gib: number | null
  disk_per_gb: number | null
}

// Public payment details for checkout — readable by any authenticated role. `bank` is null
// only when none of the 3 bank_* keys are set; individual fields inside it can still be null.
export interface PaymentInfo {
  promptpay_id: string | null
  bank: { code: string | null; account_no: string | null; account_name: string | null } | null
}

export class SystemConfigService extends ApiClient {
  static async list(token: string): Promise<SystemConfig[]> {
    return this.get<SystemConfig[]>("/api/system-configs", { token })
  }

  static async getPricing(token: string): Promise<Pricing> {
    return this.get<Pricing>("/api/system-configs/pricing", { token })
  }

  static async getPaymentInfo(token: string): Promise<PaymentInfo> {
    return this.get<PaymentInfo>("/api/system-configs/payment-info", { token })
  }

  static async update(key: string, value: string | null, token: string): Promise<void> {
    return this.put<void>(`/api/system-configs/${key}`, { value }, { token })
  }

  static async flushCache(token: string): Promise<void> {
    return this.delete<void>("/api/system-configs/cache/flush", { token })
  }
}
