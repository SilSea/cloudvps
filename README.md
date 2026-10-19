# CloudVPS — VPS Cloud Rental Platform

CloudVPS is a full-stack VPS rental platform that provisions and manages virtual machines on **Proxmox VE** through its API. Customers order a package, pay (TrueMoney / bank slip / PromptPay), and get a running VM with cloud-init, a web terminal, and self-service controls. Admin and Support staff get a full back office for packages, IP pools, orders, payments, tickets, and audit logs.

> Built together with a friend as a cloud service project. It was close to launch but never went live; this repo is the cleaned-up source for portfolio purposes. All production configuration, credentials, logs, and customer data have been removed.

## Tech Stack

| Layer | Stack |
|---|---|
| Backend | Bun, Elysia.js, TypeScript, Prisma 6 (PostgreSQL 15), Redis (ioredis), node-cron, Nodemailer |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui (Radix), TanStack Query, Zustand, NextAuth v5, React Hook Form + Zod, Recharts, noVNC |
| Infra | Proxmox VE API, MikroTik CHR REST API (NAT), Docker / docker-compose |
| Payments | SlipOK (slip verification), TrueMoney Angpao, PromptPay QR |
| Testing | `bun test` (unit + integration), Vitest + Testing Library |

## Features

- **RBAC** — 3 roles (Admin / Support / User), JWT access + refresh tokens, rate limiting
- **Accounts** — register, email verification, profile with Thai address fields, PDPA / Terms consent with versioning
- **Packages** — OS templates + VM specs, categories, custom VPS option
- **VPS provisioning** — clone Proxmox template, cloud-init, IP allocation from Public/Private IP pools, start / stop / reboot, password change, live status
- **Web terminal** — in-browser VNC console (noVNC) to the VM
- **NAT port forwarding** — Private-IP VPS get a port block via MikroTik CHR DST-NAT rules
- **Upgrade / downgrade** — package switch or custom CPU/RAM/disk with pro-rated pricing
- **Billing** — orders, renewals, auto-renew cron, expiry handling, promotions (flat / percent, usage limits)
- **Payments** — TrueMoney auto-verify, SlipOK auto-verify, PromptPay manual approval, slip upload
- **Capacity check** — blocks orders when the Proxmox node lacks free RAM/disk
- **Support tickets** — categories, priorities, image attachments
- **Email** — editable email templates, broadcasts (maintenance / emergency / announcement)
- **System config** — runtime-editable settings stored in DB with Redis cache (secrets masked)
- **Audit log** — append-only log of admin actions

## Repository Layout

```
cloudvps-backend/    # REST API (Bun + Elysia + Prisma)
  src/                 # routes → controllers → services
  prisma/              # schema, migrations, seed
  tests/               # unit / integration / live tests
  docs/                # spec, schema, API workflow, QA notes
cloudvps-frontend/   # Web app (Next.js)
  src/app/             # (public) (auth) (user) (support) (admin) route groups
  src/components/      # UI, VPS, payment, ticket components
  src/services/api/    # typed API client
```

## Getting Started

Requirements: [Bun](https://bun.sh), Docker, and (for real provisioning) a Proxmox VE host.

### Backend

```bash
cd cloudvps-backend
cp .env.example .env        # fill in your own values
docker-compose up -d        # PostgreSQL + Redis
bun install
bunx prisma migrate dev
bun run db:seed             # demo roles, users, packages
bun run dev                 # http://localhost:3000 (Swagger at /swagger)
```

Seeded demo accounts (development only): `admin@cloudvps.com`, `support@cloudvps.com`, `user@cloudvps.com` — password `Password1234!`.

### Frontend

```bash
cd cloudvps-frontend
cp .env.example .env
bun install
bun run dev                 # http://localhost:3001
```

### Tests

```bash
cd cloudvps-backend && bun run test      # unit tests (no external services)
cd cloudvps-frontend && bun run test     # Vitest
```

See each sub-project's README and `cloudvps-backend/docs/` for API details.

## Authors

Developed by Nattawut ([@SilSea](https://github.com/SilSea)) and a friend as a joint project.
