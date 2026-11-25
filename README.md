# 365 Yachts Broker Portal

Broker onboarding and team management for 365 Yachts. New brokers work through an 11-step onboarding checklist on their phone; admins review submissions, track every broker, and keep a persona per broker for lead matching.

- What was built and why: [docs/SPEC.md](docs/SPEC.md) (see its "Decisions" section)
- Build log: [docs/PLAN.md](docs/PLAN.md)
- Deploying to Railway: [docs/DEPLOY.md](docs/DEPLOY.md)
- Long-term design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Rules for Claude Code: [CLAUDE.md](CLAUDE.md)

## What's in the repo

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js app: broker screens under `/app`, admin screens under `/admin`, sign-in pages. Port 3000. |
| `apps/api` | Fastify API on port 4000. The web app forwards `/v1/*` and `/api/auth/*` to it. OpenAPI docs at `/docs`. |
| `packages/db` | Drizzle schema, migrations, the `broker_metrics` view, seed and import scripts |
| `packages/shared` | Code used by web and API: request/response schemas, onboarding rules, storage client, helpers |
| `packages/eslint-config` | Lint setup, including the rules that enforce the file-header comment rule |
| `docker-compose.yml` | Local Postgres 16 and SeaweedFS (S3-compatible file storage) |

## Setup (first time)

You need Node 24, pnpm and Docker Desktop (see `START_HERE.md` for installing them).

```bash
pnpm install
cp .env.example .env          # local settings; the defaults work with docker compose
docker compose up -d          # starts Postgres and file storage, creates the bucket
pnpm db:migrate               # creates the tables
pnpm db:seed                  # onboarding steps, the owner account and three sample brokers
pnpm storage:cors             # lets the browser upload straight to local file storage
pnpm --filter @bp/web exec playwright install chromium   # once, for end-to-end tests
```

Then start everything:

```bash
pnpm dev
```

- Web app: http://localhost:3000
- API health: http://localhost:4000/health, API docs: http://localhost:4000/docs
- Emails are printed in the API's output unless `RESEND_API_KEY` is set.

### Sample logins after `pnpm db:seed`

| Who | Email | Password |
| --- | --- | --- |
| Owner (admin screens) | `SEED_OWNER_EMAIL` from `.env` | `SEED_OWNER_PASSWORD` from `.env` |
| Daniel Reyes, mid-onboarding (one step sent back) | `daniel.reyes@example.com` | `SEED_SAMPLE_PASSWORD` (default `sample-broker-pass`) |
| Kevin Osei, active, has a persona | `kevin.osei@example.com` | same |
| Marisol Vega, invited | use the invite link the seed prints | chosen when accepting |

To start again from a clean slate: `docker compose down -v`, then `docker compose up -d`, `pnpm db:migrate`, `pnpm db:seed` and `pnpm storage:cors`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs web and API with live reload (needs `docker compose up -d`) |
| `pnpm test` | Unit and integration tests for every package (integration tests start their own Postgres and SeaweedFS containers) |
| `pnpm test:e2e` | Playwright journeys at desktop and 390px width, on an isolated `broker_portal_e2e` database (ports 3100/4100, so `pnpm dev` can keep running) |
| `pnpm lint` / `pnpm typecheck` | Code checks; lint fails on missing or outdated file headers and on inline comments |
| `pnpm build` | Production build of web and API |
| `pnpm db:generate` | Creates a migration after a schema change |
| `pnpm db:migrate` | Applies migrations |
| `pnpm db:seed` | Seeds onboarding steps, owner and sample brokers (`--refresh-steps` rewrites step copy, `--no-samples` skips brokers, `--match-samples` adds the six lead-matching sample brokers) |
| `pnpm db:studio` | Opens Drizzle Studio to browse the database |
| `pnpm db:metrics-user` | Creates the read-only login other tools use to read `broker_metrics` |
| `pnpm import:brokers -- --dry-run` | Previews importing existing brokers from `data/import/` |
| `pnpm admin:invite -- --name "…" --email …` | Creates an admin account and prints the invite link |
| `pnpm storage:cors` | Allows the web app to upload straight to the bucket (once per bucket) |
| `pnpm match:backfill` | Extracts persona tags with Claude for every broker whose persona changed (`-- --force` redoes all) |
| `pnpm match:sample-leads` | Sends three sample leads to a running API's `/api/match` and prints the results |

## Adding brokers from the admin panel

On **Brokers** (`/admin/brokers`):

