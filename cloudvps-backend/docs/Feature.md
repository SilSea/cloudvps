# CloudVPS - VPS Cloud Rental Service

## 1. Feature Matrix (per Role)

### Admin
1. Auth — Login via Email+Password, Google, Discord
2. Manage Users & Support — CRUD user and support accounts
3. Manage Packages — CRUD packages, toggle status
4. Full VPS Management — View and monitor all VPS instances in the system
5. Payment Management — View and verify all transactions
6. Support — Read and reply to support tickets from Users and Support
7. Manage Public Key pool and IP pool
8. Email Broadcast — Send notification emails to users for events (maintenance, emergency, announcements)

### Support
1. Auth — Login via Email+Password, Google, Discord with PDPA/ToS acceptance
2. VPS Operations — Config VM, assign packages, manage provisioning
3. Manage Users — View and edit user accounts
4. Registration — Register new accounts

### Users
1. Auth — Login via Email+Password, Google, Discord with PDPA/ToS acceptance and registration
2. Profile — Edit personal info (name, phone, email, address)
3. Browse Packages — View VPS packages or choose Custom VPS
4. Payment — Truemoney Angpao, Slip (SlipOK), PromptPay QR (manual verification)
5. VPS Control — Console (future), Start/Stop/Reboot, view VPS info (name, username, password)
6. Support — Contact via Facebook Fanpage (external system)
7. View billing history

---

## 2. Feature Summary

CloudVPS is a VPS Cloud rental service that controls Proxmox VE through its API. The system includes 19 feature modules (F1–F19):

**F1 — RBAC (Role-Based Access Control)**
Access control with 3 groups: Admin (full management), Support (VPS and user management), Users (service consumers). Uses the roles table linked to users with JWT for authentication.

**F2 — Account Management**
Register and login via Email+Password, Google, Discord with email verification. User data is split into 2 tables: users for credentials and users_info for personal details and address.

**F3 — Package Management**
Admin creates VPS packages composed of OS template (os table) + VM spec such as CPU/RAM/Disk (vm table) + price and period. Includes 8 predefined packages (as defined in the project documentation) ranging from 2 cores/4GB RAM to 10 cores/20GB RAM. Custom VPS option available for Users. Packages optionally define `port_count` (Int?): null = Public IP (direct), number = Private IP + NAT port block of that size via MikroTik CHR (see F11). Packages optionally belong to a `package_categories` (see F13).

**F4 — PDPA and Terms of Service**
Policy management via the policies table supporting 2 types (PDPA, TERMSERVICE) with versioning. Users and Support must accept the latest policies during registration or login. Consent records are stored in the consents table.

**F5 — VPS Management**
Integrates with Proxmox VE API to clone templates, set specs, assign IPs, and start/stop/reboot VMs. Features 2 IP pool types (Public and Private). Flow: order paid → create temp_vps (fire-and-forget) → clone Proxmox template → configure cloud-init → start VM → create vps record + delete temp_vps. Supports soft delete, auto-expiration (cron), and auto-renew (F10). Admin can force-delete any VPS immediately via `DELETE /api/vps/:id` (bypasses grace period, releases IP, notifies user). Private IP VMs also trigger NAT port block allocation via MikroTik CHR (see F11).

**F6 — Payment System**
Supports 3 channels: TRUEMONEY Angpao (auto-verified via API), SLIP via SlipOK (auto-verified), PROMPTPAY QR (upload slip → Admin/Support manual approval). Includes a promotions system supporting DISCOUNT (flat amount) and PERCENT (percentage) types with expiry dates.

*Slip Upload (Phase 15 — Complete ✅):*
`POST /api/transactions` accepts `multipart/form-data`. Slip upload mode is configurable at runtime via `payment.slip_mode` system config key (default `FILE`):

- **FILE mode** (`payment.slip_mode = FILE`): `slip_file: File` field (≤ 5 MB, image/jpeg | png | webp | gif). Backend saves to `uploads/slips/YYYY-MM/{uuid}.{ext}`; `transactions.slip_url` stores URL path (e.g. `/uploads/slips/2026-07/abc.jpg`). `slipokService.verify(filePath)` reads file → base64 → SlipOK API.
- **BASE64 mode** (`payment.slip_mode = BASE64`): `slip_image: string` field (raw base64). Backend validates size (≈ decoded bytes), passes directly to `slipokService.verifyBase64(base64)`, stores base64 string in `transactions.slip_url`.
- Shared upload infrastructure with F17 ticket attachments (`src/config/upload.config.ts`, `src/utils/file.utils.ts`).
- Files served via `GET /uploads/*` (no auth, path-traversal protected).
- See `docs/frontend.md` Section 5 for frontend integration guide.

