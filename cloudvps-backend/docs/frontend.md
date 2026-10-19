# Frontend Integration Guide

Last updated: 2026-07-04 (rev 19 — VM Spec RAM field: bare-number parseGib fix + OS_MISMATCH false-positive fix)

This document describes API behaviour changes that require frontend code updates.

---

## 1. Order Creation — New Error Codes (Breaking)

**Endpoint:** `POST /api/orders`

Previously, 3 error cases returned a generic `400` with no specific error code. They now return structured errors with correct HTTP status codes.

### Updated Error Responses

| `error` field | HTTP Status | When |
|---|---|---|
| `PROMO_LIMIT_REACHED` | **409** | Promotion has hit its global usage cap (`max_uses`) |
| `PROMO_USER_LIMIT_REACHED` | **409** | This user has hit their personal usage cap (`max_uses_per_user`) |
| `RENEWAL_PENDING` | **409** | A renewal order for this VPS is already pending payment |

**Previous behaviour:** All 3 fell through to `400` with message `"Error."` — undistinguishable from other failures.

### What Frontend Must Do

Handle these 3 new `error` values explicitly:

```ts
const res = await fetch('/api/orders', { method: 'POST', body: ... });
const body = await res.json();

if (!body.success) {
  switch (body.error ?? '') {
    case 'PACKAGE_NOT_FOUND':   // existing
    case 'PACKAGE_INACTIVE':    // existing
    case 'INVALID_PROMO':       // existing
    case 'PROMO_EXPIRED':       // existing
      showError(body.message);
      break;

    // NEW — handle these explicitly
    case 'PROMO_LIMIT_REACHED':
      showError('โปรโมชั่นนี้ถูกใช้งานครบแล้ว');
      break;
    case 'PROMO_USER_LIMIT_REACHED':
      showError('คุณใช้โปรโมชั่นนี้ครบจำนวนที่กำหนดแล้ว');
      break;
    case 'RENEWAL_PENDING':
      showError('มีคำสั่งต่ออายุรออยู่แล้ว กรุณาชำระเงินหรือยกเลิกก่อน');
      break;

    default:
      showError(body.message ?? 'เกิดข้อผิดพลาด');
  }
}
```

### Response Shape (unchanged)

```json
{
  "success": false,
  "message": "Human-readable message",
  "error": "MACHINE_READABLE_CODE"
}
```

---

## 2. Package List — New `available` Field (Non-Breaking)

**Endpoint:** `GET /api/packages`

Each package object now includes an `available` boolean indicating whether the Proxmox node has sufficient resources to provision it.

### New Field

```ts
interface Package {
  id: number;
  name: string;
  price: number;
  // ... existing fields ...
  available: boolean;  // NEW — true = can provision, false = node too full
}
```

### What Frontend Must Do

- **Disable package cards** where `available === false` so users cannot select them.
- **Do not hide** unavailable packages — show them as greyed-out/disabled so users know they exist.
- The field degrades gracefully: if Proxmox is unreachable or the capacity check is disabled, all packages return `available: true` — the list never breaks.

```ts
const res = await fetch('/api/packages');
const { data: packages } = await res.json();

packages.forEach((pkg) => {
  const card = renderPackageCard(pkg);
  if (!pkg.available) {
    card.classList.add('disabled');
    card.querySelector('button').disabled = true;
    card.querySelector('.badge').textContent = 'ทรัพยากรไม่เพียงพอ';
  }
});
```

### Order Creation Guard

Even when `available: false`, the backend enforces the same capacity check at `POST /api/orders`. If a user somehow bypasses the disabled UI and attempts to order, they will receive:

```json
{
  "success": false,
  "message": "Insufficient Proxmox node resources for this package.",
  "error": "INSUFFICIENT_RESOURCES",
  "detail": {
    "required_ram_mb": 4096,
    "available_ram_mb": 2048,
    "required_disk_gb": 80,
    "available_disk_gb": 45
  }
}
```

Handle this case:

```ts
case 'INSUFFICIENT_RESOURCES':
  showError(
    `ทรัพยากรไม่เพียงพอ — ต้องการ RAM ${body.detail.required_ram_mb} MB ` +
    `(เหลือ ${body.detail.available_ram_mb} MB)`
  );
  break;
```

---

## 3. Order Creation — `INSUFFICIENT_RESOURCES` Error (Breaking)

**Endpoint:** `POST /api/orders`

New error returned when the Proxmox node lacks sufficient RAM or disk to provision the requested package.

| `error` field | HTTP Status | When |
|---|---|---|
| `INSUFFICIENT_RESOURCES` | **409** | Node free RAM or disk is below the package requirement + configured buffer |

**Response includes `detail` object** (unique to this error):

```json
{
  "success": false,
  "message": "Insufficient Proxmox node resources for this package.",
  "error": "INSUFFICIENT_RESOURCES",
  "detail": {
    "required_ram_mb": 4096,
    "available_ram_mb": 2048,
    "required_disk_gb": 80,
    "available_disk_gb": 45
  }
}
```

> **Note:** Under normal conditions this error should never appear in the UI — the package list already marks `available: false` so the order button is disabled. This error acts as a backend safety net.

---

## 4. Health Endpoint — Extended Response (Non-Breaking)

**Endpoint:** `GET /health`

Previously returned `{ status: "ok", ts }`. Now returns per-service diagnostic info.

### New Response Shape

```ts
interface HealthResponse {
  status: "ok" | "degraded";
  ts: string; // ISO 8601
  services: {
    db:      { status: "ok" | "error"; latencyMs: number };
    redis:   { status: "ok" | "error"; latencyMs: number };
    proxmox: { status: "ok" | "error"; latencyMs: number };
  };
}
```

### HTTP Status Codes

| HTTP | Meaning |
|------|---------|
| **200** | All services healthy (`status: "ok"`) |
| **503** | At least one service down (`status: "degraded"`) |

### What Frontend Must Do

- **Uptime monitors / status pages**: check HTTP status code (200 vs 503) — not just `status` field.
- **Debug panels**: can display `services[*].latencyMs` to surface slow dependencies.
- **No auth required**: this endpoint is public and does not need a Bearer token.

### Example — All Healthy

```json
{
  "status": "ok",
  "ts": "2026-06-30T12:00:00.123Z",
  "services": {
    "db":      { "status": "ok", "latencyMs": 12 },
    "redis":   { "status": "ok", "latencyMs": 2 },
    "proxmox": { "status": "ok", "latencyMs": 85 }
  }
}
```

### Example — Proxmox Down

```json
{
  "status": "degraded",
  "ts": "2026-06-30T12:00:00.123Z",
  "services": {
    "db":      { "status": "ok",    "latencyMs": 11 },
    "redis":   { "status": "ok",    "latencyMs": 3 },
    "proxmox": { "status": "error", "latencyMs": 5001 }
  }
}
```

> HTTP **503** is returned in this case.

---

## 5. Payment Submission — Multipart/Form-Data (Breaking)

**Endpoint:** `POST /api/transactions`

Previously accepted `application/json`. Now requires `multipart/form-data`.

### Slip Upload Mode (Admin-Configurable)

The server has two slip upload modes, controlled by the `payment.slip_mode` system config key (set via `PUT /api/system-configs/payment.slip_mode`):

| Mode | Value | How frontend sends slip | What `data.slip_url` contains |
|---|---|---|---|
| **FILE** (default) | `"FILE"` | `slip_file` form field (File object) | URL path e.g. `/uploads/slips/2026-07/abc.jpg` |
| **BASE64** | `"BASE64"` | `slip_image` form field (base64 string) | Raw base64 string |

**Frontend must send the correct field for the active mode.** Ask the backend admin which mode is active, or read it from the system config API.

### What Changed

| Field | Before | After (FILE mode) | After (BASE64 mode) |
|---|---|---|---|
| `order_id` | JSON `number` | Form field `string` (auto-coerced) | Form field `string` |
| `payment_method` | JSON `string` | Form field `string` | Form field `string` |
| `voucher_code` | JSON `string?` | Form field `string?` | Form field `string?` |
| `slip_image` | JSON `string` (base64) | _(ignored in FILE mode)_ | Form field `string` (base64) |
| `slip_file` | _(did not exist)_ | Form file `File?` (image ≤5MB) | _(ignored in BASE64 mode)_ |

### FILE Mode — FormData with File object

```ts
// PROMPTPAY — no slip required
const form = new FormData();
form.append('order_id', String(orderId));
form.append('payment_method', 'PROMPTPAY');
// Optional: attach slip image as proof
// form.append('slip_file', fileInput.files[0]);
await fetch('/api/transactions', {
  method: 'POST',
  // Do NOT set Content-Type — browser sets multipart boundary automatically
  body: form,
});

// SLIP — slip_file required
const form = new FormData();
form.append('order_id', String(orderId));
form.append('payment_method', 'SLIP');
form.append('slip_file', slipFileInput.files[0]);  // required, image ≤5MB
await fetch('/api/transactions', { method: 'POST', body: form });
```

### BASE64 Mode — FormData with base64 string

```ts
// Convert file to base64 first
const toBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res((reader.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

const base64 = await toBase64(slipFileInput.files[0]);

const form = new FormData();
form.append('order_id', String(orderId));
form.append('payment_method', 'SLIP');
form.append('slip_image', base64);  // base64 string, no data URI prefix needed
await fetch('/api/transactions', { method: 'POST', body: form });
```

### New Error Codes

| `error` | HTTP | When |
|---|---|---|
| `SLIP_REQUIRED` | 400 | `payment_method=SLIP` but no slip sent (either `slip_file` or `slip_image` missing for active mode) |
| `INVALID_FILE_TYPE` | 400 | File is not JPEG/PNG/WebP/GIF (FILE mode only) |
| `SLIP_TOO_LARGE` | 400 | File or base64 exceeds 5MB |

### Displaying Slip Images

`data.slip_url` format depends on active mode. Use this helper to display correctly in admin review panels:

```ts
function renderSlip(slip_url: string | null): string | null {
  if (!slip_url) return null;
  // FILE mode: URL path starting with /uploads/
  if (slip_url.startsWith('/uploads/')) return slip_url;
  // BASE64 mode: raw base64 string — prepend data URI
  return `data:image/jpeg;base64,${slip_url}`;
}

// Usage
<img src={renderSlip(transaction.slip_url)} alt="Payment slip" />;
```

