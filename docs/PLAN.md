# Build plan - Broker Portal MVP

Approved by Aj on Oct 17, 2026. `docs/SPEC.md` (including its "Decisions" section, D1-D20) is the source of truth; this file tracks the build. Each phase ends with `pnpm lint`, `pnpm typecheck` and `pnpm test` passing, file headers checked, one local commit (`phase X: <summary>`), and a stop. Nothing is ever pushed.

## Status

- [x] A. Monorepo scaffold (Oct 17, 2026)
- [ ] B. Database and shared logic
- [ ] C. API
- [ ] D. Broker screens
- [ ] E. Admin screens
- [ ] F. Import, end-to-end tests, deploy docs

## Folder structure

```
brokerPortal/
├─ apps/
│  ├─ api/                 Fastify + Zod + Better Auth
│  │  ├─ src/{server.ts, app.ts, env.ts, auth.ts}
│  │  ├─ src/plugins/      auth-guard, error-handler, openapi
│  │  ├─ src/routes/       health, invites, me, broker-steps, files, admin/*
│  │  ├─ src/services/     steps, audit, storage, notify, account-tokens
│  │  └─ test/             integration tests and helpers
│  └─ web/                 Next.js App Router + Tailwind + shadcn/ui
│     ├─ src/app/          (auth)/{login,invite/[token],reset/[token]}, app/*, admin/*
│     ├─ src/components/   ui/, broker/, admin/, brand/
│     ├─ src/lib/          api client, session, formatting
│     └─ e2e/              Playwright specs
├─ packages/
│  ├─ shared/              zod schemas, step machine, next step, labels, metrics maths, permissions, chapters, WhatsApp link
│  ├─ db/                  drizzle schema, migrations, broker_metrics view, seed, import, metrics user
│  └─ eslint-config/       shared flat config + local rules (file header, no inline comments)
├─ docs/                   SPEC, ARCHITECTURE, PLAN, DEPLOY (phase F)
├─ docker-compose.yml      postgres:16 + seaweedfs (S3) + bucket init
├─ docker/seaweedfs/       local S3 credentials
└─ turbo.json, pnpm-workspace.yaml, tsconfig.base.json, .env.example, README.md
```

## Phases

### A. Monorepo scaffold
- pnpm workspaces, Turborepo, base tsconfig, Node 24 (`.nvmrc`, `engines`)
- ESLint flat config with local rules that enforce the CLAUDE.md header and ban every other comment
- Vitest per package, Playwright in `apps/web`
- `docker-compose.yml` with Postgres 16, MinIO and a bucket-init container
- `.env.example`, README with setup steps
- Stub apps: Fastify `GET /health`; Next.js page with the `/v1/*` and `/api/auth/*` proxy rewrites (D10)
- Tests: `/health`, proxy rewrite builder, env parsing, the lint rules (RuleTester), one Playwright smoke test

### B. Database and shared logic
- Drizzle schema (with `account_tokens` per D8 and the D17 additions), first migration, `broker_metrics` view, `metrics_reader` NOLOGIN role, `pnpm db:metrics-user` (D18)
- Seed: 11 steps (instructions and review checklists from the manual), owner from env, 3 brokers (invited, onboarding with a sent-back step, active)
- `packages/shared`: state machine with admin override (D2), next step (D1), status labels (D3), permissions, Zod schemas, tenure and days-to-onboard maths, `VOLUME_ONE_CHAPTERS` (D6), `buildWhatsAppLink` (D13)
- Tests: unit tests for all of the above; integration test of the view against seeded data

### C. API
- Better Auth with inactive-broker block at login and in the guard (D9)
- Account tokens: invite, resend invite, admin reset, forgot password, reset completion (D8); owner-only `POST /v1/admin/admins` and `pnpm admin:invite` (D7)
- Broker step routes, storage interface with direct and proxy modes (D11), 5-minute download URLs
- All admin routes from the spec plus send-reminder; audit log; email via Resend or console; OpenAPI at `/docs`
- Integration tests (Testcontainers Postgres + MinIO) for every route, including all permission tests, D9 tests and token tests; 80% line coverage on `apps/api` and `packages/shared`

### D. Broker screens
- `/login`, `/invite/[token]` (1a), `/reset/[token]`, `/app` (1b), `/app/steps/[stepKey]` (1c: upload, form, confirm), `/app/welcome-aboard` (1d), `/app/training` (locked, D6), `/app/help` (WhatsApp, D13)
- visual-check at 390 and 1280 px, web-design-guidelines audit, component tests

### E. Admin screens
- Sidebar with "Chapters & quizzes · Soon", `/admin` (3a), `/admin/brokers` (3b), `/admin/brokers/[id]` (3c with Persona panel, files, upload on behalf, mark done, resend invite, reset link, level/status), `/admin/reviews/[brokerStepId]` (3d), invite dialog
- visual-check at 1280 px, web-design-guidelines audit

### F. Import, end-to-end, deploy
- `pnpm import:brokers` with `--dry-run`; CSV unit tests; idempotency integration test
- Playwright: the 6 spec journeys plus reset link and inactive-broker block
- `docs/DEPLOY.md` (Railway settings for web and api, proxy, bucket CORS check and `STORAGE_UPLOAD_MODE`, every env var, migrations as pre-deploy, `/health`); final README

## Changes from the original plan

- Phase A: Vitest runs per package through Turborepo instead of a root `vitest.workspace.ts` (the workspace file is deprecated in current Vitest). The ESLint config and its local rules live in a new `packages/eslint-config` package so the rules have their own tests.
- Phase A: SeaweedFS replaces MinIO locally and in tests (SPEC D21). Phase C integration tests start `chrislusf/seaweedfs` as a Testcontainers GenericContainer.
- Phase A: TypeScript is pinned to 6.0.x and ESLint to 9.x: typescript-eslint does not support TypeScript 7 yet, and the Next.js React/a11y lint plugins do not support ESLint 10 yet.

## Notes for later phases

- Phase C: Next.js rewrites cap proxied request bodies (10 MB by default). The proxy upload mode (D11) needs that limit raised, or uploads must go straight to the API.
- Phase C: SeaweedFS bucket CORS must be set so the browser's presigned PUT works locally, mirroring what DEPLOY.md asks for on Railway.
- Phase F (DEPLOY.md): Next.js fixes rewrite destinations at build time, so `API_INTERNAL_URL` must be set on the Railway `web` service before its build, and changing it needs a redeploy.