**F7 — Support System**
Contact support via Facebook Fanpage (external system). Admin can read and reply to all tickets. Support can manage assigned issues.

**F8 — System Config Management** *(Phase 4 — Complete ✅)*
Runtime-editable configuration store. **31 keys total**: 12 Proxmox VE keys + 5 MikroTik keys (Phase 8) + 3 pricing keys (Phase 9) + 3 capacity keys (Phase 14: `capacity.check_enabled`, `capacity.min_free_ram_mb`, `capacity.min_free_disk_gb`) + 8 payment keys (Phase 15: `payment.slip_mode` — `FILE` | `BASE64`; plus `payment.promptpay_id`, `payment.slipok_api_key` (secret), `payment.slipok_branch_id`, `payment.bank_code`, `payment.bank_account_no`, `payment.bank_account_name`, `payment.truemoney_mobile`). Admin sets values via `PUT /api/system-configs/:key`; system reads DB first, falls back to `.env`. Values cached in Redis (60s TTL) so changes take effect without restart. Admin/Support can view configs via GET endpoints (secrets masked as `***`). All updates are audited (`UPDATE SYSTEM_CONFIG`). Config keys are pre-seeded; no new keys can be created via API. All authenticated users can read `GET /api/system-configs/pricing` (upgrade cost preview) and `GET /api/system-configs/payment-info` (PromptPay/bank display at checkout).

Payment credentials (SlipOK api key/branch, TrueMoney mobile) resolve from system_configs first, falling back to `.env` (`SLIPOK_API_KEY`, `SLIPOK_BRANCH_ID`, `TRUEMONEY_MOBILE`). SMTP and `TRUEMONEY_API_URL` remain `.env` only — see `.env.example`.

**F9 — Email Broadcast** *(Phase 5 — Complete ✅)*
Admin sends notification emails to users for system events. Supports 3 event types: `MAINTENANCE` (maintenance notice), `EMERGENCY` (emergency alert), `ANNOUNCEMENT` (general notice). Each type has a pre-built HTML template with color-coded header. Admin provides `subject` + `body` (plain text; `\n→<br>` in HTML). Admin selects target scope: `ALL` (verified active users), `ACTIVE_VPS` (users with running VPS), `EXPIRING_SOON` (users with VPS expiring within 14 days). Delivery uses `Promise.allSettled` (non-blocking per recipient); result saved to `email_broadcasts` table (`sent_count`, `failed_count`). Rate-limited to 5 sends/hour. All broadcasts audited (`BROADCAST EMAIL_BROADCAST`).

**F10 — Promo Limits & Auto-Renew** *(Phase 7 — Complete ✅)*

*Promo usage limits (F1):*
Promotions now support `max_uses` (global cap) and `max_uses_per_user` (per-user cap); both default to null (unlimited). A new `promo_usages` table tracks usage per order. On order create: checks global cap vs `used_count`, checks per-user usage count, then atomically creates order + `promo_usages` record + increments `used_count` in one DB transaction. Error codes: `PROMO_LIMIT_REACHED` (409), `PROMO_USER_LIMIT_REACHED` (409).

*Auto-renew toggle (F2):*
VPS has an `auto_renew` flag (default false) and optional `locked_promo_id` referencing a promotion. Users toggle via `PATCH /api/vps/:id/auto-renew` with `{ auto_renew: boolean, locked_promo_id?: number | null }`. Locked promo is validated as active on set; if promo is later disabled, cron creates order at full price (graceful degradation).

*Auto-renew cron (F3+F4):*
Daily at 02:20 Asia/Bangkok: finds all VPS with `auto_renew=true, deleted_at=null, expired_at ≤ 3 days`. For each, calls `orderService.create()` with `locked_promo_id` code (if promo still active). Skips VPS that already have a `RENEWAL_PENDING` order (RNW-DUP-1 guard reused). On success, sends `sendAutoRenewalReminder()` email to user. All errors are logged without rethrowing.

