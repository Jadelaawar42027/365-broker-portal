# Broker Portal - MVP Spec (weekend build)

Goal: by Sunday night, a new broker can be invited, complete onboarding on their phone, and be approved by an admin; admins can see every broker's status, metrics and persona.

## In scope

1. Broker side: account setup from an invite link, "My onboarding" checklist, step detail pages (upload, form, confirm), "needs a fix" banner, onboarding-complete screen
2. Admin side: overview, all brokers table, broker profile (onboarding record + persona), review a submission (approve / send back with note), invite a broker
3. Broker persona: one free-text profile per broker, edited by admins
4. Broker metrics SQL view (shareable with other tools)
5. Import script for existing brokers, their files and personas
6. Email notifications (only if `RESEND_API_KEY` is set; otherwise log to the console)
7. Unit, integration and end-to-end tests
8. Railway deployment config

## Out of scope this weekend (phase 2+)

Training chapters, lessons and quizzes (mockups 2a-2d, 3e), SMS, Redis/worker service, Python ingest service, MCP endpoint for the AI bot, GHL sync, in-portal e-signature, magic-link login. Do not build these, but do not design the schema in a way that blocks them.

## Mockup map

| Mockup file | Screen | Route |
| --- | --- | --- |
| 1a-welcome.png | Welcome / create account from invite | `/invite/[token]` |
| 1b-my-onboarding.png | Broker checklist | `/app` |
| 1c-submit-document.png | Step detail (upload example) | `/app/steps/[stepKey]` |
| 1d-onboarding-complete.png | Onboarding complete | `/app/welcome-aboard` |
| 3a-admin-overview.png | Admin overview | `/admin` |
| 3b-admin-brokers.png | All brokers table | `/admin/brokers` |
| 3c-admin-broker-profile.png | Broker profile (+ persona section, see below) | `/admin/brokers/[id]` |
| 3d-admin-review.png | Review a submission | `/admin/reviews/[brokerStepId]` |

The profile mockup shows a training column. In the MVP, replace that column with the **Persona** panel described below.

## Roles

| Role | Can |
| --- | --- |
| broker | See and act on only their own steps and files |
| admin | Everything on `/admin`: invite, review, edit brokers and personas |
| owner | Admin + manage admin accounts |

Seed one owner account from env vars (`SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`).

## Onboarding steps (seeded template, editable later)

| # | key | Stage | Title | Kind | Needs approval |
| --- | --- | --- | --- | --- | --- |
| 1 | photo_id | Paperwork | Upload photo ID / driver's license | upload | yes |
| 2 | contract_nda | Paperwork | Sign your Employment Contract & NDA (download, sign, upload) | upload | yes |
| 3 | bio | Paperwork | Write your professional bio | form (long text) | yes |
| 4 | headshot | Paperwork | Upload a professional headshot | upload (image) | yes |
| 5 | w9 | Paperwork | Upload your W-9 | upload | yes |
| 6 | license_situation | Florida license | Tell us your license situation (new / transfer / not licensed yet) | form (choice) | no |
| 7 | dbpr_filing | Florida license | File your DBPR application or license transfer (upload confirmation) | upload | yes |
| 8 | license_bond | Florida license | Upload your license & surety bond copy | upload | yes |
| 9 | email_signature | Your tools | Activate your 365 email and install the brand signature | confirm | no |
| 10 | platform_logins | Your tools | Log in to BoatWizard, YachtCloser and GoHighLevel | confirm (3 checkboxes) | no |
| 11 | commission_tier | Your tools | Book your 1-on-1 to confirm your commission tier | admin marks done | yes |

Each step has: instructions (markdown), optional template file to download, optional video URL, accepted file types, max size 10 MB.

## Step state machine (lives in packages/shared)

- States: `todo`, `submitted`, `approved`, `changes_requested`
- `todo -> submitted` (broker submits, step needs approval)
- `todo -> approved` (broker confirms, step needs no approval)
- `submitted -> approved` (admin approves)
- `submitted -> changes_requested` (admin sends back with a required note)
- `changes_requested -> submitted` (broker resubmits; new file version kept, old one kept too)
- Anything else is rejected with a clear error
- "Next step" = lowest-numbered step in `todo` or `changes_requested`
- When the last step becomes `approved`: broker status `onboarding -> active`, set `onboarded_at`, write audit rows, notify admins, broker sees the onboarding-complete screen once

## Data model (Drizzle, Postgres)

