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

## Phase H2: Account provisioning

Started Oct 18, 2026, built unattended. When an admin adds a broker, the platform creates their Google Workspace email and their GoHighLevel user. Migrations are additive only. Each numbered step was committed locally (`phase H2.N: …`). Nothing was pushed.

### Summary (written when phase H2 finished, Oct 18, 2026)

**Done:** all 14 steps.
- Inviting a broker (name, personal phone, level, both splits) queues Google, then GHL. The api's worker creates `firstname@365yachts.org`, or `firstname.lastname@` when the first name is taken, then `firstname.lastname2@`, `3`, … (accents and punctuation stripped, middle names dropped) in `GOOGLE_ORG_UNIT`, with the personal phone as recovery phone and a random temporary password that must be changed at first sign-in. It then creates the GHL user in `GHL_LOCATION_ID` (role user) and stores both ids. The corporate email becomes the broker's portal login and their `broker_email` on agreements not yet signed.
- Tasks live in `provisioning_tasks` and are claimed with `FOR UPDATE SKIP LOCKED`. Every create looks the user up by email first, and Google users carry the broker id, so retries never duplicate. Backoff is 30 s, 1, 2, 4 min (5 attempts); permanent errors fail at once, in plain words.
- 3c has an Accounts panel (status, email or id, error, Retry or Set up, Link existing account, 365 email typed by hand, CRM phone). 3b has CRM phone and G / GHL status marks; the CSV export adds `corporate_email` and `crm_phone`; `broker_metrics` adds `crm_phone`.
- Step 9 shows the 365 email and "Reveal my temporary password": it resets the Google password at that moment, shows it once with Copy and Open Gmail, 3 a day, audited without the password.
- The invite dialog always shows the link with Copy and "Send via WhatsApp" (wa.me to the personal phone). Email invites still go out when there is an email.
- Inactive suspends Google and deletes the GHL user (after a confirmation that says so); reactivating unsuspends Google and sets GHL up again.
- `pnpm import:brokers -- --link` (plus optional `corporate_email` and `crm_phone` columns) queues link tasks. Re-imports match by login or corporate email.
- At start-up the api logs one warning per system that isn't configured. The overview has an Integrations panel with "Test connection".
- `pnpm provision:verify` is written and was **not run**.

**Tests:** 16 new shared unit tests, 14 client unit tests, 9 worker and 11 route integration tests (incl. permissions), and 5 importer integration tests, all passing. `pnpm lint` and `pnpm typecheck` pass. The admin permissions list now also covers the H3 contract routes, so that test passes again.