*Promo on manual renew (F5):*
`POST /api/vps/:id/renew` now accepts optional `{ promo_code?: string }` body. Passes promo to order service — all F1 limit checks apply identically to manual and auto-renewal paths.

---

**F12 — VM Reconfigure & Upgrade** *(Phase 9 — Complete ✅)*

Two upgrade modes for existing VPS without reprovisioning:

*Mode A — Package Switch:*
User switches to a different package (same OS). Upgrade (higher price) = pro-rate charge for remaining days. Downgrade (lower or equal price) = free spec change, lower monthly_price takes effect at next renewal. Amount = `ceil((price_delta * days_remaining) / period)`.

"Same OS" is decided by `os_name` + `os_version`, not `os.id`. The `os` table has no uniqueness constraint on name+version — the same logical OS (e.g. "Ubuntu 22.04 LTS") can legitimately have multiple rows with different `vmid` (different Proxmox templates across tiers/nodes). Comparing raw `os_id` would false-positive `OS_MISMATCH` between two packages that are the same OS but point at different template rows.

*Mode B — Custom Resource:*
User specifies new cores/RAM/disk individually at admin-defined unit prices (`pricing.cpu_per_core`, `pricing.ram_per_gib`, `pricing.disk_per_gb` from system_configs). Added resources charge pro-rate; reduced resources free. Disk cannot shrink (Proxmox limitation, blocked at order-creation time via `DISK_SHRINK_NOT_ALLOWED`). `monthly_price` updated by delta.

*Apply Flow:*
Orders with amount > 0 remain PENDING until payment (same flow as renewal). Amount = 0 auto-approved immediately. After payment, `upgradeService.applyUpgrade()` fires and-forget: acquires Redis lock; if cores/RAM changed, `stopVm → pollTask → updateVmResources → startVm → pollTask`; if disk changed, `resizeDisk`; then updates `vps.current_*` and `monthly_price`. `proxmoxService.resizeDisk()` itself is defensive — it reads the VM's actual current disk size first and no-ops (instead of erroring the whole task) if the target is not strictly larger, since Proxmox rejects the resize call outright ("shrinking disks is not supported") rather than just ignoring it.

*Accounting Trail:*
`vps_upgrade_logs` records before/after specs + amount_charged for every upgrade (including free downgrades). `applied_at` null = pending/failed; filled on successful Proxmox apply.

*RBAC:*
Users upgrade/downgrade their own VPS. Admin/Support upgrade any VPS. Users can cancel PENDING (unpaid) upgrade orders — the pending `vps_upgrade_logs` entry is marked failed. PAID upgrade orders cannot be cancelled (`CANNOT_CANCEL_UPGRADE`) since the upgrade is already applied.

*APIs:*
- `POST /api/vps/:id/upgrade/package` — body: `{ package_id }`
- `POST /api/vps/:id/upgrade/custom` — body: `{ cores?, memory_gib?, disk_gb? }`
- `GET /api/vps/:id/upgrade/history` — paginated upgrade log

**F11 — Port Forwarding / NAT** *(Phase 8 — Complete ✅)*

Enables VPS on Private IPs to receive inbound connections via MikroTik CHR REST API (`/rest/ip/firewall/nat`). Requires `package.port_count > 0`.

*Port Block Allocation:*
When a Private IP VPS is provisioned, a consecutive port block is allocated from the shared NAT public IP. Block size = `package.port_count`. Allocation is dynamic: `next_port_start = MAX(port_end) + 1` from active `nat_allocations` on that public IP (or `mikrotik.nat_base_port` if none exist). Block stored in `nat_allocations` table.

*System Port (auto-created at provision):*
First port in the block is automatically forwarded to the default remote-access port based on OS:
- Linux (Ubuntu/Debian) → port 22 (SSH)
- Windows Server → port 3389 (RDP)

This rule is marked `is_system=true` and cannot be deleted by regular users.

*User-Managed Port Rules:*
Users specify only `private_port` + `protocol` (TCP/UDP/BOTH). System auto-assigns the next available `public_port` within the VPS block. Rules stored in `nat_port_rules`. Maximum active rules = `package.port_count`. Each rule creates 1 or 2 MikroTik DST-NAT rules (TCP and/or UDP); MikroTik rule IDs stored for cleanup.

*Port Info in VPS Response:*
`GET /api/vps/:id` includes `nat_allocation` (public_ip, port_start, port_end, used_count, available_count) and `port_rules` array.