- `users`: id, name, email (unique), phone, role (`broker` | `admin` | `owner`), created_at
- `brokers`: id, user_id, level (`junior` | `senior`), status (`invited` | `onboarding` | `active` | `inactive`), joined_at, onboarded_at, left_at, commission_tier (text, nullable), persona_md (text), persona_updated_at, persona_updated_by
- `invites`: id, broker_id, token_hash, expires_at (7 days), used_at
- `onboarding_steps`: id, key, position, stage, title, kind, needs_approval, instructions_md, template_file_key, video_url, accepted_types, active
- `broker_steps`: id, broker_id, step_id, status, form_data (jsonb), submitted_at, reviewed_by, reviewed_at, review_note; unique (broker_id, step_id)
- `files`: id, broker_step_id, storage_key, file_name, mime_type, size_bytes, version, uploaded_by, created_at (never overwritten)
- `audit_log`: id, actor_user_id, action, entity_type, entity_id, before (jsonb), after (jsonb), created_at
- Better Auth's own tables for sessions/accounts

### broker_metrics view

One row per broker: broker_id, name, email, level, status, is_active (status = active), joined_at, onboarded_at, days_to_onboard (onboarded_at - joined_at), tenure_days (from joined_at to left_at or today), steps_total, steps_approved, steps_waiting_review, last_activity_at.

Also create a read-only Postgres role `metrics_reader` with SELECT on `broker_metrics` only (migration), so Metabase, Sheets or the AI bot can read it safely.

## Persona

- Free-text markdown per broker, admin-only, shown and edited on the broker profile page (3c) in a large editor with a preview
- Pre-filled with the template in `docs/templates/persona-template.md` when empty
- Shows "last edited by X on date"; every edit writes to `audit_log`
- Searchable from the brokers table search box (simple ILIKE on persona text for now)
- Never returned by any broker-facing API route

## Files

- Browser uploads directly to storage with a presigned PUT URL the API issues after checking permission, type and size; then the API records the file row
- Downloads only via presigned GET URLs valid for 5 minutes, after a permission check; every admin download writes `audit_log`
- Storage key format: `brokers/{brokerId}/{stepKey}/{version}-{safeFileName}`
- Admins can upload a file to any broker's step on their behalf from the broker profile page (for existing brokers' paperwork). It is stored the same way, marked approved, and `uploaded_by` records the admin
- The broker profile page lists every file with version, date and who uploaded it, plus a download button

## API (Fastify, `/v1`)

- Auth: Better Auth routes; `POST /v1/invites/:token/accept` (set name, password, phone)
- Broker: `GET /v1/me`, `GET /v1/me/steps`, `GET /v1/me/steps/:key`, `POST /v1/me/steps/:key/upload-url`, `POST /v1/me/steps/:key/submit`, `GET /v1/files/:id/download-url`
- Admin: `GET /v1/admin/overview`, `GET /v1/admin/brokers` (filters: status, level, search), `POST /v1/admin/brokers` (create + invite), `GET/PATCH /v1/admin/brokers/:id` (level, status, left_at, commission_tier), `PUT /v1/admin/brokers/:id/persona`, `GET /v1/admin/reviews`, `POST /v1/admin/broker-steps/:id/approve`, `POST /v1/admin/broker-steps/:id/send-back`, `POST /v1/admin/broker-steps/:id/mark-done`, `POST /v1/admin/brokers/:id/steps/:key/upload-url` and `.../upload-complete` (admin uploads on behalf), `GET /v1/admin/metrics` (from the view)
- `GET /health`
- Every request validated with Zod; OpenAPI served at `/docs` in non-production

## Admin overview numbers (3a)

Active brokers (with junior/senior split), onboarding right now, average days to onboard (last 10 onboarded), submissions waiting for review (list), onboarding in progress (progress bar + next step + "stuck" if no activity for 4+ days). Skip the training panel for now.

## Import existing brokers

`pnpm import:brokers` reads:

- `data/import/brokers.csv` with columns: name, email, phone, level, status, joined_at, onboarded_at, left_at, commission_tier
- `data/import/personas/{email}.md` (optional)
- `data/import/files/{email}/{stepKey}.{ext}` (optional; uploaded to storage and marked approved)

Upserts by email, never deletes, prints a summary, supports `--dry-run`. Existing active brokers get all steps marked approved with a note "imported". `data/import/` is gitignored.

## Tests