**Older failing tests, fixed afterwards (Oct 18, 2026, at Aj's request):** 13 db and 10 api tests and 4 e2e journeys had failed since step 0 (D30) and H3, before H2. They now expect what those features do: 11 steps with step 0 "Start here" first (it has five bullets, no manual text and one video slot), and step 2 signed in the portal. The e2e environment names the seeded owner as `COMPANY_SIGNER_EMAIL`. Journey 2 stores the owner's signature, so the agreements are countersigned automatically, then approves the other six submissions. A shared helper signs both agreements through the real signing screen.

**Added afterwards (Aj's requests, Oct 18, 2026):** the owner can delete a broker and everything about them for good, from the bottom of their profile (SPEC "Decided: deleting a broker permanently"). The invite page shows the phone Shelly entered and, once Google has created it, the 365 email, both grayed out and not editable. The 365 address is `firstname@`, then `firstname.lastname@` when that's taken, then numbered.

**Also fixed afterwards:** every deploy since H3 added an identical new version of both contract templates. The seed compared field maps with `JSON.stringify`, and Postgres reorders JSON keys, so they never matched; it now compares them with sorted keys. Step 9's 365 email card is hidden until Google is configured, so brokers who already have a 365 email aren't told it's being set up.

**Skipped or blocked:**
- `.env.example`: this session's permission settings block reading it, so the new variables are listed below and in DEPLOY.md for you to add: `GOOGLE_SERVICE_ACCOUNT_JSON=`, `GOOGLE_ADMIN_SUBJECT=`, `GOOGLE_DOMAIN=365yachts.org`, `GOOGLE_ORG_UNIT=`, `GHL_AGENCY_TOKEN=`, `GHL_COMPANY_ID=`, `GHL_LOCATION_ID=`, `PROVISIONING_WORKER=on`.
- visual-check / screenshots of the new panels: not run (CLAUDE.md: only when you say "check the screens"). They reuse the existing panel, pill and button styles.
- Real Google and GHL calls: no credentials yet. The clients are unit-tested against the documented request shapes.

**GHL token type and scopes (from the official v2 OpenAPI, DEPLOY.md section 8):** an **agency Private Integration token** (`Authorization: Bearer pit-…`, header `Version: 2021-07-28`). Scopes: **`users.readonly`, `users.write`, `locations.readonly`**. Agency level is needed because `POST /users/search/filter-by-email` accepts agency access only. GHL has no deactivate endpoint, so offboarding uses `DELETE /users/{id}`. The docs don't say whether GHL emails new users, and the API requires a password at creation.

**Decisions to confirm** (each is written out under Decisions in docs/SPEC.md as "H2-assumed"): agency token · GHL deactivate = delete, reactivate = new user · GHL random password, broker uses Forgot password · idempotency via lookup, reserved address and the broker-id tag · address rules · corporate email typed by hand · login email switches to the 365 email · invite dialog always shows link and WhatsApp · retry policy and worker · nothing queued while not configured ("Set up" afterwards) · offboarding and reactivation · reveal limits and confirmation · import --link via the worker · new columns and panels.

**How to turn it on:**
1. Set up Google (DEPLOY.md section 9): enable the Admin SDK API, create a service account and JSON key, add domain-wide delegation for `https://www.googleapis.com/auth/admin.directory.user`.
2. In GHL's agency view, create a Private Integration with the three scopes above.
3. On Railway → api → Variables, add the variables from DEPLOY.md section 2 and redeploy. Migrations 0012 and 0013 run in pre-deploy.
4. Admin overview → Integrations → **Test connection** for both.
5. From your laptop: `railway run --service api -- pnpm provision:verify`. It prints PASS or FAIL per step, creates and deletes only its own `provisioning.check.<timestamp>@365yachts.org` users and broker row, and never touches anyone else.
6. Existing brokers: type their 365 email under Accounts → **Link existing account**, or use `pnpm import:brokers -- --link`.

- [x] 1. Broker fields (corporate_email, personal phone, crm_phone, google_user_id, ghl_user_id) and `provisioning_tasks`
- [x] 2. Google Workspace client (Admin SDK Directory API, service account with domain-wide delegation)
- [x] 3. GoHighLevel client (API v2, built from the official docs; findings in DEPLOY.md)
- [x] 4. Tracked, idempotent tasks with backoff, processed by a worker loop in the api (FOR UPDATE SKIP LOCKED)
- [x] 5. Accounts panel on the profile (3c) and status icons on the brokers table (3b)
- [x] 6. Step 9: corporate email and "Reveal my temporary password"
- [x] 7. Invite dialog: link plus "Send via WhatsApp"
- [x] 8. crm_phone on the profile, brokers table, CSV export and broker_metrics
- [x] 9. Offboarding: suspend on inactive, unsuspend on reactivation
- [x] 10. Link existing accounts (profile button, manual corporate email, `import:brokers --link`)
- [x] 11. Startup env validation and the Integrations panel with "Test connection"
- [x] 12. Tests
- [x] 13. `pnpm provision:verify` (written, not run)
- [x] 14. DEPLOY.md variables and SPEC decisions

## Phase H3: Contract signing (D31)

Started Oct 18, 2026. Step 2 becomes "Review and sign your agreements": the broker signs the Broker Independent Contractor & Commission Agreement and the Mutual NDA in one flow; both are filled from the broker's record and countersigned with Shelly's stored, authorized signature. Migrations additive only. Built without running tests (Rule 3).

- [x] Versioned contract templates (PDF, field map, font) loaded from docs/templates/contracts by the seed and deploy
- [x] PDF filling with pdf-lib + fontkit (Carlito for the agreement, Helvetica for the NDA), signature stamping, signature certificate page, SHA-256 hashes; every version in the private bucket
- [x] Company signature on Shelly's admin profile (draw or upload, authorization tick with timestamp, IP and text, auto-sign on/off); overview banner while missing
- [x] Broker flow: two cards with live pdf.js previews, address / license / phone / email form, e-sign consent, one signature pad (draw or type); both documents must be opened
- [x] Auto countersign and auto-approve, or "Waiting for countersignature" and one-click countersign
- [x] Emails with the final PDFs; documents on step 2 and the broker profile with every version; "Void and re-issue"
- [x] Changes to split, name or phone before the company signature void the pending documents and reset step 2; Section 1.7 warning after
- [x] Admins can upload copies signed outside the portal
- [x] Lesson 2 bonus line fixed by a guarded data migration
- Tests not written or run (Rule 3). The filled PDFs were checked by rendering both templates with sample values.

## Step 0 · Start here (D30, Oct 18, 2026)

- [x] New "Start here" stage (0) with step `start_here`: walkthrough video slot, five bullets, "I've watched the walkthrough" tick
- [x] Existing brokers get the new step on the next seed or deploy; stages numbered from 0 on the checklist and the invite welcome
- Not run or committed yet. Fill the video in Admin → Onboarding steps → Start here after deploy.

## Phase H1: Commission structure (D29)

Started Oct 18, 2026. Built without running tests (Rule 3); tests are written for "run tests". Migrations additive only. Step 11 stays retired (Aj: excluded from H1).

- [x] `commission_history` table (broker, in-house %, self-generated %, effective from, changed by, note); the latest row is the current split. Migrated: one first row per broker from the D27 columns, with any old `commission_tier` text as its note. The D27 columns and `commission_tier` stay in place, unused.
- [x] Shared: the manual's tiers (in-house 30/40/50, self-generated 30–80) plus "Custom %"; E.164 phone; invite email optional
- [x] API: invite (name, E.164 phone, optional email, level, both splits); no email → the invite link is returned for the admin to copy, and the broker gives their own email when accepting; commission change endpoint (adds a history row, audit_log); profile with current split and history; list rows, metrics feed and `broker_metrics` with both splits; importer writes history rows
- [x] Web: invite dialog (dropdowns with Custom %, copyable link when there's no email); profile commission panel with history; two columns on 3b; CSV export; accept-invite asks for an email when there is none
- [x] Tests written (not run): shared, db (history migration, view), API (invite, commission history, accept without email), importer, e2e journeys
  - Existing tests updated for the new behaviour (not weakened): shared api-contract, db commission-splits / seed-and-metrics / import, API invites / permissions / admin-brokers, web content-helpers (CSV), e2e invite helper.
  - New: shared commission-and-contact, db commission-history, API commission-structure, e2e journey 1 "invite without an email".
  - Not yet run: say "run tests" or "full check".

## Onboarding guidance (D28, Oct 18, 2026)

Aj's decision after phase G: the onboarding modules belong in the onboarding steps, and training is the real training. Not yet committed: waiting for Aj to check the wording.

- [x] Additive migration 0006: guidance columns on steps and lessons; `step_videos`, `step_questions`, `step_question_options`
- [x] Step guidance content from Modules 01, 02 and 06 (week one): bullets, callouts (every NEVER and WATCH), full text, video slots on steps 7 and 10, deposit check on step 8; seeded only into steps without bullets
- [x] Broker step page and lesson page in the short layout; Part 0 welcome on 1d
- [x] Knowledge check (up to 3 questions per step), checked answer by answer, enforced on submit
- [x] Admin "Onboarding steps" editor (guidance, video slots with embed or MP4 upload, knowledge check); bullets and callouts in the lesson editor
- [x] Training reduced to "I · How you get paid & measured" (Modules 03–05) plus Volume Two shells; old chapters removed from the seed
- [x] Tests: shared guidance rules, content and seed tests, API integration (guidance, check, videos, admin editor, permissions), Playwright journeys 7 (rewritten) and 8 (new); visual-check at 390 and 1280
- [x] The deploy deletes the old Part 0 and 01–06 drafts if never published and untouched by brokers (audited, logged)
- After deploy: check the deploy log for the deleted drafts; record the step 7 and step 10 videos; fill the GoHighLevel walkthrough slot

## Phase G: Training

Started Oct 17, 2026, built unattended. Each step is committed separately once lint, typecheck and tests pass. Nothing is pushed. Migrations are additive only (new tables, new enums, new view, nullable or defaulted new columns).

### Summary (written when phase G finished, Oct 17, 2026)

**Done:** all seven steps, G1 to G7, each committed locally (nothing pushed). Every migration is additive. `pnpm lint`, `pnpm typecheck`, `pnpm test` (383 unit and integration tests) and `pnpm test:e2e` (12 journeys, including the two new training ones) all pass.

- Brokers: training opens once their status is Active. Chapters unlock in order, Part 0 first. Lessons are text, embedded video (YouTube, Loom or Vimeo, finished with "Mark as watched") or uploaded MP4 (finished at 90% watched, played through 5-minute links). Each quiz draws a random set of questions from the chapter's pool. Answers stay hidden until the broker submits. Results show explanations. After a fail, the broker re-reads the lessons behind the missed questions, then the retake opens.
- Admins: chapter list with average scores, chapter settings (pass mark, questions per attempt, retake rule), publish and unpublish (drafts are never visible to brokers), a lesson editor with callout buttons and live preview, video by embed link or MP4 upload (multipart, up to 1 GB), reordering, a question editor with per-question correct rates, training columns on the broker list (3b), a training panel on the broker profile (3c) and quiz stats on the overview (3a).
- Content: Volume One (Part 0 and Modules 01 to 06) has 24 lessons and 73 questions in the manual's wording, plus the empty "GoHighLevel CRM walkthrough" video slot in Module 01. Volume Two Parts II to X are "coming soon" cards. Production gets Volume One as **drafts** on the next deploy (the release step adds them once). An admin reviews and publishes each chapter.

**Before publishing in production:** check the chapters flagged with a warning icon in the admin. These are the DBPR fee and bond figures in Module 02, and the disputed $500,000 co-broke example in Module 03 (kept out of the questions; the lesson uses the standard 10% gross, 50/50 split).

**Skipped, and why:**
- 3e's "Draft questions from lessons (AI)" and "Upload SOP" buttons: they need an AI API key and the later ingest phase.
- "Book a 1-on-1" on 3a and 3c: no booking feature exists yet.
- Clicking through a real MP4 upload in the browser locally: the shared local SeaweedFS bucket has no CORS rule for the test origin, and changing it could break your own dev setup. Integration tests cover the server side. Production runs in direct upload mode and its bucket CORS (including the exposed ETag header) was checked on Oct 17, so large uploads should work there. Nothing extra is needed to enable them. In proxy mode the API refuses video uploads and asks for an embed link.
- Video captions: not built yet (see the decision below).

**Decisions to confirm** (each is written out in full under Decisions in docs/SPEC.md as "G-assumed"):
separate `broker_training_metrics` view · chapter statuses draft / live / coming soon · per-chapter pass mark (80%), questions per attempt (8) and retake rule · unlocking · lesson completion · answers hidden until submit · lesson videos · lesson text format (Markdown with callouts) · admin-only notes · content edits keep history · "needs a hand" list · no video captions yet · broker training screens · admin training screens · content seeded once per chapter code · lesson length follows the manual · verify-before-publishing flags as admin notes.

**Try the training flow locally:**
1. `docker compose up -d`, then `pnpm db:migrate` and `pnpm db:seed`. Outside production the seed adds the training chapters as live. It never changes chapters that already exist.
2. `pnpm dev`, then open http://localhost:3000.
3. As a broker: sign in as `kevin.osei@example.com` with your `SEED_SAMPLE_PASSWORD` (Kevin is the active sample broker). Open Training, read Part 0, and take the quiz. Get some answers wrong to see the re-read and retake path. Pass to unlock Module 01.
4. As an admin: sign in with your `SEED_OWNER_*` account and open Training (the "Chapters & quizzes" nav item). Try a chapter: edit a lesson, add a YouTube or Loom link, add a question, publish or unpublish. Then check Kevin's row on Brokers and his profile.
5. Or run `pnpm test:e2e -- journey-7` to watch both journeys run against their own database.

- [x] G1. Schema: chapters, lessons, lesson_videos, lesson_progress, questions, question_options, quiz_attempts, attempt_answers; `broker_training_metrics` view
- [x] G2. Shared logic + unit tests: unlock rules, lesson completion, scoring and pass mark, drawing N questions, retake after re-reading, best / first-attempt scores, embed URL validation, lesson Markdown with callouts
- [x] G3. API + integration tests: broker training home, chapter, lesson, progress and video heartbeat, quiz start / answer / submit / result; admin chapter, lesson, video (multipart upload up to 1 GB, or embed), question CRUD, publish, stats, per-broker progress; permission tests
- [x] G4. Broker screens 2a-2d (training home, lesson reader with video, quiz, result); visual-check at 390 and 1280
- [x] G5. Admin screen 3e (chapters, lesson editor with callouts and video, question editor, publish, stats); unlock nav item; training columns on 3b, training panel on 3c, training panel on 3a; visual-check at 1280
  - Skipped: mockup 3e's "Draft questions from lessons (AI)" and "Upload SOP" buttons (need an AI API key and the later ingest phase), and 3a/3c's "Book a 1-on-1" (no booking feature exists). Browser MP4 upload was not clicked through locally: the shared local SeaweedFS bucket has no CORS rule for the test origin, and changing it could break Aj's own dev setup. The server side is covered by integration tests and production CORS was verified.
- [x] G6. Content: Volume One (Part 0, Modules 01-06) as 24 lessons and 73 questions; Volume Two as coming-soon chapters; drafts in production, live in development
  - Kept the manual's wording, so most lessons read in 1 to 2 minutes (shown as at least 2). Existing chapters are never overwritten by the seed.
- [x] G7. Playwright: broker learns, fails, re-reads, passes, next chapter unlocks; admin creates a lesson with an embed video, adds questions, publishes, sees stats (`apps/web/e2e/journey-7-training.spec.ts`)
