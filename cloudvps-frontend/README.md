# CloudVPS Frontend

Next.js 16 frontend for the CloudVPS VPS hosting platform.

## Stack

- **Runtime**: Bun
- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4
- **UI**: shadcn/ui (Radix UI)
- **State**: Zustand + TanStack Query v5
- **Forms**: React Hook Form + Zod
- **Auth**: NextAuth.js v5

## Getting Started

```bash
# Install dependencies
bun install

# Copy environment variables
cp .env.example .env.local

# Start development server
bun run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Commands

```bash
bun run dev          # Development server
bun run build        # Production build (runs postbuild for standalone output)
bun run start        # Production server
bun run lint         # ESLint
bun run format       # Prettier
bun run type-check   # TypeScript check
bun run test         # Vitest
```

## Docker

`docker-compose.yml` builds this app (multi-stage `Dockerfile`, Bun + Next.js standalone output) and
includes the sibling `../cloudvps-backend/docker-compose.yml` so `bun run` and the backend stack
come up together.

```bash
docker compose up --build
```

Requires a sibling checkout at `../cloudvps-backend`. Web container listens on `3001` (host) →
`3000` (container); `NEXT_PUBLIC_API_URL` is passed as a build arg.

## Environment Variables

See `.env.example` for required variables.

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL |
| `AUTH_SECRET` | NextAuth v5 secret |
| `AUTH_URL` | App URL for NextAuth |

PromptPay and bank account details are admin-configurable via `system_configs` (see backend
`GET /api/system-configs/payment-info`) — no frontend env var needed for those anymore.

## Project Structure

```
src/
├── app/            # Next.js App Router (public/auth/user/admin/support)
├── components/     # UI components
├── hooks/          # Custom React hooks
├── services/api/   # Typed API fetch functions
├── stores/         # Zustand stores
├── types/          # TypeScript interfaces
├── lib/            # Utilities and helpers
└── proxy.ts        # Route protection middleware (Next.js 16 renamed middleware.ts)
```

## License

Private — CloudVPS © 2025