---

## 6. Ticket Messages — Multipart/Form-Data (Breaking)

**Endpoint:** `POST /api/tickets/:id/messages`

Previously accepted `application/json`. Now requires `multipart/form-data`.

### What Changed

| Field | Before | After |
|---|---|---|
| `message` | JSON `string` | Form field `string` |
| `is_internal` | JSON `boolean?` | Form field `"true"` / `"false"` (string) |
| `attachments` | JSON array `[{name,mime_type,data}]` | Form files `File[]?` (max 3, each ≤5MB) |

### What Frontend Must Do

```ts
// OLD
await fetch(`/api/tickets/${id}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello', is_internal: false }),
});

// NEW
const form = new FormData();
form.append('message', 'Hello');
form.append('is_internal', 'false');  // string, not boolean
// Optional image attachments (up to 3)
for (const file of attachments) {
  form.append('attachments', file);
}
await fetch(`/api/tickets/${id}/messages`, { method: 'POST', body: form });
```

### Attachment Response Shape

`data.attachments` is now a JSON array (or null if no attachments):

```ts
interface Attachment {
  name: string;       // original filename
  mime_type: string;  // e.g. "image/png"
  url: string;        // e.g. "/uploads/tickets/2026-07/abc.png"
  size: number;       // bytes
}
```

Display attachments as images:
```ts
msg.attachments?.forEach(att => {
  <img src={att.url} alt={att.name} />;
});
```

### New Error Codes

| `error` | HTTP | When |
|---|---|---|
| `TOO_MANY_FILES` | 400 | More than 3 attachments |
| `FILE_TOO_LARGE` | 400 | Any file exceeds 5MB |
| `INVALID_FILE_TYPE` | 400 | File is not JPEG/PNG/WebP/GIF |

---

## 7. Uploaded Files — Public Access

Uploaded files (slips and ticket attachments) are served directly by the server:

```
GET /uploads/slips/{YYYY-MM}/{uuid}.{ext}     — payment slips
GET /uploads/tickets/{YYYY-MM}/{uuid}.{ext}   — ticket attachments
```

- No auth required to access URLs
- **FILE mode**: `transactions.slip_url` contains a `/uploads/...` URL path — use directly as `<img src>`
- **BASE64 mode**: `transactions.slip_url` contains raw base64 — prepend `data:image/jpeg;base64,` before using as `<img src>` (see `renderSlip()` helper in Section 5)
- Ticket attachment `url` values are always URL paths (`/uploads/tickets/...`) — BASE64 mode does not affect ticket attachments
- Path traversal is blocked server-side (403 on `..` in path)

---

## 8. Admin Capacity Snapshot — New `allocated_ram_mb` Field (Non-Breaking)

**Endpoint:** `GET /api/system/capacity` (ADMIN, SUPPORT only)

New field added to the response. Previous fields (`maxmem_mb`, `mem_mb`, `effective_free_ram_mb`) were returning `null` due to a backend bug — this is now fixed.

### Updated Response Shape

```ts
interface NodeSnapshot {
  maxmem_mb: number;         // total physical RAM on Proxmox node (MB)
  mem_mb: number;            // actual RAM in use right now (balloon-adjusted — display only)
  allocated_ram_mb: number;  // NEW — sum of maxmem across all VMs (used for capacity checks)
  cpu_pct: number;
  total_disk_gb: number;
  avail_disk_gb: number;
  reserved_ram_mb: number;   // RAM reserved by unprovisioned pending orders
  reserved_disk_gb: number;
  effective_free_ram_mb: number;  // maxmem_mb - allocated_ram_mb - reserved_ram_mb
  effective_free_disk_gb: number;
}
```

**Display note:** For a capacity dashboard, show `allocated_ram_mb` (not `mem_mb`) as the "in-use" figure — `mem_mb` fluctuates with balloon driver and understates committed resources. `effective_free_ram_mb` is the authoritative "can allocate" value.

### Bug Fixed (was broken previously)

`maxmem_mb`, `mem_mb`, and `effective_free_ram_mb` were returning `null` before this fix due to a field-name mismatch between the backend code and the actual Proxmox API response structure. All fields now return correct numeric values.

---

## 8b. No Other Breaking Changes

All other endpoints and response shapes are **unchanged**. The following fixes are transparent to the frontend:

| Fix | Frontend impact |
|---|---|
| Promo cap enforced inside DB transaction (race condition fix) | None — correct 409 was already expected |
| Transaction approve race condition fix | None — idempotent behaviour unchanged |
| NAT port block allocation race fix | None — internal provisioning only |
| `parseInt` base-10 fix in NAT controller | None — IDs were already decimal |
| Null guard on `vps.order` in NAT controller | None — prevents server crash only |
| Proxmox RAM capacity check always failing (PROX-BUG-1 + BUG-2) | None — capacity check now accurate; `POST /api/orders` may now accept packages it previously wrongly rejected |
| **VPS status passive sync** — `GET /api/vps/:id` and `GET /api/vps/:id/status` now auto-update DB status when Proxmox state differs (e.g. VM stopped/started directly in Proxmox) | None — `live_status` field in response is unchanged; DB sync is internal |
| **Renewal live-status check** — `renew()` now reads actual Proxmox VM state before deciding to start VM, instead of trusting DB `status` field | None — renewal behaviour is correct now; previously could fail if admin manually started VM in Proxmox while DB showed `status=false` |
| **Per-OS default user** — provision now picks `proxmox.default_user.linux` or `proxmox.default_user.windows` based on `os_name` instead of single global key. Same for password change (`confirmPasswordChange`) | None — credential delivery email now shows correct OS username automatically |

---

## 10. VPS Terminal + Power Controls — Phase 12 Frontend Guide

> **สรุปสิ่งที่ frontend ต้องเตรียม:**
> 1. ติดตั้ง `@novnc/novnc` library
> 2. สร้าง VPS detail page ที่มี Live Status panel + Power control buttons + Terminal button
> 3. implement noVNC terminal modal ตาม flow 2 ขั้นตอน (token → WS)
> 4. handle error + reconnect

---

### 10a. สิ่งที่ต้องติดตั้ง

```bash
npm install @novnc/novnc
# หรือถ้าใช้ CDN:
# <script src="https://cdn.jsdelivr.net/npm/@novnc/novnc/core/rfb.js" type="module"></script>
```

noVNC ต้องการ container `<div>` ที่มีขนาด (width/height) ก่อน initialize — ถ้า container size เป็น 0 จะ render ไม่ออก

---

### 10b. RBAC — อะไรแสดงให้ใคร

| Feature | USER | ADMIN | SUPPORT |
|---|---|---|---|
| Live Status (`GET /api/vps/:id/status`) | ✅ (own) | ✅ (any) | ✅ (any) |
| Force Reset (`POST /api/vps/:id/reset`) | ✅ (own) | ✅ (any) | ❌ ซ่อน |
| Terminal button + modal | ✅ (own) | ✅ (any) | ❌ ซ่อน |

---

### 10c. GET /api/vps/:id/status — Live VPS Metrics

เรียกเพื่อแสดง CPU/RAM/uptime แบบ real-time บน VPS detail page

**Response 200:**
```json
{
  "success": true,
  "data": {
    "vpsId": 1,
    "vmid": 200,
    "status": "running",
    "cpu_pct": 4.23,
    "mem_mb": 512,
    "maxmem_mb": 2048,
    "uptime_sec": 86400,
    "disk_used_gb": 3.72,
    "disk_total_gb": 20.0
  }
}
```

> **`disk_used_gb` / `disk_total_gb`** — ดึงจาก QEMU guest agent (`get-fsinfo`) เป็น usage จริงของ root filesystem (`/`) ข้างใน guest OS  
> ค่าเป็น **`null`** เมื่อ: VM stopped / guest agent ไม่ได้ติดตั้ง / agent ยังไม่พร้อม (boot ใหม่)  
> Frontend ต้อง handle `null` — แสดงเป็น `"N/A"` หรือซ่อน disk panel ไว้ก่อน

**Polling strategy — อย่า poll ถี่เกินไป:**
```js
// Poll ทุก 10 วินาที ขณะอยู่ที่ VPS detail page
const interval = setInterval(async () => {
  const r = await api.get(`/vps/${vpsId}/status`);
  if (r.ok) updateStatusPanel(r.data.data);
}, 10_000);

// ต้อง clear เมื่อออกจากหน้า
onUnmount(() => clearInterval(interval));
```

**การแสดงผล:**
```
status       → badge: "running" = green, "stopped" = red, "paused" = yellow
cpu_pct      → progress bar 0-100%
mem_mb       → `${mem_mb} / ${maxmem_mb} MB` หรือเป็น %
uptime_sec   → format เป็น "3d 4h 12m" (ดู helper ด้านล่าง)
disk_used_gb → `${disk_used_gb} / ${disk_total_gb} GB` หรือเป็น %
               ถ้า null → แสดง "N/A" (agent ไม่พร้อม)
```

```ts
// Disk display helper
function renderDisk(used: number | null, total: number | null): string {
  if (used === null || total === null) return 'N/A';
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  return `${used.toFixed(1)} / ${total.toFixed(1)} GB (${pct}%)`;
}
```

**Helper — format uptime:**
```js
function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
}
```

**Error 502** — Proxmox down: แสดง "ไม่สามารถเชื่อมต่อ Proxmox" แทน crash

---

### 10d. POST /api/vps/:id/reset — Force Reset

ACPI hard reset (เทียบเท่ากดปุ่ม reset จริงๆ) — ข้อมูลที่ไม่ได้ save จะหาย

**ต้องมี confirmation dialog ก่อนเสมอ:**
```js
async function handleReset(vpsId) {
  const confirmed = await confirm(
    'Force reset จะ restart VM ทันทีโดยไม่ graceful shutdown\nข้อมูลที่ยังไม่ได้บันทึกอาจสูญหาย\n\nยืนยัน?'
  );
  if (!confirmed) return;

  setLoading(true);
  const r = await api.post(`/vps/${vpsId}/reset`);
  setLoading(false);

  if (r.status === 200) showSuccess('Reset สำเร็จ');
  else if (r.status === 502) showError('Proxmox ไม่ตอบสนอง');
  else showError('เกิดข้อผิดพลาด');
}
```

**Rate limit:** 10 req/min — ถ้า user กด reset ซ้ำเร็ว จะได้ 429, disable ปุ่มหลัง click 5 วินาที

---

### 10e. Terminal — noVNC Flow (2 ขั้นตอน)

#### ขั้นตอนที่ 1: ขอ token (REST)

```
GET /api/terminal/:vps_id/token
Authorization: Bearer {accessToken}
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "eyJ...",
    "expires_in": 30,
    "vnc_password": "<proxmox-vnc-ticket>"
  }
}
```

> **Token อายุ 30 วินาที** — ต้องเปิด WebSocket ทันที อย่า store token ไว้ใช้ทีหลัง
> **`vnc_password`** — ต้องส่งใน `credentialsrequired` event ของ noVNC ถ้าไม่ส่งจะเกิด `password check failed`

#### ขั้นตอนที่ 2: เปิด WebSocket + noVNC

```
WS /api/terminal/:vps_id?token={token}
```

**Full implementation example:**
```js
import RFB from '@novnc/novnc/core/rfb.js';

