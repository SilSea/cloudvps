# CloudVPS Frontend — System Specification

## 1. System Architecture

### 1.1 Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Runtime**: Bun
- **Styling**: Tailwind CSS v4 + shadcn/ui (Radix UI)
- **State Management**: Zustand (global) + React Context (scoped)
- **Server State**: TanStack Query v5
- **Forms & Validation**: React Hook Form + Zod
- **Auth**: NextAuth.js v5 (JWT, custom credentials provider)
- **Language**: TypeScript (Strict)
- **HTTP**: native `fetch`, wrapped in typed service layer under `src/services/api/`
- **Testing**: Vitest + React Testing Library (configured, no test files written yet)

### 1.2 System Flow

```
Browser (Next.js)
  → src/proxy.ts            (route guard by role — Next.js 16 renamed middleware.ts → proxy.ts)
  → App Router pages/layouts
  → TanStack Query hooks
  → src/services/api/*      (typed fetch wrappers)
  → CloudVPS Backend REST API (Elysia.js)
  → PostgreSQL / Redis / Proxmox
```

### 1.3 Auth Flow

1. User submits login form → `POST /api/auth/login` (backend)
2. Backend returns `{ accessToken, refreshToken, user }` on success
3. NextAuth stores session in httpOnly cookie (JWT)
4. `src/proxy.ts` checks role on every protected route
5. `TanStack Query` handles refetch; on 401 → call `POST /api/auth/refresh` → retry
6. Logout → `POST /api/auth/logout` (backend invalidates refresh) + NextAuth signOut

### 1.4 Role Routing

| Role | Layout | Route Prefix |
|------|--------|-------------|
| Public (no auth) | `(auth)` / `(public)` layout | `/login`, `/register`, `/verify`, `/`, `/about`, `/contact`, `/packages` |
| USER | `(user)` layout | `/dashboard`, `/vps`, `/billing`, `/profile`, `/tickets` |
| SUPPORT | `(support)` layout | `/support/*` |
| ADMIN | `(admin)` layout | `/admin/*` |

Roles are mutually exclusive. ADMIN cannot use USER routes and vice versa.
`src/proxy.ts` enforces redirect to role-appropriate home on mismatch.

---

## 2. Folder Structure

