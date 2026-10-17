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

## Importing your current brokers

1. Create `data/import/` (it is gitignored and never leaves your machine).
2. Copy `docs/templates/brokers-import-example.csv` to `data/import/brokers.csv` and fill one row per broker. Columns: `name, email, phone, level (junior/senior), status (invited/onboarding/active/inactive), joined_at, onboarded_at, left_at, commission_tier`. Dates as `2026-03-11` or `3/11/2026`.
3. Optional personas: `data/import/personas/<email>.md`, following `docs/templates/persona-template.md`.
4. Optional paperwork: `data/import/files/<email>/<step key>.pdf` (or `.jpg` / `.png`), for example `w9.pdf`, `photo_id.jpg`, `contract_nda-page2.pdf`. Step keys: `photo_id`, `contract_nda`, `headshot`, `w9`, `dbpr_filing`, `license_bond`.
5. Run `pnpm import:brokers -- --dry-run`. It checks every row and file first and imports nothing if anything is wrong, with line numbers. Then run `pnpm import:brokers`.

The import matches brokers by email, never deletes anyone, and is safe to run again. Active brokers get every step marked approved with the note "imported" and never see the "welcome aboard" screen. Imported brokers have no password: open each profile in `/admin` and click **Resend invite**.

## Deploying

Follow [docs/DEPLOY.md](docs/DEPLOY.md). It lists the exact Railway settings and variables for the `web` and `api` services. There are deliberately no `railway.json` files.