async function openTerminal(vpsId, containerEl) {
  // Step 1: get token + vnc_password
  let token, vncPassword;
  try {
    const res = await fetch(`/api/terminal/${vpsId}/token`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    if (!res.ok) throw new Error(res.status === 403 ? 'FORBIDDEN' : 'TOKEN_ERROR');
    const { data } = await res.json();
    token = data.token;
    vncPassword = data.vnc_password; // Proxmox VNC ticket — ใช้ใน credentialsrequired
  } catch (e) {
    showError('ไม่สามารถเปิด terminal: ' + e.message);
    return;
  }

  // Step 2: open WebSocket immediately (token expires in 30s)
  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${API_HOST}/api/terminal/${vpsId}?token=${token}`;

  // rfbRef เป็น ref (e.g. useRef) — ต้องเคลียร์ใน disconnect handler ก่อน cleanup
  // เพื่อป้องกัน "Tried changing state of a disconnected RFB" error
  let rfb;
  try {
    rfb = new RFB(containerEl, wsUrl);
    rfb.scaleViewport = true;
    rfb.resizeSession = false; // Proxmox VNC does not support server-side resize — use scaleViewport instead
  } catch (e) {
    showError('noVNC init failed: ' + e.message);
    return;
  }

  rfb.addEventListener('disconnect', (e) => {
    rfb = null; // เคลียร์ทันที ป้องกัน double-disconnect (Bug: "Tried changing state of disconnected RFB")
    const code = e.detail?.code;
    if (code === 4001) showError('Token หมดอายุหรือไม่ถูกต้อง');
    else if (code === 4003) showError('Token ไม่ตรงกับ VPS');
    else if (code === 1011) showError('Backend ไม่สามารถเชื่อมต่อ Proxmox');
    else showInfo('Terminal ถูกปิด');
  });

  rfb.addEventListener('credentialsrequired', () => {
    // Proxmox ใช้ VNC ticket เป็น RFB password — ต้องส่ง vnc_password จาก token response
    rfb.sendCredentials({ password: vncPassword });
  });

  return { getRfb: () => rfb }; // getter แทน direct ref — ป้องกัน stale reference หลัง disconnect เคลียร์ rfb = null
}

function cleanupTerminal(getRfb) {
  try { getRfb()?.disconnect(); } catch {}
}
```

#### WS close codes ที่ต้อง handle:

| Code | ความหมาย | แสดง UI |
|---|---|---|
| `4001` | Token หมดอายุ/ไม่ถูกต้อง | "กรุณาเปิด terminal ใหม่" |
| `4003` | Token ไม่ตรงกับ VPS | "เกิดข้อผิดพลาด กรุณาลองใหม่" |
| `1011` | Backend เชื่อม Proxmox ไม่ได้ | "Proxmox ไม่ตอบสนอง" |
| `1000` / `1001` | ปิดปกติ | "Terminal ถูกปิด" |

---

### 10f. UI Components แนะนำ

**VPS Detail Page — Layout:**
```
┌─────────────────────────────────────────────┐
│  VPS: my-server-01          [running] 🟢     │
├────────────────┬────────────────────────────┤
│  CPU           │  ████░░░░  4.2%            │
│  RAM           │  512 / 2048 MB  25%        │
│  Disk (/)      │  3.7 / 20.0 GB  18%        │
│  Uptime        │  3d 4h 12m                 │
├────────────────┴────────────────────────────┤
│  [Start] [Stop] [Reboot] [Reset ⚠️] [Console]│
└─────────────────────────────────────────────┘
```

> Disk row แสดงเฉพาะเมื่อ `disk_used_gb !== null` — ถ้า null ซ่อน row ไว้หรือแสดง N/A

- **Reset** ใช้สี warning (orange/red) เพราะ destructive action
- **Console** → เปิด modal/drawer ที่มี `<div>` container สำหรับ noVNC

**Terminal Modal:**
```
┌──────────────────────────────────────────────┐
│  Console: my-server-01          [Fullscreen] X│
├──────────────────────────────────────────────┤
│                                              │
│   (noVNC renders here — needs height > 0)   │
│                                              │
└──────────────────────────────────────────────┘
```

> Container div ต้องมี explicit height เช่น `height: 600px` หรือ `height: 80vh` — ถ้า height: auto noVNC จะ render ขนาด 0

---

### 10g. Error States สรุป

| Situation | HTTP | แสดง |
|---|---|---|
| Proxmox down (status/reset/token) | 502 | "ไม่สามารถเชื่อมต่อ server ได้ในขณะนี้" |
| VPS ไม่ใช่ของ user | 403 | "ไม่มีสิทธิ์เข้าถึง" |
| VPS ไม่พบ | 404 | "ไม่พบ VPS" |
| Rate limited (reset) | 429 | "กรุณารอสักครู่ก่อนลองใหม่" |

---

### 10h. Known Issues & Required Frontend Fixes

#### ❌ Issue 1 — `Server did not accept the resize request: Resize is administratively prohibited`

**อาการ:** console spam ซ้ำๆ ทุกครั้งที่ window resize  
**สาเหตุ:** `rfb.resizeSession = true` ทำให้ noVNC ส่ง resize request ไป Proxmox VNC server ซึ่ง standard VNC ไม่รองรับ (SPICE เท่านั้นถึงรองรับ)

**✅ Fix (frontend):**
```js
// ❌ Wrong
rfb.resizeSession = true;

// ✅ Correct
rfb.resizeSession = false;   // ไม่ขอ server resize
rfb.scaleViewport = true;    // scale canvas ใน browser แทน
```

---

#### ❌ Issue 2 — ล็อคอิน OS ใน web terminal ไม่ได้ (แต่ Proxmox console ได้)

**อาการ:** พิมพ์รหัสผ่านที่ถูกต้องใน web terminal แล้ว login fail — แต่ Proxmox console ได้  
**สาเหตุ:** backend WebSocket ไม่ได้ระบุ `"binary"` subprotocol ตอน connect ไป Proxmox VNC WebSocket — ทำให้ Proxmox อาจใช้ encoding ที่ต่างออกไป ส่งผลให้ keyboard events ที่ส่งผ่านไป VM ผิดเพี้ยน

**✅ Fix (backend — แก้แล้วใน commit `71dc7d8`):** backend ระบุ `protocols: ["binary"]` แล้ว  
**Frontend ไม่ต้องแก้อะไร** — แค่ deploy backend ใหม่

---

#### ⚠️ Issue 3 — Keyboard input ไม่ทำงานหลัง click นอก terminal

**อาการ:** พิมพ์อะไรไม่ได้หลัง user click ออกนอก terminal canvas แล้วกลับมา  
**สาเหตุ:** noVNC canvas หมด keyboard focus  

**✅ Fix (frontend):**
```js
// เพิ่ม click handler บน container เพื่อ refocus
containerEl.addEventListener('click', () => {
  containerEl.querySelector('canvas')?.focus();
});

// หรือตั้งค่า focusOnClick (noVNC ≥ 1.4)
rfb.focusOnClick = true;
```

---

#### ⚠️ Issue 4 — Container height = 0 → terminal ไม่ render

**อาการ:** เปิด terminal แล้วเห็นแค่หน้าดำ / ว่างเปล่า  
**สาเหตุ:** `<div>` container ของ noVNC ไม่มี explicit height  

**✅ Fix (frontend):**
```css
/* ❌ Wrong */
.terminal-container { height: auto; }

/* ✅ Correct */
.terminal-container { height: 600px; }
/* หรือ */
.terminal-container { height: 80vh; }
```

noVNC ต้องการ container ที่มี `clientHeight > 0` ก่อน initialize — ถ้าใช้ modal ต้องรอให้ modal fully visible ก่อนสร้าง `RFB`

---

#### ⚠️ Issue 5 — `Tried changing state of a disconnected RFB`

**อาการ:** error ใน console หลัง terminal disconnect  
**สาเหตุ:** cleanup code เรียก `rfb.disconnect()` บน object ที่ disconnect ไปแล้ว  

**✅ Fix (frontend):**
```js
rfb.addEventListener('disconnect', () => {
  rfb = null; // เคลียร์ก่อน ป้องกัน double-call
  // ทำ cleanup อื่นๆ ต่อ
});

function cleanupTerminal() {
  if (rfb) {           // ตรวจก่อนเสมอ
    try { rfb.disconnect(); } catch {}
    rfb = null;
  }
}
```

---

#### ❌ Issue 6 — Numpad + Delete key เพี้ยน

**อาการ:** กด numpad 7 ได้ `Home`, กด Delete ได้ `Backspace`, ตัวเลข numpad ออกมาเป็น arrow key  
**สาเหตุ:** browser keyboard API ส่ง keysym ผิดสำหรับ special keys — เป็น limitation ของ Web keyboard API + noVNC ไม่ใช่ backend issue

**✅ Fix 1 — บังคับ keyboard จาก noVNC ใช้ `event.code` แทน `event.key`:**

noVNC 1.4+ มี option `rfb._keyboard` ที่ไม่ expose ใน public API แต่สามารถ patch ได้:

```js
rfb = new RFB(containerEl, wsUrl);

// หลัง rfb สร้างแล้ว — patch keyboard handler ให้ใช้ event.code
// (ทำงานกับ noVNC >= 1.3)
const origOnKey = rfb._keyboard._onKeyEvent?.bind(rfb._keyboard);
// ไม่ควร patch internal — ดู Fix 2 แทน
```

**✅ Fix 2 (แนะนำ) — interceptKey ก่อนส่งให้ noVNC:**

```js
containerEl.addEventListener('keydown', (e) => {
  // Numpad: บังคับให้ส่ง number แทน navigation key เมื่อ NumLock off
  const numpadMap: Record<string, string> = {
    'Numpad0': 'Insert',   'Numpad1': 'End',
    'Numpad2': 'ArrowDown','Numpad3': 'PageDown',
    'Numpad4': 'ArrowLeft','Numpad5': 'Clear',
    'Numpad6': 'ArrowRight','Numpad7': 'Home',
    'Numpad8': 'ArrowUp',  'Numpad9': 'PageUp',
    'NumpadDecimal': 'Delete',
  };
  // noVNC handles this internally — see Fix 3
}, true);
```

**✅ Fix 3 (ถูกต้องที่สุด) — ใช้ noVNC built-in keyboard event ผ่าน canvas focus + ปิด browser shortcut intercept:**

```js
rfb = new RFB(containerEl, wsUrl);
rfb.scaleViewport = true;
rfb.resizeSession = false;
rfb.focusOnClick = true;

// สำคัญ: ป้องกัน browser intercept ปุ่มก่อน noVNC รับ
containerEl.addEventListener('keydown', (e) => {
  // ป้องกัน browser กิน Delete, Backspace, arrow keys
  if (['Delete','Backspace','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
       'Tab','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'].includes(e.key)) {
    e.preventDefault(); // ป้องกัน browser navigate/refresh
    // noVNC จะ handle keyboard event ผ่าน canvas เอง
  }
}, true); // useCapture = true — intercept ก่อน bubble
```

**✅ Fix 4 — NumLock workaround:**

Numpad เพี้ยนมักเกิดเมื่อ NumLock OFF บน host → browser ส่ง navigation keysym แทน number:

```js
// แจ้ง user ให้กด NumLock ก่อนใช้ numpad
// หรือแสดง badge เตือนใน terminal toolbar
const numLockWarning = document.createElement('div');
numLockWarning.textContent = '⚠️ กด NumLock ก่อนใช้ตัวเลข numpad';
numLockWarning.style.cssText = 'font-size:11px;color:#fbbf24;padding:2px 8px';
terminalToolbar.appendChild(numLockWarning);
```

---

#### สรุป — Frontend Checklist สำหรับ terminal

| # | สิ่งที่ต้องแก้ | Priority |
|---|---|---|
| 1 | `rfb.resizeSession = false` | **ต้องแก้** — spam console |
| 2 | Backend binary subprotocol | ✅ แก้แล้ว (backend) |
| 3 | `rfb.focusOnClick = true` หรือ click handler | **ต้องแก้** |
| 4 | Container height explicit (ไม่ใช่ `auto`) | **ต้องแก้** ถ้า terminal ดำ |
| 5 | `rfb = null` ใน disconnect handler | **ต้องแก้** |
| 6 | Numpad + Delete เพี้ยน → `preventDefault` บน special keys + NumLock hint | **ต้องแก้** |
| 7 | Special Keys Menu (Ctrl+Alt+Del, Win key, Alt+Tab, ...) — ดู §10i | **ต้องเพิ่ม** — จำเป็นสำหรับ Windows VPS |

---

### 10i. Special Keys Menu (Ctrl+Alt+Del ฯลฯ) — สำคัญมากสำหรับ Windows VPS

**ทำไมต้องมี:** ปุ่มลัดบางตัว (Ctrl+Alt+Del, Alt+Tab, Win key, Alt+F4, PrtScn) ถูก browser/OS ดักไว้ก่อนถึง JS เสมอ — พิมพ์ผ่าน keyboard จริงไม่ได้ผลใน canvas ของ noVNC ต้อง "synthesize" ส่ง keysym ตรงเข้า VNC session แทน. **นี่คือ frontend-only feature — backend proxy เป็น raw byte passthrough อยู่แล้ว ไม่ต้องแก้อะไรฝั่ง backend**

**Ctrl+Alt+Del — ใช้ built-in method ของ noVNC ตรงๆ:**
```js
function sendCtrlAltDel(getRfb) {
  getRfb()?.sendCtrlAltDel();
}
```

**ปุ่มอื่นๆ — ใช้ `rfb.sendKey(keysym, code, down)` ส่ง keydown/keyup เอง:**

```js
import keysyms from '@novnc/novnc/core/input/keysymdef.js';

// กด modifier ค้าง → กด key → ปล่อย key → ปล่อย modifier (เรียงย้อนกลับ)
function sendCombo(getRfb, keysymList) {
  const rfb = getRfb();
  if (!rfb) return;
  keysymList.forEach((k) => rfb.sendKey(k, null, true));   // keydown ทุกตัวตามลำดับ
  [...keysymList].reverse().forEach((k) => rfb.sendKey(k, null, false)); // keyup ย้อนกลับ
}

const KEYSYM = {
  CTRL_L: 0xffe3, ALT_L: 0xffe9, SHIFT_L: 0xffe1,
  SUPER_L: 0xffeb,        // Windows key
  DELETE: 0xffff, ESCAPE: 0xff1b, TAB: 0xff09,
  F4: 0xffc1, PRINT: 0xff61,
};

const specialKeys = [
  { label: 'Ctrl+Alt+Del',   action: (get) => sendCtrlAltDel(get) },
  { label: 'Windows key',    action: (get) => sendCombo(get, [KEYSYM.SUPER_L]) },
  { label: 'Alt+Tab',        action: (get) => sendCombo(get, [KEYSYM.ALT_L, KEYSYM.TAB]) },
  { label: 'Alt+F4',         action: (get) => sendCombo(get, [KEYSYM.ALT_L, KEYSYM.F4]) },
  { label: 'Ctrl+Esc',       action: (get) => sendCombo(get, [KEYSYM.CTRL_L, KEYSYM.ESCAPE]) }, // Start menu (สำรอง — เผื่อ Win key โดน OS/แถบ browser ดักก่อน)
  { label: 'Esc',            action: (get) => sendCombo(get, [KEYSYM.ESCAPE]) },
  { label: 'Print Screen',   action: (get) => sendCombo(get, [KEYSYM.PRINT]) },
];
```

**UI แนะนำ — toolbar เหนือ terminal canvas:**
```
┌──────────────────────────────────────────────────────┐
│ [Ctrl+Alt+Del] [⊞ Win] [Alt+Tab] [Alt+F4] [Esc] [⋮]   │
├──────────────────────────────────────────────────────┤
│                                                        │
│              (noVNC canvas)                           │
│                                                        │
└──────────────────────────────────────────────────────┘
```
- ปุ่มที่ใช้บ่อย (Ctrl+Alt+Del, Windows key) โชว์ตรงๆ; ที่เหลือพับใน dropdown `⋮` ก็ได้
- ปุ่มต้องกดได้แม้ canvas ไม่มี focus — `action` เรียก `rfb.sendKey()` ตรงๆ ไม่ผ่าน real keyboard event เลย
- Mobile/touch: เมนูนี้จำเป็นมาก เพราะจอสัมผัสไม่มีปุ่ม Ctrl/Alt/Win ให้กดค้างจริง

**ข้อควรระวัง:** `rfb.sendKey()` ต้อง import จาก noVNC core (`@novnc/novnc/core/rfb.js`) เวอร์ชันเดียวกับที่ใช้สร้าง `RFB` instance — เช็ค version ที่ล็อกไว้ใน `package.json` ของ frontend ก่อนใช้ keysym list ด้านบน (path ของ `keysymdef.js` อาจต่างกันตาม noVNC version)

---

---

## 11. VPS Password Change — Phase 16 Frontend Guide

> **สรุปสิ่งที่ frontend ต้องทำ:**
> 1. แสดงหน้า VPS detail ให้มี "เปลี่ยนรหัสผ่าน" button
> 2. กด request OTP → รอ email → user กรอก OTP + new password → confirm
> 3. handle error states ทั้งหมด
> 4. Credential delivery ผ่าน email — frontend ไม่ต้องทำ (backend ส่งเอง)

---

### 11a. RBAC — ใครทำอะไรได้

| Feature | USER | ADMIN | SUPPORT |
|---|---|---|---|
| เปลี่ยนรหัสผ่าน VPS ตัวเอง | ✅ | ✅ (any) | ❌ |

---

### 11b. Flow เปลี่ยนรหัสผ่าน (2 ขั้นตอน)

#### ขั้นตอนที่ 1: ขอ OTP

```
POST /api/vps/:id/change-password/request
Authorization: Bearer {accessToken}
```

- ไม่ต้อง body
- ระบบส่ง 6-digit OTP ไปที่ email ที่ลงทะเบียน
- OTP หมดอายุใน **5 นาที**
- ถ้า request ใหม่ก่อน OTP เดิมหมดอายุ — OTP เดิมจะถูก replace

**Response 200:**
```json
{ "success": true, "data": { "message": "OTP sent" } }
```

**Error responses:**

| HTTP | ความหมาย |
|---|---|
| 404 | VPS ไม่พบ |
| 403 | VPS ไม่ใช่ของ user |
| 502 | ส่ง email ไม่สำเร็จ (SMTP error) |

#### ขั้นตอนที่ 2: ยืนยัน OTP + รหัสผ่านใหม่

```
POST /api/vps/:id/change-password/confirm
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "otp": "123456",
  "new_password": "MyNewPass123!"
}
```

**Password rules:**
- อย่างน้อย 8 ตัวอักษร สูงสุด 64 ตัว
- ห้ามมี newline (`\n`, `\r`) และ null byte (`\0`) — อักขระอื่นทุกตัวใช้ได้

**Response 200:**
```json
{ "success": true, "data": { "message": "Password changed" } }
```

**Error responses:**

| HTTP | `message` | ความหมาย |
|---|---|---|
| 400 | "Password must be 8-64 characters..." | รหัสผ่านไม่ผ่าน validation |
| 400 | "OTP expired. Please request a new one." | OTP หมดอายุ (ผ่าน 5 นาที) หรือยังไม่เคย request |
| 400 | "Invalid OTP." | OTP ไม่ถูกต้อง (เหลือโอกาสอีก N ครั้ง) |
| 429 | "Too many incorrect OTP attempts. Request a new OTP." | ลองผิดครบ 5 ครั้ง → ต้อง request OTP ใหม่ |
| 502 | "Failed to change password in VM." | qemu-guest-agent error หรือ VM ไม่ running |

---

### 11c. Implementation Example

```ts
// ── ขั้นตอนที่ 1: Request OTP ──────────────────────────────────────────────
async function requestPasswordChange(vpsId: number) {
  setLoading(true);
  try {
    const res = await api.post(`/vps/${vpsId}/change-password/request`);
    if (res.status === 200) {
      setStep('enterOtp');
      showInfo('OTP ถูกส่งไปยัง email ของคุณแล้ว (หมดอายุใน 5 นาที)');
    } else if (res.status === 502) {
      showError('ระบบ email ขัดข้อง กรุณาลองใหม่อีกครั้ง');
    } else {
      showError(res.data?.message ?? 'เกิดข้อผิดพลาด');
    }
  } finally {
    setLoading(false);
  }
}

// ── ขั้นตอนที่ 2: Confirm OTP + new password ───────────────────────────────
async function confirmPasswordChange(vpsId: number, otp: string, newPassword: string) {
  setLoading(true);
  try {
    const res = await api.post(`/vps/${vpsId}/change-password/confirm`, {
      otp,
      new_password: newPassword,
    });

    if (res.status === 200) {
      showSuccess('เปลี่ยนรหัสผ่านสำเร็จ');
      closeModal();
      return;
    }

    // Handle all error cases
    const msg = res.data?.message ?? '';
    if (res.status === 400 && msg.includes('8-64')) {
      showError('รหัสผ่านต้องมี 8-64 ตัวอักษร');
    } else if (res.status === 400 && msg.includes('expired')) {
      showError('OTP หมดอายุ กรุณาขอ OTP ใหม่');
      setStep('requestOtp');
    } else if (res.status === 400 && msg.includes('Invalid OTP')) {
      showError('OTP ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง');
    } else if (res.status === 429) {
      showError('ลองผิดครบ 5 ครั้ง กรุณาขอ OTP ใหม่');
      setStep('requestOtp');
    } else if (res.status === 502) {
      showError('ไม่สามารถเปลี่ยนรหัสผ่านใน VM ได้ — ตรวจสอบว่า VM กำลัง running');
    } else {
      showError(msg || 'เกิดข้อผิดพลาด');
    }
  } finally {
    setLoading(false);
  }
}
```

---

### 11d. UI Flow แนะนำ

```
VPS Detail Page
  └── [เปลี่ยนรหัสผ่าน] button → เปิด Modal

Modal — Step 1: Request OTP
  ┌────────────────────────────────────────────┐
  │  เปลี่ยนรหัสผ่าน VPS                        │
  │                                            │
  │  ระบบจะส่ง OTP ไปที่ email ของคุณ           │
  │  email: u***@example.com (masked)          │
  │                                            │
  │  [ส่ง OTP]  [ยกเลิก]                       │
  └────────────────────────────────────────────┘

Modal — Step 2: Enter OTP + New Password
  ┌────────────────────────────────────────────┐
  │  ยืนยันการเปลี่ยนรหัสผ่าน                  │
  │                                            │
  │  OTP (6 หลัก): [_][_][_][_][_][_]         │
  │  รหัสผ่านใหม่:  [________________]          │
  │  ยืนยันรหัสผ่าน: [________________]         │
  │                                            │
  │  OTP หมดอายุใน: 4:32 ⏱                    │
  │                                            │
  │  [ยืนยัน]  [ขอ OTP ใหม่]  [ยกเลิก]        │
  └────────────────────────────────────────────┘
```

**UX Notes:**
- Mask email ในหน้า "ส่ง OTP" เช่น `u***@example.com` — backend ไม่ส่ง email มาใน response (ไม่เปิดเผย email โดยตรง)
- Countdown timer 5 นาทีใน UI (ไม่ใช่ server-side) — เมื่อหมดให้แสดง "OTP หมดอายุ กรุณาขอใหม่" และ disable ปุ่ม confirm
- "ขอ OTP ใหม่" — ส่ง request ใหม่และ reset countdown
- ตรวจสอบ `new_password === confirmPassword` ฝั่ง frontend ก่อน submit เสมอ

---

### 11e. Error States สรุป

| Situation | HTTP | UI |
|---|---|---|
| VPS ไม่พบ | 404 | "ไม่พบ VPS" — ปิด modal |
| VPS ไม่ใช่ของ user | 403 | "ไม่มีสิทธิ์" — ปิด modal |
| Email ส่งไม่สำเร็จ | 502 | "ระบบ email ขัดข้อง ลองใหม่อีกครั้ง" |
| รหัสผ่านไม่ถูกรูปแบบ | 400 | "รหัสผ่านต้องมี 8-64 ตัวอักษร" |
| OTP หมดอายุ | 400 | "OTP หมดอายุ" → กลับ step 1 |
| OTP ผิด | 400 | "OTP ไม่ถูกต้อง" |
| ลองผิดครบ 5 ครั้ง | 429 | "ลองผิดครบ 5 ครั้ง กรุณาขอ OTP ใหม่" → step 1 |
| VM ไม่ running หรือ guest agent ไม่ทำงาน | 502 | "ไม่สามารถเปลี่ยนรหัสผ่านได้ ตรวจสอบว่า VPS กำลัง running" |

---

## 12. Admin — Per-OS Default Username (System Config)

> **ใครต้องอ่าน:** Admin panel เท่านั้น — user panel ไม่ได้รับผลกระทบ

Admin ตั้งค่า network bridge + default OS username ผ่าน system_configs — แยกตาม IP type และ OS type:

### Network Bridge (แยก Public / Private)

| Key | Default | ใช้กับ |
|---|---|---|
| `proxmox.bridge.public` | `vmbr0` | VM ที่ใช้ Public IP |
| `proxmox.bridge.private` | `vmbr1` | VM ที่ใช้ Private IP |

**Backend เลือก bridge** จาก `ipAlloc.type` ตอน provision — `"PUBLIC"` ใช้ `proxmox.bridge.public`, `"PRIVATE"` ใช้ `proxmox.bridge.private`

Bridge ถูก set ผ่าน Proxmox `net0: virtio,bridge=<bridge>` ตอน `configureVm()` — MAC address จะ auto-assign ใหม่ทุกครั้งที่ provision

```
PUT /api/system-configs/proxmox.bridge.public   → { "value": "vmbr0" }
PUT /api/system-configs/proxmox.bridge.private  → { "value": "vmbr1" }
```

**Admin Panel — แนะนำ UI (Network section):**
```
┌──────────────────────────────────────────────────────┐
│  Network Bridge                                      │
│                                                      │
│  Public IP VMs:  [vmbr0]  (e.g. vmbr0)              │
│  Private IP VMs: [vmbr1]  (e.g. vmbr1, vmbr100)     │
│                                                      │
│  ℹ️ ใช้กับ VM ที่ provision ใหม่เท่านั้น              │
│     VM ที่ provision แล้วต้องแก้ใน Proxmox โดยตรง    │
│                                                      │
│  [บันทึก]                                            │
└──────────────────────────────────────────────────────┘
```

---

### Default OS Username (แยก Linux / Windows)

Admin ตั้งค่า default OS username ผ่าน system_configs ได้ 2 keys แยกตาม OS type:

| Key | Default | ใช้กับ |
|---|---|---|
| `proxmox.default_user.linux` | `root` | Linux VMs ทุก distro (Ubuntu, Debian, CentOS, ฯลฯ) |
| `proxmox.default_user.windows` | `Administrator` | Windows VMs (os_name มีคำว่า "windows") |

**Backend detect OS type:** ใช้ regex `/windows/i` บน `os_name` ของ package — ถ้าไม่ match ถือว่า Linux

### ตั้งค่าผ่าน API

```
PUT /api/system-configs/proxmox.default_user.linux
Authorization: Bearer {adminToken}
Content-Type: application/json

{ "value": "ubuntu" }
```

```
PUT /api/system-configs/proxmox.default_user.windows
Authorization: Bearer {adminToken}
Content-Type: application/json

{ "value": "Administrator" }
```

### อ่านค่าปัจจุบัน

```
GET /api/system-configs?category=proxmox
Authorization: Bearer {adminToken}
```

Response จะมี entry ทั้ง 2 keys อยู่ใน `data` array

### Admin Panel — แนะนำ UI

ใน System Config page (proxmox category) ให้แสดง input สำหรับ 2 keys นี้:

```
┌─────────────────────────────────────────────────────┐
│  Default OS Username                                 │
│                                                     │
│  Linux VMs:   [root          ]  (e.g. root, ubuntu) │
│  Windows VMs: [Administrator ]                      │
│                                                     │
│  ℹ️ ค่านี้ใช้เป็น cloud-init user ตอน provision VPS  │
│     และ target user ตอน เปลี่ยนรหัสผ่าน              │
│                                                     │
│  [บันทึก]                                            │
└─────────────────────────────────────────────────────┘
```

### ผลกระทบ

| จุด | ผลกระทบ |
|---|---|
| VPS provisioning | `ciuser` ที่ set ใน cloud-init ใช้ค่า key ที่ตรง OS type |
| Email credential delivery | Email ที่ส่งหลัง provision แสดง username จาก key ที่ตรง |
| Password change (confirm OTP) | เรียก guest-agent command ตาม OS: Linux ใช้ `chpasswd`, Windows ใช้ PowerShell `Set-LocalUser` — username มาจาก key ที่ตรง OS type. **ต้องเปิด VPS อยู่เท่านั้น** — guest-agent เป็น service ในตัว OS เอง ปิดเครื่อง = ไม่มี agent ให้เรียก |

> **หมายเหตุ:** การเปลี่ยน key หลัง provision แล้ว **ไม่ย้อนหลัง** — VPS ที่ provision ไปแล้วใช้ username เดิมอยู่ ต้องเปลี่ยนรหัสผ่านผ่าน in-app change password หรือ console ด้วยตัวเอง

---

## 13. VPS Upgrade — Billing Breakdown (Non-Breaking)

> **ใครต้องอ่าน:** หน้า upgrade + ประวัติการสั่งซื้อ

### 13a. Create Upgrade Response — ใหม่: `billing` object

**Endpoints:**
- `POST /api/vps/:id/upgrade/package`
- `POST /api/vps/:id/upgrade/custom`

เพิ่ม `billing` ใน response เพื่อแสดง breakdown ส่วนลดจาก package เดิม:

```json
{
  "success": true,
  "data": {
    "order": { ... },
    "auto_approved": false,
    "direction": "UPGRADE",
    "before": { "cores": 2, "memory_gib": 2, "disk_gb": 40, "monthly_price": 500 },
    "after":  { "cores": 4, "memory_gib": 4, "disk_gb": 80, "monthly_price": 800 },
    "amount_charged": 200,
    "billing": {
      "days_remaining": 20,
      "period_days": 30,
      "new_subtotal": 533.33,
      "old_credit": 333.33,
      "amount_charged": 200
    }
  }
}
```

**Math:**
```
new_subtotal = afterPrice × (days_remaining / period_days)   // ค่า package ใหม่ช่วงที่เหลือ
old_credit   = beforePrice × (days_remaining / period_days)  // ส่วนที่จ่ายไปแล้วยังไม่ได้ใช้
amount_charged = ceil(new_subtotal - old_credit)             // ยอดที่ต้องชำระจริง
```

**กรณี Downgrade:** `old_credit > new_subtotal` → `amount_charged = 0` (ไม่มี refund, คิดเงินรอบหน้าน้อยลง)

### 13b. แสดง Billing Breakdown ใน UI

```ts
function renderBilling(billing: {
  days_remaining: number;
  period_days: number;
  new_subtotal: number;
  old_credit: number;
  amount_charged: number;
} | null) {
  if (!billing) return null;
  return {
    label: `ยอดชำระ (เหลือ ${billing.days_remaining}/${billing.period_days} วัน)`,
    rows: [
      { label: 'ค่า package ใหม่ (ช่วงที่เหลือ)', value: `฿${billing.new_subtotal.toFixed(2)}` },
      { label: 'ส่วนลดจาก package เดิม',           value: `-฿${billing.old_credit.toFixed(2)}` },
      { label: 'ยอดชำระสุทธิ',                      value: `฿${billing.amount_charged}` },
    ],
  };
}
```

**UI mockup:**
```
┌──────────────────────────────────────────────────────┐
│  อัพเกรด: Basic → Pro                                │
│                                                      │
│  ค่า package ใหม่ (เหลือ 20/30 วัน)    ฿533.33       │
│  ส่วนลดจาก package เดิม               -฿333.33       │
│  ─────────────────────────────────────────────────── │
│  ยอดชำระสุทธิ                           ฿200.00       │
│                                                      │
│  [ยืนยันอัพเกรด]                                     │
└──────────────────────────────────────────────────────┘
```

---

### 13c. Upgrade History — `billing` ใน GET /api/vps/:id/upgrades

**Endpoint:** `GET /api/vps/:id/upgrades`

ประวัติแต่ละรายการมี `billing` object (หรือ `null` สำหรับ log เก่าก่อน feature นี้):

```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 5,
        "upgrade_type": "PACKAGE",
        "before_cores": 2,
        "before_memory_gib": 2,
        "before_disk_gb": 40,
        "before_monthly_price": 500,
        "after_cores": 4,
        "after_memory_gib": 4,
        "after_disk_gb": 80,
        "after_monthly_price": 800,
        "amount_charged": 200,
        "billing": {
          "days_remaining": 20,
          "period_days": 30,
          "new_subtotal": 533.33,
          "old_credit": 333.33,
          "amount_charged": 200
        },
        "applied_at": "2026-07-02T10:00:00.000Z",
        "created_at": "2026-07-02T09:58:00.000Z",
        "order": { "ref_no": "QC-20260702-ABC123", "status": "PAID" }
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  }
}
```

**`billing` เป็น `null`** สำหรับ log ที่สร้างก่อน feature นี้ — ให้ fallback แสดงแค่ `amount_charged`:

```ts
function renderUpgradeHistory(log) {
  if (log.billing) {
    return (
      <>
        <div>ค่า package ใหม่: ฿{log.billing.new_subtotal.toFixed(2)}</div>
        <div>ส่วนลด package เดิม: -฿{log.billing.old_credit.toFixed(2)}</div>
        <div>ยอดชำระ: ฿{log.billing.amount_charged}</div>
      </>
    );
  }
  return <div>ยอดชำระ: ฿{log.amount_charged}</div>;
}
```

---

## 14. Unit Pricing — GET /api/system-configs/pricing

> **ใครต้องอ่าน:** หน้า Custom Upgrade form ทุก role ที่ login แล้วเรียกได้

Endpoint นี้เปิด unit pricing ให้ frontend คำนวณ cost preview แบบ real-time ก่อน submit

### RBAC

| Role | เข้าถึงได้ |
|---|---|
| USER | ✅ |
| SUPPORT | ✅ |
| ADMIN | ✅ |
| ไม่ login | ❌ 401 |

### Request

```
GET /api/system-configs/pricing
Authorization: Bearer {accessToken}
```

### Response 200

```json
{
  "success": true,
  "data": {
    "cpu_per_core": 50,
    "ram_per_gib": 30,
    "disk_per_gb": 5
  }
}
```

ถ้า admin ยังไม่ตั้งค่า key ใด field นั้นจะเป็น `null`:

```json
{
  "success": true,
  "data": {
    "cpu_per_core": null,
    "ram_per_gib": null,
    "disk_per_gb": null
  }
}
```

> ถ้า field เป็น `null` → ซ่อน custom upgrade preview หรือแสดง "ยังไม่เปิดใช้ custom upgrade"

---

### คำนวณ Cost Preview (client-side)

ใช้ **สูตรเดียวกับ backend** (`upgrade.service.ts`):

```ts
// pricing มาจาก GET /api/system-configs/pricing
function calcUpgradeCost(
  current:  { cores: number; memory_gib: number; disk_gb: number },
  after:    { cores: number; memory_gib: number; disk_gb: number },
  pricing:  { cpu_per_core: number; ram_per_gib: number; disk_per_gb: number },
  expiredAt: string  // ISO date from VPS object
): number {
  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(expiredAt).getTime() - Date.now()) / 86_400_000)
  );
  const cpuCharge  = Math.max(0, after.cores      - current.cores)      * pricing.cpu_per_core  * (daysRemaining / 30);
  const ramCharge  = Math.max(0, after.memory_gib - current.memory_gib) * pricing.ram_per_gib   * (daysRemaining / 30);
  const diskCharge = Math.max(0, after.disk_gb    - current.disk_gb)    * pricing.disk_per_gb   * (daysRemaining / 30);
  return Math.ceil(cpuCharge + ramCharge + diskCharge);
}
```

> **Disk ลด (shrink) ไม่ได้** — backend จะ return `DISK_SHRINK_NOT_ALLOWED` 400  
> ควร disable input disk ถ้าค่าต่ำกว่าปัจจุบัน และ set `diskCharge = 0` ถ้า `after.disk_gb < current.disk_gb`

### UI — Real-time Preview

```ts
// โหลดครั้งเดียวตอนเปิดหน้า upgrade
const { data: pricing } = await fetch('/api/system-configs/pricing', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// re-calculate ทุกครั้งที่ input เปลี่ยน
function onInputChange() {
  if (!pricing.cpu_per_core) {
    hidePreview();
    return;
  }
  const cost = calcUpgradeCost(currentSpecs, formValues, pricing, vps.expired_at);
  setPreviewText(`ยอดชำระโดยประมาณ ฿${cost.toLocaleString()}`);
}
```

**UI mockup:**

```
┌──────────────────────────────────────────────────────┐
│  กำหนดเอง                                            │
│                                                      │
│  CPU (cores):  [2] → [4 ▲]   (+฿100/core เหลือ 20 วัน)│
│  RAM (GiB):    [4] → [8 ▲]   (+฿30/GiB)             │
│  Disk (GB):    [40] → [40]   (ลดไม่ได้)             │
│                                                      │
│  ─────────────────────────────────────────────────── │
│  ยอดชำระโดยประมาณ  ฿267                              │
│  * ราคาสุดท้ายคำนวณจริงตอนกด submit                  │
│                                                      │
│  [ส่งคำขออัพเกรด]                                    │
└──────────────────────────────────────────────────────┘
```

---

## 15. Payment Config — GET /api/system-configs/payment-info

> **ใครต้องอ่าน:** หน้า checkout ทุก role ที่ login แล้ว — ใช้แสดง PromptPay number + เลขบัญชีธนาคารให้ user โอนเงิน

### RBAC

| Role | เข้าถึงได้ |
|---|---|
| USER | ✅ |
| SUPPORT | ✅ |
| ADMIN | ✅ |
| ไม่ login | ❌ 401 |

### Request

```
GET /api/system-configs/payment-info
Authorization: Bearer {accessToken}
```

### Response 200

```json
{
  "success": true,
  "data": {
    "promptpay_id": "0812345678",
    "bank": {
      "code": "KBANK",
      "account_no": "xxx-x-xxxxx-x",
      "account_name": "บริษัท CloudVPS"
    }
  }
}
```

**กรณียังไม่ตั้งค่า** — field เป็น `null`:

```json
{
  "success": true,
  "data": {
    "promptpay_id": null,
    "bank": null
  }
}
```

> ถ้า `promptpay_id === null` → ซ่อน PromptPay payment option หรือแสดง "ยังไม่เปิดรับชำระ PromptPay"  
> ถ้า `bank === null` → ซ่อน SLIP payment option

**`bank` object:** จะเป็น `null` ถ้าไม่มีการตั้งค่า **ทั้งสาม** field (`bank_code`, `bank_account_no`, `bank_account_name`) เลย — แต่ถ้าตั้งค่าบางส่วนจะแสดง object ที่ field ที่ไม่ได้ตั้งค่าเป็น `null`:

```json
{
  "bank": {
    "code": "KBANK",
    "account_no": null,
    "account_name": null
  }
}
```

---

### Admin — Keys ที่ต้องตั้งค่า

Admin ตั้งค่าผ่าน `PUT /api/system-configs/{key}` (Admin only):

| Key | ตัวอย่าง | ใช้กับ |
|---|---|---|
| `payment.promptpay_id` | `"0812345678"` | เลข PromptPay (เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก) |
| `payment.bank_code` | `"KBANK"` | รหัสธนาคาร (`KBANK`, `SCB`, `KTB`, `BBL`, `BAY`, `TTB`, `GSB`) |
| `payment.bank_account_no` | `"xxx-x-xxxxx-x"` | เลขบัญชีธนาคาร |
| `payment.bank_account_name` | `"บริษัท CloudVPS"` | ชื่อเจ้าของบัญชี |
| `payment.slipok_api_key` | `"<api_key>"` | SlipOK API key — **secret** (masked ใน GET list) |
| `payment.slipok_branch_id` | `"<branch_id>"` | SlipOK Branch ID |
| `payment.truemoney_mobile` | `"0812345678"` | เบอร์รับอังเปา TrueMoney (override `TRUEMONEY_MOBILE` env) |

**ตัวอย่าง set PromptPay:**
```
PUT /api/system-configs/payment.promptpay_id
Authorization: Bearer {adminToken}
Content-Type: application/json

{ "value": "0812345678" }
```

---

### SlipOK Credential Priority

SlipOK อ่าน credentials ตาม priority:

```
system_configs (payment.slipok_api_key / payment.slipok_branch_id)
  → fallback env (SLIPOK_API_KEY / SLIPOK_BRANCH_ID)
```

ถ้าตั้งค่าผ่าน system_configs จะ **override** env ทันทีโดยไม่ต้อง redeploy

**TrueMoney mobile** ใช้ priority เดียวกัน:
```
system_configs (payment.truemoney_mobile) → fallback env (TRUEMONEY_MOBILE)
```

---

### UI — Checkout Page

แนะนำโหลด payment-info ครั้งเดียวตอนเปิดหน้า checkout:

```ts
const { data: paymentInfo } = await fetch('/api/system-configs/payment-info', {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.json());

// ซ่อน/แสดง payment option ตาม config
const showPromptPay = !!paymentInfo.promptpay_id;
const showSlip = !!paymentInfo.bank;
```

**UI mockup — Payment method selection:**

```
┌──────────────────────────────────────────────────────┐
│  เลือกวิธีชำระเงิน                                   │
│                                                      │
│  ○ PromptPay                                         │
│    QR Code — เลข: 081-234-5678                       │
│                                                      │
│  ○ โอนธนาคาร (SLIP)                                  │
│    ธนาคาร: กสิกรไทย (KBANK)                         │
│    เลขบัญชี: xxx-x-xxxxx-x                          │
│    ชื่อบัญชี: บริษัท CloudVPS                      │
│                                                      │
│  ○ TrueMoney Wallet                                  │
│  ○ Voucher                                           │
└──────────────────────────────────────────────────────┘
```

---

## 17. NAT Port Forwarding — Private IP VPS

> **ใครต้องอ่าน:** หน้า VPS detail สำหรับ VPS ที่ใช้ Private IP (package ที่มี `port_count > 0`)

### Private IP vs Public IP

Package บางประเภทไม่มี Public IP ตรง — ใช้ NAT ผ่าน MikroTik CHR แทน:

| Package type | `port_count` | IP ที่ได้ | การเข้าถึง |
|---|---|---|---|
| Public IP | `null` | Public IP ตรง | เชื่อมต่อผ่าน IP โดยตรง |
| Private IP + NAT | `> 0` (เช่น 5) | Private IP | เชื่อมต่อผ่าน Public IP + Port ที่ assigned |

เมื่อ provision VPS แบบ Private IP — ระบบจะ:
1. Auto-allocate port block (เช่น port 20000–20004 สำหรับ `port_count=5`)
2. สร้าง system rule อัตโนมัติ: port แรก → SSH (22) สำหรับ Linux หรือ RDP (3389) สำหรับ Windows
3. User สามารถเพิ่ม/ลบ port rules เองในช่วง port ที่ได้รับ

---

### ⚠️ Breaking Fixes — Frontend ต้องแก้ 3 จุด (rev 18)

> **ฟีเจอร์ Port Forwarding ใช้ไม่ได้เลยก่อน rev 18** — ทั้ง 3 action พัง

#### Fix 1 — GET response ห่อด้วย `{success, data}` แล้ว (backend เปลี่ยน)

เดิม backend คืน `{nat_allocation, port_rules}` ตรงๆ → ตอนนี้ห่อแล้ว:

```ts
// ❌ เดิม (เข้าถึง data ไม่ได้ถ้า ApiClient unwrap .data)
const rules = await api.get(`/vps/${id}/port-rules`); // ได้ undefined

// ✅ ใหม่ — backend คืน {success, data: {nat_allocation, port_rules}}
const { data } = await api.get(`/vps/${id}/port-rules`);
const { nat_allocation, port_rules } = data;
```

---

#### Fix 2 — POST body ต้องใช้ camelCase (frontend ต้องแก้)

Backend route schema กำหนด **camelCase** — frontend ส่งผิด field name:

```ts
// ❌ ผิด — frontend ส่ง snake_case + ไม่มี privateIp
{ private_port: 8080, protocol: "TCP" }

// ✅ ถูก — ต้องส่ง camelCase ครบ 3 fields
{
  privateIp: "192.168.1.100",   // ← IP ใน VM (ดูจาก vps.ip_address)
  privatePort: 8080,             // ← camelCase ไม่ใช่ private_port
  protocol: "TCP"                // ← "TCP" | "UDP" | "BOTH"
}
```

> **`privateIp`** — ใช้ `vps.ip_address` จาก `GET /api/vps/:id` (Private IP ของ VM)

---

#### Fix 3 — DELETE คืน 200 + `{success: true}` แล้ว (backend เปลี่ยน)

เดิม backend คืน 204 No Content → ApiClient เรียก `.json()` แล้ว parse error:

```ts
// ❌ เดิม — backend คืน 204, ApiClient เรียก res.json() → throw
await api.delete(`/vps/${vpsId}/port-rules/${ruleId}`); // parse error แม้ลบสำเร็จ

// ✅ ใหม่ — backend คืน 200 + {success: true} เหมือน endpoint อื่น
const result = await api.delete(`/vps/${vpsId}/port-rules/${ruleId}`);
// result.success === true → ลบสำเร็จ
```

---

### รู้ว่า VPS ใช้ Private IP ยังไง

`GET /api/vps/:id` — response มี `nat` object:

```json
{
  "success": true,
  "data": {
    "id": 10,
    "status": true,
    "nat": {
      "nat_allocation": {
        "public_ip": "1.2.3.4",
        "port_start": 20000,
        "port_end": 20004,
        "used_count": 2,
        "available_count": 3
      },
      "port_rules": [
        { "id": 1, "public_port": 20000, "private_port": 22,   "protocol": "TCP", "is_system": true },
        { "id": 2, "public_port": 20001, "private_port": 8080, "protocol": "TCP", "is_system": false }
      ]
    }
  }
}
```

**`nat === null`** → Public IP VPS — ไม่ต้องแสดง port forwarding section

```ts
const isPrivateIpVps = vps.nat !== null;
```

---

### RBAC

| Action | USER | ADMIN | SUPPORT |
|---|---|---|---|
| ดู port rules (`GET`) | ✅ (own) | ✅ (any) | ✅ (any) |
| เพิ่ม rule (`POST`) | ✅ (own) | ✅ (any) | ❌ |
| ลบ user rule (`DELETE`) | ✅ (own) | ✅ (any) | ❌ |
| ลบ system rule (`DELETE`) | ❌ | ✅ (admin only) | ❌ |

---

### GET /api/vps/:id/port-rules — ดู Port Rules

```
GET /api/vps/{vpsId}/port-rules
Authorization: Bearer {accessToken}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "nat_allocation": {
      "public_ip": "1.2.3.4",
      "port_start": 20000,
      "port_end": 20004,
      "used_count": 2,
      "available_count": 3
    },
    "port_rules": [
      { "id": 1, "public_port": 20000, "private_port": 22,   "protocol": "TCP", "is_system": true  },
      { "id": 2, "public_port": 20001, "private_port": 8080, "protocol": "TCP", "is_system": false }
    ]
  }
}
```

| Field | ความหมาย |
|---|---|
| `public_ip` | IP ของ MikroTik ที่ใช้ DST-NAT |
| `port_start` / `port_end` | ช่วง port ที่ VPS นี้ได้รับ |
| `used_count` | จำนวน rule ที่ใช้แล้ว |
| `available_count` | port ที่ยังเหลือให้เพิ่ม rule ได้ |
| `is_system` | `true` = rule ที่ระบบสร้างอัตโนมัติ (SSH/RDP) — user ลบไม่ได้ |

---

### POST /api/vps/:id/port-rules — เพิ่ม Port Rule

```
POST /api/vps/{vpsId}/port-rules
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "privateIp": "192.168.1.100",
  "privatePort": 8080,
  "protocol": "TCP"
}
```

| Field | Type | ค่าที่ได้ |
|---|---|---|
| `privateIp` | string (IPv4) | IP ใน VM (ดูจาก VPS detail) |
| `privatePort` | number (1–65535) | port ใน VM ที่ต้องการเปิด |
| `protocol` | `"TCP"` \| `"UDP"` \| `"BOTH"` | TCP/UDP/ทั้งคู่ (BOTH สร้าง 2 rules ใน MikroTik) |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": 3,
    "allocation_id": 1,
    "public_port": 20002,
    "private_port": 8080,
    "protocol": "TCP",
    "is_system": false,
    "mikrotik_ids": ["*1A2B"]
  }
}
```

> `public_port` ถูก assign อัตโนมัติ — user ไม่เลือกเอง

**Error Codes:**

| `error` | HTTP | ความหมาย |
|---|---|---|
| `PORT_LIMIT_REACHED` | 409 | ใช้ port ครบแล้ว (`available_count === 0`) |
| `NAT_NOT_FOUND` | 404 | VPS นี้ไม่มี NAT allocation (Public IP VPS) |
| `FORBIDDEN` | 403 | VPS ไม่ใช่ของ user |

---

### DELETE /api/vps/:id/port-rules/:ruleId — ลบ Port Rule

```
DELETE /api/vps/{vpsId}/port-rules/{ruleId}
Authorization: Bearer {accessToken}
```

**Response 200:**
```json
{ "success": true }
```

**Error Codes:**

| `error` | HTTP | ความหมาย |
|---|---|---|
| `SYSTEM_RULE` | 403 | Rule นี้ระบบสร้างอัตโนมัติ (SSH/RDP) — เฉพาะ admin ลบได้ |
| `NOT_FOUND` | 404 | Rule ไม่พบหรือถูกลบแล้ว |
| `FORBIDDEN` | 403 | VPS ไม่ใช่ของ user |

> Error responses ของทุก endpoint ในกลุ่มนี้มี `success: false` ประกอบ เช่น `{ "success": false, "error": "NOT_FOUND" }`

---

### Implementation Example

```ts
// ── โหลด port rules ──────────────────────────────────────────────────────────
async function loadPortRules(vpsId: number) {
  const res = await fetch(`/api/vps/${vpsId}/port-rules`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null; // Public IP VPS — ไม่มี NAT
  return await res.json(); // { nat_allocation, port_rules }
}

// ── เพิ่ม rule ────────────────────────────────────────────────────────────────
async function addPortRule(vpsId: number, privatePort: number, protocol: 'TCP' | 'UDP' | 'BOTH') {
  const vps = await fetchVps(vpsId); // ดู private IP จาก VPS detail
  const res = await fetch(`/api/vps/${vpsId}/port-rules`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ privateIp: vps.ip_address, privatePort, protocol }),
  });

  if (res.status === 409) throw new Error('ใช้ port ครบแล้ว');
  if (!res.ok) throw new Error('เพิ่ม port rule ไม่สำเร็จ');
  return await res.json(); // { id, public_port, ... }
}

