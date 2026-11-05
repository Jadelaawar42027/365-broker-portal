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
| `pnpm db:seed` | Seeds onboarding steps, owner and sample brokers (`--refresh-steps` rewrites step copy, `--no-samples` skips brokers) |
| `pnpm db:studio` | Opens Drizzle Studio to browse the database |
| `pnpm db:metrics-user` | Creates the read-only login other tools use to read `broker_metrics` |
| `pnpm import:brokers -- --dry-run` | Previews importing existing brokers from `data/import/` |
| `pnpm admin:invite -- --name "…" --email …` | Creates an admin account and prints the invite link |
| `pnpm storage:cors` | Allows the web app to upload straight to the bucket (once per bucket) |

## Adding brokers from the admin panel

On **Brokers** (`/admin/brokers`):

- **Invite a new broker** is for someone starting from zero. They get an invite email (when you give an email), their Google and GoHighLevel accounts are created, and they work through every onboarding step.
- **Add an existing broker** is for someone who already works with 365 Yachts. Enter their name, phone, 365 email (their existing Google and GoHighLevel accounts are looked up by it, nothing new is created), level, joining date and, optionally, their splits. Choose **Onboarding done** to mark every onboarding step approved so only training is left, or **Still onboarding**. No email is sent; you get their sign-in link to share.
- **Sign-in link:** until a broker creates their password, their profile shows their sign-in link with **Copy link** and **Send via WhatsApp**. It is the same link every time and has no time limit. It stops working once they use it, when you click **Replace link**, or when you set them to Inactive. **Email the invite** emails that same link. Admin invite links still expire after 7 days.
- **Remove** (owner only, on each row) deletes a broker and everything stored about them for good, after you type their name. If someone only left, set them to Inactive on their profile instead.

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

## Deploying

Follow [docs/DEPLOY.md](docs/DEPLOY.md). It lists the exact Railway settings and variables for the `web` and `api` services. There are deliberately no `railway.json` files.
