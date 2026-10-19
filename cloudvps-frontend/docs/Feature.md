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

CloudVPS is a VPS Cloud rental service that controls Proxmox VE through its API. The system includes 7 core features:

**F1 — RBAC (Role-Based Access Control)**
Access control with 3 groups: Admin (full management), Support (VPS and user management), Users (service consumers). Uses the roles table linked to users with JWT for authentication.

**F2 — Account Management**
Register and login via Email+Password, Google, Discord with email verification. User data is split into 2 tables: users for credentials and users_info for personal details and address.

**F3 — Package Management**
Admin creates VPS packages composed of OS template (os table) + VM spec such as CPU/RAM/Disk (vm table) + price and period. Includes 8 predefined packages (as defined in the project documentation) ranging from 2 cores/4GB RAM to 10 cores/20GB RAM. Custom VPS option available for Users. Packages optionally define `port_count` (Int?): null = Public IP (direct), number = Private IP + NAT port block of that size via MikroTik CHR (see F11). Packages optionally belong to a `package_categories` (see F13). Admin package list/create/edit (`/admin/packages`) operates on spec-key groups rather than individual DB rows — one spec + multi-select OS, create/edit/delete cascades to all OS-variant rows in the group (REQ-F3.9); no backend/DB change, pure frontend grouping shared with the order picker (REQ-F3.8).

**F4 — PDPA and Terms of Service**
Policy management via the policies table supporting 2 types (PDPA, TERMSERVICE) with versioning. Users and Support must accept the latest policies during registration or login. Consent records are stored in the consents table.

**F5 — VPS Management**
Integrates with Proxmox VE API to clone templates, set specs, assign IPs, and start/stop/reboot VMs. Features 2 IP pool types (Public and Private). Flow: order paid → create temp_vps (fire-and-forget) → clone Proxmox template → configure cloud-init → start VM → create vps record + delete temp_vps. Supports soft delete, auto-expiration (cron), and auto-renew (F10). Admin can force-delete any VPS immediately via `DELETE /api/vps/:id` (bypasses grace period, releases IP, notifies user). Private IP VMs also trigger NAT port block allocation via MikroTik CHR (see F11).

**F6 — Payment System**
Supports 3 channels: TRUEMONEY Angpao (auto-verified via API), SLIP via SlipOK (auto-verified), PROMPTPAY QR (upload slip → Admin/Support manual approval). Includes a promotions system supporting DISCOUNT (flat amount) and PERCENT (percentage) types with expiry dates. PromptPay number and bank account details are admin-configurable via `system_configs` (`payment.promptpay_id`, `payment.bank_code`, `payment.bank_account_no`, `payment.bank_account_name`) and served to any authenticated role via `GET /api/system-configs/payment-info`; a payment method is hidden on checkout when its config isn't set *(2026-07-02)*.

**F7 — Support System** *(superseded by F17)*
~~Contact support via Facebook Fanpage (external system).~~ Replaced with in-app ticket system (see F17).

**F8 — System Config Management** *(Phase 4 — Complete ✅, expanded through 2026-07-02)*
Runtime-editable configuration store. **31 keys total** across 5 categories: 12 Proxmox VE (`proxmox.*` — connection/provisioning, plus `proxmox.bridge.public`/`.private` and `proxmox.default_user.linux`/`.windows` split from single keys) + 3 pricing (`pricing.cpu_per_core`, `pricing.ram_per_gib`, `pricing.disk_per_gb`) + 5 MikroTik (`mikrotik.*`) + 3 capacity-lock (`capacity.*`) + 8 payment (`payment.slip_mode`, `payment.promptpay_id`, `payment.bank_code`, `payment.bank_account_no`, `payment.bank_account_name`, `payment.slipok_api_key`, `payment.slipok_branch_id`, `payment.truemoney_mobile`). Admin sets values via `PUT /api/system-configs/:key`; system reads DB first, falls back to `.env`. Values cached in Redis (60s TTL) so changes take effect without restart. Admin/Support view the full list via `GET /api/system-configs` (secrets masked as `***`); any authenticated role can read the 3 pricing keys via `GET /api/system-configs/pricing` and the 2 payment-display keys via `GET /api/system-configs/payment-info`. All updates are audited (`UPDATE SYSTEM_CONFIG`). Config keys are pre-seeded; no new keys can be created via API.