- Unit (Vitest): state machine (every allowed and rejected transition), next-step logic, tenure and days-to-onboard maths, permission helpers, Zod schemas, CSV row parsing
- Integration (Vitest + Testcontainers Postgres + MinIO or a storage fake, Fastify `inject`): every route, happy path and errors; broker A cannot see broker B's steps, files or persona; brokers get 403 on `/v1/admin/*`; approving the last step activates the broker; send-back requires a note; import is idempotent; `broker_metrics` returns correct numbers
- End-to-end (Playwright, seeded database, runs against `pnpm dev`):
  1. Admin invites a broker, broker opens the invite link and creates an account
  2. Broker completes all steps (uploads, form, confirm); admin approves; broker sees the onboarding-complete screen; admin sees status Active
  3. Admin sends a step back with a note; broker sees the red banner, resubmits; admin approves
  4. Admin edits a persona and finds the broker by searching a word from it
  5. Broker cannot open `/admin` (redirected)
  6. Mobile viewport (390px) run of journey 2's broker steps
- Coverage: at least 80% lines on `packages/shared` and `apps/api`

## Deployment (Railway)

- Services: `web`, `api`, `postgres`, `bucket`
- Do NOT create `railway.json` / `railway.toml` files: Railway has deprecated config-as-code files for new services. Do not create `.railway/railway.ts` either; that can delete resources when applied, and Aj will adopt it later.
- Instead write `docs/DEPLOY.md`: for each of `web` and `api`, the exact values to type into the Railway service settings (root directory or watch paths, build command, start command, pre-deploy command, healthcheck path) and every environment variable with where its value comes from. `api`'s pre-deploy command runs the migrations; its healthcheck is `/health`
- Both apps must build and start with plain `pnpm` commands from the repo root (for example `pnpm --filter @bp/api build` and `pnpm --filter @bp/api start`)
- Env vars documented in `.env.example`; `api` uses `${{Postgres.DATABASE_URL}}` and the bucket's credentials via Railway variable references
- Aj connects the GitHub repo in Railway himself after he pushes

## Decisions

Agreed with Aj on Oct 17, 2026, after the planning pass. Where these differ from the sections above, the decisions win.

### Onboarding logic

- **D1. Next step.** "Next step" = the lowest-numbered step in `todo`. Steps in `changes_requested` always show in the red "sent back" banner. Only when no `todo` step is left does the next step fall back to the lowest `changes_requested` step. (Matches mockup 1b, replaces the rule in "Step state machine".)
- **D2. Admin override.** One extra transition, admin-only: any state -> `approved`, recorded with the admin as actor and an `audit_log` row. Used by "mark done" (step 11) and by admin uploads on a broker's behalf. "Mark done" on `commission_tier` also takes the tier text and saves it to `brokers.commission_tier`.
- **D3. Status labels.** Approved steps that need no approval show "Done"; `contract_nda` shows "Signed"; every other approved step shows "Approved". The admin onboarding record (3c) uses the same labels with the date.
- **D4. Order.** Every step can be opened at any time. "Coming up" is only a label.
- **D5. Joining.** Admin sets `joined_at` when creating the broker (defaults to today, editable). Broker status goes `invited -> onboarding` when the invite is accepted.

### Training placeholders (phase 2 visible but locked)

- **D6.** Broker nav keeps "Training" with a lock icon. It opens `/app/training`, a locked page listing the Volume One chapters greyed out (titles only) with the banner "Training opens soon. You'll get access once your onboarding is approved."
- 1d keeps "Start training" as a disabled button labelled "Training coming soon". 1b keeps "Training unlocks when all 11 are done".
- Admin sidebar: Overview, Brokers, Reviews, and "Chapters & quizzes" shown with a "Soon" badge and not clickable. "Onboarding steps" and "Settings" are hidden.
- 3a: the quiz score card becomes "Waiting for review" (count); the training panel is dropped.
- 3b: the Training and Avg. quiz columns stay and show "—" for everyone.
- The chapter list lives in one place, `packages/shared` (`VOLUME_ONE_CHAPTERS`): Part 0 · Start Here, 01 · Week One Setup, 02 · Licensing & Compliance, 03 · Commission Structure, 04 · Commission Income Management, 05 · KPIs & Benchmarks, 06 · Quick Start Checklist. Phase 2 reuses it.

### Accounts and auth

