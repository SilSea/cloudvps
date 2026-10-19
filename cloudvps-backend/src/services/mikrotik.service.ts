import { systemConfigService } from "./system-config.service";
import { logger } from "../utils/logger";

async function getMikrotikBase(): Promise<{ host: string; auth: string } | null> {
  const [host, username, password] = await Promise.all([
    systemConfigService.get("mikrotik.host"),
    systemConfigService.get("mikrotik.username"),
    systemConfigService.get("mikrotik.password"),
  ]);
  if (!host || !username || !password) return null;
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return { host, auth };
}

async function mikrotikFetch(method: string, path: string, body?: object): Promise<any> {
  const cfg = await getMikrotikBase();
  if (!cfg) throw new Error("MikroTik credentials not configured in system_configs");

  const res = await fetch(`${cfg.host}/rest${path}`, {
    method,
    headers: {
      Authorization: `Basic ${cfg.auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MikroTik API ${res.status}: ${text}`);
  }

  return res.json();
}

export const mikrotikService = {
  // Creates a DST-NAT firewall rule on MikroTik CHR.
  // Returns the MikroTik internal rule ID (.id field).
  async createNatRule(params: {
    publicIp: string;
    publicPort: number;
    privateIp: string;
    privatePort: number;
    protocol: "tcp" | "udp";
    comment?: string;
  }): Promise<string> {
    const result = await mikrotikFetch("PUT", "/ip/firewall/nat", {
      chain: "dstnat",
      action: "dst-nat",
      protocol: params.protocol,
      "dst-address": params.publicIp,
      "dst-port": String(params.publicPort),
      "to-addresses": params.privateIp,
      "to-ports": String(params.privatePort),
      comment: params.comment ?? `qc-${params.publicPort}`,
    });
    return result[".id"] as string;
  },

  async deleteNatRule(ruleId: string): Promise<void> {
    await mikrotikFetch("DELETE", `/ip/firewall/nat/${ruleId}`);
  },
};
