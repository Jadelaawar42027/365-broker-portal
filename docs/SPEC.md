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
- **D8. Account tokens.** Invites and password resets share one token mechanism: an `account_tokens` table (id, user_id, purpose `invite` | `password_reset`, token_hash, expires_at, used_at, created_by, created_at) replaces `invites`. It has no broker_id: users and brokers are one-to-one, and admin invites (D7) have no broker row. Invites expire after 7 days, reset links after 24 hours; tokens are single-use and stored only as hashes.
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

- **D17. Schema additions.** `onboarding_steps.config` (jsonb: choices, checklist items, confirm label, text length limits, template link, review checklist, minutes); `brokers.welcome_seen_at` (the onboarding-complete screen shows once); Better Auth's user table is `users`, with `role` and `phone` as additional fields. Added in phase B:
  - `onboarding_steps`: `short_title` (3a/3c/3d labels such as "W-9"), `summary` (the 1b next-step card text), `intro` (the 1c subtitle), `max_size_bytes`.
  - `onboarding_steps.kind` is one of `upload`, `text`, `choice`, `confirm`, `checklist`, `admin` (the spec's "form (long text)", "form (choice)", "confirm", "confirm (3 checkboxes)" and "admin marks done").
  - `broker_steps.attempts` (number of submissions, shown as "Attempt" on 3d).
  - `joined_at`, `onboarded_at` and `left_at` are `date` columns; "today" in metrics is Florida time.
- **D18. metrics_reader.** The migration creates `metrics_reader` as a NOLOGIN role with SELECT on `broker_metrics` only. `pnpm db:metrics-user` creates a login user in that role from `METRICS_READER_PASSWORD`.
- **D19.** 3a's "Avg. days to onboard" subtitle says "Last 10 brokers" (the mockup's "Last 6" is placeholder).

### Tooling

- **D20.** Node 24 (`engines.node >=24`, `.nvmrc`), not Node 22.
- **D21. Local S3 is SeaweedFS, not MinIO.** MinIO stopped publishing pullable Docker images (quay.io/minio returns 401, Docker Hub `minio/minio` is gone). Local development and integration tests use `chrislusf/seaweedfs` (S3 API on port 8333, credentials in `docker/seaweedfs/s3.json`). Production is unchanged (Railway Storage Bucket); the API only speaks plain S3. Decided by Aj, Oct 17, 2026.

### Added during phase C (API)

- **D22. Storage keys** are `brokers/{brokerId}/{stepKey}/{version}-{nonce}-{safeFileName}`. The short random nonce keeps keys unique when one submission holds several files with the same name (D12). Submitted files are re-checked in storage (exists, type, size, belongs to this broker and step, not recorded before) before a `files` row is written.
- **D23. Routes beyond the spec's list**, all needed by the screens or decisions: `GET /v1/invites/:token` (1a shows the name), `POST /v1/password-reset/request`, `GET`/`POST /v1/password-reset/:token` (D8), `POST /v1/me/welcome-seen` (1d once), `GET /v1/me/steps/:key/template-url`, `GET /v1/admin/broker-steps/:id` (3d detail and queue position), `POST /v1/admin/brokers/:id/resend-invite`, `.../reset-password`, `.../remind` (D16), `POST /v1/admin/admins` (D7), `PUT /v1/uploads/:token` (proxy uploads, D11). The full list is in the OpenAPI document at `/docs`.
- **D24. Emails** go to the broker when a step is approved or sent back, on invite, reset and reminder, and to the broker and every admin when onboarding completes. A failed email is logged and never fails the request.
- **D25. CSRF guard.** Besides SameSite cookies, state-changing `/v1` requests that carry an `Origin` header must come from `WEB_ORIGIN`.
- **D26. Request/response contract** lives in `packages/shared/src/api.ts` as Zod schemas. The API validates and serialises with them (so fields not listed, like persona notes on broker routes, can never be sent) and the web app imports the same types.

### Phase G: Training (decided while working unattended; confirm with Aj)

