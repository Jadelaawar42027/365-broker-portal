# 365 Yachts Broker Portal

Broker onboarding and team management for 365 Yachts. Brokers work through an 11-step onboarding checklist on their phone; admins review submissions, track every broker and keep a persona per broker for lead matching.

- What is being built: [docs/SPEC.md](docs/SPEC.md) (see its "Decisions" section)
- Build progress: [docs/PLAN.md](docs/PLAN.md)
- Long-term design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Rules for Claude Code: [CLAUDE.md](CLAUDE.md)

## What's in the repo

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js app (broker screens at `/app`, admin screens at `/admin`) on port 3000 |
| `apps/api` | Fastify API on port 4000; the web app forwards `/v1/*` and `/api/auth/*` to it |
| `packages/db` | Drizzle schema, migrations, seed and import scripts |
| `packages/shared` | Code used by both web and API: schemas, onboarding rules, helpers |
| `packages/eslint-config` | Lint setup, including the rules that enforce the file-header comment rule |
| `docker-compose.yml` | Local Postgres 16 and SeaweedFS (S3-compatible file storage) |

## Setup (first time)

You need Node 24, pnpm and Docker Desktop (see `START_HERE.md` for installing them).

```bash
pnpm install
cp .env.example .env          # local settings; the defaults work with docker compose
docker compose up -d          # starts Postgres and file storage, creates the bucket
pnpm db:migrate               # creates the tables
pnpm db:seed                  # adds the onboarding steps, the owner account and sample brokers
pnpm --filter @bp/web exec playwright install chromium   # once, for end-to-end tests
```

Then start everything:

```bash
pnpm dev
```

- Web app: http://localhost:3000
- API health: http://localhost:4000/health

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Runs web and API with live reload (needs `docker compose up -d`) |
| `pnpm test` | Unit and integration tests for every package |
| `pnpm test:e2e` | Playwright end-to-end tests at desktop and 390px phone width (starts `pnpm dev` if needed) |
| `pnpm lint` / `pnpm typecheck` | Code checks; lint fails on missing or outdated file headers and on inline comments |
| `pnpm build` | Production build of web and API |
| `pnpm db:generate` | Creates a migration after a schema change |
| `pnpm db:migrate` | Applies migrations |
| `pnpm db:seed` | Seeds onboarding steps, owner and sample brokers (prints Marisol's invite link) |
| `pnpm db:studio` | Opens Drizzle Studio to browse the database |
| `pnpm db:metrics-user` | Creates the read-only login other tools use to read `broker_metrics` |
| `pnpm import:brokers -- --dry-run` | Previews importing existing brokers from `data/import/` |

## Local services

| Service | Address | Login |
| --- | --- | --- |
| Postgres | `localhost:5432`, database `broker_portal` | `bp` / `bp` |
| File storage (S3 API) | `http://localhost:8333`, bucket `broker-files` | keys in `docker/seaweedfs/s3.json` |

To wipe local data and start fresh: `docker compose down -v`, then `docker compose up -d`, `pnpm db:migrate` and `pnpm db:seed`.

## Deploying

Railway settings for the `web` and `api` services are in `docs/DEPLOY.md` (written in phase F). There are deliberately no `railway.json` files.