- **D7. Admin accounts.** Owner-only `POST /v1/admin/admins` invites an admin by email, plus a `pnpm admin:invite` script. No Settings screen this weekend.
- **D8. Account tokens.** Invites and password resets share one token mechanism: an `account_tokens` table (id, user_id, broker_id nullable, purpose `invite` | `password_reset`, token_hash, expires_at, used_at) replaces `invites`. Invites expire after 7 days, reset links after 24 hours; tokens are single-use and stored only as hashes.
  - `POST /v1/admin/brokers/:id/resend-invite` issues a fresh invite and invalidates the old one.
  - `POST /v1/admin/brokers/:id/reset-password` emails a reset link; `/login` has a "Forgot password?" link that does the same for the user's own email (always answers the same way so it does not reveal which emails exist).
  - `/reset/[token]` sets a new password; completing it deletes the user's other sessions.
- **D9. Inactive brokers.** An inactive broker cannot log in, and setting a broker to `inactive` deletes all their sessions. The API auth guard also rejects any session that belongs to an inactive broker. Integration tests cover both.
- **D10. Cookies.** The web app proxies `/v1/*` and `/api/auth/*` to the api over Railway's private network, so the browser only talks to the web origin and the session cookie is first-party. The api keeps a public domain for `/docs` and the future bot.

### Files

- **D11. Storage interface.** One storage interface in the api with two upload modes: direct presigned PUT (default) and upload through the api for files up to 10 MB (fallback if the Railway bucket rejects cross-origin PUTs). Callers never know which mode is active; a `STORAGE_UPLOAD_MODE` env var (`direct` | `proxy`) switches it.
- **D12. Submissions.** One submission can hold up to 5 files sharing one version number. "Remove" before sending only discards a file that has not been submitted; file rows are created on submit and never deleted.

### Support, notifications and copy

- **D13. WhatsApp support.** Support is through WhatsApp. Env vars `SUPPORT_CONTACT_NAME` and `SUPPORT_WHATSAPP_NUMBER` (international format, digits only, e.g. `15614459241`).
  - Everywhere the mockups say "Call Shelly" or "Stuck? Just call" (1a footer, 1c side card), show a green "Message {name} on WhatsApp" button instead.
  - It opens `https://wa.me/<number>?text=<message>` in a new tab with a pre-filled message naming the broker and their step, e.g. "Hi Shelly, it's Daniel Reyes. I need help with step 5: Upload your W-9." On 1a it says "I need help creating my account."
  - The link is built by a pure function in `packages/shared` (`buildWhatsAppLink`) with unit tests for URL encoding and for returning nothing when the number is missing, which hides the button.
  - `/app/help` is mainly this button.
- **D14. Names.** The red banner uses the real reviewer's name and the 3d "Send back to {first name}" button uses the real broker's name. Other copy that says "Shelly" uses `SUPPORT_CONTACT_NAME`.
- **D15. No SMS copy.** Copy that promises a text ("We text you a reminder", "You get a text") says email instead. The phone number is still collected.
- **D16. Extra mockup elements kept.**
  - "Send reminder" (3a) sends a templated email through the notification code and writes `audit_log`.
  - "Export CSV" (3b) downloads the currently filtered table, built in the browser.
  - "Take a photo" (1c) is a file input with `capture`.
  - 3d "Check before approving" shows a per-step checklist from `onboarding_steps.config`; it is a reading aid and is not saved.

### Data and metrics

- **D17. Schema additions.** `onboarding_steps.config` (jsonb: choices, checkboxes, max size, review checklist); `brokers.welcome_seen_at` (the onboarding-complete screen shows once); Better Auth's user table is `users`, with `role` and `phone` as additional fields.
- **D18. metrics_reader.** The migration creates `metrics_reader` as a NOLOGIN role with SELECT on `broker_metrics` only. `pnpm db:metrics-user` creates a login user in that role from `METRICS_READER_PASSWORD`.
- **D19.** 3a's "Avg. days to onboard" subtitle says "Last 10 brokers" (the mockup's "Last 6" is placeholder).

### Tooling

- **D20.** Node 24 (`engines.node >=24`, `.nvmrc`), not Node 22.
- **D21. Local S3 is SeaweedFS, not MinIO.** MinIO stopped publishing pullable Docker images (quay.io/minio returns 401, Docker Hub `minio/minio` is gone). Local development and integration tests use `chrislusf/seaweedfs` (S3 API on port 8333, credentials in `docker/seaweedfs/s3.json`). Production is unchanged (Railway Storage Bucket); the API only speaks plain S3. Decided by Aj, Oct 17, 2026.