- **G-assumed: separate training metrics view (confirm with Aj).** Training numbers live in a new `broker_training_metrics` view (chapters passed, average best and first-attempt scores, attempts, last training activity) instead of changing `broker_metrics`, so the existing view and its consumers are untouched. `metrics_reader` can read it.
- **G-assumed: chapter statuses `draft`, `live`, `coming_soon` (confirm with Aj).** Brokers see only `live` chapters; `coming_soon` is used for the Volume Two parts, shown as locked cards with no content; drafts are never sent to brokers.
- **G-assumed: per-chapter settings (confirm with Aj).** Each chapter has a pass mark (default 80%), questions per attempt (default 8, drawn at random from the chapter's active questions) and an "after a fail" rule: `reread` (default; re-read the lessons behind the missed questions, then retake) or `immediate`. Admins can waive the re-read for one broker ("Allow another retake").
- **G-assumed: unlocking (confirm with Aj).** Training opens when the broker's status is `active`. Volume One chapters unlock in position order (Part 0 first); a chapter unlocks when every chapter before it is passed. All lessons of an unlocked chapter are open; the quiz opens when every lesson in the chapter is complete. Passed chapters can be retaken for practice; the best score counts.
- **G-assumed: lesson completion (confirm with Aj).** Text lessons complete when the broker presses the read button; embedded videos when they press "Mark as watched"; uploaded videos when watch heartbeats reach 90% of the duration (watched seconds only go up and are capped at the duration). An uploaded video with no known duration can be marked watched. Re-reading a completed lesson (for a retake) is pressing its button again.
- **G-assumed: answers stay hidden until submit (confirm with Aj).** Mockup 2c's "Check answer" becomes "Next question": answers are saved one by one and nothing reveals correctness until the quiz is submitted. Results (2d) then show each missed question with the broker's answer, the correct one, the explanation and a link to the lesson.
- **G-assumed: lesson videos (confirm with Aj).** One video per lesson: an embed (YouTube, Loom or Vimeo over https only, stored as the provider's embed address, YouTube via youtube-nocookie.com) or an MP4 upload up to 1 GB, uploaded from the browser straight to the bucket in 16 MB multipart parts (part URLs valid 6 hours) and played through 5-minute presigned links that the player refreshes. Uploads need `STORAGE_UPLOAD_MODE=direct`; production is direct and its bucket CORS was verified on Oct 17, 2026 (it also exposes the ETag header multipart needs). In proxy mode the API refuses video uploads and asks for an embed link instead.
- **G-assumed: lesson text format (confirm with Aj).** Lessons are Markdown with headings, bold/italic, https links, lists, tables, and the manual's callouts written as `> [!WATCH]`, `> [!NEVER]`, `> [!HOUSE RULE]`, `> [!EDGE]`, `> [!FIELD NOTE]`. No raw HTML is ever rendered.
- **G-assumed: admin-only notes (confirm with Aj).** Lessons and questions have an admin-only note used for "verify before publishing" flags (DBPR fees and bond amounts, the disputed Module 03 co-broke example). Brokers never see notes; the chapter list flags chapters that have any.
- **G-assumed: content edits keep history (confirm with Aj).** Lessons can be deleted only while their chapter is unpublished; questions that brokers have answered are archived (hidden from new quizzes, kept for statistics) instead of deleted; chapters can be deleted only as drafts nobody has attempted.
- **G-assumed: "needs a hand" (confirm with Aj).** The admin overview lists active brokers who failed a chapter twice or more without passing it, or who have done no training for 7+ days while chapters remain.
- **G-assumed: no video captions yet (confirm with Aj).** Uploaded MP4s play without a caption track; the lesson text under the video carries the same content. Adding WebVTT caption uploads is a follow-up.
- **G-assumed: broker training screens (confirm with Aj).** Lesson and quiz pages use a focused header (like the step page) instead of the main navigation, as on mockups 2b to 2d. Opening a chapter goes to the quiz in progress, the last result while a re-read is needed, the first unread lesson, or lesson 1. The quiz button sits on the last lesson ("Got it — take the quiz"). "Save and exit" keeps saved answers; a quiz with unanswered questions jumps back to them before finishing.
- **G-assumed: admin training screens (confirm with Aj).** 3e is split into a chapter page (settings, lessons, questions; question editor opens in place) and a lesson editor page (text with callout buttons and live preview, video link or MP4 upload). Settings save as soon as a dropdown changes. Lessons reorder with up/down buttons. Questions under 70% correct are highlighted. 3a gets the mockup's "Avg. quiz score" card back (first attempts) in place of the D6 "Waiting for review" card (the waiting count stays in the review panel and the nav badge); "who needs a hand" rows link to the broker's profile, since reminders only cover onboarding steps. 3c shows the training panel under the Persona panel and adds an "Avg. quiz score" tile. 3b's Training column shows "—" until a broker is active. The brokers CSV gains chapters_passed, chapters_total and avg_quiz_score at the end.
- **G-assumed: training content is seeded once per chapter code (confirm with Aj).** `pnpm db:seed` and the production `release` step add any manual chapter whose code (`0`, `01`…`06`, `II`…`X`) is not in the database yet, with its lessons and questions. Existing chapters are never changed, so admin edits and broker progress survive every deploy; to reload a chapter from the manual, delete it in the admin first. Production adds Volume One as drafts; `pnpm db:seed` outside production and the e2e reset add it live. `pnpm db:seed -- --no-training` skips it.
- **G-assumed: lesson length follows the manual (confirm with Aj).** The manual's Volume One sections are short, so most lessons read in one to two minutes at 200 words a minute. The wording was kept rather than padded to reach 2 to 4 minutes; the read time shown to brokers is at least 2 minutes. Each chapter has 9 to 12 questions, so the default 8 per attempt still varies between retakes.
- **G-assumed: verify-before-publishing flags are admin notes (confirm with Aj).** The DBPR fee and bond lessons and questions carry an admin-only "Verify before publishing" note shown in the lesson and question editors. The Module 03 worked-examples lesson notes the disputed $500,000 co-broke figure (the old manual implied 2.5% a side); the lesson uses the standard 10% gross, 50/50 math and no question uses that example.
