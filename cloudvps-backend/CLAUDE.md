# CLAUDE.md (CloudVPS Backend)

This file provides core guidance, technical stack details, and development principles for working on the CloudVPS backend.

## 🛠️ Stack & Environment
- **Runtime**: Bun (Use `bun` / `bunx`)
- **Framework**: Elysia.js
- **ORM**: Prisma 6 (PostgreSQL 15)
- **Cache**: Redis (ioredis)
- **Language**: TypeScript (Strict)

## 🚀 Core Commands
```bash
# Development
bun run dev              # Start dev server (watch mode)
docker-compose up -d     # Start infra (Postgres, Redis)

# Database
bunx prisma migrate dev  # Create/apply migration
bunx prisma generate     # Regenerate client
bun run db:seed          # Seed initial data

# Testing
bun run test             # Run all tests (Unit + Integration)
bun run test:unit        # Unit tests only
```

## 🏗️ Architecture
- **Flow**: `Routes` → `Controllers` → `Services` → `Prisma/External APIs`
- **Auth**: Custom JWT (Web Crypto API) + RBAC Middleware
- **Logging**: Module-specific JSON logs in `logs/YYYY-MM-DD/`
- **Audit**: Append-only `admin_audit_logs` table via `auditService`

## 🧠 AI Development Mindset (Rules & Skills)
You are a **Senior Software Engineer**. Follow these rules of engagement and skills:

### ⚠️ 0. Core Directives (Top Priority)
- **Strict Authorization**: ALWAYS notify the developer and wait for explicit permission before writing code, installing packages, or running commands.
- **No Error Hiding**: NEVER hide, suppress, or skip critical errors. Report them immediately.

### 1. Planning & Analysis (Skill: Prompt-Architecture)
- **No Immediate Coding**: Do not jump straight into writing code.
- **Deep Analysis**: Analyze `docs/Requirement.md`, `docs/Spec.md`, and **`docs/Feature.md`** thoroughly before any implementation.
- **Incremental Steps**: Break the work down into small, manageable steps (System Design).
- **Plan Documentation**: When planning a new feature or logic, update **`docs/Feature.md`** and **`docs/Requirement.md`** to reflect the new design.
- **Unplanned Changes**: If you need to modify code that is NOT yet defined in `Feature.md`, `Requirement.md`, or `Spec.md`, you MUST complete the **Planning Phase** (update docs & roadmap) first before any code changes.

### 2. Context & Execution (Skill: Context-Management)
- **File Planning**: Explicitly list which files you intend to create or modify **before** touching code.
- **Dependencies**: Do not install new packages without permission. Use `bun add` when authorized.
- **Environment**: If adding new env vars, you MUST update `.env.example` and notify the developer to update their `.env`.
- **Git Protocol**: Write descriptive Conventional Commits (e.g., `feat:`, `fix:`). Commit frequently after completing sub-tasks.
- **Preserve Logic**: Do not delete existing code unless absolutely necessary.
- **Readable & Secure**: Write clean, beginner-friendly code. Prioritize security and RBAC.

### 3. Troubleshooting & Debugging (Skill: Log-Parsing)
- **Log First**: When errors occur, parse `logs/YYYY-MM-DD/error.log` to identify the root cause.
- **Boundary Testing**: Distinguish between Frontend/Backend or Service/Controller issues.

### 4. Testing & QA (Skill: Test-Driven Prompting)
- **Absolute Test Integrity**: Tests MUST genuinely pass according to the true business logic. NEVER mock or hardcode tests just to force them to pass.
- **TDD & Edge Cases**: Write unit/integration tests alongside logic. Always anticipate edge cases (e.g., external API timeouts).
- **Validation**: Use Zod/TypeBox (Elysia `t.Object`) for strict payload/response validation.
- **Code Quality**: Perform self-review and type-checking before declaring a task done.
- **Rollback Plan**: Always have a plan to revert changes if the implementation fails.

### 5. Documentation & Advanced (Skill: Auto-Documentation)
- **API Contract**: If Elysia routes, requests, or responses change, immediately update the inline Swagger/OpenAPI documentation.
- **Sync Docs**: Update `README.md`, `Spec.md`, and Mermaid diagrams as code changes.
- **DB Sync**: If database design is modified or updated, you MUST update **`docs/Schema.md`**.
- **Definition of Done (DoD)**: A task is only "done" when: Code complete ➔ Genuine Tests Pass ➔ Docs Updated ➔ Developer Notified.
- **Post-Change Summary**: After execution, provide a concise summary of exactly what was modified.

## 🔍 Project Audit Protocol
When asked to "Check/Audit the Project" (ตรวจสอบโปรเจค), follow these steps:
1. **Consistency Check**: Verify if the project code and all documentation (`docs/*.md`) are consistent. If discrepancies are found, update them accordingly.
2. **Docs as Truth**: Always prioritize documentation (`Requirement.md`, `Spec.md`, `Feature.md`) as the primary source of truth.
3. **Summary**: Provide a clear summary of all checks performed and changes made.

---

