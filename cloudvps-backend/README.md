# CloudVPS Backend

REST API backend สำหรับบริการเช่า VPS Cloud ควบคุมผ่าน Proxmox VE

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun |
| Framework | Elysia.js |
| Language | TypeScript (strict) |
| ORM | Prisma 6 |
| Database | PostgreSQL 15 |
| Cache | Redis 7 |
| VPS Infrastructure | Proxmox VE API |
| NAT / Port Forwarding | MikroTik CHR REST API |

## Requirements

- [Bun](https://bun.sh) >= 1.0
- PostgreSQL 15
- Redis 7
- Docker + Docker Compose (optional)

## Quick Start

### 1. Clone และติดตั้ง dependencies

```bash
git clone <repo-url>
cd cloudvps-backend
bun install
```

### 2. ตั้งค่า Environment Variables

```bash
cp .env.example .env
```

แก้ไขค่าใน `.env` ให้ครบ (ดู [`.env.example`](.env.example) สำหรับรายการเต็ม):

```env
# Database
DATABASE_URL="postgresql://<user>:<password>@<host>:5432/<dbname>"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Email (SMTP)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your@email.com
EMAIL_PASS=your_password

# Proxmox VE (fallback — override via Admin UI in system_configs)
PROXMOX_HOST=https://proxmox.example.com:8006
PROXMOX_TOKEN_ID=root@pam!your_token_name
PROXMOX_TOKEN_SECRET=your_token_secret_uuid
PROXMOX_NODE=pve

# SlipOK (slip verification — fallback, can override via system_configs)
SLIPOK_API_KEY=your_slipok_key
SLIPOK_BRANCH_ID=your_branch_id

# TrueMoney (voucher redemption — mobile fallback, can override via system_configs)
TRUEMONEY_API_URL=https://gift.truemoney.com/campaign/vouchers
TRUEMONEY_MOBILE=your_mobile_number
```

> **Note:** MikroTik CHR credentials (`host`, `username`, `password`, `nat_public_ip`, `nat_base_port`), per-OS default usernames, unit pricing, and PromptPay/bank display info are all stored in the `system_configs` DB table (runtime-editable via Admin UI), not `.env`. Payment credentials (SlipOK, TrueMoney) read `system_configs` first and fall back to `.env` if unset.

### 3. Setup Database

```bash
bunx prisma migrate dev
bun run db:seed
```

### 4. Start Server

```bash
bun run dev      # Development (hot-reload)
bun run start    # Production
```

Server จะรันที่ `http://localhost:3000` และ Swagger docs ที่ `http://localhost:3000/docs`

---

## Docker (แนะนำ)

รัน full stack (API + PostgreSQL + Redis) ด้วยคำสั่งเดียว:

```bash
docker-compose up -d
```

ปิด:

```bash
docker-compose down
```

---

## Commands

```bash
# Development
bun run dev                    # Start with hot-reload
bun run start                  # Production start

# Database
bunx prisma migrate dev        # Create and apply migration
bun run db:push                # Push schema (no migration history)
bun run db:generate            # Regenerate Prisma client
bun run db:seed                # Seed roles, packages, IPs, policies, system_configs
bun run db:seed:prod           # Production seed (minimal)
bun run db:studio              # Visual database browser

# Testing
bun run test                   # Unit tests (all non-integration suites)
bun run test:unit              # Alias for unit tests
bun run test:integration       # Integration tests (serial, requires running DB+Redis)
bun run test:live              # Live Proxmox tests (requires real Proxmox)
bun run test:all               # Unit + integration tests
bun run test:ui                # Serve HTML test UI at localhost
```

---

## Architecture

### Request Flow

```
Client → CORS → Auth Guard → RBAC → Rate Limit → Controller → Service → Prisma / External API
```

### Directory Structure

```
src/
├── config/         # env validation, Prisma singleton, Redis client
├── types/          # Shared TypeScript interfaces (JwtPayload, AuthUser, RoleName)
├── utils/          # logger, hash (bcrypt), jwt (Web Crypto API), specs helpers
├── middlewares/    # auth guard, RBAC, rate-limit
├── routes/         # Elysia route groups by domain
├── controllers/    # Request handlers per domain
├── services/       # Business logic + external integrations
│   └── payment/    # truemoney, slipok, promptpay
└── jobs/           # Cron jobs (VPS expiry, auto-renew)

prisma/
├── schema.prisma   # Database schema (28 models)
├── migrations/     # Migration history
├── seed.ts         # Development seed data
└── seed.production.ts  # Production seed (minimal)
```

---

## Features

| # | Feature | Description |
|---|---------|-------------|
| F1 | RBAC | 3 roles: Admin, Support, User — JWT-based authentication |
| F2 | Account | Register/Login, Email verification, Profile management |
| F3 | Packages | VPS packages (OS template + VM spec + price + period + optional port_count + optional category) |
| F4 | PDPA / ToS | Policy versioning + consent tracking |
| F5 | VPS Management | Proxmox integration — provision, start, stop, reboot, soft-delete, auto-expire |
| F6 | Orders & Payment | Truemoney Angpao, SlipOK, PromptPay QR + promotions |
| F7 | Support | Facebook Fanpage (external) |
| F8 | System Config | Runtime-editable config (31 keys: Proxmox × 12, MikroTik × 5, pricing × 3, capacity × 3, payment × 8) |
| F9 | Email Broadcast | Admin sends typed emails (MAINTENANCE/EMERGENCY/ANNOUNCEMENT) to user groups |
| F10 | Promo Limits & Auto-Renew | Promo usage caps + VPS auto-renewal cron (02:20 Asia/Bangkok) |
| F11 | Port Forwarding / NAT | Private IP VPS + MikroTik CHR port block allocation + user-managed rules |
| F12 | VM Reconfigure & Upgrade | Package switch (Mode A) or custom resource upgrade (Mode B) with pro-rate billing |
| F13 | Package Categories | Admin-managed categories for grouping packages; filterable by public API |
| F14 | Admin Create User | Admin/Support create accounts with auto policy-accept + secure password gen |
| F15 | Email Templates | DB-backed per-type email templates with `{{variable}}` interpolation + Redis cache |
| F16 | VPS Web Terminal | noVNC WebSocket proxy (30s short-lived JWT) + live power controls (reset, live status) |
| F17 | Support Tickets | In-app helpdesk: threaded messages, categories, priority, RBAC, internal notes, email notifications |
| F18 | Resource Capacity Lock | Pre-order capacity check against live Proxmox node free RAM/disk to prevent overselling |
| F19 | VPS Credential Delivery | Auto-email VPS credentials on provision + OTP-verified in-app OS password change |

## Roles & Permissions

| Endpoint Group | Admin | Support | User |
|---------------|-------|---------|------|
| User management | Full CRUD + role/status | View + Edit | Own profile only |
| Package management | Full CRUD | — | Browse |
| VPS management | All instances + force delete | View + assign + configure | Own VPS only |
| Orders | All orders | All orders | Own orders |
| Transactions | Approve/Reject | Approve/Reject | Submit payment |
| Policies | Full CRUD | — | Accept |
| System Config | Read + Update | Read (secrets masked) | — |
| Audit Logs | Full read | — | — |
| Email Broadcast | Send + history | — | — |
| Port Rules (NAT) | All VPS + system rules | Read-only | Own VPS (non-system rules) |
| VM Upgrade | Any VPS | Any VPS | Own VPS |
| VPS Terminal / Power (reset) | Any VPS | — | Own VPS |
| VPS Password Change | Any VPS | — | Own VPS (OTP-verified) |
| IP Pools | Full CRUD | — | — |
| Email Templates | Full CRUD | — | — |
| Create User | Create any account | Create users role | — |
| Support Tickets | View all + manage | View all + manage + self-assign | Own tickets only |
| Node Capacity | Read | Read | — |

---

## API Endpoints (Summary)

### Auth
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/verify/:token
GET    /api/auth/me
```

### Users
```
GET    /api/users/me
PUT    /api/users/me
PUT    /api/users/me/password
PUT    /api/users/me/email
POST   /api/users                    (ADMIN, SUPPORT) — create user + auto-accept policies
GET    /api/users                    (ADMIN, SUPPORT)
GET    /api/users/:id                (ADMIN, SUPPORT)
PUT    /api/users/:id                (ADMIN, SUPPORT)
PATCH  /api/users/:id/status         (ADMIN)
PATCH  /api/users/:id/role           (ADMIN)
```

### Packages
```
GET    /api/packages                              (optional ?category_id=N)
GET    /api/packages/:id
POST   /api/packages                              (ADMIN)
PUT    /api/packages/:id                          (ADMIN)
PATCH  /api/packages/:id/status                   (ADMIN)
GET    /api/packages/categories
GET    /api/packages/categories/all               (ADMIN)
POST   /api/packages/categories                   (ADMIN)
PUT    /api/packages/categories/:id               (ADMIN)
PATCH  /api/packages/categories/:id/status        (ADMIN)
GET    /api/packages/os                           (ADMIN)
POST   /api/packages/os                           (ADMIN)
PUT    /api/packages/os/:id                       (ADMIN)
GET    /api/packages/vm                           (ADMIN)
POST   /api/packages/vm                           (ADMIN)
PUT    /api/packages/vm/:id                       (ADMIN)
```

### Policies
```
GET    /api/policies/active
GET    /api/policies                 (ADMIN)
POST   /api/policies                 (ADMIN)
PUT    /api/policies/:id             (ADMIN)
PATCH  /api/policies/:id/status      (ADMIN)
POST   /api/policies/consents
GET    /api/policies/consents/me
```

### VPS
```
GET    /api/vps
GET    /api/vps/:id
GET    /api/vps/:id/status                    live Proxmox status (ADMIN, SUPPORT, USER=own)
GET    /api/vps/queue                         (ADMIN, SUPPORT)
POST   /api/vps/provision/:orderId            (ADMIN, SUPPORT)
POST   /api/vps/:id/start
POST   /api/vps/:id/stop
POST   /api/vps/:id/reboot
POST   /api/vps/:id/reset                     hard reset (ADMIN, USER=own)
POST   /api/vps/:id/renew
PATCH  /api/vps/:id/auto-renew
POST   /api/vps/:id/change-password/request   send OTP email (ADMIN, USER=own)
POST   /api/vps/:id/change-password/confirm   verify OTP + change OS password (ADMIN, USER=own)
DELETE /api/vps/:id                           (ADMIN)
```

### Terminal (noVNC)
```
GET    /api/terminal/:vps_id/token   30s short-lived JWT for WS auth (ADMIN, USER=own)
WS     /api/terminal/:vps_id?token=  bidirectional noVNC ↔ Proxmox WebSocket proxy
```

### Port Rules (NAT)
```
GET    /api/vps/:id/port-rules
POST   /api/vps/:id/port-rules       (USER, ADMIN)
DELETE /api/vps/:id/port-rules/:ruleId  (USER [non-system], ADMIN)
```

### VM Upgrade
```
POST   /api/vps/:id/upgrade/package
POST   /api/vps/:id/upgrade/custom
GET    /api/vps/:id/upgrade/history
```

### Orders & Payment
```
POST   /api/orders
GET    /api/orders
GET    /api/orders/:id
PATCH  /api/orders/:id/cancel
POST   /api/transactions
GET    /api/transactions
PATCH  /api/transactions/:id/approve  (ADMIN, SUPPORT)
PATCH  /api/transactions/:id/reject   (ADMIN, SUPPORT)
POST   /api/promotions                (ADMIN)
GET    /api/promotions                (ADMIN)
PUT    /api/promotions/:id            (ADMIN)
PATCH  /api/promotions/:id/status     (ADMIN)
POST   /api/promotions/validate
```

### IP Pools
```
GET    /api/ip-pools                  (ADMIN)
POST   /api/ip-pools                  (ADMIN)
POST   /api/ip-pools/range            (ADMIN)
PATCH  /api/ip-pools/:id              (ADMIN)
PATCH  /api/ip-pools/:id/status       (ADMIN)
```

### System Config
```
GET    /api/system-configs              (ADMIN, SUPPORT)
GET    /api/system-configs/:key         (ADMIN, SUPPORT)
GET    /api/system-configs/pricing      unit pricing for upgrade preview (all authenticated roles)
GET    /api/system-configs/payment-info PromptPay/bank display at checkout (all authenticated roles)
PUT    /api/system-configs/:key         (ADMIN)
DELETE /api/system-configs/cache/flush  (ADMIN)
```

### System
```
GET    /api/system/capacity           live Proxmox node resource snapshot (ADMIN, SUPPORT)
```

### Audit Logs
```
GET    /api/audit                     (ADMIN)
```

### Email Broadcast
```
POST   /api/broadcasts                (ADMIN)
GET    /api/broadcasts                (ADMIN)
GET    /api/broadcasts/:id            (ADMIN)
```

### Email Templates
```
GET    /api/email-templates              (ADMIN)
GET    /api/email-templates/:type        (ADMIN)
PUT    /api/email-templates/:type        (ADMIN)
PATCH  /api/email-templates/:type/status (ADMIN)
```

### Support Tickets
```
GET    /api/tickets/categories            (Public)
GET    /api/tickets/categories/all        (ADMIN, SUPPORT)
POST   /api/tickets/categories            (ADMIN)
PUT    /api/tickets/categories/:id        (ADMIN)
PATCH  /api/tickets/categories/:id/status (ADMIN)
POST   /api/tickets                       (USER)
GET    /api/tickets                       (USER=own, ADMIN/SUPPORT=all)
GET    /api/tickets/:id                   (Owner, ADMIN, SUPPORT)
PATCH  /api/tickets/:id/status            (USER=CLOSED own; ADMIN/SUPPORT=any)
PATCH  /api/tickets/:id/assign            (ADMIN, SUPPORT)
PATCH  /api/tickets/:id/priority          (ADMIN, SUPPORT)
POST   /api/tickets/:id/messages          (Owner, ADMIN, SUPPORT)
```

ดู full spec ได้ที่ [`docs/Requirement.md`](docs/Requirement.md)

---

## Database Schema

28 tables แบ่งตาม domain:

```
roles → users → users_info
                users → consents ← policies
                users → orders → transactions
                               orders → temp_vps
                               orders → vps ← ip_assignments ← ip_pools
                               orders → vps_upgrade_logs ← vps
                users → promo_usages ← promotions → orders
package_categories → packages (os + vm) → orders
vps → nat_allocations → nat_port_rules
users → user_oauth_providers
users (actor/target) → admin_audit_logs
users → email_broadcasts
users → system_configs (updated_by)
users → email_templates (updated_by)
ticket_categories → tickets → ticket_messages
users (opener/assignee) → tickets
```

ดูรายละเอียดได้ที่ [`docs/Schema.md`](docs/Schema.md)

---

## External Integrations

| Service | Purpose | Config Location |
|---------|---------|----------------|
| Proxmox VE | VPS provisioning & control | `system_configs` (DB) + `.env` fallback |
| SlipOK | Bank slip auto-verification | `system_configs` (DB, `payment.slipok_*`) + `.env` fallback |
| Truemoney | Gift voucher redemption | `system_configs` (DB, `payment.truemoney_mobile`) + `.env` fallback |
| PromptPay | QR payment (manual verify) | `system_configs` (DB, `payment.promptpay_id`) |
| SMTP | Email verification & notifications | `.env` (`EMAIL_*`) |
| MikroTik CHR | NAT port forwarding for Private IP VPS | `system_configs` (DB) (`mikrotik.*`) |

---

## Development Status

**Phase 1–5, 7–16 — Complete ✅ | Phase 6 (Staging Deploy) — In Progress 🔧**

- [x] Phase 1 — Foundation (Bun + Elysia + Prisma + Auth + RBAC + seed)
- [x] Phase 2 — Legal & Packages (policies, OS templates, VM specs, packages, promotions)
- [x] Phase 3 — Orders & Payment (TrueMoney, SlipOK, PromptPay, transactions)
- [x] Phase 4 — VPS Provisioning (Proxmox integration, IP allocation, system configs)
- [x] Phase 5 — Admin & Monitoring (expiry cron, audit logs, email broadcast)
- [ ] Phase 6 — Staging Deploy 🔧
- [x] Phase 7 — Promo Limits & Auto-Renew (promo caps, auto-renew cron)
- [x] Phase 8 — Port Forwarding / NAT (MikroTik CHR, nat_allocations, nat_port_rules)
- [x] Phase 9 — VM Reconfigure & Upgrade (package switch, custom resource, pro-rate billing)
- [x] Phase 10 — Package Categories (admin-managed grouping, public filter API)
- [x] Phase 11 — Admin Create User + Email Templates (F14, F15)
- [x] Phase 12 — VPS Web Terminal + Power Controls (F16, noVNC WebSocket proxy, reset)
- [x] Phase 13 — In-App Support Ticket System (F17, threaded tickets, RBAC, email notifications)
- [x] Phase 14 — Resource Capacity Lock (F18, pre-order capacity check vs live Proxmox)
- [x] Phase 15 — File Upload System (slip upload FILE/BASE64 dual-mode, ticket attachments)
- [x] Phase 16 — VPS Credential Delivery + In-App Password Change (F19, OTP-verified)

**Test suite: 528 unit/isolated tests + ~345 integration tests**


---

## Docs

- [`docs/Feature.md`](docs/Feature.md) — Feature matrix (F1–F19) by role
- [`docs/Requirement.md`](docs/Requirement.md) — Functional & security requirements + API spec
- [`docs/Spec.md`](docs/Spec.md) — System architecture & development plan
- [`docs/Schema.md`](docs/Schema.md) — Database schema (28 tables)
- [`docs/Rules.md`](docs/Rules.md) — Development rules & conventions
- [`docs/ProxmoxAPI.md`](docs/ProxmoxAPI.md) — Proxmox API reference notes
- [`docs/Workflow_api.md`](docs/Workflow_api.md) — API workflow diagrams
- [`docs/frontend.md`](docs/frontend.md) — Frontend integration guide (request/response shapes, RBAC, error codes)