*Cleanup:*
VPS deletion (force or expiry) triggers `natService.releaseAll(vpsId)` — deletes all MikroTik rules and marks nat_port_rules + nat_allocations as inactive before releasing the private IP.

*RBAC:*
Users manage rules for their own VPS only. Admin manages rules for any VPS and can delete system rules. Support has read-only access.

*Schema:*
- `packages.port_count Int?` — null = PUBLIC IP, number = PRIVATE IP + NAT
- `nat_allocations` — one row per VPS (block reservation)
- `nat_port_rules` — individual port mappings (public_port → private_port)

---

**F13 — Package Categories** *(Phase 10 — Complete ✅)*

Admin-managed grouping for VPS packages. Categories are independent from packages — a package may or may not belong to a category (`category_id Int?`). Categories are listed publicly so the frontend can build filter UI.

*Admin Operations:*
- Create / update / toggle status for any category
- View all categories including inactive (`GET /api/packages/categories/all`)

*Public Operations:*
- List all active categories (`GET /api/packages/categories`)
- Filter active packages by category (`GET /api/packages?category_id=N`)

*Schema:*
- `package_categories` — id, name (unique), description?, status, created_at, updated_at
- `packages.category_id Int?` — optional FK → package_categories.id

---

**F14 — Admin/Support Create User** *(Phase 11 — Complete ✅)*

Admin and Support can create user accounts directly without requiring self-registration.

*Behavior:*
- `POST /api/users` (ADMIN + SUPPORT) — creates a `users` role account immediately
- `is_verify = true` — admin-created accounts skip email verification
- `password` optional — if omitted, a 16-character cryptographically secure password is auto-generated using `crypto.getRandomValues`
- Auto-accepts all currently active policies (creates `consents` rows) on behalf of the new user
- Sends a WELCOME email with login credentials to the new user's address (non-fatal: account exists even if email fails)
- `password_generated` flag in response indicates whether the caller should relay credentials out-of-band

*RBAC:*
- ADMIN and SUPPORT can create users; regular users cannot
- All newly created accounts get the `users` role (role change done separately via `PATCH /api/users/:id/role`)

*Audit:*
- `CREATE USER` logged with `policies_accepted` count in metadata

*API:*
- `POST /api/users` — body: `{ email, password?, first_name, last_name, phone, address1-6 }`

---

**F15 — Email Template Management** *(Phase 11 — Complete ✅)*

Admin-managed HTML templates for all system-sent emails. Templates stored in DB, editable at runtime without code deployment.

*11 Template Types (9 from Phase 11 + 2 added in Phase 13):*
| Type | Trigger | Variables | Phase |
|------|---------|-----------|-------|
| `VERIFICATION` | Registration / email change | `verify_url` | 11 |
| `EXPIRY_WARNING` | VPS expiry warning (7/1 day) | `vps_name`, `days_left` | 11 |
| `EXPIRED` | VPS expired | `vps_name`, `grace_until` | 11 |
| `FORCE_DELETED` | Admin force-deletes VPS | `vps_name` | 11 |
| `AUTO_RENEWAL_REMINDER` | Auto-renew order created | `vps_name` | 11 |
| `BROADCAST_MAINTENANCE` | Broadcast type MAINTENANCE | `subject`, `body` | 11 |
| `BROADCAST_EMERGENCY` | Broadcast type EMERGENCY | `subject`, `body` | 11 |
| `BROADCAST_ANNOUNCEMENT` | Broadcast type ANNOUNCEMENT | `subject`, `body` | 11 |
| `WELCOME` | Admin/Support creates user | `email`, `password`, `login_url` | 11 |
| `TICKET_REPLY` | Staff replies to ticket | `ticket_ref`, `ticket_title`, `reply_preview` | 13 ✅ |
| `TICKET_CLOSED` | Ticket closed | `ticket_ref`, `ticket_title` | 13 ✅ |

*Template System:*
- Variable syntax: `{{variable_name}}` — interpolated at send time
- DB record `is_active=true` → use DB template; `is_active=false` or no record → fallback to hardcoded default
- Templates cached in Redis (5 min TTL) — cache invalidated on update

