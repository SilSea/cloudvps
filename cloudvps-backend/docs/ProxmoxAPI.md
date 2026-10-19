# Proxmox VE API Reference — CloudVPS Phase 4

**Source:** https://pve.proxmox.com/pve-docs/api-viewer/  
**Proxmox VE version:** 8.x  
**Compiled:** 2026-05-02

---

## 1. Connection & Authentication

### Base URL
```
https://{PROXMOX_HOST}:8006/api2/json
```

> **PROX-BUG-1 (fixed 2026-05-08):** `PROXMOX_HOST` may be set as a full URL (`https://10.x.x.x:8006`) instead of a bare host. `proxmox.service.ts` detects this: if the value starts with `http://` or `https://`, it is used as-is (trailing slashes stripped); otherwise `https://` + `:8006` is applied. Set `PROXMOX_HOST` to either format — both work.

### API Token Authentication (used by CloudVPS)
No CSRF token needed — API tokens bypass that requirement.

```
Authorization: PVEAPIToken={PROXMOX_TOKEN_ID}={PROXMOX_TOKEN_SECRET}
```

Where env vars map to:
- `PROXMOX_TOKEN_ID` = `USER@REALM!TOKENID` (e.g. `root@pam!cloudvps`)
- `PROXMOX_TOKEN_SECRET` = UUID (e.g. `aaaaaaaaa-bbbb-cccc-dddd-ef0123456789`)
- `PROXMOX_NODE` = node name (e.g. `pve`)

**Example header:**
```
Authorization: PVEAPIToken=root@pam!cloudvps=aaaaaaaaa-bbbb-cccc-dddd-ef0123456789
```

### TLS
Proxmox self-signed cert by default → set `rejectUnauthorized: false` in fetch or use `NODE_TLS_REJECT_UNAUTHORIZED=0`.

### Required Privileges for CloudVPS token
| Operation | Required Privilege |
|-----------|-------------------|
| Clone VM | `VM.Clone` on source VM + `VM.Allocate` on target |
| Configure VM | `VM.Config.CPU`, `VM.Config.Memory`, `VM.Config.Network`, `VM.Config.Disk` |
| Start/Stop/Reboot | `VM.PowerMgmt` |
| Delete VM | `VM.Allocate` |
| List VMs | `VM.Audit` |

---

## 2. VM (QEMU) Endpoints

All paths are under `/nodes/{node}/qemu`. Replace `{node}` with `PROXMOX_NODE` env var.

---

### GET /nodes/{node}/qemu
List all VMs on node.

**Response:**
```json
{
  "data": [
    { "vmid": 100, "name": "ubuntu-template", "status": "stopped", "cpu": 0, "mem": 0, "maxmem": 2147483648 }
  ]
}
```

---

### POST /nodes/{node}/qemu
Create new VM from scratch (not used for provisioning — use clone instead).

**Key body params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `vmid` | int | ✅ | New VM ID (100–999999999) |
| `name` | string | | VM display name |
| `cores` | int | | CPU cores per socket (default 1) |
| `memory` | int | | RAM in MiB (default 512) |
| `ostype` | string | | `l26` = Linux 2.6+/modern kernel |
| `net0` | string | | Network device (see format below) |
| `scsi0` | string | | Primary disk (see format below) |
| `scsihw` | string | | SCSI controller type: `virtio-scsi-pci` |

---

### POST /nodes/{node}/qemu/{vmid}/clone
Clone VM from template. **Main provisioning entry point for CloudVPS.**

**Path param:** `{vmid}` = template vmid from `os.vmid`

**Body params:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `newid` | int | ✅ | New VM ID for the clone |
| `name` | string | | Name of the new VM |
| `full` | int | | `1` = full clone (independent disk copy), `0` = linked clone |
| `storage` | string | | Target storage ID for full clone disk (e.g. `local-lvm`) |
| `target` | string | | Target node (omit to use same node) |
| `pool` | string | | Resource pool to add VM to |

**Response:** Returns UPID (task ID) — poll task to check completion.
```json
{ "data": "UPID:pve:000A1B2C:12345678:67890ABC:qmclone:100:root@pam:" }
```

**Example:**
```bash
POST /api2/json/nodes/pve/qemu/100/clone
Body: newid=201&name=cloudvps-1&full=1&storage=local-lvm
```

---

### GET /nodes/{node}/qemu/{vmid}/config
Get current VM configuration.

**Response includes:** `cores`, `memory`, `net0`, `scsi0`, `ipconfig0`, `ciuser`, `name`, `ostype`, etc.

---

### PUT /nodes/{node}/qemu/{vmid}/config
Update VM configuration. Used after clone to set CPU/RAM/network/cloud-init.

**Body params (all optional — only send what needs changing):**
| Param | Type | Description |
|-------|------|-------------|
| `cores` | int | CPU cores per socket |
| `memory` | int | RAM in MiB |
| `name` | string | VM display name |
| `net0` | string | Network device (see format) |
| `ipconfig0` | string | Cloud-init IP config (see format) |
| `ciuser` | string | Default login username |
| `cipassword` | string | Login password (prefer sshkeys) |
| `sshkeys` | string | URL-encoded OpenSSH public keys |
| `nameserver` | string | DNS server IP |
| `searchdomain` | string | DNS search domain |

**net0 format:**
```
virtio,bridge=vmbr0,macaddr=AA:BB:CC:DD:EE:FF
```

