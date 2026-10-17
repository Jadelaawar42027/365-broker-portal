# 365 Yachts Broker Portal

Broker onboarding and team-management platform for 365 Yachts, a Florida yacht brokerage.
Brokers get a step-by-step onboarding checklist. Admins (Shelly, Max, Aj) approve submissions,
track every broker, and keep a persona profile per broker for lead matching.

Read these before doing anything:

- `docs/SPEC.md` - what to build this weekend (MVP scope, data model, screens, tests)
- `docs/ARCHITECTURE.md` - the long-term architecture (the MVP is a subset of it)
- `docs/mockups/` - screenshots of every screen; the UI must match them
- `docs/manual/` - the 365 Broker Onboarding Manual (source of the onboarding steps)

## Stack (MVP)

- pnpm workspaces + Turborepo, TypeScript everywhere, Node 22
- `apps/web` - Next.js (App Router), Tailwind, shadcn/ui
- `apps/api` - Fastify + Zod, OpenAPI generated from the Zod schemas
- `packages/db` - Postgres via Drizzle ORM, migrations, seed and import scripts
- `packages/shared` - Zod schemas, types, the onboarding state machine, metrics helpers
- Postgres on Railway (production), Docker Postgres locally and in tests
- File storage: S3-compatible API. Railway Storage Bucket in production, MinIO locally
- Auth: Better Auth (email + password, invite links)
- Tests: Vitest (unit + integration), Testcontainers (real Postgres in integration tests), Playwright (end-to-end)

## Commands

Keep these working at all times and update this list if they change.

- `pnpm dev` - run web + api locally (needs `docker compose up -d` first)
- `pnpm test` - unit + integration tests
- `pnpm test:e2e` - Playwright end-to-end tests
- `pnpm lint` and `pnpm typecheck`
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio`
- `pnpm import:brokers -- --dry-run` - import existing brokers from `data/import/`

## Rule 1: Comments - file headers only, never inline

- Never write inline or end-of-line comments inside code. No `//` explanations, no commented-out code, no JSX comments.
- Every source file (`.ts`, `.tsx`, `.js`, `.mjs`, `.py`, `.sql`, `.css`) starts with ONE header comment that contains:
  1. The file path
  2. What the file is for, in one to three plain sentences
  3. A `Functions:` list with every function, component, hook and class method in the file, one line each: name, inputs, what it does and returns
- Whenever you add, rename, delete or change the behaviour of a function, update that file's header in the same edit. A header that no longer matches the code is a bug.
- Files that cannot hold comments (JSON, lockfiles, generated migrations) are exempt. Generated files must not be hand-edited.
- Name things so the code reads without comments. If code needs explaining, extract a well-named function and describe it in the header.

Header format for TypeScript:

```ts
/**
 * File: apps/api/src/routes/broker-steps.ts
 * Purpose: HTTP routes a broker uses to see and submit their own onboarding steps.
 *
 * Functions:
 * - registerBrokerStepRoutes(app): mounts GET /v1/me/steps and POST /v1/me/steps/:stepId/submit.
 * - toStepView(row): turns a broker_steps row into the shape the web app renders.
 */
```

Python uses the same content as a module docstring. SQL and CSS use a block comment.

## Rule 2: Git - never push

- NEVER run `git push`, `gh`, or `git remote` commands, and never open pull requests. Aj pushes to GitHub himself.
- You may make local commits at the end of each phase, only when `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass. Message format: `phase B: database schema and seed`.
- Never commit `.env*` files (except `.env.example`), anything in `data/import/`, uploaded files, or real broker data.

## Rule 3: Tests are part of every change

- Every feature ships with unit tests (pure logic) and integration tests (API route + real Postgres).
- Every user journey in `docs/SPEC.md` has a Playwright test.
- Permission tests are mandatory: a broker must never read or change another broker's data, and only admins reach `/v1/admin/*`.
- A task is done only when `pnpm lint`, `pnpm typecheck` and `pnpm test` pass. Say which tests you added.

## Rule 4: Database

- Schema changes only through Drizzle schema + generated migrations. Never edit the database by hand from code you write, never drop or truncate tables outside tests.
- Every status change (step submitted, approved, sent back, broker level/status changed, persona edited) writes a row to `audit_log`.
- Broker metrics come from the `broker_metrics` SQL view, never from stored copies.

## Rule 5: UI

- Match `docs/mockups/` closely: 365 navy `#0A1F3D`, blue `#1D5FBF`, white cards, Manrope font, large text, touch targets of at least 44px.
- Broker screens are mobile-first; check them at 390px and 1280px wide.
- Use the frontend-design skill when building screens. After building or changing a screen, run the `visual-check` skill and fix differences before moving on.
- Real `<button>`, `<a>`, `<label>`; visible focus states; text contrast at least 4.5:1.

## Rule 6: Security and secrets

- Never read `.env` files. Add new variables to `.env.example` with a placeholder and tell Aj.
- Permission checks live in the API on every route, never only in the UI.
- Files are private. Serve them only through short-lived presigned URLs after a permission check.
- Persona notes are admin-only. Never return them on broker-facing routes.

## Working style

- Follow `docs/SPEC.md`. If something is unclear or conflicts, stop and ask rather than guessing.
- Work in the phases from the build prompt. Stop at the end of each phase with a short summary and wait.