*Admin Operations (ADMIN only):*
- `GET /api/email-templates` — list all 9 types with current values and variable metadata
- `GET /api/email-templates/:type` — get single type (returns DB or default)
- `PUT /api/email-templates/:type` — create or update template (upsert)
- `PATCH /api/email-templates/:type/status` — toggle is_active (requires template in DB first)

*Audit:*
- `UPDATE EMAIL_TEMPLATE` on every upsert
- `ENABLE/DISABLE EMAIL_TEMPLATE` on status toggle

*Schema:*
- `email_templates` — id, type (EmailTemplateType unique), subject, body_html, variables (JSON), is_active, updated_by (FK), created_at, updated_at
- `EmailTemplateType` enum — 9 values above

---

**F17 — In-App Support Ticket System** *(Phase 13 — Complete ✅)*

Full in-app helpdesk: Users open tickets, Staff replies in threaded messages, with category/priority management and email notifications.

*Ticket Lifecycle (Status Flow):*
```
OPEN → IN_PROGRESS (first staff reply)
     → WAITING_USER (staff waiting for user response)
     ← IN_PROGRESS (user replies again)
     → RESOLVED (staff marks resolved)
     → CLOSED (staff/user closes, or auto after 7 days RESOLVED)
```

*Ticket Categories (Admin-managed):*
Admin creates categories (e.g. Billing, Technical, Account). Users select a category on ticket creation.

*Priority (Staff-set):* LOW | MEDIUM | HIGH | URGENT — set/changed by ADMIN or SUPPORT after ticket opens.

*Threaded Messages:*
Both user and staff can add messages to an open ticket. Staff can post `is_internal=true` notes (hidden from user — for internal coordination).

*Attachments (Phase 15 — Complete ✅):*
`POST /api/tickets/:id/messages` accepts `multipart/form-data` with optional `attachments: File[]` (max 3 files, each ≤ 5 MB, types: image/jpeg | image/png | image/webp | image/gif). Files saved to `uploads/tickets/YYYY-MM/{uuid}.{ext}`. Stored in `ticket_messages.attachments` as JSON array:
```json
[{ "name": "error.png", "mime_type": "image/png", "url": "/uploads/tickets/2026-07/abc.png", "size": 204800 }]
```
Shared upload infrastructure with F6 slip upload (see `src/config/upload.config.ts`, `src/utils/file.utils.ts`).

*Email Notifications (via F15 template system):*
- Staff replies → email to ticket owner (`TICKET_REPLY` template: variables `ticket_ref`, `ticket_title`, `reply_preview`)
- Ticket closed → email to ticket owner (`TICKET_CLOSED` template: variables `ticket_ref`, `ticket_title`)

*RBAC:*
| Action | USER | SUPPORT | ADMIN |
|--------|------|---------|-------|
| Create ticket | own | ❌ | ❌ |
| View tickets | own only | all | all |
| Add message | own ticket | any | any |
| Internal note | ❌ | ✅ | ✅ |
| Set priority | ❌ | ✅ | ✅ |
| Update status | CLOSED own only | any | any |
| Assign to staff | ❌ | self | any |
| Manage categories | ❌ | ❌ | ✅ |

*Schema (3 new tables):*
- `ticket_categories` — id, name (unique), description?, status, created_at, updated_at
- `tickets` — id, ref_no (unique, `TKT-YYYYMMDD-XXXXX`), title, category_id FK, priority (TicketPriority enum), status (TicketStatus enum), user_id FK, assigned_to FK?, closed_at?, created_at, updated_at
- `ticket_messages` — id, ticket_id FK, sender_id FK, message, attachments Json?, is_internal Boolean (default false), created_at

*Enums (new):* `TicketStatus`: OPEN | IN_PROGRESS | WAITING_USER | RESOLVED | CLOSED; `TicketPriority`: LOW | MEDIUM | HIGH | URGENT

*EmailTemplateType additions:* `TICKET_REPLY`, `TICKET_CLOSED`

*AuditEntity additions:* `TICKET`, `TICKET_CATEGORY`

*Files to create:*
- `src/services/ticket.service.ts`
- `src/controllers/ticket.controller.ts`
- `src/routes/ticket.route.ts`
- `tests/unit/ticket-service.test.ts`
- `tests/integration/phase13-ticket-api.test.ts`

