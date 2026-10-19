# CloudVPS - System Specification

## 1. System Architecture

### 1.1 Tech Stack

- Backend: Bun + Elysia.js + TypeScript
- ORM: Prisma
- Database: PostgreSQL (database name: cloudvps) — see SCHEMA.md for full schema
- Cache: Redis
- Infrastructure: Proxmox VE API
- Payment Gateways: Truemoney Angpao, SlipOK (Slip verify), PromptPay (Manual verify)

### 1.2 System Flow

The Frontend (TBD) communicates with the Backend via REST API. The Backend connects to PostgreSQL through Prisma ORM, uses Redis for caching, calls the Proxmox VE API to create and manage VMs, and integrates with payment gateways for payment processing.

### 1.3 Core Modules

1. Auth & RBAC — JWT authentication with 3 roles via the roles table (Admin, Support, Users)
2. Account — User account management, personal info, email verification (tables: users + users_info)
3. Packages & Categories — VPS package management + category grouping (tables: packages + os + vm + package_categories)
4. Legal (PDPA/ToS) — Privacy policy and terms of service management with versioning and consent tracking (tables: policies + consents)
5. VPS Management — Create/manage VPS via Proxmox API with IP allocation, expiry, auto-renew (tables: vps + temp_vps + ip_assignments + ip_pools)
6. Orders & Payment — Order processing, payment (TrueMoney, SlipOK, PromptPay), promotions (tables: orders + transactions + promotions + promo_usages)
7. NAT / Port Forwarding — MikroTik CHR NAT rule management for private-IP VPS (tables: nat_rules)
8. VPS Upgrade — In-place CPU/RAM/Disk upgrade with pro-rate pricing (tables: vps_upgrade_logs)
9. Admin Tools — Broadcast emails, audit logs, system config, capacity checks, user creation
10. Email Templates — DB-backed editable email templates (table: email_templates)
11. Support Tickets — In-app ticket system with file attachments (tables: ticket_categories + tickets + ticket_messages)
12. System Health — Live /health endpoint with DB/Redis/Proxmox status

---

## 2. Folder Structure

- src/config/ — Configuration files (environment variables, Proxmox config, Redis config)
- src/controllers/ — Route handlers (auth, user, vps, package, order, payment, promotion, ip, legal)
- src/services/ — Business logic and external integrations
  - proxmox.service.ts — Proxmox API communication
  - payment/truemoney.service.ts — Truemoney Angpao verification
  - payment/slipok.service.ts — SlipOK slip verification (FILE + BASE64 dual-mode)
  - payment/promptpay.service.ts — PromptPay manual flow
  - vps.service.ts — VPS management (provision, expiry, renew, upgrade)
  - order.service.ts — Order management
  - ip.service.ts — IP allocation management
  - auth.service.ts — Login, JWT, registration
  - promotion.service.ts — Promotion management
  - audit.service.ts — Admin/Support action audit log (append-only, fire-and-forget)
  - broadcast.service.ts — Email broadcast (template builder, allSettled send, DB record)
  - email.service.ts — Transactional email sending via Nodemailer
  - system-config.service.ts — Runtime config key/value store with Redis cache (TTL 60s)
  - mikrotik.service.ts — MikroTik CHR REST API for NAT rule management [Phase 8]
  - nat.service.ts — NAT port block allocation and rule CRUD [Phase 8]
  - upgrade.service.ts — VPS in-place resource upgrade + pro-rate pricing [Phase 9]
  - email-template.service.ts — DB-backed email templates with Redis cache (TTL 5 min) [Phase 11]
  - policy.service.ts — PDPA/ToS policy and user consent management
  - ticket.service.ts — Support ticket + message CRUD [Phase 13]
  - capacity.service.ts — Proxmox node resource capacity check with Redis cache [Phase 14]
- src/middlewares/ — Auth guard, RBAC validation, rate-limit
- src/routes/ — API route definitions (auth, user, vps, order, payment, promotion, ip, legal, broadcast, audit, email-template, nat, system-config, system, ticket, upgrade)
- src/utils/ — Helper functions, logger, validators, constants
- src/types/ — Global TypeScript interfaces and types
- src/index.ts — Application entry point (Elysia setup)
- prisma/schema.prisma — Database schema definition
- prisma/migrations/ — Database migrations
- prisma/seed.ts — Initial seed data (roles, packages, ip_pools, policies)
- tests/ — Unit and integration tests

---

## 3. Development Plan

