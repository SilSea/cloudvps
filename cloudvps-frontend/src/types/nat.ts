export type Protocol = "TCP" | "UDP" | "BOTH"

// Matches backend nat_port_rules select fields from getInfo
export interface PortRule {
  id: number
  public_port: number
  private_port: number
  protocol: Protocol
  is_system: boolean
}

export interface AddPortRuleInput {
  private_ip: string
  private_port: number
  protocol: Protocol
}

export interface NatInfo {
  nat_allocation: {
    public_ip: string
    port_start: number
    port_end: number
    used_count: number
    available_count: number
  }
  port_rules: PortRule[]
}