*Files to modify:*
- `prisma/schema.prisma` — 3 new models + 2 enums
- `src/services/audit.service.ts` — AuditEntity += TICKET, TICKET_CATEGORY
- `src/services/email-template.service.ts` — EmailTemplateType += TICKET_REPLY, TICKET_CLOSED
- `src/index.ts` — register `ticketRoutes`, "Support Tickets" Swagger tag
- `prisma/seed.ts` — seed default categories + 2 new email templates

*API:*
```
# Categories
GET  /api/tickets/categories             — active categories (Public)
GET  /api/tickets/categories/all         — all incl. inactive (ADMIN)
POST /api/tickets/categories             — create (ADMIN)
PUT  /api/tickets/categories/:id         — update (ADMIN)
PATCH /api/tickets/categories/:id/status — toggle (ADMIN)

# Tickets
POST  /api/tickets                       — create ticket (USER)
GET   /api/tickets                       — own (USER) / all w/ filters (ADMIN, SUPPORT)
GET   /api/tickets/:id                   — ticket + messages (Owner / ADMIN / SUPPORT)
PATCH /api/tickets/:id/status            — update status (ADMIN, SUPPORT; USER=CLOSED own only)
PATCH /api/tickets/:id/assign            — assign to staff (ADMIN, SUPPORT)
PATCH /api/tickets/:id/priority          — set priority (ADMIN, SUPPORT)

# Messages
POST /api/tickets/:id/messages           — add message / internal note (Owner / ADMIN / SUPPORT)
```

---

**F18 — Resource Capacity Lock** *(Phase 14 — Complete ✅)*

Prevents VPS order creation when the Proxmox node lacks sufficient RAM or disk to provision the requested package. Checked at order time — before payment — so users cannot queue orders the system cannot fulfill.

*Capacity Check Flow (at `POST /api/orders`):*
1. `orderService.create()` calls `capacityService.check(packageId)` before creating the order record
2. `capacityService` fetches Proxmox node status via `GET /nodes/{node}/status` (cached 30 s in Redis key `capacity:node:{node}`)
3. `capacityService` fetches storage status via `GET /nodes/{node}/storage/{storage}/status` (same 30 s cache)
4. Calculates effective available:
   - `effective_free_ram_mb = node.maxmem_mb - node.mem_mb - Σ(temp_vps.memory where deleted_at IS NULL)`
   - `effective_free_disk_gb = storage.avail_gb - Σ(temp_vps.disk_gb where deleted_at IS NULL)`
   - `temp_vps` rows represent paid-but-not-yet-live VMs Proxmox may not yet reflect in node stats
5. Checks: `effective_free_ram_mb ≥ package.memory + min_free_ram_mb` AND `effective_free_disk_gb ≥ package.disk + min_free_disk_gb`
6. Fail → throw `INSUFFICIENT_RESOURCES` (HTTP 409); body includes `{ required_ram_mb, available_ram_mb, required_disk_gb, available_disk_gb }`

*Admin Bypass:* ADMIN may pass `{ force: true }` in order request body to skip the check (e.g., manual provisioning when admin knows actual capacity).

*Admin Monitoring:* `GET /api/system/capacity` returns current node snapshot (total/used/free RAM, disk, CPU %) from the same Redis-cached call. Available to ADMIN and SUPPORT.

*Frontend Package Availability:* `GET /api/packages` (public) includes `available: boolean` per package — `true` if the node has sufficient RAM and disk for that package, `false` if not. Frontend uses this to disable package cards/buttons before the user even tries to order. Degrades gracefully: if `capacity.check_enabled=false` or Proxmox is unreachable, all packages show `available: true` (never blocks the package list).

*System Config keys (3 new — total becomes 21, then 22 after Phase 15 adds `payment.slip_mode`):*
- `capacity.check_enabled` — `"true"` / `"false"` (default `"true"`) — global toggle
- `capacity.min_free_ram_mb` — buffer RAM in MB to keep free after allocation (default `"1024"`)
- `capacity.min_free_disk_gb` — buffer disk in GB to keep free after allocation (default `"10"`)

*No new DB tables.* Uses existing `temp_vps` + `system_configs`.

*Files to create:*
- `src/services/capacity.service.ts` — `getSnapshot()` (Redis cached 30s, returns null if unreachable), `isPackageFit(vm, snapshot, buffers)`, `check(packageId, force?)` (throws on fail), `getNodeSnapshot()` (throws if unreachable — for admin view)