```
cloudvps-frontend/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── verify/[token]/page.tsx
│   │   ├── (public)/
│   │   │   ├── page.tsx                 # Landing
│   │   │   ├── about/page.tsx
│   │   │   ├── contact/page.tsx
│   │   │   └── packages/page.tsx
│   │   ├── (user)/
│   │   │   ├── layout.tsx               # USER shell (sidebar, navbar)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── vps/
│   │   │   │   ├── page.tsx             # VPS list
│   │   │   │   └── [id]/page.tsx        # VPS detail (start/stop/reboot/console/change-password/ports/upgrade)
│   │   │   ├── billing/orders/
│   │   │   │   ├── page.tsx             # Order list
│   │   │   │   ├── new/page.tsx         # Package picker + create order (OS-variant picker)
│   │   │   │   └── [orderId]/page.tsx   # Order detail + spec card + pay
│   │   │   ├── profile/page.tsx
│   │   │   └── tickets/
│   │   │       ├── page.tsx
│   │   │       ├── new/page.tsx
│   │   │       └── [id]/page.tsx
│   │   ├── (support)/support/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx             # Support dashboard (stats, capacity chart, pending-tx actions)
│   │   │   ├── users/page.tsx
│   │   │   ├── vps/page.tsx, vps/[id]/page.tsx
│   │   │   ├── orders/page.tsx
│   │   │   ├── packages/page.tsx
│   │   │   ├── transactions/page.tsx
│   │   │   └── tickets/page.tsx, tickets/[id]/page.tsx
│   │   ├── (admin)/admin/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx       # Stats + system health card
│   │   │   ├── users/page.tsx
│   │   │   ├── packages/page.tsx
│   │   │   ├── categories/page.tsx      # Package categories CRUD
│   │   │   ├── os-vm/page.tsx           # OS template + VM spec CRUD
│   │   │   ├── vps/page.tsx, vps/[id]/page.tsx, vps/queue/page.tsx
│   │   │   ├── orders/page.tsx
│   │   │   ├── transactions/page.tsx
│   │   │   ├── promotions/page.tsx
│   │   │   ├── policies/page.tsx
│   │   │   ├── ip-pools/page.tsx
│   │   │   ├── system-configs/page.tsx
│   │   │   ├── broadcasts/page.tsx
│   │   │   ├── email-templates/page.tsx
│   │   │   ├── audit-logs/page.tsx
│   │   │   ├── tickets/page.tsx, tickets/[id]/page.tsx
│   │   │   └── ticket-categories/page.tsx
│   │   └── api/
│   │       └── auth/[...nextauth]/route.ts
│   ├── auth.ts                     # NextAuth v5 config (Credentials provider)
│   ├── proxy.ts                    # Next.js 16 middleware — role-based route protection
│   ├── components/
│   │   ├── ui/                    # shadcn/ui generated components
│   │   ├── shared/                # Navbar, Sidebar, Pagination, ConfirmDialog, ThaiAddressFields, etc.
│   │   ├── auth/                  # LoginForm, RegisterForm, PolicyConsentModal
│   │   ├── vps/                   # VpsCard, PortRulesTable, VpsUpgradeSection, VpsStatusBadge,
│   │   │                          # VpsLiveStatusPanel, VpsTerminalModal (noVNC), VpsChangePasswordModal (OTP)
│   │   ├── packages/              # PackageCard, PackageListItem, PackageFilter, ViewToggle
│   │   ├── payment/                # SlipUploader, TrueMoneyInput, PromptPayDisplay, BankAccountInfo
│   │   ├── tickets/                # TicketStatusBadge, TicketPriorityBadge, TicketAttachmentPicker
│   │   └── admin/                 # (currently empty — reserved for admin-only components)
│   ├── hooks/
│   │   ├── useAuth.ts             # Current session/user
│   │   ├── useVps.ts              # VPS list/detail/actions/port rules/live status (10s poll)/password change (user)
│   │   ├── usePackages.ts         # Package list + categories (public/user, categories sorted)
│   │   ├── useOrders.ts           # Order create/list/cancel, transaction submit, promo validate
│   │   ├── useProfile.ts          # Profile, password/email change, upgrade history
│   │   ├── useTickets.ts          # Ticket categories/tickets/messages/status/priority/assign
│   │   ├── useSupport.ts          # SUPPORT-role: users, VPS, upgrades, orders, transactions
│   │   ├── useAdmin.ts            # Full ADMIN domain (largest hook file — see below)
│   │   └── usePagination.ts       # Generic client-side pagination utility
│   ├── services/
│   │   └── api/
│   │       ├── client.ts          # Base fetch wrapper (token injection, error normalise) — ApiClient, ApiClientError
│   │       ├── auth.ts            # AuthService
│   │       ├── vps.ts             # VpsService
│   │       ├── nat.ts             # NatService (port rules)
│   │       ├── terminal.ts        # TerminalService (noVNC console token)
│   │       ├── packages.ts        # PackageService (packages, categories, OS templates, VM specs, status toggle)
│   │       ├── orders.ts          # OrderService
│   │       ├── transactions.ts    # TransactionService
│   │       ├── upgrade.ts         # UpgradeService
│   │       ├── users.ts           # UserService
│   │       ├── promotions.ts      # PromotionService
│   │       ├── policies.ts        # PolicyService
│   │       ├── ip-pools.ts        # IpPoolService
│   │       ├── system-configs.ts  # SystemConfigService
│   │       ├── system.ts          # SystemService (health, capacity)
│   │       ├── broadcasts.ts      # BroadcastService
│   │       ├── email-templates.ts # EmailTemplateService
│   │       ├── audit-logs.ts      # AuditLogService
│   │       └── tickets.ts         # TicketService
│   ├── types/
│   │   ├── api.ts                 # Generic ApiResponse<T>, PaginatedResponse<T>
│   │   ├── auth.ts, next-auth.d.ts
│   │   ├── vps.ts, nat.ts, novnc.d.ts
│   │   ├── package.ts, order.ts, transaction.ts, promotion.ts
│   │   ├── user.ts, policy.ts
│   │   ├── ticket.ts, email-template.ts
│   │   └── audit-log.ts
│   ├── stores/
│   │   ├── auth.store.ts          # Zustand — auth/session state
│   │   └── ui.store.ts            # Zustand — UI state (toast, sidebar, etc.)
│   └── lib/
│       ├── utils.ts               # cn(), formatDate(), formatCurrency(), parseGib(), parseDiskGb(), toSlipSrc()
│       ├── packageGroup.ts        # specKey/osVariants/groupPackages — shared by admin package-group CRUD + order picker
│       ├── thai-address.ts        # Province/district/subdistrict/zipcode lookups
│       └── validators/            # Zod schemas per form
├── public/                        # Static assets
├── docs/                          # Project documentation
├── .env.example
├── next.config.ts
├── vitest.config.ts                # Configured, zero test files written yet
├── tsconfig.json
└── CLAUDE.md
```

---

## 3. Key UI Pages & Components

### Public Pages
- `/` — Landing page (marketing, CTA)
- `/about`, `/contact` — static info pages
- `/packages` — VPS package listing (dropdown filters: category, IP type, OS, vCPU, RAM, Disk — single scrollable row)
- `/login` — Login form (Email+Password)
- `/register` — Registration form (with PDPA/ToS consent modal)
- `/verify/[token]` — Email verification redirect