// ── ลบ rule ───────────────────────────────────────────────────────────────────
async function deletePortRule(vpsId: number, ruleId: number) {
  const res = await fetch(`/api/vps/${vpsId}/port-rules/${ruleId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) throw new Error('ลบ system rule ไม่ได้');
}
```

---

### UI — Port Forwarding Panel

แสดงเฉพาะเมื่อ `vps.nat !== null`:

```
┌─────────────────────────────────────────────────────────────┐
│  Port Forwarding                                            │
│  Public IP: 1.2.3.4  |  ใช้แล้ว 2/5 port                  │
├──────────┬──────────────┬──────────┬────────────────────────┤
│ Public   │ Private Port │ Protocol │                        │
├──────────┼──────────────┼──────────┼────────────────────────┤
│ 20000    │ 22 (SSH)     │ TCP      │ 🔒 System rule         │
│ 20001    │ 8080         │ TCP      │ [ลบ]                   │
├──────────┴──────────────┴──────────┴────────────────────────┤
│  เพิ่ม rule: Port [____] Protocol [TCP ▼] [เพิ่ม]           │
│  เหลือ 3 port ที่ว่าง                                       │
└─────────────────────────────────────────────────────────────┘
```

**UX Notes:**
- System rule (`is_system: true`) → ซ่อนปุ่มลบสำหรับ user, แสดง badge "🔒 System"
- `available_count === 0` → ซ่อน/disable form เพิ่ม rule พร้อมแจ้ง "ใช้ port ครบแล้ว"
- หลัง provision ใหม่ → อาจต้องรอสักครู่กว่า nat_allocation จะพร้อม (MikroTik async)
- `privateIp` ส่วนใหญ่ดูจาก `vps.ip_address` — แต่ VM อาจมีหลาย NIC ให้ user ระบุเองได้

---

## 16. Cancel Order — Upgrade Orders (Breaking Fix)

> **ใครต้องอ่าน:** หน้า order list / order detail ที่มีปุ่มยกเลิก

**Endpoint:** `DELETE /api/orders/:id` (หรือ `POST /api/orders/:id/cancel` ตามที่ frontend ใช้)

### พฤติกรรมเก่า vs ใหม่

| Scenario | เก่า | ใหม่ |
|---|---|---|
| Upgrade order ที่ยังไม่จ่าย (PENDING) | ❌ 403 `CANNOT_CANCEL_UPGRADE` | ✅ ยกเลิกได้ |
| Upgrade order ที่จ่ายแล้ว (PAID / applied) | ❌ 403 `CANNOT_CANCEL_UPGRADE` | ❌ 403 `CANNOT_CANCEL_UPGRADE` |
| Order ปกติที่จ่ายแล้ว (PAID) | ❌ 400 `ALREADY_PAID` | ❌ 400 `ALREADY_PAID` (ไม่เปลี่ยน) |

### Error Codes ที่เกี่ยวข้อง

| `error` | HTTP | ความหมาย |
|---|---|---|
| `CANNOT_CANCEL_UPGRADE` | 403 | Upgrade นี้ถูก apply ไปแล้ว (VPS specs เปลี่ยนแล้ว) — ย้อนกลับไม่ได้ |
| `ALREADY_PAID` | 400 | Order ปกติที่จ่ายแล้ว |
| `ALREADY_CANCELLED` | 400 | ถูก cancel ไปแล้ว |
| `EXPIRED` | 400 | Order หมดอายุแล้ว |

### Error Message ที่เปลี่ยน

`CANNOT_CANCEL_UPGRADE` message เปลี่ยนเป็น:
> `"This upgrade has already been applied and cannot be cancelled."`

(เดิม: `"Upgrade orders cannot be cancelled by users."`)

### What Frontend Must Do

แสดงปุ่มยกเลิกสำหรับ upgrade orders ที่ `status === "PENDING"` ได้แล้ว — ไม่ต้องซ่อน:

```ts
// เดิม: ซ่อนปุ่มยกเลิกถ้าเป็น upgrade order
// const canCancel = order.status === 'PENDING' && !order.upgrade_vps_id;

// ใหม่: ซ่อนเฉพาะ PAID/applied upgrade
const canCancel =
  order.status === 'PENDING' ||
  (order.status === 'PENDING' && !!order.upgrade_vps_id);

// หรือเขียนชัดขึ้น:
const canCancel = order.status === 'PENDING';
// PENDING ทุก type (ปกติ + upgrade) ยกเลิกได้
// PAID upgrade ถูก block ที่ backend แล้ว (403) ไม่ต้องซ่อนเอง
```

**เมื่อ cancel สำเร็จ:** upgrade log entry จะถูก mark เป็น `failed_at` → upgrade ไม่ถูก apply

---

## 9. Reference — Complete Order Error Codes

For `POST /api/orders`:

| `error` | HTTP | Cause | Has `detail`? |
|---|---|---|---|
| `PACKAGE_NOT_FOUND` | 404 | `package_id` does not exist | No |
| `PACKAGE_INACTIVE` | 400 | Package is disabled | No |
| `INVALID_PROMO` | 400 | `promo_code` not found or inactive | No |
| `PROMO_EXPIRED` | 400 | Promotion has passed `expired_at` | No |
| `PROMO_LIMIT_REACHED` | 409 | Global `max_uses` cap reached | No |
| `PROMO_USER_LIMIT_REACHED` | 409 | Per-user `max_uses_per_user` cap reached | No |
| `RENEWAL_PENDING` | 409 | Duplicate renewal order for same VPS | No |
| `INSUFFICIENT_RESOURCES` | 409 | Proxmox node RAM/disk insufficient | **Yes** — `{ required_ram_mb, available_ram_mb, required_disk_gb, available_disk_gb }` |

---

## 18. VM Spec RAM Field — Bare Number Handling (Bug Fix, Non-Breaking)

> **ใครต้องอ่าน:** หน้า admin VM Spec form (`/admin/os-vm`) ที่มี field `memory`

### บั๊กที่เจอ

Admin form ที่หน้า `/admin/os-vm` มี field label **"RAM (GB)"** แต่เป็น plain text input (`z.string()`) — ค่าที่กรอก (เช่น `"4"`) ถูกส่งไป backend **ตรงๆ ไม่ต่อ `GB` ต่อท้าย** เอง. ตัว "GB" ที่เห็นในตารางรายการ (`{s.memory} GB`) เป็นแค่ label ตอน**แสดงผล** เท่านั้น ไม่ได้อยู่ใน value ที่ submit จริง.

ฝั่ง backend (`src/utils/specs.ts` → `parseGib()`) เดิมต้องการ unit suffix (`GB`/`MB`) เสมอ — ถ้าไม่มี suffix (เช่น value ดิบ `"4"`) จะ parse ไม่ผ่านและ fallback เป็น `1` GiB เงียบๆ ไม่มี error. ผลคือ VM spec ที่ admin สร้างด้วยเลข RAM ล้วน (ไม่มี GB) จะโดนบันทึก/แสดงเป็น 1 GB เสมอ ไม่ว่าจะพิมพ์อะไรก็ตาม.

### Fix (Backend)

`parseGib()` แก้ให้ bare number (ไม่มี unit) ถือว่าเป็น GB ตรงๆ แล้ว (`"4"` → `4` GiB). ค่าที่เคยกรอกไว้แล้ว (ที่กลายเป็น 1 GB) จะ parse ถูกต้องทันทีหลัง deploy — **ไม่ต้อง migrate ข้อมูลเก่า** เพราะ raw string ในคอลัมน์ `vm.memory` ไม่ได้เปลี่ยน แค่วิธี parse เปลี่ยน.

### What Frontend Should Do (ไม่บังคับ แต่แนะนำ)

ไม่จำเป็นต้องแก้ frontend — backend รองรับทั้ง `"4"`, `"4GB"`, `"4096MB"` แล้ว. แต่ถ้าอยากชัดเจนขึ้นและกันปัญหาซ้ำในอนาคต แนะนำให้ submit เป็น `` `${value}GB` `` แทนเลขล้วนตอนส่ง create/update VM spec:

```ts
// ก่อน (ambiguous —พึ่ง backend fallback)
form.memory // "4"

// แนะนำ (explicit unit ตอน submit, label ในฟอร์มยังโชว์ "RAM (GB)" เหมือนเดิม)
`${form.memory}GB`
```
