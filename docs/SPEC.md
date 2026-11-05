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
| 0 | start_here | Start here | Start here: how the 365 portal works (Part 1, Aj walks you through the platform, then tick "I've watched the walkthrough") | confirm | no |
| 1 | ai_agent | Start here | Introducing your personal AI agent (Part 2, Aj's "Introducing Your Personal AI Agent" video, then tick "I've watched the AI agent video") | confirm | no |
| 2 | photo_id | Paperwork | Upload photo ID / driver's license | upload | yes |
| 3 | contract_nda | Paperwork | Review and sign your agreements (Broker Agreement + NDA, signed in the portal, D31) | upload (signing flow) | yes |
| 4 | bio | Paperwork | Write your professional bio | form (long text) | yes |
| 5 | headshot | Paperwork | Upload a professional headshot | upload (image) | yes |
| 6 | w9 | Paperwork | Upload your W-9 | upload | yes |
| 7 | license_situation | Florida license | Tell us your license situation (new / transfer / not licensed yet) | form (choice) | no |
| 8 | dbpr_filing | Florida license | File your DBPR application or license transfer (upload confirmation) | upload | yes |
| 9 | license_bond | Florida license | Upload your license & surety bond copy | upload | yes |
| 10 | email_signature | Your tools | Log in to your 365 Yachts email (shows the broker's own 365 email and the starting password, D32) | confirm | no |
| 11 | crm_login | Your tools | CRM sign in and training (Aj's video, transcript to read along, D32) | confirm | no |
| 12 | boatwizard_login | Your tools | Sign in to BoatWizard | confirm | no |
| 13 | yachtcloser_login | Your tools | Sign in to YachtCloser | confirm | no |

The old step 11 (`platform_logins`, "Log in to BoatWizard, YachtCloser and GoHighLevel") was retired in November 2026 and split into steps 11 to 13 (D32); its row is kept with `active = false` at position 111.

Step 11 (`commission_tier`, "Book your 1-on-1 to confirm your commission tier"; now at position 112, D32) was retired in October 2026: commission splits are now set when the broker is invited (D27). Its row is kept with `active = false`, so brokers who already had it keep their history, but no checklist, count or metric includes it.

Every step page uses the short layout from D28: videos first, "What to do" bullets, one-line callouts, and the manual's text behind "Read the full section". Step 9 carries a one-question knowledge check.

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
- `brokers`: id, user_id, level (`junior` | `senior`), status (`invited` | `onboarding` | `active` | `inactive`), joined_at, onboarded_at, left_at, commission_tier (text, nullable, legacy: no longer shown or edited, D27), in_house_split and self_generated_split (integers 0 to 100, nullable for brokers created before D27: the broker's share of in-house lead deals and of self-generated deals; the house keeps the rest), persona_md (text), persona_updated_at, persona_updated_by
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
- Admin: `GET /v1/admin/overview`, `GET /v1/admin/brokers` (filters: status, level, search), `POST /v1/admin/brokers` (create + invite; both commission splits required), `GET/PATCH /v1/admin/brokers/:id` (level, status, joined_at, left_at, in_house_split, self_generated_split), `PUT /v1/admin/brokers/:id/persona`, `GET /v1/admin/reviews`, `POST /v1/admin/broker-steps/:id/approve`, `POST /v1/admin/broker-steps/:id/send-back`, `POST /v1/admin/broker-steps/:id/mark-done`, `POST /v1/admin/brokers/:id/steps/:key/upload-url` and `.../upload-complete` (admin uploads on behalf), `GET /v1/admin/metrics` (from the view)
- `GET /health`
- Every request validated with Zod; OpenAPI served at `/docs` in non-production

## Admin overview numbers (3a)

Active brokers (with junior/senior split), onboarding right now, average days to onboard (last 10 onboarded), submissions waiting for review (list), onboarding in progress (progress bar + next step + "stuck" if no activity for 4+ days). Skip the training panel for now.

## Import existing brokers

`pnpm import:brokers` reads:

- `data/import/brokers.csv` with columns: name, email, phone, level, status, joined_at, onboarded_at, left_at, commission_tier, and optionally in_house_split and self_generated_split (whole percentages; a blank cell leaves the broker's current split alone)
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
- **D2. Admin override.** One extra transition, admin-only: any state -> `approved`, recorded with the admin as actor and an `audit_log` row. Used by "mark done" and by admin uploads on a broker's behalf. (Until D27, "mark done" on step 11 also saved the commission tier.)
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

- **D7. Admin accounts.** Any admin (or the owner) can invite another admin from the Admins tab (`/admin/admins`): `GET /v1/admin/admins` lists admins with whether each has created their login, `POST /v1/admin/admins` invites one by email and returns the invite link to copy, and `POST /v1/admin/admins/:id/resend-invite` emails a fresh link to an admin still pending. The `pnpm admin:invite` script does the same from the command line. Deleting a broker stays owner-only.
- **D8. Account tokens.** Invites and password resets share one token mechanism: an `account_tokens` table (id, user_id, purpose `invite` | `password_reset`, token_hash, expires_at, used_at, created_by, created_at) replaces `invites`. It has no broker_id: users and brokers are one-to-one, and admin invites (D7) have no broker row. Invites expire after 7 days, reset links after 24 hours; tokens are single-use and stored only as hashes. (Nov 2026, D33) A broker's invite link has no time limit; admin invites still expire after 7 days.
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
- **D23. Routes beyond the spec's list**, all needed by the screens or decisions: `GET /v1/invites/:token` (1a shows the name), `POST /v1/password-reset/request`, `GET`/`POST /v1/password-reset/:token` (D8), `POST /v1/me/welcome-seen` (1d once), `GET /v1/me/steps/:key/template-url`, `GET /v1/admin/broker-steps/:id` (3d detail and queue position), `POST /v1/admin/brokers/:id/resend-invite`, `.../reset-password`, `.../remind` (D16), `GET`/`POST /v1/admin/admins` and `POST /v1/admin/admins/:id/resend-invite` (D7), `PUT /v1/uploads/:token` (proxy uploads, D11). The full list is in the OpenAPI document at `/docs`.
- **D24. Emails** go to the broker when a step is approved or sent back, on invite, reset and reminder, and to the broker and every admin when onboarding completes. A failed email is logged and never fails the request.
- **D25. CSRF guard.** Besides SameSite cookies, state-changing `/v1` requests that carry an `Origin` header must come from `WEB_ORIGIN`.
- **D34. Step videos are MP4 uploads only (Nov 2026, Aj's request).** Every onboarding step video is an uploaded MP4, so the portal's own player always knows how much a broker has watched. Admin → Onboarding steps no longer offers "Use this link" (`PUT /v1/admin/step-videos/:id/embed` is removed), the broker's step page only plays uploaded MP4s, and the YouTube / Vimeo player-message tracking and Loom's "I've watched this video" button (`POST /v1/me/steps/:key/videos/:videoId/watched`) are removed. Step video views no longer carry `provider` or `embedUrl`, and `source` is `upload` or null. Migration 0022 empties any step video slot still holding a link (title and place kept, one `step.video_cleared` audit row each); none did in production. The `provider` and `embed_url` columns stay, so older migrations still run, but a slot holding a link counts as empty. A refreshed play link is asked for at most once a minute, so a video that can't play doesn't keep asking. Lesson videos in training keep their YouTube, Loom and Vimeo links.
- **D33. Existing brokers, permanent invite links, removing from the list and the AI roster sync (Nov 2026, Aj's request, branch `manage-brokers`).** **Add an existing broker** on Brokers (`POST /v1/admin/brokers/existing`): name, personal phone, optional 365 email (its Google and GoHighLevel accounts are queued to be linked, never created), optional sign-in email (defaults to the 365 email; with neither, the broker types their own at sign-in), optional CRM phone, level, joining date, optional splits, and **Onboarding done** (status `active`, onboarded date, every onboarding step approved with the note "Onboarded before the portal", one `step.approved` audit row each, only training left) or **Still onboarding** (status `invited`; without a 365 email their accounts are queued to be created as for an invite). No email is sent. **Invite links:** a broker's invite token is derived from its row id and `BETTER_AUTH_SECRET`, stored only as a hash and has no expiry (`account_tokens.expires_at` is nullable, migration 0021). The profile (`inviteUrl` on `GET /v1/admin/brokers/:id`) shows the same link until the broker has a password, making one on the first visit if they have none (`broker.invite_link_created`); an older random invite is left working and shown only once replaced. "Email the invite" (`resend-invite`) emails that same link; "Replace link" (`invite-link`) makes a new one and the old one stops working; setting a broker inactive ends it. Emails and the WhatsApp message no longer mention 7 days. **Remove** on each Brokers row (owner only) opens the same typed-name confirmation as "Delete this broker". **AI roster sync:** with `AI_ROSTER_SYNC_ENABLED=true`, `AI_ROSTER_API_URL` and `AI_ROSTER_API_SECRET`, inviting or adding a broker calls the 365 Yachts AI's `POST /api/brokers` (role `broker`, digits-only phone, the 365 or sign-in email) and deleting a broker calls `DELETE /api/brokers/:phone`; anything else, including unset, keeps it off. Outcomes are audited as `roster.added`, `roster.add_failed`, `roster.removed` or `roster.remove_failed` (the removal row keeps no name or phone); a failure never fails the portal request.
- **D32. Final onboarding steps (Nov 2026, Aj's request, branch `final-onboarding-steps`).** Onboarding is 14 steps.
  - **Step 10, "Log in to your 365 Yachts email"** (key stays `email_signature`, kind `confirm`, "I've logged in to my 365 Yachts email", no approval). The brand signature is no longer part of onboarding. The step keeps the H2 card: the broker's own 365 email (stored on `brokers.corporate_email` when Google created the account) and the shared starting password (`GOOGLE_STARTING_PASSWORD`, change-at-next-login), each with Copy, until the broker picks their own password; "Can't sign in? Get a new temporary password" stays the fallback (3 a day).
  - **The old platform logins step is retired** like `commission_tier`: `active = false`, history kept. Three `confirm` steps (no approval) replace it: 11 `crm_login` "CRM sign in and training", 12 `boatwizard_login` "Sign in to BoatWizard", 13 `yachtcloser_login` "Sign in to YachtCloser". Each has one video slot; the old step's GoHighLevel, BoatWizard and YachtCloser slots move to them with any video already in them (the GoHighLevel slot is renamed "CRM sign in and training").
  - **Read along.** A step's config can rename its full-text panel (`fullTextLabel`, `fullTextSource`). Step 11 uses "Read along with the video" and "Transcript": its full text is Aj's CRM video transcript, lightly cleaned and split under headings in video order, with a short summary first (`packages/db/src/seed/crm-training.ts`). Its bullets and a HOUSE RULE callout (update the Broker outcome buttons after every contact) come from the same video.
  - **Required video.** `config.requireVideo` (step 11 only) means the step can't be finished until the broker has watched its video. `step_video_progress` (broker, step video, watched_seconds, watched_at) records it, like lesson progress: the uploaded MP4 reports the furthest second watched every 10 seconds (skipping ahead doesn't count) and counts as watched at 90% of the length saved at upload. (Nov 2026, D34) Step videos are MP4 uploads only, so the YouTube / Vimeo player tracking and Loom's "I've watched this video" button are gone. Until then the confirm box is locked with "Watch the whole video above first", and `POST /v1/me/steps/:key/submit` answers 409 `video_not_watched` (or `video_not_ready` while the slot is empty). Upload the MP4 right after deploying, or brokers wait at step 11 (they can still do 12 and 13; an admin can mark it done).
  - **Existing data.** Retired steps move to positions above 100 so 11 to 13 are free. Every broker gets todo rows for the three new steps; their status doesn't change. Step 10's copy changes only where it still has the seeded wording. Migration 0019 applies all of this.
- **D31. Contract signing on step 2 (phase H3, Oct 2026).** Every broker signs both the Broker Independent Contractor & Commission Agreement and the Mutual Non-Disclosure & Non-Compete Agreement in one flow; both are filled from the broker's record and countersigned with Shelly's stored, authorized signature.
  - **Templates.** `contract_templates` (key, version, PDF bytes, SHA-256, field map, font, font file, active), loaded from `docs/templates/contracts` by `pnpm db:seed` and the deploy (or from `CONTRACT_TEMPLATES_DIR`); a changed PDF or field map becomes a new active version, older versions stay so every document keeps the exact template it was made from. Filling uses pdf-lib + fontkit at the field map's coordinates (top-left origin, y = 792 − baseline), shrinking text to fit and centring the split percentages in their 40pt column; the agreement uses Carlito (#1B2233), embedded whole because pdf-lib's subsetting drops its glyphs; the NDA uses Helvetica. Characters a font can't draw become "?".
  - **Values.** Agreement: full name (also printed name), effective and broker sign date = the signing date (MM/DD/YYYY, America/New_York), the current in-house and self-generated % and the house's 100 − each, phone (US numbers as (561) 555-0123), email (the login email until phase H2 adds a corporate one), mailing address and Florida license number (optional), both entered at signing and saved on `brokers`. NDA: name (twice) and sign date. Shelly's printed name and title are already on both templates.
  - **Company signature.** `COMPANY_SIGNER_EMAIL` names the owner or admin who signs (Shelly). On "Your profile & signature" (/admin/account) she draws or uploads a PNG and must tick "I authorize 365 Yachts Inc. to apply this signature on my behalf to Broker Agreements and NDAs generated by this platform."; the image is stored privately and `company_signatures` keeps its SHA-256, the authorization text, time, IP and user agent. Replacing keeps the old row (revoked); auto-signing can be switched off. The overview shows a banner while it isn't set up.
  - **Broker flow.** Step 2 shows "Broker Agreement" and "NDA" cards with live pdf.js previews (zoomable, rebuilt as the broker types their address), a short form (mailing address, license no., confirm phone and email), the consent "I agree to sign electronically and that my electronic signature is legally binding.", and one signature pad (draw, or type in Dancing Script) applied to both. Signing is refused until both documents were opened (the preview records the first view), the split is set, a phone exists and both documents are still pending.
  - **Signing.** For each document the unsigned and broker-signed PDFs, and the signature image, are stored privately with their SHA-256 (`contract_documents`); step 2 is submitted. When auto-signing is on, Shelly's signature and today's date are stamped into the company fields straight away, a signature certificate page is appended (document and template version; broker name, email, signed-at in UTC and Eastern, IP, user agent, signature method and consent text; "Signed for 365 Yachts Inc. by Shelly Melcher, applied automatically under authorization dated …" or the manual countersign details; SHA-256 of the unsigned PDF and of the signed pages before the certificate), the final PDFs are stored and attached to step 2 as its files, and step 2 is approved by her automatically (activating the broker if it was the last step). Otherwise step 2 shows "Waiting for countersignature" in the review queue and Shelly countersigns both from the broker's profile with one click (drawing a signature there if hers isn't set up); only she can countersign, and the generic Approve is refused. The final hash of each file is kept in the database (it can't be printed inside the file it describes).
  - **Emails and downloads.** The broker gets both final PDFs as attachments (or a "waiting for countersignature" email; Shelly, or every admin if no signer is set, gets a countersign request). Every version can be downloaded through 5-minute links: by the broker on step 2, by admins on the profile (audited).
  - **Changes.** A commission change, or a name or phone change through the importer, voids documents that aren't countersigned yet (kept, marked voided with the reason), resets step 2 to "to do" if the broker had signed, and emails them to sign again; sending step 2 back does the same but keeps the "needs a fix" note. After both sides signed, changing a split shows "Section 1.7: split changes need a signed addendum." (addenda aren't built). "Void and re-issue" on the profile voids even fully signed documents and resets step 2.
  - **Signed outside the portal.** An admin uploads an already-signed copy of either document on the profile, with the date it was signed; it is stored as a step 2 file and a `signed_outside` document. When both documents are covered, step 2 is approved.
  - **Audit.** `contract.viewed`, `contract.signed`, `contract.company_signed`, `contract.voided`, `contract.signed_outside`, `contract.downloaded`, `company_signature.set` / `.replaced` / `.auto_sign_on` / `.auto_sign_off`, `step.reset`.
  - **Migrations** 0010 (new tables, enums, two nullable broker columns) and 0011 (guarded copy updates: step 2's title, copy and bullets, and lesson 2's bonus line "Bonuses and incentives open 90 days after your contract is signed, once you've closed at least two deals." per contract section 2.8, each only if the row still has the earlier wording).
- **D30. Step 0 · Start here (Oct 2026, Aj's request).** A new first onboarding stage, "Start here" (stage 0; Paperwork stays 1), with one step: `start_here`, position 0, kind `confirm` ("I've watched the walkthrough"), no approval needed. It has five short bullets, no manual text, and one video slot, "How to use the 365 portal", for Shelly's screen-share walkthrough (fill it in Admin → Onboarding steps). Onboarding is now 11 steps and step 0 is everyone's first next step. Existing brokers get a todo row for it when the seed or deploy runs (any active step a broker is missing is added), so active brokers show 10 of 11 until they tick it; their status doesn't change. Migration 0009 adds the `start_here` value to the `step_stage` enum. (Nov 2026) Aj presents step 0, not Shelly: the slot is renamed "Part 1: Aj walks you through the platform" and a second slot, "Part 2: Introducing Your Personal AI Agent", is added; the copy mentions both. Migration 0017 applies this to existing databases, leaving admin edits alone. (Nov 2026, later the same day) Part 2 becomes its own step: step 1 `ai_agent`, "Introducing your personal AI agent" (stage Start here, kind `confirm`, "I've watched the AI agent video", no approval), with the Part 2 video slot moved to it; step 0 goes back to the one walkthrough video. Every later step moves up one number (Photo ID is step 2, the agreements step 3, licensing steps 7 to 9, 365 email step 10, platform logins step 11), so onboarding is 12 steps. Step copy that names step numbers is renumbered (licensing guides, the signed-agreements email). Existing brokers get a todo row for the new step; their status doesn't change. Migration 0018 applies this to existing databases (positions shift, the Part 2 slot moves with any video already in it), leaving admin-edited copy alone. Step 1 also shows a "Start chat with AI agent" button: it opens WhatsApp to the 365 Yachts AI (19547381542, not overridden by SUPPORT_*) with "Hey 365 Yachts AI, it's [broker name]. I'm new here and doing my onboarding." ready to send. In Admin → Onboarding steps, "Edit titles" on each step edits its title, sub-header (intro), short title and summary; saving writes `step.copy_updated` to `audit_log`.
- **D29. Commission structure with history (phase H1, Oct 2026, Aj's request).** Builds on D27; step 11 stays retired.
  - **Splits.** Every broker has the same two splits, in-house leads % and self-generated deals %, stored as the broker's whole percentage (0 to 100); the house share is always 100 minus it and is never entered. The admin picks each from the manual's tiers (in-house 30, 40, 50; self-generated 30, 40, 50, 60, 70, 80) or "Custom %".
  - **History.** `commission_history` (broker, in_house_pct, self_generated_pct, effective_from, changed_by, note, created_at). The current split is the latest row by `effective_from`, then `created_at`. "Change commission" on the profile adds a row (start date today or earlier, never in the future or before the broker joined; optional note) and writes `audit_log` (`broker.commission_changed`). The profile shows the history, newest first. Migration 0008 gives every existing broker a first row from the D27 columns, with any old `commission_tier` text as the note ("Previous commission tier: …"), dated from when they joined. The D27 columns and `commission_tier` stay in the database, unused.
  - **Where it shows.** Profile (3c), two columns on the brokers table (3b), the CSV export (`in_house_split_pct`, `self_generated_split_pct`), the metrics feed, `broker_metrics` (`in_house_pct`, `self_generated_pct` added at the end of the view), the broker's welcome screen, and the import CSV (optional `in_house_split`, `self_generated_split`; a changed split adds a history row noted "Imported"; an old `commission_tier` becomes the first row's note).
  - **Invite.** Full name, personal phone in E.164 (required, stored as `+15615550123`), email (optional until phase H2 generates a corporate one), level, both splits (required); the joining date defaults to today. Without an email the account gets a placeholder on the reserved `invite.invalid` domain (sign-in needs an email): it is never emailed or shown, the dialog shows the invite link with a Copy button, the profile can make a fresh link at any time ("Make a new invite link", `POST /v1/admin/brokers/:id/invite-link`, the old link stops working), "Resend invite" by email is refused (`no_email`), and the broker enters their own email on the invite page, which becomes their sign-in email (refused if already in use).
- **D28. Onboarding steps carry the manual; training is the real training (Oct 2026, Aj's decision).** Volume One's onboarding material (Part 0, Modules 01, 02 and 06 week one) is no longer taught as training chapters; it lives where the broker does the work:
  - **Short layout everywhere.** Every onboarding step and every lesson shows, in order: its videos (for a step, an uploaded MP4 only, D34; for a lesson, an uploaded MP4 or a YouTube / Loom / Vimeo embed; empty slots show as a slim "On its way" row), a "What to do" card with 3 to 5 plain bullets (about 60 words at most), the NEVER / WATCH / HOUSE RULE callouts as one-line boxes (consecutive callouts of the same kind share one box), and the manual's original text in a collapsed "Read the full section" panel. Every NEVER and WATCH from those modules is kept. Bond and fee figures appear only in the full text, next to the manual's WATCH that they change, because steps go live without a draft stage.
  - **Data (additive).** `onboarding_steps` gains nullable `todo_items`, `callouts`, `full_text_md`; `lessons` gains nullable `todo_items`, `callouts` (its `body_md` is the full section). New tables: `step_videos` (titled slots per step; `source` null = empty), `step_questions` and `step_question_options`. Migration 0006.
  - **Seeding.** `pnpm db:seed` and the production release fill a step's guidance, video slots and knowledge check only while the step has no bullets, so admin edits are never overwritten. Slots seeded: step 10 (GoHighLevel CRM, BoatWizard, YachtCloser walkthroughs) and step 7 (DBPR application).
  - **Knowledge check.** An admin can attach up to 3 multiple-choice questions to any step. Brokers check one answer at a time (`POST /v1/me/steps/:key/check` returns right or wrong and the explanation; retries allowed), and `submit` is refused with `check_not_passed` unless every answer sent with it is correct. Correct answers never appear in broker responses. Seeded: step 8, "Where must a client's deposit go?" → "The brokerage escrow account, by wire".
  - **Admin editing.** New "Onboarding steps" screen (`/admin/steps/:key`): edit bullets, callouts and full text (with preview), add / rename / remove video slots, set an embed link or upload an MP4 (up to 1 GB, multipart, like lesson videos), and manage the knowledge check. The lesson editor gains the same bullets and callouts fields. Every change writes `audit_log` (`entity_type = onboarding_step` for steps).
  - **Training.** Volume One training is one chapter, **"I · How you get paid & measured"** (Modules 03, 04 and 05 in five lessons, 22 questions, 80% pass mark, the disputed co-broke example kept out of the questions). It is the first chapter that unlocks once a broker is active. The Part 0, 01, 02, 03, 04, 05 and 06 chapters are removed from the seed; Volume Two parts stay "coming soon".
  - **Welcome.** Part 0 becomes a short welcome on the onboarding-complete screen (1d): the 365 Standard as five bullets, the five NEVERs, the "call, don't guess" HOUSE RULE, and Part 0's text behind "Read the full section".
  - **Production clean-up (on deploy).** Databases seeded before D28 still hold the old chapters (codes `0`, `01` to `06`) as drafts. The release step deletes each one only if it is still a draft, was never published, and no broker has lesson progress or quiz attempts on it; every deletion writes an `audit_log` row (`chapter.retired_draft_deleted`, no actor) and the deploy log lists what was deleted. Anything that fails those checks is left for an admin to handle. `pnpm db:seed` never deletes.
  - **Captions.** Step videos, like lesson videos, have no caption track yet (see "no video captions yet").
- **D27. Two commission splits, set at invite (Oct 2026, Aj's request).** The single free-text commission tier is replaced by two splits, each the broker's share as a whole percentage (house = 100 minus it): **In-house leads** (deals from 365-assigned leads) and **Self-generated deals**. Both are required in the invite dialog and can be changed on the broker's profile (3c); every change writes `audit_log`. The broker sees their own two percentages on the welcome screen (1d). Step 11 is retired by migration 0005 (marked inactive, never deleted), so onboarding is 10 steps and approving the last of them activates the broker. Existing data was not migrated: brokers created before this have empty splits until an admin sets them, and the old `commission_tier` text stays in the database unused.
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

### Phase H2: Account provisioning (decided while working unattended, Oct 18, 2026; confirm with Aj)

When an admin adds a broker, the api creates their Google Workspace email and GoHighLevel user through tracked tasks (`provisioning_tasks`) run by a worker loop inside the api. Brokers gain `corporate_email`, `crm_phone`, `google_user_id` and `ghl_user_id` (migration 0012); `broker_metrics` gains `crm_phone` at the end (0013). What the GHL v2 docs say is recorded in docs/DEPLOY.md section 8.

- **H2-assumed: GHL token is an agency Private Integration token (confirm with Aj).** The docs accept agency or sub-account tokens for create, update and delete, but `filter-by-email` (the lookup before creating) is agency-only. Scopes: `users.readonly`, `users.write`, `locations.readonly`.
- **H2-assumed: GHL "deactivate" is delete (confirm with Aj).** The GHL v2 API has no suspend or deactivate endpoint, only `DELETE /users/{id}` (queued, takes effect within minutes). Offboarding deletes the GHL user; reactivating looks the email up and creates a new GHL user if none exists, storing the new id.
- **H2-assumed: GHL password (confirm with Aj).** GHL requires a password at creation and the docs don't say whether GHL sends a welcome email. The portal sends a random one, never stored or shown. Brokers use GHL's "Forgot password" with their 365 email the first time (step 10).
- **H2-assumed: idempotency (confirm with Aj).** Every create looks the user up by email first. The chosen address is saved on the broker before Google is asked to create it, and the Google user carries the broker id (`externalIds`, custom type `broker_portal_id`), so a retry after a crash finds and links its own user instead of making another.
- **H2-decided: address rules (Aj, Oct 18, 2026).** `firstname@GOOGLE_DOMAIN`; when that is taken, `firstname.lastname@` (first and last word of the full name, middle names dropped); after that `firstname.lastname2@`, `3`, … up to 20 tries. Lowercased, accents removed (ß→ss, ø→o, æ→ae and similar), everything but a–z and 0–9 dropped. A one-word name goes `name@`, `name2@`, …; an address already used by another portal user or broker is skipped too. A name with no Latin letters needs the corporate email typed in. Google and GHL get the first word as first name and the rest as last name (the first name again for one-word names, as both require a last name).
- **H2-assumed: corporate email typed by hand (confirm with Aj).** It must be on `GOOGLE_DOMAIN` (when Google is configured), unused by anyone else, and can't change once a Google account is linked. A create task uses it exactly (no `2`, `3`); if another Workspace account already has it, the task fails with "use Link existing account".
- **H2-assumed: login email (confirm with Aj).** When the Google account is created or linked, the corporate email becomes the broker's portal login (unless another portal user already has it; audited as `user.login_email_changed`). Their password and sessions are unchanged. An invite still goes to the personal email when one was given. Agreements not yet signed use the corporate email as `broker_email`.
- **H2-assumed: invite dialog (confirm with Aj).** The API now always returns the invite link (plus the personal phone), and the dialog always shows it with Copy and "Send via WhatsApp" (`wa.me/<personal phone>` with "Hi {first name}, welcome to 365 Yachts! Create your broker portal account here: {link}"; Nov 2026, D33: the "(the link works for 7 days)" ending was dropped). With an email, the link is also emailed as before. "Make a new invite link" on the profile has the same WhatsApp button.
- **H2-assumed: retries (confirm with Aj).** Network errors, 408, 429 and 5xx retry after 30 s, 1 min, 2 min, 4 min (max 5 attempts, cap 1 hour). Anything else (bad credentials, missing delegation or scope, refused input) fails at once with the reason in plain words. A GHL task waits, without using an attempt, while the broker's Google create is still open. Tasks stuck "running" for 10 minutes (a crashed process) go back to pending. The worker polls every 5 seconds and wakes at once after an admin action; `PROVISIONING_WORKER=off` stops it. `PROVISIONING_MODE=dry-run` swaps in stand-in clients that log what they would send and return `dry-run-` ids, so onboarding can be tried without creating Workspace or GHL users (docs/DEPLOY.md section 9).
- **H2-assumed: not configured (confirm with Aj).** No task is queued for a system that isn't configured, so brokers added before the variables are set get nothing automatically. Once configured, their Accounts panel shows "Not set up" with a **Set up** button (or use Link for existing accounts). Statuses are the five asked for plus "Not set up".
- **H2-assumed: offboarding (confirm with Aj).** Setting a broker inactive cancels their open create, link and unsuspend tasks and queues suspend only for systems where they have an account; the confirmation adds "This will suspend their Google account and deactivate their GHL user." Reactivating cancels pending suspends, asks for confirmation, and queues unsuspend. Google accounts are only ever suspended, never deleted (`provision:verify` deletes only its own test user).
- **H2-assumed: password reveal (confirm with Aj).** Step 9 asks for confirmation first, because a reveal replaces any earlier temporary password. The limit is 3 per Florida calendar day, counted from `audit_log` (`google.password_revealed`, no password). Responses are `Cache-Control: no-store`. The card shows the corporate email only once the Google account exists and is active; otherwise "Your 365 email is being set up. {support name} will send your login details."
- **H2-decided: starting Google password and "How to log in" (Aj, Oct 21, 2026).** When `GOOGLE_STARTING_PASSWORD` is set (at least 8 characters), every new Workspace account gets it as its first password (still change-at-next-login); without it the account gets a random one as before. The create's audit row says `startingPassword: true`, never the password. `GET /v1/me/accounts` returns `startingPassword` while the account was created with it, the broker hasn't used a reset since, and Google still has `changePasswordAtNextLogin` set (checked live; shown if Google can't be reached; linked accounts get null). Once the broker picks their own password in Gmail, it disappears from step 9. The step 9 card shows a numbered "How to log in to Gmail" list: Open Gmail, the 365 email with Copy, the password with Copy, and "Google asks you to pick a new password". The reveal button becomes "Can't sign in? Get a new temporary password" (same 3-a-day limit).
- **H2-assumed: import --link (confirm with Aj).** `brokers.csv` accepts optional `corporate_email` and `crm_phone` (E.164) columns; with `GOOGLE_DOMAIN` set, an `email` on that domain counts as the corporate one. Existing brokers are matched by login or corporate email, so re-importing after their login changed doesn't duplicate them. `--link` queues link tasks that the api's worker runs, so the script itself needs no Google or GHL credentials.
- **H2-assumed: where the new fields show (confirm with Aj).** 3b gains "CRM phone" and "Accounts" columns (G and GHL marks with a symbol, tooltip and screen-reader text). The CSV export adds `corporate_email` and `crm_phone` at the end. The Accounts panel sits at the top of the profile's right column, and the Integrations panel at the bottom of the overview.
- **H2-decided: the invite page shows the phone and 365 email read-only (Aj, Oct 18, 2026).** The admin enters the broker's personal phone when inviting; the invite page (1a) shows it grayed out and not editable, and accepting keeps it. Once Google Workspace has created the broker's 365 email, the email field shows it grayed out and not editable, and it is the sign-in email. `GET /v1/invites/:token` returns `phone`, `hasPhone` and `corporateEmail`; `phone` in the accept body is optional (still validated when sent). Invites without a phone on file (for example imported brokers) still ask for it.
- **Decided: deleting a broker permanently (Aj, Oct 18, 2026).** `DELETE /v1/admin/brokers/:id` (owner only, body `{ confirmName }` that must match the broker's full name, ignoring case and extra spaces). In one transaction it removes the broker's user, sessions, password, invite and reset links, broker row, steps, file records, agreements, commission history, persona, training progress and quiz answers, provisioning tasks, and every audit_log row about them (the broker, the user, their steps, files, agreements and quiz attempts). One `broker.deleted` audit row remains with the deleting owner and counts only, no personal details. Then everything under `brokers/{brokerId}/` in the bucket is deleted; if that fails, the records stay deleted and the response says so. Google Workspace and GoHighLevel accounts are not touched. On the profile (3c) the owner sees "Delete this broker" at the bottom; the dialog lists what is removed and enables "Delete permanently" only once the full name is typed. Setting a broker to Inactive is still the normal way to offboard someone.
