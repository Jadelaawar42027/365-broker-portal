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

- pnpm workspaces + Turborepo, TypeScript everywhere, Node 24
- `apps/web` - Next.js (App Router), Tailwind, shadcn/ui
- `apps/api` - Fastify + Zod, OpenAPI generated from the Zod schemas
- `packages/db` - Postgres via Drizzle ORM, migrations, seed and import scripts
- `packages/shared` - Zod schemas, types, the onboarding state machine, metrics helpers
- Postgres on Railway (production), Docker Postgres locally and in tests
- File storage: S3-compatible API. Railway Storage Bucket in production, SeaweedFS locally and in tests (MinIO no longer publishes Docker images; SPEC D21)
- Auth: Better Auth (email + password, invite links)
- Tests: Vitest (unit + integration), Testcontainers (real Postgres in integration tests), Playwright (end-to-end)

## Commands

Keep these working at all times and update this list if they change.

- `pnpm dev` - run web + api locally (needs `docker compose up -d` first)
- `pnpm test` - unit + integration tests
- `pnpm test:unit` - unit tests only (no Docker: skips every `*.int.test.ts`)
- `pnpm test:e2e` - Playwright end-to-end tests (needs `docker compose up -d`; resets and uses its own `broker_portal_e2e` database and ports 3100/4100)
- `pnpm lint` and `pnpm typecheck` (lint also enforces Rule 1: header present, path correct, functions listed, no other comments)
- `pnpm build` - production build of web + api
- `pnpm start` / `node scripts/start.mjs` - production start for one Railway service (picks api or web from `RAILWAY_SERVICE_NAME` or `BP_SERVICE`)
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:studio` (seed flags: `--refresh-steps`, `--no-samples`, `--no-training`; training chapters are added live in development and as drafts in production; sample brokers are never seeded when `NODE_ENV=production`)
- `pnpm db:metrics-user` - create or reset the read-only `broker_metrics` login from `METRICS_READER_USER` / `METRICS_READER_PASSWORD`
- `pnpm import:brokers -- --dry-run` - import existing brokers from `data/import/` (`--link` also queues linking their Google and GHL accounts by corporate email)
- `pnpm provision:verify` - real end-to-end check of Google Workspace and GoHighLevel provisioning with the live credentials (creates and deletes its own test users; run by Aj only)
- `pnpm admin:invite -- --name "Shelly Melcher" --email shelly@365yachts.org` - create an admin and print their invite link (owner task, SPEC D7)
- `pnpm storage:cors` - allow the web origin to upload straight to the bucket (run once per bucket; SPEC D11)
- `pnpm --filter @bp/api release` - production pre-deploy: migrations + idempotent seed (built by `pnpm build`; see docs/DEPLOY.md)

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
- Never commit unless Aj says "commit". Then make a local commit with a message like `phase B: database schema and seed`.
- Never commit `.env*` files (except `.env.example`), anything in `data/import/`, uploaded files, or real broker data.

## Rule 3: Tests only when asked

- While I'm making changes, do NOT run tests, write new tests or run visual-check unless I ask. Just make the change.
- After a change, only run `pnpm typecheck` on the packages you touched (it's fast and catches broken code). Fix any type errors.
- When I say "run tests", run `pnpm lint`, `pnpm typecheck` and `pnpm test`, and fix failures.
- When I say "add tests", write unit/integration tests for the changes since the last commit.
- When I say "check the screens", run the visual-check skill on the screens that changed.
- When I say "full check", do all of the above plus `pnpm test:e2e`.
- Never delete or weaken an existing test to make a change pass. If a change will clearly break an existing test, tell me which one instead of fixing it silently.

## Rule 4: Database

- Schema changes only through Drizzle schema + generated migrations. Never edit the database by hand from code you write, never drop or truncate tables outside tests.
- Every status change (step submitted, approved, sent back, broker level/status changed, persona edited) writes a row to `audit_log`.
- Broker metrics come from the `broker_metrics` SQL view, never from stored copies.

## Rule 5: UI

- Match `docs/mockups/` closely: 365 navy `#0A1F3D`, blue `#1D5FBF`, white cards, Manrope font, large text, touch targets of at least 44px.
- Broker screens are mobile-first; design them for 390px and 1280px wide.
- Use the frontend-design skill when building screens. Run the `visual-check` skill only when Aj asks ("check the screens" or "full check"), then fix the differences.
- Real `<button>`, `<a>`, `<label>`; visible focus states; text contrast at least 4.5:1.

## Rule 6: Security and secrets

- Never read `.env` files. Add new variables to `.env.example` with a placeholder and tell Aj.
- Permission checks live in the API on every route, never only in the UI.
- Files are private. Serve them only through short-lived presigned URLs after a permission check.
- Persona notes are admin-only. Never return them on broker-facing routes.

## Working style

- Follow `docs/SPEC.md`. If something is unclear or conflicts, stop and ask rather than guessing.
- Work in the phases from the build prompt. Stop at the end of each phase with a short summary and wait.