SlipOK and TrueMoney credentials are now admin-configurable via `system_configs` (see above), falling back to `.env` when unset — no longer `.env`-only.

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

*Mode B — Custom Resource:*
User specifies new cores/RAM/disk individually at admin-defined unit prices (`pricing.cpu_per_core`, `pricing.ram_per_gib`, `pricing.disk_per_gb` from system_configs). Added resources charge pro-rate; reduced resources free. Disk cannot shrink (Proxmox limitation). `monthly_price` updated by delta. Frontend shows a live cost preview as the user types, computed client-side from `GET /api/system-configs/pricing` (any authenticated role) using the same formula as the backend *(2026-07-02)*.

*Apply Flow:*
Orders with amount > 0 remain PENDING until payment (same flow as renewal). Amount = 0 auto-approved immediately. After payment, `upgradeService.applyUpgrade()` fires and-forget: acquires Redis lock, calls Proxmox `updateVmResources` + `resizeDisk` + `rebootVm`, then updates `vps.current_*` and `monthly_price`.

*Accounting Trail:*
`vps_upgrade_logs` records before/after specs + amount_charged for every upgrade (including free downgrades). `applied_at` null = pending/failed; filled on successful Proxmox apply.

*RBAC:*
Users upgrade/downgrade their own VPS. Admin/Support upgrade any VPS. A PENDING upgrade order can be cancelled by the user like any other order *(changed 2026-07-02)*; `CANNOT_CANCEL_UPGRADE` (403) now only fires once the upgrade has actually been applied (VPS specs already changed) — cancelling before that marks the `vps_upgrade_logs` entry `failed_at` and the upgrade never applies.

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

**F17 — In-App Support Ticket System** *(Phase 13 — Complete ✅)*

Full in-app helpdesk. Users open tickets, Staff replies in threaded messages, with category/priority management and email notifications.

*Status flow:* `OPEN → IN_PROGRESS → WAITING_USER → RESOLVED → CLOSED`

*Roles:*
- USER: create own tickets, view own tickets, add messages, close own ticket
- SUPPORT: view all tickets, reply (public/internal note), update status/priority, self-assign
- ADMIN: full access + manage categories + assign any staff by User ID

*Key features:*
- Internal notes (`is_internal=true`) — visible to Staff only
- Ticket categories managed by Admin (`/admin/ticket-categories`)
- Priority: LOW / MEDIUM / HIGH / URGENT — set by Staff
- Email notifications: `TICKET_REPLY` on staff reply, `TICKET_CLOSED` on close
- `ref_no` format: `TKT-YYYYMMDD-XXXXX`

*API endpoints:*
- `GET /api/tickets/categories` — active categories (public)
- `GET /api/tickets/categories/all` — all incl. inactive (ADMIN)
- `POST /api/tickets/categories` — create (ADMIN)
- `PUT /api/tickets/categories/:id` — update (ADMIN)
- `PATCH /api/tickets/categories/:id/status` — toggle (ADMIN)
- `POST /api/tickets` — create ticket (USER)
- `GET /api/tickets` — list tickets (role-filtered)
- `GET /api/tickets/:id` — ticket detail + messages
- `PATCH /api/tickets/:id/status` — update status (ADMIN/SUPPORT)
- `PATCH /api/tickets/:id/assign` — assign staff (ADMIN/SUPPORT)
- `PATCH /api/tickets/:id/priority` — set priority (ADMIN/SUPPORT)
- `POST /api/tickets/:id/messages` — add message

*Frontend pages:*
- `/tickets` — USER ticket list with status filter
- `/tickets/new` — create ticket form (category + title + message)
- `/tickets/[id]` — ticket detail + reply (USER view, hides internal notes)
- `/support/tickets` — SUPPORT ticket table with status/priority filter
- `/support/tickets/[id]` — ticket detail + reply + self-assign + status/priority controls
- `/admin/tickets` — ADMIN ticket table with assign column
- `/admin/tickets/[id]` — ticket detail + assign by User ID + full controls
- `/admin/ticket-categories` — CRUD ticket categories

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