- **Invite a new broker** is for someone starting from zero. They get an invite email (when you give an email), their Google and GoHighLevel accounts are created, and they work through every onboarding step.
- **Add an existing broker** is for someone who already works with 365 Yachts. Enter their name, phone, 365 email (their existing Google and GoHighLevel accounts are looked up by it, nothing new is created), level, joining date and, optionally, their splits. Choose **Onboarding done** to mark every onboarding step approved so only training is left, or **Still onboarding**. No email is sent; you get their sign-in link to share.
- **Sign-in link:** until a broker creates their password, their profile shows their sign-in link with **Copy link** and **Send via WhatsApp**. It is the same link every time and has no time limit. It stops working once they use it, when you click **Replace link**, or when you set them to Inactive. **Email the invite** emails that same link. Admin invite links still expire after 7 days.
- **Remove** (owner only, on each row) deletes a broker and everything stored about them for good, after you type their name. If someone only left, set them to Inactive on their profile instead.

## Onboarding step videos

Step videos are set in **Admin → Onboarding steps** and are MP4 uploads only (up to 1 GB, sent straight to the bucket). Uploads give the portal the video's real length, so on a step that needs its video watched (step 11, CRM training) the broker has to play 90% of it before the step unlocks; skipping ahead doesn't count. Training lessons can still use a YouTube, Loom or Vimeo link.

