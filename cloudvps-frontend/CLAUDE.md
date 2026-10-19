# CLAUDE.md (CloudVPS Frontend)

This file provides core guidance, technical stack details, and development principles for the CloudVPS frontend.

## 🛠️ Stack & Environment

- **Runtime**: Bun (Use `bun` / `bunx`)
- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4
- **UI Library**: shadcn/ui (Radix UI primitives)
- **State Management**: Zustand (global) + React Context (scoped)
- **Server State / Data Fetching**: TanStack Query v5
- **Forms & Validation**: React Hook Form + Zod
- **Language**: TypeScript (Strict)
- **Auth**: NextAuth.js v5 (JWT strategy, custom credentials provider)
- **HTTP Client**: `fetch` (native) wrapped in typed service layer

## 🚀 Core Commands

```bash
# Development
bun run dev              # Start dev server (http://localhost:3001)
bun run build            # Build for production
bun run start            # Start production server

# Code Quality
bun run lint             # Run ESLint
bun run format           # Run Prettier
bun run type-check       # Run tsc --noEmit

# Testing
bun run test             # Run all UI and Unit tests (Vitest)
```

## 🏗️ Architecture

### Flow
```
Pages / Layouts (app/)
  → Components (components/)
    → Hooks (hooks/)
      → API Services (services/api/)
        → Backend REST API (cloudvps-backend)
```

### Folder Structure
```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login, Register, Verify pages (public)
│   ├── (user)/             # User dashboard, VPS, billing, profile
│   ├── (admin)/            # Admin panel
│   ├── (support)/          # Support panel
│   └── api/                # Next.js API routes (NextAuth callback only)
├── components/
│   ├── ui/                 # shadcn/ui base components (auto-generated)
│   ├── shared/             # Shared cross-role components
│   ├── auth/               # Auth-specific components
│   ├── vps/                # VPS control components
│   ├── packages/           # Package listing/detail components
│   ├── payment/            # Payment flow components
│   ├── admin/              # Admin-only components
│   └── tickets/            # Ticket status/priority badge components
├── hooks/                  # Custom React hooks
├── services/
│   └── api/                # Typed API fetch functions (per module)
│       ├── auth.ts
│       ├── vps.ts
│       ├── packages.ts
│       ├── orders.ts
│       ├── transactions.ts
│       ├── users.ts
│       ├── promotions.ts
│       ├── policies.ts
│       ├── system-configs.ts
│       ├── broadcasts.ts
│       └── tickets.ts
├── stores/                 # Zustand stores
├── types/                  # TypeScript interfaces (mirroring backend DTOs)
├── lib/                    # Utilities, helpers, constants
└── proxy.ts                 # Next.js middleware (route protection by role) — Next.js 16 uses proxy.ts
```

### Auth Strategy
- **NextAuth.js v5** with custom `credentials` provider calling `POST /api/auth/login`
- JWT stored in **httpOnly cookie** (NextAuth default)
- Access token refresh via `POST /api/auth/refresh` on token expiry (≤ 15 min)
- Role (`ADMIN` | `SUPPORT` | `USER`) extracted from JWT and stored in NextAuth session
- Route protection via `src/proxy.ts` + `matcher` config (Next.js 16 renamed `middleware.ts` → `proxy.ts`)

### RBAC — Route Groups
| Role | Path Prefix | Access |
|------|-------------|--------|
| Public | `/` | Landing, login, register, packages listing |
| USER | `/(user)/` | Dashboard, own VPS, billing, profile, support tickets |
| SUPPORT | `/(support)/` | User management, VPS ops, support tickets |
| ADMIN | `/(admin)/` | Full admin panel |

## 🔗 Backend API Contract

**Base URL**: `NEXT_PUBLIC_API_URL` (e.g., `http://localhost:3000`)

All API modules documented in backend `docs/Requirement.md`. Key endpoints:

| Module | Public Endpoints | Auth Required |
|--------|-----------------|---------------|
| Auth | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/verify/:token` | `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/refresh` |
| Users | — | `GET/PUT /api/users/me`, `PUT /api/users/me/password`, `GET /api/users` (ADMIN/SUPPORT) |
| Packages | `GET /api/packages`, `GET /api/packages/:id`, `GET /api/packages/categories` | ADMIN: CRUD |
| VPS | — | `GET /api/vps`, `GET /api/vps/:id`, Start/Stop/Reboot/Renew |
| Orders | — | `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id` |
| Transactions | — | `POST /api/transactions`, `GET /api/transactions` |
| Promotions | — | `POST /api/promotions/validate` (USER), ADMIN: CRUD |
| Policies | `GET /api/policies/active` | `POST /api/policies/consents`, ADMIN: CRUD |
| System Configs | — | ADMIN/SUPPORT: `GET /api/system-configs`, ADMIN: `PUT /api/system-configs/:key` |
| Broadcasts | — | ADMIN: `POST /api/broadcasts`, `GET /api/broadcasts` |
| Port Rules | — | `GET/POST/DELETE /api/vps/:id/port-rules` |
| Upgrade | — | `POST /api/vps/:id/upgrade/package`, `POST /api/vps/:id/upgrade/custom` |
| Tickets | `GET /api/tickets/categories` | `GET/POST /api/tickets`, `GET /api/tickets/:id`, PATCH status/assign/priority, `POST /api/tickets/:id/messages`; ADMIN: ticket-categories CRUD |

### Error Response Shape
```ts
// Backend always returns:
{ success: false, message: string, error?: string }
// e.g. PROMO_LIMIT_REACHED, PROMO_USER_LIMIT_REACHED, RENEWAL_PENDING, CANNOT_CANCEL_UPGRADE
// ApiClientError.code is populated from the `error` field (not `code`)
```

### Payment Methods (F6)
- **TRUEMONEY**: user inputs Angpao voucher code
- **SLIP (SlipOK)**: user uploads slip image → base64 → `POST /api/transactions` (auto-verified)
- **PROMPTPAY**: user uploads slip → ADMIN/SUPPORT manually approve via `PATCH /api/transactions/:id/approve`

### VPS IP Types (F11)
- `package.port_count === null` → Public IP VPS (no NAT)
- `package.port_count > 0` → Private IP VPS with NAT port block (show port rules UI)

## 🧠 AI Development Mindset (Rules & Skills)

You are a **Senior Frontend Engineer**. Follow these rules:

### ⚠️ 0. Core Directives (Top Priority)

- **Strict Authorization**: ALWAYS notify the developer and wait for explicit permission before writing code, installing packages, or running commands.
- **No Error Hiding**: NEVER hide React warnings, hydration errors, or build errors. Report immediately.

### 1. Planning & Analysis (Skill: Prompt-Architecture)

- **No Immediate Coding**: Do not jump straight into writing code.
- **Deep Analysis**: Analyze `docs/Requirement.md`, `docs/Spec.md`, `docs/Feature.md`, and `docs/Design.md` (Figma/UI references, color system, component design) before any implementation.
- **Incremental Steps**: Break work into small components and state logic.
- **Plan Documentation**: When planning a new UI feature or route, update `docs/Feature.md`, `docs/Requirement.md`, and reference `docs/Design.md` for visual spec.
- **Unplanned Changes**: If code is NOT yet defined in `Feature.md` or `Spec.md`, complete the Planning Phase first.

### 2. Context & Execution (Skill: Context-Management)

- **File Planning**: List all components, pages, hooks to create/modify before touching code.
- **Dependencies**: Do not install new packages without permission. Use `bun add` when authorized.
- **Environment**: If adding `NEXT_PUBLIC_` env vars, update `.env.example` and notify the developer.
- **Git Protocol**: Use Conventional Commits (`feat:`, `fix:`, `ui:`, `refactor:`). Commit after each sub-task.
- **Responsive & Accessible**: Mobile-First. Meet WCAG 2.1 AA basics (focus states, aria labels, color contrast).
- **API Types**: Keep `src/types/` in sync with backend response shapes. No `any`.

### 3. Troubleshooting & Debugging (Skill: UI/UX & API Parsing)

- **Log First**: Check browser console, network tab, and Next.js terminal before guessing.
- **Boundary Testing**: Distinguish UI rendering, state bugs, and backend API payload errors.
- **Hydration**: Always check for SSR/CSR mismatch. Use `"use client"` only when needed.

### 4. Testing & QA (Skill: Test-Driven Prompting)

- **Absolute Test Integrity**: Tests MUST genuinely pass. Never mock just to force pass.
- **Edge Cases**: Empty states, loading skeletons, API timeouts, invalid inputs, expired tokens.
- **Validation**: Use Zod + React Hook Form for all form inputs before API calls.
- **Code Quality**: Self-review for React hydration issues and strict TypeScript before declaring done.

### 5. Documentation & Advanced (Skill: Auto-Documentation)

- **API Contract**: If service types or API calls change, update `src/types/` immediately.
- **Sync Docs**: Update `docs/Spec.md` and component docs as code changes.
- **Definition of Done (DoD)**: UI pixel-perfect ➔ Responsive passes ➔ API integrated ➔ Tests pass ➔ Docs updated ➔ Developer notified.
- **Post-Change Summary**: After execution, provide a concise summary of what was modified.

## 🔍 Project Audit Protocol

When asked to "Check/Audit the Project" (ตรวจสอบโปรเจค), follow these steps:

1. **Consistency Check**: Verify UI components, routing, and `docs/*.md` are consistent. Check for unused components or missing types.
2. **Docs as Truth**: Prioritize `Requirement.md`, `Spec.md`, `Feature.md` as source of truth.
3. **Design Sync**: Verify component implementations match `docs/Design.md` (colors, spacing, typography, component states).
4. **API Sync**: Verify `src/types/` matches current backend API response shapes from `docs/Requirement.md`.
4. **Summary**: Provide a clear summary of all checks performed and changes made.

---

*For UI/visual design spec, see [docs/Design.md](docs/Design.md)*
*For backend API reference, see [cloudvps-backend/docs/Requirement.md](../cloudvps-backend/docs/Requirement.md)*