*Files to modify:*
- `src/services/proxmox.service.ts` — add `getNodeStatus(node)`, `getStorageStatus(node, storage)`
- `src/services/package.service.ts` — `listActive()` calls `capacityService.getSnapshot()` (catch → null), maps each package with `available: isPackageFit(pkg.vm, snapshot, buffers) ?? true`
- `src/services/order.service.ts` — call `capacityService.check(packageId, force)` in `create()` before insert; honour `force` flag for ADMIN
- `src/controllers/order.controller.ts` — pass `force` flag from request body to service
- `src/routes/order.route.ts` — add optional `force: t.Optional(t.Boolean())` to POST body schema
- `src/controllers/system.controller.ts` — add `getCapacity()` handler (or new `capacity.controller.ts`)
- `src/routes/system.route.ts` — `GET /api/system/capacity` (ADMIN, SUPPORT)
- `prisma/seed.ts` — seed 3 new capacity config keys
- `src/index.ts` — register system route if not exists

*Audit:*
- `capacityService.check()` skip (force=true by ADMIN) logged as `BYPASS CAPACITY_CHECK` with metadata `{ package_id, node_snapshot }`

*API:*
- `GET /api/packages` — now includes `available: boolean` per package (public endpoint, no auth required)
- `GET /api/system/capacity` — live node snapshot: total/used/free RAM + disk + CPU % (ADMIN, SUPPORT)

---

**F16 — VPS Web Terminal (noVNC + Power Controls)** *(Phase 12 — Complete ✅)*

Web-based terminal access to VPS via Proxmox noVNC, plus live power controls. Backend proxies the Proxmox WebSocket so Proxmox stays on the internal network and is never exposed to the browser.

*noVNC Flow:*
1. Client calls `GET /api/terminal/:vps_id/token` → backend calls Proxmox `POST /nodes/{node}/qemu/{vmid}/vncproxy` to get a short-lived VNC ticket + port
2. Backend signs a 30-second JWT containing `{ vmid, ticket, port }` and returns it to the client
3. Client opens `WS /api/terminal/:vps_id?token=xxx`
4. Backend verifies JWT, opens a WebSocket to Proxmox noVNC (`wss://{proxmox_host}:{port}/api2/json/nodes/{node}/qemu/{vmid}/vncwebsocket?...`), and bridges both WebSockets bi-directionally
5. Client passes the bridged connection to the noVNC library — full VM console rendered in browser

*Power Controls (new endpoints added alongside existing start/stop/reboot):*
- `POST /api/vps/:id/reset` — force reset (ACPI hard reset via Proxmox)
- `GET /api/vps/:id/status` — live CPU %, RAM usage, uptime from Proxmox (deferred since Phase 8; implemented here)

*RBAC:*
- USER: access own VPS terminal + power controls only
- ADMIN: access any VPS terminal + power controls; every action audit-logged with target `user_id`
- SUPPORT: `GET /api/vps/:id/status` read-only; no terminal access

*Audit:*
- `VIEW VPS_TERMINAL` — user opens terminal token request
- `ADMIN_VIEW VPS_TERMINAL` — admin opens terminal for another user's VPS (metadata: `{ vps_id, target_user_id }`)
- `POWER_ACTION VPS` — reset action (start/stop/reboot already logged via existing F5 audit)

*Files to create:*
- `src/services/terminal.service.ts` — `getVncToken()`, JWT sign/verify for terminal sessions
- `src/controllers/terminal.controller.ts` — token REST handler + WebSocket proxy handler
- `src/routes/terminal.route.ts` — `GET /token` + `WS /` routes

*Files to modify:*
- `src/services/proxmox.service.ts` — add `getVncProxy(vmid)` method
- `src/routes/vps.route.ts` — add `POST /:id/reset` + `GET /:id/status`
- `src/controllers/vps.controller.ts` — add `reset()` + `status()` handlers
- `src/index.ts` — register `terminalRoutes`, add "Terminal" Swagger tag

*API:*
- `GET /api/terminal/:vps_id/token` — get short-lived terminal token (USER own / ADMIN any)
- `WS /api/terminal/:vps_id?token=xxx` — WebSocket proxy to Proxmox noVNC (token auth)
- `POST /api/vps/:id/reset` — force reset VM (USER own / ADMIN any)
- `GET /api/vps/:id/status` — live Proxmox metrics: status, cpu%, mem, maxmem, uptime (USER own / ADMIN / SUPPORT)