### Phase 1: Foundation ✅ Complete
- Initialize Bun + Elysia project
- Setup Prisma + PostgreSQL and create initial 16 tables (schema has since grown to 28 tables)
- Setup Redis connection
- Seed roles data (Admin, Support, Users)
- Implement Auth system (register, login, JWT, email verification)
- Implement RBAC middleware
- Implement CRUD for users + users_info

### Phase 2: Legal & Packages ✅ Complete
- Implement CRUD for policies (Admin creates PDPA/ToS versions)
- Implement consents system (Users accept policies on register/login)
- Implement CRUD for os + vm (Admin defines OS templates and VM specs)
- Implement CRUD for packages (Admin composes Package = OS + VM + price + period)
- Implement CRUD for promotions (Admin creates promo codes)
- Add `admin_audit_logs` table to schema (enums: AuditAction, AuditEntity)
- Implement `audit.service.ts` with `auditService.record()` — fire-and-forget, append-only
- Inject audit calls into package + promotion controllers (P3 priority actions)
- Migration applied, Prisma client regenerated, seed data loaded

### Phase 3: Orders & Payment ✅ Complete
- Implement order flow (User selects package → create order → status PENDING)
- Implement transactions with payment integrations:
  - Truemoney Angpao API verification (auto)
  - SlipOK webhook/API (auto)
  - PromptPay manual upload + Admin/Support approval
- Order status lifecycle: PENDING → PAID / CANCEL / EXPIRE
- Transaction status lifecycle: PENDING → SUCCESSFUL / REJECT
- temp_vps created automatically when order transitions to PAID
- Payment rate limit 5 req/min per IP (SEC-G9)
- Inject P1 audit calls into user controller: `toggleUserStatus` (DISABLE/ENABLE USER) and `changeUserRole` (ROLE_CHANGE)
- Inject P1 audit calls into transaction controller (approve/reject) and order controller (cancel by Admin)
- TrueMoney URL fixed: `{TRUEMONEY_API_URL}/{voucherCode}/redeem` + body `{"mobile": "..."}` only

**Post-QA Fixes (2026-05-01 — แก้แล้วทั้งหมด ✅):**
- TX-SLIP-1 ✅: PROMPTPAY `slip_image` เป็น optional แล้ว + size validation conditional
- TX-DUP-1 ✅: เพิ่ม PENDING transaction guard สำหรับ PROMPTPAY ป้องกัน duplicate submission
- AUTH-SEC-1 ✅: Redis token blocklist `token_block:{token}` ใน logout + middleware check
- SlipOK rewrite ✅: แก้ field `data`→`files`, success check `!response.ok`, เพิ่ม `amount` param + error code mapping (1010–1014)

### Phase 4: VPS Provisioning & IP Management ✅ Complete
- Integrate Proxmox API: clone OS template, configure CPU/RAM/Disk, assign IP, start VM
- Auto-provision on order paid: fire-and-forget after `completePaidOrder()`, non-blocking
- Failure mode: `temp_vps` stays in DB as retry queue, user opens support ticket
- Support/Admin manual retry endpoint + provision queue view
- VPS actions: Start, Stop, Reboot (Users: own VPS only; Admin/Support: any VPS + audit P2)
- IP pool management: CRUD for `ip_pools` + `ip_assignments` allocation logic (Admin only, audit P3)
- Wire `vpsRoutes` + `ipRoutes` into `src/index.ts`
- Full API spec: see `docs/Workflow_api.md` Module 8–9

**Post-QA Fixes (2026-05-04 — แก้แล้วทั้งหมด ✅):**
- VPS-BLK-1 ✅: `ip.service.ts` — `allocate()` atomic via `SELECT FOR UPDATE SKIP LOCKED`
- VPS-H1 ✅: `vps.service.ts` — configure fail → release IP + deleteVm + return
- VPS-H2 ✅: `vps.service.ts` — pollTask result check in start/stop/reboot
- VPS-M1 ✅: `ip.controller.ts` — active assignment guard before IP update
- VPS-M2 ✅: `ip.route.ts` — IP regex pattern validation
- VPS-M3 ✅: `vps.service.ts` — Redis provision lock `provision_lock:{orderId}`
- VPS-L1–L3 ✅: deleteVm cleanup, parseMemoryMiB logging, VPS action rate limit (10/60s)

