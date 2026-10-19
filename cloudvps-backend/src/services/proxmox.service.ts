import { env } from "../config/env";
import { logger } from "../utils/logger";
import { systemConfigService } from "./system-config.service";

const POLL_INTERVAL_MS = 1000;
const POLL_MAX_TRIES = 300; // 5 minutes

export function parseMemoryMiB(memory: string): number {
  const match = memory.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)/i);
  if (!match) {
    logger.error("parseMemoryMiB: unexpected format — defaulting to 1024 MiB", { memory });
    return 1024;
  }
  const val = parseFloat(match[1]);
  return match[2].toUpperCase() === "GB" ? Math.round(val * 1024) : Math.round(val);
}

// Reads connection config from system_configs DB (admin-editable), falls back to env vars.
async function requireConfig() {
  const [host, tokenId, tokenSecret, node] = await Promise.all([
    systemConfigService.get("proxmox.host"),
    systemConfigService.get("proxmox.token_id"),
    systemConfigService.get("proxmox.token_secret"),
    systemConfigService.get("proxmox.node"),
  ]);

  const h = host || env.proxmox.host;
  const ti = tokenId || env.proxmox.tokenId;
  const ts = tokenSecret || env.proxmox.tokenSecret;
  const n = node || env.proxmox.node;

  if (!h || !ti || !ts || !n) {
    throw new Error(
      "Proxmox not configured: set PROXMOX_HOST, PROXMOX_TOKEN_ID, PROXMOX_TOKEN_SECRET, PROXMOX_NODE"
    );
  }

  return { host: h, tokenId: ti, tokenSecret: ts, node: n };
}

// Picks the OS system volume from qemu-guest-agent get-fsinfo entries.
// Linux reports the root filesystem at mountpoint "/". Windows has no such
// concept — its system drive is conventionally "C:\" ("C:\\" once JSON-escaped),
// with other entries being the cloud-init CD-ROM, EFI System Partition, or
// recovery partitions. Falls back to the largest drive-lettered NTFS volume
// in case the OS drive isn't C: for some template.
export function findPrimaryVolume(entries: any[]): any | null {
  const linuxRoot = entries.find((e) => e.mountpoint === "/");
  if (linuxRoot) return linuxRoot;

  const driveLetterEntries = entries.filter((e) => /^[A-Za-z]:\\?$/.test(e.mountpoint ?? ""));
  const cDrive = driveLetterEntries.find((e) => /^C:\\?$/i.test(e.mountpoint));
  if (cDrive) return cDrive;

  return driveLetterEntries.sort((a, b) => (b["total-bytes"] ?? 0) - (a["total-bytes"] ?? 0))[0] ?? null;
}

// Builds the guest-exec command array to change a Windows local user's password
// via PowerShell's Set-LocalUser (touches the SAM directly — no net1.exe
// subprocess involved, unlike `net user`). Password/username are embedded as
// PowerShell single-quoted string literals inside the script, then the whole
// script is passed via -EncodedCommand (base64 UTF-16LE) so nothing needs to
// survive guest-agent's argv → command-line join or PowerShell's own tokenizer.
// A lone `'` is escaped by doubling (PowerShell single-quote escape) as a
// defensive measure — the app's password/username validation already forbids
// `'` outright, so this should never actually trigger.
export function buildWindowsPasswordChangeCommand(username: string, password: string): string[] {
  const esc = (s: string) => s.replace(/'/g, "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  $s = ConvertTo-SecureString '${esc(password)}' -AsPlainText -Force`,
    `  Set-LocalUser -Name '${esc(username)}' -Password $s`,
    "} catch {",
    "  Write-Error $_.Exception.Message",
    "  exit 1",
    "}",
  ].join("\r\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return [
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-EncodedCommand",
    encoded,
  ];
}

async function pveRequest(
  path: string,
  method = "GET",
  body?: Record<string, string | number | string[]>
): Promise<any> {
  const { host, tokenId, tokenSecret } = await requireConfig();
  // host may be a bare IP ("10.0.0.1") → add https:// and default port 8006,
  // or a full URL ("https://10.0.0.1:8006") → use as-is.
  const baseUrl =
    host.startsWith("http://") || host.startsWith("https://")
      ? host.replace(/\/+$/, "")
      : `https://${host}:8006`;
  const url = `${baseUrl}/api2/json${path}`;

  const options: any = {
    method,
    headers: {
      Authorization: `PVEAPIToken=${tokenId}=${tokenSecret}`,
    },
    // Proxmox uses a self-signed cert by default
    tls: { rejectUnauthorized: false },
  };

  if (body && (method === "POST" || method === "PUT")) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (Array.isArray(v)) {
        for (const item of v) params.append(k, item);
      } else {
        params.append(k, String(v));
      }
    }
    options.body = params;
    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url, options);
  const json: any = await res.json();

  if (!res.ok) {
    const detail = json?.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
    throw new Error(`Proxmox API error on ${method} ${path}: ${detail}`);
  }

  return json?.data;
}