---

**F19 — VPS Credential Delivery + In-App Password Change** *(Phase 16 — Complete ✅)*

Two linked features: (1) deliver random credentials to user by email right after VPS is provisioned, and (2) allow users to change their VPS OS password through the web UI, verified with an email OTP.

*Prerequisite:* `qemu-guest-agent` must be installed inside the VM template (vmid 100 — `ubuntu-cloudinit`). Without the agent running inside the VM, Proxmox cannot execute commands in the guest OS. See installation guide in `docs/PROGRESS.md` Phase 16 notes.

*F19a — Auto Credential Delivery on Provision:*
1. During `vps.service.ts` provision flow, generate a random 16-character alphanumeric password (`[A-Za-z0-9]` — no shell metacharacters)
2. Pass `cipassword` to `proxmoxService.configureVm()` alongside existing cloud-init config
3. After `provision_complete`, send email to VPS owner with: IP address, username (`proxmox.default_user.linux` / `proxmox.default_user.windows`, resolved by OS), password
4. Password is **not stored in DB** — delivered once via email; user resets via terminal or in-app change if forgotten

*F19b — In-App Password Change with OTP:*
1. User clicks "Change Password" on VPS detail page
2. `POST /api/vps/:id/change-password/request` — backend generates 6-digit OTP, stores bcrypt hash in Redis (TTL 5 min, max 5 attempts), sends OTP email
3. User submits new password + OTP: `POST /api/vps/:id/change-password/confirm { otp, new_password }`
4. Backend verifies OTP → resolves `osType` (`linux` | `windows`) from the VPS's OS name → calls `proxmoxService.changeVmPassword(vmid, username, newPassword, osType)` via `POST /nodes/{node}/qemu/{vmid}/agent/exec`:
   - **Linux:** `chpasswd` via stdin (`input-data: "user:pass\n"`)
   - **Windows:** PowerShell `Set-LocalUser` via `-EncodedCommand` (base64 UTF-16LE script, built by `buildWindowsPasswordChangeCommand()`). ~~`net user <username> <password>`~~ was tried first but is unreliable here — it spawns `net1.exe` as a child process, which is flaky in `guest-exec`'s non-interactive SYSTEM session (no console/window station): it reports exit code 0 but silently does not change the password (confirmed live — the account's "Password last set" timestamp never advanced despite repeated "successful" calls). `Set-LocalUser` touches the SAM directly with no subprocess involved.
5. On success: delete OTP from Redis, send "password changed" confirmation email

*RBAC:*
- USER: own VPS only
- ADMIN: any VPS
- SUPPORT: no access

*Audit:*
- `UPDATE VPS_TERMINAL` with metadata `{ action: "password_change" }` on successful change

*Password Constraints (new_password):*
- 8–64 characters
- Allowed: `[A-Za-z0-9!@#%^&*()_+\-=]`
- Forbidden: `"`, `` ` ``, `$`, `\`, `:` — to prevent `chpasswd` parse errors (Linux path); safe as-is for the Windows `net user` args-array path since guest-agent exec never invokes a shell

*Files to create:* none

*Files to modify:*
- `src/services/proxmox.service.ts` — add `changeVmPassword(vmid, username, password, osType)` (agent/exec; branches `chpasswd` vs `net user` by OS) + add `cipassword` param to `configureVm()`
- `src/services/vps.service.ts` — generate password in `provision()`, add `requestPasswordChange()`, `confirmPasswordChange()`
- `src/controllers/vps.controller.ts` — add `requestPasswordChange()`, `confirmPasswordChange()` handlers
- `src/routes/vps.route.ts` — add `POST /:id/change-password/request` + `POST /:id/change-password/confirm`
- `src/services/email.service.ts` — add `sendVpsProvisioned()`, `sendVpsPasswordOtp()`, `sendVpsPasswordChanged()`
- `src/services/email-template.service.ts` — add `VPS_PROVISIONED`, `VPS_PASSWORD_OTP`, `VPS_PASSWORD_CHANGED` templates
- `prisma/seed.production.ts` — add 3 new email templates

*API:*
- `POST /api/vps/:id/change-password/request` — send OTP to email (USER own / ADMIN any)
- `POST /api/vps/:id/change-password/confirm` — verify OTP + change password (USER own / ADMIN any)