### System Config Management ✅ Complete (2026-05-04)
- New table `system_configs` — key/value store for runtime-editable configuration (started with 10 proxmox keys; grown to 22 keys total as of Phase 15: +5 mikrotik [Phase 8] + 3 pricing [Phase 9] + 3 capacity [Phase 14] + 1 payment [Phase 15])
- `system-config.service.ts` — get/set with Redis cache (TTL 60s, null sentinel), env fallback when value = null
- `system-config.controller.ts` + `system-config.route.ts` — REST API `/api/system-configs`
- `proxmox.service.ts` + `vps.service.ts` — reads from `system_configs` DB first, falls back to `PROXMOX_*` env
- Seeded 10 proxmox config keys + 3 pricing keys (pricing.cpu_per_core, pricing.ram_per_gib, pricing.disk_per_gb) [Phase 9]; SMTP and payment credentials configured via `.env` only
- Audit: every `PUT /api/system-configs/:key` records `UPDATE SYSTEM_CONFIG`
- DB migration required: `bunx prisma migrate dev --name add_system_configs`

**Post-QA Fixes — Phase 4 Post-Fix + System Config (2026-05-04 — แก้แล้วทั้งหมด ✅):**
- VPS-BLK-2 ✅: `vps.service.ts` Step 4 — wrap `prisma.$transaction` ใน try/catch → fail → stopVm + deleteVm + release IP + return
- IP-H1 ✅: `ip.route.ts` PATCH `/:id` — เพิ่ม IPv4/IPv6 regex `pattern` บน `ip` field (เหมือน POST)
- SYSCFG-M1 ✅: `system-config.service.ts` — null cached ด้วย `"__NULL__"` sentinel → ป้องกัน DB spam ขณะ config ยังไม่ตั้งค่า
- IP-M1 ✅: `ip.controller.ts` `toggleStatus()` — ตรวจ active assignment ก่อน disable pool → 409

### Phase 5: Admin & Monitoring ✅ Complete (2026-05-10)

#### VPS Expiry & Renewal ✅ Complete (2026-05-10)

Design decisions:
- `expired_at` set at provision time (`now + package.period` days)
- **Expiry flow**: cron daily 02:00 (Asia/Bangkok) → stop VM → `order.status = EXPIRE` → email user → 7-day grace → delete VM + release IP + soft delete
- **Renewal flow**: `POST /api/vps/:id/renew` → renewal order (`renewal_vps_id` set) → user pays normally → on paid: `vpsService.renew()` extends `expired_at`, restarts VM if was EXPIRE
- **Notifications**: email 7d before + 1d before expiry
- **Grace period**: 7 days (stop at expiry, delete when `expired_at + 7d <= now`)

Schema change (2026-05-08):
- `orders.renewal_vps_id Int?` — links renewal order → existing VPS
- Named relations `"vps_provision"` / `"vps_renewals"` on orders ↔ vps
- Migration: `bunx prisma migrate dev --name add_renewal_vps_id` ✅ Applied (20260510025531)

Files implemented (2026-05-10):
- `src/jobs/expiry.job.ts` — 4 cron tasks (notify_7d, notify_1d, stop_expired, delete_grace) using `node-cron@4.2.1`
- `src/services/vps.service.ts` — `expire()`, `deleteExpired()`, `renew()`
- `src/services/email.service.ts` — `sendExpiryWarning()`, `sendExpired()`
- `src/services/order.service.ts` — `create()` accepts optional `renewalVpsId`
- `src/services/transaction.service.ts` — `completePaidOrder()` `isRenewal` flag; `renewal_vps_id` check in 3 payment paths; `approve()` query includes `package.period`
- `src/controllers/vps.controller.ts` — `renewVps()` handler
- `src/routes/vps.route.ts` — `POST /:id/renew` in rate-limited guard
- `src/index.ts` — `startExpiryJobs()` after `.listen()`

#### Admin Monitoring & Broadcast ✅ Complete (2026-05-10)

**Audit Logs endpoint:**
- `GET /api/audit-logs` — ADMIN only, filters: actor_id, entity, action, target_user_id, from/to date range, pagination
- `src/controllers/audit.controller.ts` + `src/routes/audit.route.ts` — dynamic Prisma `where` build, includes actor + target_user email

**logger.admin():**
- Added `admin(event, meta)` to `src/utils/logger.ts` — writes to `admin.log`

**VPS-L4 — live status sync:**
- `vpsService.getById()` now calls `proxmoxService.getVmStatus(vmid)` after DB fetch
- Returns `live_status: { status, cpu, mem, maxmem, uptime }` (null if Proxmox unreachable)

**PROX-OBS-2 fix:**
- `vpsService.stop()` — pollTask timeout increased 60s → 120s (prevents false 502 on graceful shutdown)

