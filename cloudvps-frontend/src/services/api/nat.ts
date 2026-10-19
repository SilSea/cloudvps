import { ApiClient } from "./client"
import type { NatInfo, PortRule, AddPortRuleInput } from "@/types/nat"

export class NatService extends ApiClient {
  static async getPortRules(vpsId: number, token: string): Promise<NatInfo> {
    return this.get<NatInfo>(`/api/vps/${vpsId}/port-rules`, { token })
  }

  static async addPortRule(vpsId: number, data: AddPortRuleInput, token: string): Promise<PortRule> {
    // Backend route schema requires camelCase field names.
    const body = { privateIp: data.private_ip, privatePort: data.private_port, protocol: data.protocol }
    return this.post<PortRule>(`/api/vps/${vpsId}/port-rules`, body, { token })
  }

  static async deletePortRule(vpsId: number, ruleId: number, token: string): Promise<void> {
    return this.delete<void>(`/api/vps/${vpsId}/port-rules/${ruleId}`, { token })
  }
}