**ipconfig0 format (cloud-init):**
```
ip=198.51.100.10/24,gw=198.51.100.1        # static IP
ip=dhcp                                   # DHCP
```

**Example — configure after clone:**
```bash
PUT /api2/json/nodes/pve/qemu/201/config
Body: cores=2&memory=4096&ipconfig0=ip%3D198.51.100.10%2F24%2Cgw%3D198.51.100.1&ciuser=ubuntu&cipassword=secret
```

---

### GET /nodes/{node}/qemu/{vmid}/status/current
Get current VM runtime status.

**Response:**
```json
{
  "data": {
    "vmid": 201,
    "name": "cloudvps-1",
    "status": "running",   // "running" | "stopped" | "paused"
    "cpu": 0.05,
    "mem": 1073741824,
    "maxmem": 4294967296,
    "uptime": 3600,
    "qmpstatus": "running"
  }
}
```

---

### POST /nodes/{node}/qemu/{vmid}/status/start
Start VM.

**Body params (optional):**
| Param | Type | Description |
|-------|------|-------------|
| `timeout` | int | Wait timeout in seconds |

**Response:** UPID task string.

---

### POST /nodes/{node}/qemu/{vmid}/status/stop
Force-stop VM (hard power off).

**Body params (optional):**
| Param | Type | Description |
|-------|------|-------------|
| `timeout` | int | Wait timeout in seconds |
| `skiplock` | int | Ignore locks (root only) |

---

### POST /nodes/{node}/qemu/{vmid}/status/shutdown
Graceful shutdown (sends ACPI signal). Preferred over stop for user-initiated halts.

**Body params (optional):**
| Param | Type | Description |
|-------|------|-------------|
| `timeout` | int | Wait timeout (default: 60s) |
| `forceStop` | int | `1` = force stop if shutdown times out |

---

### POST /nodes/{node}/qemu/{vmid}/status/reboot
Reboot VM (graceful restart).

**Body params (optional):**
| Param | Type | Description |
|-------|------|-------------|
| `timeout` | int | Wait timeout in seconds |

---

### DELETE /nodes/{node}/qemu/{vmid}
Delete VM and its disks.

**Query params (optional):**
| Param | Type | Description |
|-------|------|-------------|
| `purge` | int | `1` = remove from backup/replication/HA configs |
| `destroy-unreferenced-disks` | int | `1` = remove disks not referenced in config |

---

## 3. Task Polling

Clone and other long-running operations return a UPID. Poll until status = `stopped`.

### GET /nodes/{node}/tasks/{upid}/status

**Response:**
```json
{
  "data": {
    "upid": "UPID:pve:...",
    "status": "stopped",   // "running" | "stopped"
    "exitstatus": "OK"     // "OK" | error message
  }
}
```

**Poll strategy:** 1s interval, max 5 min timeout. If `exitstatus !== "OK"` → provisioning failed.

---

## 4. CloudVPS Provisioning Flow (API calls sequence)

```
1. POST /nodes/{node}/qemu/{templateVmid}/clone
   Body: { newid, name, full: 1, storage }
   → returns UPID

2. GET /nodes/{node}/tasks/{upid}/status  (poll until stopped + exitstatus=OK)

3. PUT /nodes/{node}/qemu/{newVmid}/config
   Body: { cores, memory, ipconfig0, ciuser, cipassword, nameserver }

4. POST /nodes/{node}/qemu/{newVmid}/status/start
   → returns UPID

5. GET /nodes/{node}/tasks/{upid}/status  (poll until stopped + exitstatus=OK)
```

---

## 5. VM ID Strategy

Proxmox requires unique vmid across the cluster (range 100–999999999).

**CloudVPS convention:** auto-increment from DB or use `vps.id + offset`.  
Safe approach: `GET /nodes/{node}/qemu` → find max vmid → next = max + 1.  
Alternative: use order/vps ID + fixed offset (e.g. `10000 + vps.id`).

---

## 6. Error Responses

All errors return HTTP 4xx/5xx with body:
```json
{ "errors": { "field": "error message" }, "data": null }
```

| HTTP | Meaning |
|------|---------|
| 401 | Auth failed — check token |
| 403 | Permission denied — check token privileges |
| 500 | Internal Proxmox error (check Proxmox logs) |
| 596 | VM locked (another task running) — retry after delay |

---

## 7. Environment Variables (src/config/env.ts)

```typescript
proxmox: {
  host:        process.env.PROXMOX_HOST        // e.g. "192.168.1.10" or "proxmox.example.com"
  tokenId:     process.env.PROXMOX_TOKEN_ID    // e.g. "root@pam!cloudvps"
  tokenSecret: process.env.PROXMOX_TOKEN_SECRET // UUID
  node:        process.env.PROXMOX_NODE        // e.g. "pve"
}
```

All 4 vars are **optional at startup** (SEC-H1) but required at provision time. If any missing → throw at provision call.

---

## Sources
- [Proxmox VE API Documentation](https://pve.proxmox.com/wiki/Proxmox_VE_API)
- [Proxmox API Viewer](https://pve.proxmox.com/pve-docs/api-viewer/)
- [qm(1) man page](https://pve.proxmox.com/pve-docs/qm.1.html)
- [Forum: API clone and start VM](https://forum.proxmox.com/threads/proxmox-api-clone-and-start-vm.91272/)
- [Forum: API automation power ON/OFF](https://forum.proxmox.com/threads/api-automation-power-on-off-vm-and-else.92467/)