**Email Broadcast (F9):**
- New table `email_broadcasts` + enums `BroadcastType` (MAINTENANCE/EMERGENCY/ANNOUNCEMENT) + `BroadcastTarget` (ALL/ACTIVE_VPS/EXPIRING_SOON)
- Added `BROADCAST` to `AuditAction`; `EMAIL_BROADCAST` to `AuditEntity`
- `src/services/broadcast.service.ts` — HTML template builder + `Promise.allSettled` send + DB record
- `src/controllers/broadcast.controller.ts` + `src/routes/broadcast.route.ts`
- Rate limit: 5 req/hour (keyPrefix: `broadcast`); ADMIN only
- Migration applied ✅ 20260510031052: `bunx prisma migrate dev --name add_email_broadcasts`

### Phase 6: Testing & Deployment — In Progress 🔧

**Pre-Phase-6 fixes (2026-05-10 — แก้แล้วทั้งหมด ✅)**
- ✅ Swagger docs — `@elysiajs/swagger` at `/docs`, 12 route groups tagged at Phase 6 (now 18 route groups total after Phases 8–15)
- ✅ CORS — `@elysiajs/cors`, `src/index.ts` migrated to `env.corsOrigin` (was `process.env.CORS_ORIGIN` inline)
- ✅ Rate limiting — configured per module across all phases
- ✅ Input validation — `t.Object()` Elysia schemas on all routes
- ✅ Integration tests: 66 phase1-3 + 66 phase4 + 47 phase5+7 + 13 phase9 = 192 total
- ✅ `GET /api/broadcasts/:id` — implemented + unit tested + integration tested
- ✅ `tests/api-test.html` — เพิ่ม "Get Broadcast By ID" section ใน Admin panel

**QA Remediation — Pre-Staging Fixes (2026-05-10 ✅)**
- SCHEMA-BLK-1 ✅: `src/types/index.ts` — เพิ่ม `"email_verify"` ใน `JwtPayload.type` union (TypeScript strict mode)
- SCHEMA-H1/H2/H3 + SCHEMA-M1 ✅: `prisma/schema.prisma` — เพิ่ม indexes บน 9 tables (FK columns + expiry query columns)
- ROUTE-H1 ✅: `src/routes/broadcast.route.ts` — เพิ่ม `params: t.Object({ id: t.Numeric() })` บน GET `/:id`
- SVC-M2 ✅: `src/services/vps.service.ts` — `renew()` pollTask timeout 60s → 120s
- SVC-M4 ✅: `src/routes/ip.route.ts` — IPv4 regex เปลี่ยนเป็น 0-255 range validation (POST + PATCH)
- CTRL-M2 ✅: `src/controllers/audit.controller.ts` — เพิ่ม `isNaN(d.getTime())` guard สำหรับ date query params → 400
- JOB-M1 ✅: `src/jobs/expiry.job.ts` — Stagger 4 cron tasks 5 นาที (02:00, 02:05, 02:10, 02:15)
- `tests/api-test.html` ✅ — rewrite ครอบคลุมทุก route + PROMPTPAY slip field fix
- Migration applied ✅: `20260511083133_add_missing_indexes`

**QA Fix & Test Session (2026-05-12 — แก้แล้วทั้งหมด ✅)**
- **RL-BLK-1** ✅ `src/middlewares/rate-limit.middleware.ts` — **PRODUCTION BUG**: rate limit hooks ใช้ default `local` scope ใน Elysia v1.x → ไม่ทำงานสำหรับ routes ใน parent app เลย; แก้ด้วย `{ as: "global" }` บน `.derive()` + `.onBeforeHandle()`
- **SVC-L1** ✅ `src/services/audit.service.ts` — `.catch(() => {})` → `.catch((e) => logger.error(...))` ป้องกัน silent audit trail loss

New test files (69 tests added, total **302 pass** at Phase 5; **333 pass** after Phase 9):
- `tests/middlewares/rate-limit.middleware.test.ts` — 12 tests (rate limit correctness, Redis INCR/EXPIRE logic, RL-BLK-1 verification)
- `tests/isolated/email.service.test.ts` — 11 tests (runs in separate process to avoid mock conflicts with auth/broadcast tests)
- `tests/unit/system-config.service.test.ts` — 17 tests (Redis cache, null sentinel, flushCache SCAN loop)
- `tests/unit/user.controller.test.ts` — 23 tests (changePassword, changeEmail, toggleUserStatus, changeUserRole)
- `tests/services/auth.service.test.ts` — +3 tests (logout Redis blocklist creation)
- `tests/unit/broadcast-service.test.ts` — +3 tests (EXPIRING_SOON lower bound, deleted_at exclusion)