Three steps teach a tool from a training video and carry a written version under **Read along with the video**: step 11 (CRM training, the transcript), step 12 (BoatWizard Mastery, the video's steps written out: list it, find it, price it) and step 13 (YachtCloser: the listing agreement, a co-broker deal through a counter offer, then survey to close). Upload the MP4s to the "BoatWizard walkthrough" and "YachtCloser walkthrough" slots; steps 12 and 13 don't require watching them. The bullets, callouts and read-along text can be edited in **Admin → Onboarding steps**; the panel's name, the minutes and the confirm box wording are set in code.

## Importing your current brokers

1. Create `data/import/` (it is gitignored and never leaves your machine).
2. Copy `docs/templates/brokers-import-example.csv` to `data/import/brokers.csv` and fill one row per broker. Columns: `name, email, phone, level (junior/senior), status (invited/onboarding/active/inactive), joined_at, onboarded_at, left_at, commission_tier`, plus the optional `in_house_split`, `self_generated_split`, `corporate_email` and `crm_phone`. Dates as `2026-03-11` or `3/11/2026`.
3. Optional personas: `data/import/personas/<email>.md`, following `docs/templates/persona-template.md`.
4. Optional paperwork: `data/import/files/<email>/<step key>.pdf` (or `.jpg` / `.png`), for example `w9.pdf`, `photo_id.jpg`, `contract_nda-page2.pdf`. Step keys: `photo_id`, `contract_nda`, `headshot`, `w9`, `dbpr_filing`, `license_bond`.
5. Run `pnpm import:brokers -- --dry-run`. It checks every row and file first and imports nothing if anything is wrong, with line numbers. Then run `pnpm import:brokers`. Add `--link` to look up each broker's Google and GoHighLevel accounts by their `corporate_email`, and `--dir <folder>` to read the files from somewhere other than `data/import/`.

The import matches brokers by email, never deletes anyone, and is safe to run again. Active brokers get every step marked approved with the note "imported" and never see the "welcome aboard" screen. Imported brokers have no password yet: open each profile in `/admin` and send them the sign-in link shown there.

To import into production, see "Run once" in [docs/DEPLOY.md](docs/DEPLOY.md).

## 365 Yachts AI roster sync

The portal can keep the 365 Yachts AI's roster (the people the WhatsApp bot recognises) in step: a broker you invite or add is added to the roster, and a broker you delete is deactivated there. The bot texts new roster entries a welcome message, so this is **off** unless the api has `AI_ROSTER_SYNC_ENABLED=true`, together with `AI_ROSTER_API_URL` (the bot's address) and `AI_ROSTER_API_SECRET` (the bot's `ROSTER_API_SECRET`). Leave it off while making test accounts. A roster failure never blocks the portal; it is recorded in the activity log as `roster.add_failed` or `roster.remove_failed`. Setting a broker to Inactive and the command-line import do not change the roster.

## Lead-to-broker matching

The 365 Yachts AI (the `365-whatsapp-bot` service) asks the portal which brokers should get a lead, so leadership and the setter can text it "match John Smith". Buyers close far better with a broker who shares their background, so background fit carries the most weight.

**How a match works.** Each broker's persona (the admin-only Persona panel) is turned into structured tags by Claude: background (veteran with branch, pilot, first responder and so on), story hooks, boat types, price bands, buyer types they click with, clients to avoid, languages, follow-up style, reply speed, channels, the most new leads a week, and topics never to mention to leads. Anything the persona doesn't say stays empty; nothing is guessed. Tags are re-extracted in the background whenever a persona is saved with different text, and admins can override any field in the **Matching tags** panel under the persona (overrides always win). For each lead the portal:

1. drops brokers who aren't active, don't speak the lead's language, don't cover the lead's price band or boat type, or already had their weekly cap of leads in the last 7 days;
2. scores the rest 0–100: **fit 45%** (background match judged by one Claude call across the candidates, falling back to tag overlap, plus buyer type, boat type and price expertise), **performance 35%** (broker health) and **availability 20%** (picks in the last 14 days against twice the weekly cap); a factor with no data is left out and the others are reweighted, never filled with a made-up score;
3. adjusts for follow-up: Buy Now, Active and hot leads favour brokers who follow up hard (up to ±10 points, using the health follow-up score once health is live); Nurture leads don't penalise light-touch brokers;
4. returns the top brokers with one or two short reasons, which never contain anything from the broker's do-not-mention list.

Weights live in the `match_weights` table and change without a redeploy (`PUT /v1/admin/match/weights`). Every match, with the full per-factor detail, the excluded brokers and the pick, is kept in `match_log`.

**Endpoints** (the bot's contract; key in `Authorization: Bearer <MATCH_API_KEY>` or `X-API-Key`):

- `POST /api/match` with `contactId`, `name` and optionally `budget`, `boat_type`, `location`, `language`, `priority` (Buy Now, Active, Nurture, Low Priority, On Hold), `hot`, `lead_background`, `notes`, `topN` (default 4). Returns `{ matchId, brokers: [{ id, name, score, breakdown: { fit, performance, availability }, reasons, flags, ghlUserId? }] }`. A factor is `null` when it had no data; `flags` only ever holds `health_not_live` and `no_persona` (every other flag, such as `no_capacity_set`, `fit_from_tag_overlap` or `language_unconfirmed`, is kept in `match_log` only). `ghlUserId` is left out while a broker's GoHighLevel id is a `dry-run` placeholder.
- `POST /api/match/:matchId/choice` with `{ brokerId, pickedBy, timestamp, brokerName, ghlUserId }`. An off-list pick sends `brokerId: null` and `offList: true` and is linked through `brokers.ghl_user_id`; "none" sends `brokerId: null` and no `ghlUserId`. A well-formed choice is always recorded.
- Admin: `GET`/`PATCH /v1/admin/brokers/:id/persona-tags`, `POST /v1/admin/brokers/:id/persona-tags/refresh`, `POST /v1/admin/persona-tags/backfill`, `GET`/`PUT /v1/admin/match/weights`.

**Settings** (api service):

| Variable | Meaning |
| --- | --- |
| `MATCH_API_KEY` | The key the bot sends (the bot's `PORTAL_API_KEY`). Unset turns `/api/match` off (503). At least 24 characters. |
| `ANTHROPIC_API_KEY` | Turns on persona-tag extraction and Claude's fit judgement. Without it, tags can only be set by hand and fit uses tag overlap. |
| `MATCH_MODEL` | Claude model for both calls (default `claude-opus-5-5`). |
| `HEALTH_SOURCE` | `none` (default): no health, performance is left out and every broker is flagged `health_not_live`. `mock`: fake scores that stay the same per broker, for local testing (refused in production). `coach`: reads coach-api's latest weekly snapshot (`coach.weekly_snapshot`). |
| `COACH_DATABASE_URL` | The connection string for coach-api's `coach_portal` role. The API opens ONE connection from it, shared by lead-matching health (only queried with `HEALTH_SOURCE=coach`) and the Coaching section (Admin → Coaching). Without it every broker's health is null and Coaching answers 503. |
| `COACHING_BROKER_VIEW` | `true` shows brokers their own coaching page (`GET /v1/me/coaching`); keep `false` during the shadow period. |

**Coach health:** `apps/api/src/services/match/health.ts` reads coach-api's `coach.weekly_snapshot` (coach-api migrations `1764110000000_engine.sql` and `1764130000000_portal-access.sql`). Only the newest `week_start` counts. `broker_id` is the portal's own broker id (coach-api maps GoHighLevel users to brokers by email in `coach.broker_ghl_users`). The health score is `score`, and the follow-up score is the on-time touches share (`metrics -> 'on_time_touches' ->> 'value'`) times 100. To switch it on, set `COACH_DATABASE_URL` to the `coach_portal` connection string and `HEALTH_SOURCE=coach` on the api service and redeploy. If the query fails or a broker has no snapshot row, that broker's health is null and the match still runs. The portal never creates or writes coach-api's tables. Also replace the availability count with real GoHighLevel lead counts when that API is wired in (TODO in `services/match/engine.ts`).

**Trying it locally:** `pnpm db:seed -- --match-samples` adds six sample brokers (Navy veteran, airline pilot, Spanish speaker, light-touch sailor, a firefighter who waits for leads, and one with an empty persona) with their tags already filled in, so no Claude key is needed. Set `MATCH_API_KEY` (and optionally `HEALTH_SOURCE=mock`), run `pnpm dev`, then `pnpm match:sample-leads`.

## Deploying

Follow [docs/DEPLOY.md](docs/DEPLOY.md). It lists the exact Railway settings and variables for the `web` and `api` services. There are deliberately no `railway.json` files.
