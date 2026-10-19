import { ApiClient } from "./client"
import type { TerminalTokenResponse } from "@/types/vps"

export class TerminalService extends ApiClient {
  static async getToken(vpsId: number, token: string): Promise<TerminalTokenResponse> {
    return this.get<TerminalTokenResponse>(`/api/terminal/${vpsId}/token`, { token })
  }
}