`tests/isolated/` — directory สำหรับ tests ที่ต้องรัน process แยก (mock.module conflicts ระหว่าง email.service กับ auth/broadcast mocks)

**Remaining Phase 6 tasks:**
- [ ] Staging deploy (Docker Compose on VPS, set all `.env` production values)
- [ ] Smoke test all endpoints on staging
- [ ] (Optional) Load test rate-limit thresholds

### Phase 7: Promo Limits & Auto-Renew — Complete ✅ (2026-05-12)

**Schema additions (migration: `add_promo_limits_auto_renew`):**
- `promotions.max_uses Int?` — global usage cap; null = unlimited
- `promotions.max_uses_per_user Int?` — per-user cap; null = unlimited
- `promotions.used_count Int @default(0)` — global counter (incremented atomically in order create TX)
- `vps.auto_renew Boolean @default(false)` — enable cron-driven renewal order creation
- `vps.locked_promo_id Int?` — lock a promo code for all auto-renewal orders on this VPS
- New model `promo_usages` (id, promotion_id, user_id, order_id, created_at) — tracks per-user promo usage; order_id is UNIQUE to prevent double-count

**F1 — Promo usage limits (`src/services/order.service.ts`):**
- Before applying promo: check `used_count >= max_uses` → `PROMO_LIMIT_REACHED` (409)
- Before applying promo: count `promo_usages` for `(promotion_id, user_id)` vs `max_uses_per_user` → `PROMO_USER_LIMIT_REACHED` (409)
- Order create, `promo_usages.create`, and `promotions.used_count` increment done in one `$transaction`

**F2 — Auto-renew toggle (`src/services/vps.service.ts`, `src/controllers/vps.controller.ts`, `src/routes/vps.route.ts`):**
- `vpsService.toggleAutoRenew(vpsId, userId, role, autoRenew, lockedPromoId?)` — validates promo still active if provided
- `PATCH /api/vps/:id/auto-renew` body: `{ auto_renew: boolean, locked_promo_id?: number | null }`
- Users: own VPS only; Admin/Support: any VPS

**F3 — Auto-renew cron (`src/jobs/expiry.job.ts`):**
- 5th task at 02:20 Asia/Bangkok — finds VPS with `auto_renew=true, deleted_at=null, expired_at ≤ 3 days away`
- Creates renewal order via `orderService.create()` with `locked_promo_id` code if promo still active
- Skips if `RENEWAL_PENDING` (already has pending order); logs other errors
- Sends `sendAutoRenewalReminder()` email after each successful order creation

**F4 — Locked promo for auto-renew (bundled with F2/F3):**
- `locked_promo_id` on VPS is set via F2 PATCH endpoint
- F3 cron passes `locked_promo?.code_name` as `promoCode` only if promo is still `status=true`
- Expired or disabled promo: cron creates order at full price (no error, graceful degradation)

**F5 — Promo code on manual renew (`src/routes/vps.route.ts`, `src/controllers/vps.controller.ts`):**
- `POST /api/vps/:id/renew` now accepts optional body `{ promo_code?: string }`
- Controller passes `body?.promo_code` to `orderService.create()` (inherits all F1 limit checks)
- New 409 responses: `PROMO_LIMIT_REACHED`, `PROMO_USER_LIMIT_REACHED`

**Email:**
- `src/services/email.service.ts` — added `sendAutoRenewalReminder(to, vpsName)` for F3 notifications

**P3 Backlog (post-staging):**
- SVC-M1 — `auth.service.ts`: dedicated `verifyEmailVerify()` method แทนการใช้ `verifyAccess()`
- SVC-M3 — `broadcast.service.ts`: error indicator เมื่อ `sentCount === 0` (SMTP total failure)
- SVC-L2 — `order.service.ts`: integer satangs แทน float THB
- SVC-L3 — `system-config.service.ts`: iteration cap ใน Redis SCAN loop
- SVC-L4 — `proxmox.service.ts`: แก้ pollTask timeout error message
- CTRL-M1/AUD-VAL-1 — `audit.controller.ts`: validate entity/action enum บน query params
- UTIL-L1 — `logger.ts`: log `appendFile` failures ไปที่ stderr
- CFG-L1 — `redis.ts`: explicit connection test บน startup
- ROUTE-L1 — `auth.route.ts`: `maxLength: 255` บน `address2`
- VPS-L5 — `vps.service.ts`: vmid collision check ก่อน clone
- SYSCFG-L1 — `schema.prisma`: `created_at @default(now())` ใน `system_configs`