### User Pages
- `/dashboard` — Overview: active VPS count, pending orders, expiry alerts
- `/vps` — List own VPS with status badges
- `/vps/[id]` — VPS detail: specs, IP info, Start/Stop/Reboot/Force-Reset buttons, live status panel (CPU/RAM/disk/uptime, 10s poll), console (noVNC terminal modal), change password (OTP flow), port rules (if Private IP), upgrade option (package switch + custom resource with live cost preview)
- `/billing/orders` — Order history
- `/billing/orders/new` — Package picker (grouped by spec, OS chosen via dropdown when a spec has multiple OS variants) + create order
- `/billing/orders/[orderId]` — Order detail: status badge, full spec card, price/discount/total breakdown, payment submission (TrueMoney/Slip/PromptPay)
- `/profile` — Edit personal info, change password, change email
- `/tickets` — Support ticket list with status filter
- `/tickets/new` — Create new support ticket (category + title + message)
- `/tickets/[id]` — Ticket detail + reply (user view, internal notes hidden)

### Admin Pages
- `/admin/dashboard` — System overview (user count, VPS count, pending transactions, system health)
- `/admin/users` — User list with search/filter/paginate, create/edit
- `/admin/packages` — Package group CRUD (grouped by spec-key across OS variants — one form creates/edits/deletes N `Package` rows at once, per REQ-F3.9)
- `/admin/categories` — Package category CRUD
- `/admin/os-vm` — OS template + VM spec CRUD
- `/admin/vps` — All VPS monitoring; `/admin/vps/[id]` detail (live status, console/noVNC terminal, force reset, change password OTP flow, upgrade any VPS); `/admin/vps/queue` — provisioning queue/manual retry
- `/admin/orders` — All orders
- `/admin/transactions` — All transactions (approve/reject PROMPTPAY)
- `/admin/promotions` — Promotion CRUD
- `/admin/policies` — PDPA/ToS version management
- `/admin/ip-pools` — IP pool management
- `/admin/system-configs` — Runtime config editor, grouped by category (Proxmox, Pricing, MikroTik, Capacity, Payment — 31 keys total); dedicated Default-OS-Username card
- `/admin/broadcasts` — Email broadcast sender + history
- `/admin/email-templates` — Email template management
- `/admin/audit-logs` — Audit log viewer
- `/admin/tickets` — All tickets with status/priority filter and assign column
- `/admin/tickets/[id]` — Ticket detail, full controls, assign by User ID
- `/admin/ticket-categories` — Ticket category CRUD + toggle status

### Support Pages
- `/support` — Support dashboard: user/VPS/order/transaction stats, capacity chart, pending-transaction quick actions
- `/support/users` — User list (view/edit, no role change)
- `/support/vps` — VPS list (ops: provisioning queue, manual retry); `/support/vps/[id]` detail (live status only — no console/terminal, no change-password; can upgrade any VPS)
- `/support/orders` — Order list (read)
- `/support/packages` — Package list (read, filter)
- `/support/transactions` — Transaction list
- `/support/tickets` — Ticket list with status/priority filter
- `/support/tickets/[id]` — Ticket detail, reply, self-assign, status/priority controls

---

## 4. Environment Variables

```env
# Backend API base URL
NEXT_PUBLIC_API_URL=http://localhost:3000

# NextAuth v5
AUTH_SECRET=your_auth_secret_here
AUTH_URL=http://localhost:3001

# PromptPay QR generation
NEXT_PUBLIC_PROMPTPAY_ID=0812345678
```

All `NEXT_PUBLIC_*` vars must be added to `.env.example` before use.

---

## 5. API Response Conventions

All backend responses follow:
```ts
// Success
{ success: true, data: T, message?: string }

// Error
{ success: false, message: string, error?: string }

// Paginated
{ success: true, data: T[], pagination: { total, page, limit, totalPages } }
```

Error codes to handle in UI:
- `PROMO_LIMIT_REACHED` — show "โปรโมชั่นเต็มแล้ว"
- `PROMO_USER_LIMIT_REACHED` — show "เกินสิทธิ์ใช้งานต่อคน"
- `CANNOT_CANCEL_UPGRADE` — a PENDING upgrade's cancel button is shown same as any order (2026-07-02); this error is a race-safety toast, not a reason to hide the button (it only fires once the upgrade has already been applied)
- `RENEWAL_PENDING`, `INSUFFICIENT_RESOURCES` — see `CLAUDE.md` error response shape

---

## 6. Known Gaps (from 2026-07-01 audit)

- Vitest + React Testing Library are configured but zero test files exist (`bun run test` exits 1).

---

## 7. Deployment

`Dockerfile` — multi-stage Bun build (`deps` → `builder` → `runner`), produces Next.js
`standalone` output, runs as non-root `nextjs` user, listens on `3000` inside the container.

`docker-compose.yml` (repo root) builds the `web` service from that `Dockerfile` and `include`s
`../cloudvps-backend/docker-compose.yml` so the full stack (frontend + backend + DB/Redis/etc.)
comes up with one `docker compose up --build`. Requires a sibling `cloudvps-backend` checkout.
Host port `3001` → container port `3000`; `NEXT_PUBLIC_API_URL` is baked in at build time via a
build arg (not runtime-configurable in the container image).

---

*Backend full API spec: [cloudvps-backend/docs/Requirement.md](../../cloudvps-backend/docs/Requirement.md)*
