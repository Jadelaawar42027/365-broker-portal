# Build plan - Broker Portal MVP

Approved by Aj on Oct 17, 2026. `docs/SPEC.md` (including its "Decisions" section, D1-D20) is the source of truth; this file tracks the build. Each phase ends with `pnpm lint`, `pnpm typecheck` and `pnpm test` passing, file headers checked, one local commit (`phase X: <summary>`), and a stop. Nothing is ever pushed.

## Status

- [x] A. Monorepo scaffold (Oct 17, 2026)
- [x] B. Database and shared logic (Oct 17, 2026)
- [x] C. API (Oct 17, 2026)
- [x] D. Broker screens (Oct 17, 2026)
- [x] E. Admin screens (Oct 17, 2026)
- [x] F. Import, end-to-end tests, deploy docs (Oct 17, 2026)

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
- Phase B: schema details beyond the spec are recorded in SPEC D8 and D17 (no broker_id on account_tokens; short_title, summary, intro, max_size_bytes, attempts; explicit step kinds; date columns).
- Phase B: `pnpm db:metrics-user` and the `@bp/db/testing` helper (Testcontainers Postgres with migrations) were added; the API's integration tests reuse it.
- Phase C: extra routes, storage key nonce, email rules, CSRF origin check and the shared API contract are recorded as SPEC D22-D26. Added `pnpm admin:invite` and `pnpm storage:cors`.
- Phase C: the S3 adapter lives in `@bp/shared/node` (not `apps/api`) because the seed and the phase F importer also upload files.
- Phase D: no new npm dependencies. UI primitives (buttons, pills, icons, progress bar) are small hand-written components in shadcn/ui style instead of generated shadcn/ui files, so every file carries its header; persona Markdown uses a tiny safe block parser (no raw HTML). Web tests cover pure helpers; screens are checked with the visual-check skill now and journeys with Playwright in phase F.
- Phase D: "sent" on the 1b header counts sent-back steps too (mockup: 5 sent, 3 approved, 1 waiting, 1 sent back). `countProgress` in @bp/shared changed accordingly.
- Phase D: the 1c video card is shown only when a step has a video URL; none do yet, so it is hidden rather than showing a "[Video from Shelly — to upload]" placeholder. "Call Shelly" panels are WhatsApp buttons (D13); text promises say email (D15).
- Phase D: pages shown before sign-in read SUPPORT_CONTACT_NAME / SUPPORT_WHATSAPP_NUMBER from the web service's own environment, so DEPLOY.md must set them on `web` as well as `api`.
- Phase E: the admin sidebar is 248px wide (mockup ~220px) so "Chapters & quizzes" fits on one line with its "Soon" badge. The 3a quiz card is "Waiting for review", the 3c fifth tile is "Commission tier", and the 3c record shows admin actions (Review, Upload, Mark done) on a second line under steps that aren't approved. Setting a broker inactive asks for confirmation and records today as left_at; reactivating clears it.
- Phase E: added a `/admin/reviews` list page (the sidebar "Reviews" item and "See all" on 3a need somewhere to land); it is not in the mockups.
- Phase F: the importer validates the whole folder first and imports nothing if any row or file is wrong; it runs in one transaction, and a dry run rehearses everything and rolls back. Brokers imported as active (or inactive with an onboarded date) get every step approved with the note "imported" and `welcome_seen_at` set. Imported brokers have no password; admins send invites from the profile.
- Phase F: Railway pre-deploy runs `pnpm --filter @bp/api release` (built migrations + idempotent seed) instead of drizzle-kit, so deploys don't depend on dev tools.
- Phase F: e2e tests run on their own database (`broker_portal_e2e`, reset by `pnpm --filter @bp/db e2e:reset`, which refuses any other name) and ports 3100/4100, and read invite/reset links from `EMAIL_OUTBOX_DIR` (refused in production). The status pill on 3b now renders "Active" as text rather than via CSS capitalisation.
- Phase A: TypeScript is pinned to 6.0.x and ESLint to 9.x: typescript-eslint does not support TypeScript 7 yet, and the Next.js React/a11y lint plugins do not support ESLint 10 yet.

## Notes for later phases

- Local machine: the repo lives in an iCloud-synced Desktop folder. iCloud created "file 2.ts" conflict copies inside apps/web/.next (deleted). If odd duplicate files appear again, moving the repo out of Desktop/Documents avoids it.
- Visual checks run against an isolated database `broker_portal_visual` (same Postgres container) with web on :3200 and api on :4200 in proxy upload mode, so the developer's own data and bucket CORS are untouched.

- Phase C: the seed creates approved upload steps without file rows (no storage client yet). Once storage exists, the seed uploads small placeholder files for the sample brokers so "View file" works locally.
- Phase C: the contract & NDA step has no template file yet (`template_file_key` is empty). Aj needs to provide the blank contract and NDA; the W-9 step links to the IRS form.

- Phase C: Next.js rewrites cap proxied request bodies (10 MB by default). The proxy upload mode (D11) needs that limit raised, or uploads must go straight to the API.
- Phase C: SeaweedFS bucket CORS must be set so the browser's presigned PUT works locally, mirroring what DEPLOY.md asks for on Railway.
- Phase F (DEPLOY.md): Next.js fixes rewrite destinations at build time, so `API_INTERNAL_URL` must be set on the Railway `web` service before its build, and changing it needs a redeploy.

## Phase G: Training

Started Oct 17, 2026, built unattended. Each step is committed separately once lint, typecheck and tests pass. Nothing is pushed. Migrations are additive only (new tables, new enums, new view, nullable or defaulted new columns).

<!-- PHASE-G-SUMMARY -->

- [x] G1. Schema: chapters, lessons, lesson_videos, lesson_progress, questions, question_options, quiz_attempts, attempt_answers; `broker_training_metrics` view
- [x] G2. Shared logic + unit tests: unlock rules, lesson completion, scoring and pass mark, drawing N questions, retake after re-reading, best / first-attempt scores, embed URL validation, lesson Markdown with callouts
- [x] G3. API + integration tests: broker training home, chapter, lesson, progress and video heartbeat, quiz start / answer / submit / result; admin chapter, lesson, video (multipart upload up to 1 GB, or embed), question CRUD, publish, stats, per-broker progress; permission tests
- [ ] G4. Broker screens 2a-2d (training home, lesson reader with video, quiz, result); visual-check at 390 and 1280
- [ ] G5. Admin screen 3e (chapters, lesson editor with callouts and video, question editor, publish, stats); unlock nav item; training columns on 3b, training panel on 3c, training panel on 3a; visual-check at 1280
- [ ] G6. Content: Volume One (Part 0, Modules 01-06) as lessons and questions; Volume Two as coming-soon chapters; drafts in production, live in development
- [ ] G7. Playwright: broker learns, fails, re-reads, passes, next chapter unlocks; admin creates a lesson with an embed video, adds questions, publishes, sees stats
