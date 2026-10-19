import { ApiClient } from "./client"

export interface NodeSnapshot {
  maxmem_mb: number
  mem_mb: number
  allocated_ram_mb: number
  cpu_pct: number
  total_disk_gb: number
  avail_disk_gb: number
  reserved_ram_mb: number
  reserved_disk_gb: number
  effective_free_ram_mb: number
  effective_free_disk_gb: number
}

export class SystemService extends ApiClient {
  static async getCapacity(token: string): Promise<NodeSnapshot> {
    return this.get<NodeSnapshot>("/api/system/capacity", { token })
  }
}
