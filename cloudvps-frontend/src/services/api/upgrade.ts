import { ApiClient } from "./client"

export interface UpgradePackageInput {
  package_id: number
}

export interface UpgradeCustomInput {
  cores?: number
  memory_gib?: number
  disk_gb?: number
}

export interface UpgradeSpec {
  cores: number
  memory_gib: number
  disk_gb: number
  monthly_price: number
}

export interface UpgradeResult {
  order: { id: number; ref_no: string; amount: number; status: string }
  auto_approved: boolean
  direction?: "UPGRADE" | "DOWNGRADE"
  before: UpgradeSpec
  after: UpgradeSpec
  amount_charged: number
}

export interface UpgradeLog {
  id: number
  vps_id: number
  order_id: number
  upgrade_type: "PACKAGE" | "CUSTOM"
  before_cores: number
  before_memory_gib: number
  before_disk_gb: number
  before_monthly_price: number
  after_cores: number
  after_memory_gib: number
  after_disk_gb: number
  after_monthly_price: number
  amount_charged: number
  applied_at: string | null
  failed_at: string | null
  fail_reason: string | null
  created_at: string
  order?: { ref_no: string; status: string }
}

export interface UpgradeHistoryResponse {
  logs: UpgradeLog[]
  total: number
  page: number
  limit: number
}

export class UpgradeService extends ApiClient {
  static async upgradePackage(vpsId: number, data: UpgradePackageInput, token: string): Promise<UpgradeResult> {
    return this.post<UpgradeResult>(`/api/vps/${vpsId}/upgrade/package`, data, { token })
  }

  static async upgradeCustom(vpsId: number, data: UpgradeCustomInput, token: string): Promise<UpgradeResult> {
    return this.post<UpgradeResult>(`/api/vps/${vpsId}/upgrade/custom`, data, { token })
  }

  static async getHistory(vpsId: number, token: string): Promise<UpgradeHistoryResponse> {
    return this.get<UpgradeHistoryResponse>(`/api/vps/${vpsId}/upgrade/history`, { token })
  }
}