export const proxmoxService = {
  async cloneVm(templateVmid: number, newVmid: number, name: string): Promise<string> {
    const [{ node }, storageOverride] = await Promise.all([
      requireConfig(),
      systemConfigService.get("proxmox.storage"),
    ]);
    const storage = storageOverride || env.proxmox.storage;
    const upid = await pveRequest(`/nodes/${node}/qemu/${templateVmid}/clone`, "POST", {
      newid: newVmid,
      name,
      full: 1,
      storage,
    });
    return upid as string;
  },

  async pollTask(upid: string, maxTries = POLL_MAX_TRIES): Promise<{ ok: boolean; error?: string }> {
    const { node } = await requireConfig();
    const encoded = encodeURIComponent(upid);

    for (let i = 0; i < maxTries; i++) {
      await Bun.sleep(POLL_INTERVAL_MS);
      const data = await pveRequest(`/nodes/${node}/tasks/${encoded}/status`);
      if (data?.status === "stopped") {
        return data.exitstatus === "OK"
          ? { ok: true }
          : { ok: false, error: data.exitstatus };
      }
    }

    return { ok: false, error: `Task timed out after ${maxTries}s` };
  },

  async configureVm(
    vmid: number,
    config: {
      cores: number;
      memoryMiB: number;
      ipconfig0: string;
      ciuser: string;
      cipassword?: string;
      nameserver?: string;
      bridge?: string;
    }
  ): Promise<void> {
    const { node } = await requireConfig();
    const body: Record<string, string | number> = {
      cores: config.cores,
      memory: config.memoryMiB,
      ipconfig0: config.ipconfig0,
      ciuser: config.ciuser,
    };
    if (config.cipassword) body.cipassword = config.cipassword;
    if (config.nameserver) body.nameserver = config.nameserver;
    if (config.bridge) body.net0 = `virtio,bridge=${config.bridge}`;
    await pveRequest(`/nodes/${node}/qemu/${vmid}/config`, "PUT", body);
  },

  // Change OS user password inside a running VM via qemu-guest-agent.
  // Linux: chpasswd via stdin (input-data) — avoids shell quoting issues.
  // Windows: PowerShell Set-LocalUser via -EncodedCommand. `net user` via bare
  // guest-exec looked like it succeeded (exit 0) but silently did NOT change the
  // password — net.exe spawns net1.exe as a child process, which is unreliable
  // in a non-interactive SYSTEM session (no console/window station) like
  // qemu-guest-agent's. Set-LocalUser touches the SAM directly, no subprocess.
  // Requires qemu-guest-agent installed and running inside the VM.
  async changeVmPassword(vmid: number, username: string, password: string, osType: "linux" | "windows"): Promise<void> {
    const { node } = await requireConfig();
    const execBody: Record<string, string | string[]> =
      osType === "windows"
        ? { command: buildWindowsPasswordChangeCommand(username, password) }
        : { command: ["chpasswd"], "input-data": `${username}:${password}\n` };
    const result = await pveRequest(`/nodes/${node}/qemu/${vmid}/agent/exec`, "POST", execBody);
    const pid = result?.pid;
    if (!pid) throw new Error("agent/exec did not return pid");

    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const status = await pveRequest(
        `/nodes/${node}/qemu/${vmid}/agent/exec-status?pid=${pid}`
      );
      if (status?.exited) {
        if ((status["exitcode"] ?? 0) !== 0) {
          throw new Error(`password change failed (exit ${status["exitcode"]}): ${status["err-data"] ?? ""}`);
        }
        return;
      }
    }
    throw new Error("password change timed out after 10s");
  },

  async startVm(vmid: number): Promise<string> {
    const { node } = await requireConfig();
    return (await pveRequest(`/nodes/${node}/qemu/${vmid}/status/start`, "POST")) as string;
  },

  async stopVm(vmid: number): Promise<string> {
    const { node } = await requireConfig();
    // Graceful shutdown with force fallback
    return (await pveRequest(`/nodes/${node}/qemu/${vmid}/status/shutdown`, "POST", {
      forceStop: 1,
    })) as string;
  },

  async rebootVm(vmid: number): Promise<string> {
    const { node } = await requireConfig();
    return (await pveRequest(`/nodes/${node}/qemu/${vmid}/status/reboot`, "POST")) as string;
  },

  async resetVm(vmid: number): Promise<string> {
    const { node } = await requireConfig();
    return (await pveRequest(`/nodes/${node}/qemu/${vmid}/status/reset`, "POST")) as string;
  },

  async getVncProxy(vmid: number): Promise<{ ticket: string; port: number; cert?: string }> {
    const { node } = await requireConfig();
    const data = await pveRequest(`/nodes/${node}/qemu/${vmid}/vncproxy`, "POST", { websocket: 1 });
    return { ticket: data.ticket, port: data.port, cert: data.cert };
  },

  async deleteVm(vmid: number): Promise<void> {
    const { node } = await requireConfig();
    await pveRequest(
      `/nodes/${node}/qemu/${vmid}?purge=1&destroy-unreferenced-disks=1`,
      "DELETE"
    );
  },

  // Update CPU and RAM only (for upgrades — does not touch network/cloud-init config).
  async updateVmResources(vmid: number, cores: number, memoryMiB: number): Promise<void> {
    const { node } = await requireConfig();
    await pveRequest(`/nodes/${node}/qemu/${vmid}/config`, "PUT", {
      cores,
      memory: memoryMiB,
    });
  },

  // Reads the configured size (GB) of a VM disk from its Proxmox config (e.g. "local-lvm:vm-100-disk-0,size=32G").
  // Returns null if the disk isn't configured or the size field can't be parsed.
  async getDiskSizeGb(vmid: number, disk = "scsi0"): Promise<number | null> {
    const { node } = await requireConfig();
    const config = await pveRequest(`/nodes/${node}/qemu/${vmid}/config`);
    const diskConfig: string | undefined = config?.[disk];
    if (!diskConfig) return null;
    const match = diskConfig.match(/size=(\d+(?:\.\d+)?)([GMT])/i);
    if (!match) return null;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === "T") return val * 1024;
    if (unit === "M") return val / 1024;
    return val; // G
  },

  // Resize disk to absolute target size. Proxmox rejects the call entirely if diskGb is not
  // strictly greater than the current size ("shrinking disks is not supported") — most often hit
  // when a package's disk size is smaller than the OS template's actual (cloned) disk size.
  // Skip the call in that case instead of letting Proxmox error out the whole task.
  async resizeDisk(vmid: number, diskGb: number): Promise<void> {
    const { node } = await requireConfig();
    const currentGb = await proxmoxService.getDiskSizeGb(vmid);
    if (currentGb !== null && diskGb <= currentGb) {
      logger.vps("resize_disk_skipped", { vmid, requestedGb: diskGb, currentGb, reason: "target not larger than current disk" });
      return;
    }
    await pveRequest(`/nodes/${node}/qemu/${vmid}/resize`, "PUT", {
      disk: "scsi0",
      size: `${diskGb}G`,
    });
  },

  async getVmStatus(vmid: number): Promise<{
    status: string;
    cpu: number;
    mem: number;
    maxmem: number;
    uptime: number;
  } | null> {
    const { node } = await requireConfig();
    try {
      return await pveRequest(`/nodes/${node}/qemu/${vmid}/status/current`);
    } catch (e: any) {
      logger.vps("get_vm_status_error", { vmid, error: e.message });
      return null;
    }
  },

  // Returns root filesystem usage via qemu-guest-agent get-fsinfo.
  // Returns null if agent is not running or VM is stopped.
  async getVmDiskUsage(vmid: number): Promise<{ used_gb: number; total_gb: number } | null> {
    const { node } = await requireConfig();
    try {
      const result = await pveRequest(`/nodes/${node}/qemu/${vmid}/agent/get-fsinfo`);
      // pveRequest unwraps json.data — Proxmox agent commands wrap array in { result: [...] }
      const entries: any[] = Array.isArray(result) ? result : (result?.result ?? []);
      logger.vps("fsinfo_raw", { vmid, entries: JSON.stringify(entries).slice(0, 300) });
      const root = findPrimaryVolume(entries);
      if (!root) {
        logger.vps("fsinfo_no_root", { vmid, mountpoints: entries.map((e: any) => e.mountpoint) });
        return null;
      }
      return {
        used_gb: Math.round((root["used-bytes"] / (1024 ** 3)) * 100) / 100,
        total_gb: Math.round((root["total-bytes"] / (1024 ** 3)) * 100) / 100,
      };
    } catch (e: any) {
      logger.vps("fsinfo_failed", { vmid, error: e.message });
      return null;
    }
  },

  async ping(): Promise<{ ok: boolean; latencyMs: number }> {
    const t = Date.now();
    try {
      await pveRequest("/version");
      return { ok: true, latencyMs: Date.now() - t };
    } catch {
      return { ok: false, latencyMs: Date.now() - t };
    }
  },

  async getNodeStatus(): Promise<{ maxmem: number; mem: number; cpu: number; maxcpu: number }> {
    const { node } = await requireConfig();
    const data = await pveRequest(`/nodes/${node}/status`);
    // Proxmox /nodes/{node}/status returns memory as nested object { total, used, free }
    // not flat maxmem/mem (those exist on /cluster/resources?type=node)
    return {
      maxmem: data?.memory?.total ?? 0,
      mem:    data?.memory?.used  ?? 0,
      cpu:    data?.cpu           ?? 0,
      maxcpu: data?.maxcpu        ?? 0,
    };
  },

  async getVmList(): Promise<Array<{ vmid: number; maxmem: number; status: string }>> {
    const { node } = await requireConfig();
    const list = await pveRequest(`/nodes/${node}/qemu`);
    return Array.isArray(list) ? list : [];
  },

  async getStorageStatus(): Promise<{ avail: number; total: number; used: number }> {
    const { node } = await requireConfig();
    const storage = (await systemConfigService.get("proxmox.storage")) || env.proxmox.storage;
    if (!storage) throw new Error("Proxmox storage not configured");
    return pveRequest(`/nodes/${node}/storage/${storage}/status`);
  },
};
