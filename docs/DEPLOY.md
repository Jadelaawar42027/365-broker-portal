# Deploying to Railway

The portal runs as four Railway services in one project: **web** (Next.js), **api** (Fastify), **Postgres** and a **Storage Bucket**. There are deliberately no `railway.json` / `railway.toml` files (Railway has deprecated them for new services) and no `.railway/railway.ts`. Everything below is typed into the Railway dashboard.

In the variable references below, `Postgres` and `api` are service names and `uploads` is the bucket's name in the Railway project. If you named something differently, use its name instead (for example `${{Bucket.ENDPOINT}}`).

**Current production (Oct 17, 2026):** project `365-broker-portal`, services `api` and `web`, bucket `uploads`, web at https://web-production-43f32.up.railway.app. Everything below is already set there; this guide is for checking it or rebuilding it.

## Before you start

- The Postgres and Storage Bucket services exist (START_HERE.md, step 4).
- You have pushed the repo to GitHub.
- You have generated an auth secret: `openssl rand -base64 32`.
- Optional: a Resend account with a verified sending domain, so emails really go out. Without `RESEND_API_KEY` the api only logs emails.

## 1. Create the two app services

In the project, click **Create → GitHub Repo** twice and pick this repo both times. Rename the services to **api** and **web** (Settings → Service Name). Both build from the repo root; do not set a root directory, because the apps share code from `packages/`.

## 2. api service

### Settings

| Setting (Railway → api → Settings) | Value |
| --- | --- |
| Source → Root Directory | *(leave empty)* |
| Source → Watch Paths | `/apps/api/**`<br>`/packages/**`<br>`/scripts/**`<br>`/package.json`<br>`/pnpm-lock.yaml`<br>`/pnpm-workspace.yaml`<br>`/turbo.json`<br>`/tsconfig.base.json` |
| Build → Builder | Railpack (default). It reads Node 24 from `.nvmrc` / `engines` and pnpm from `packageManager`. |
| Build → Custom Build Command | `pnpm --filter @bp/api build` |
| Deploy → Custom Start Command | `node scripts/start.mjs` |
| Deploy → Pre-Deploy Command | `pnpm --filter @bp/api release` |
| Deploy → Healthcheck Path | `/health` |
| Networking → Public Networking | Not needed. The web service talks to the api over the private network. Add a domain later only for the AI bot. |

**Start command.** Both services use the same `node scripts/start.mjs`. It starts the api or the web app based on the service's name (`RAILWAY_SERVICE_NAME`, which Railway sets): keep the services named `api` and `web`, or set a variable `BP_SERVICE=api` / `BP_SERVICE=web`. It runs Node directly rather than through pnpm, so Railway's stop signal on redeploy reaches the server and it shuts down cleanly. It is also the root `pnpm start` script, which Railpack needs to find before it will build a monorepo.

`release` runs the database migrations, then the idempotent seed: it adds any missing onboarding steps and creates the owner from `SEED_OWNER_*` if that email doesn't exist yet. Sample brokers are never created in production. If `release` fails, Railway keeps the previous deploy running.

### Variables (Railway → api → Variables)

| Variable | Value | Where it comes from |
| --- | --- | --- |
| `NODE_ENV` | `production` | type it |
| `API_HOST` | `::` | type it (listens on IPv4 and IPv6, needed for Railway's private network) |
| `PORT` | `8080` | type it (fixed, so the web service can reference it) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | reference to the Postgres service |
| `WEB_ORIGIN` | `https://<web domain>` | the web service's public domain from step 3, e.g. `https://web-production-1234.up.railway.app` or `https://team.365yachts.org` (no trailing slash) |
| `BETTER_AUTH_SECRET` | *(32+ random characters)* | `openssl rand -base64 32` |
| `S3_ENDPOINT` | `${{uploads.ENDPOINT}}` | reference to the bucket |
| `S3_REGION` | `${{uploads.REGION}}` | reference to the bucket |
| `S3_BUCKET` | `${{uploads.BUCKET}}` | reference to the bucket (use `BUCKET`, not `RAILWAY_BUCKET_NAME`) |
| `S3_ACCESS_KEY_ID` | `${{uploads.ACCESS_KEY_ID}}` | reference to the bucket |
| `S3_SECRET_ACCESS_KEY` | `${{uploads.SECRET_ACCESS_KEY}}` | reference to the bucket |
| `S3_FORCE_PATH_STYLE` | `false` | type it. Use `true` only if the bucket's **Credentials** tab says path-style URLs |
| `STORAGE_UPLOAD_MODE` | `direct` (or `proxy`, see step 5) | type it |
| `RESEND_API_KEY` | `re_…` | Resend dashboard. Leave unset to only log emails |
| `EMAIL_FROM` | `365 Yachts <onboarding@365yachts.org>` | a sender on your verified Resend domain |
| `SUPPORT_CONTACT_NAME` | `Shelly` | type it |
| `SUPPORT_WHATSAPP_NUMBER` | `15614459241` | type it (international format, digits only; empty hides the WhatsApp buttons) |
| `SEED_OWNER_NAME` | `Aj` | type it (first deploy) |
| `SEED_OWNER_EMAIL` | your email | type it (first deploy) |
| `SEED_OWNER_PASSWORD` | a long password | type it (first deploy). You can delete the three `SEED_OWNER_*` variables after the first successful deploy. |
| `LOG_LEVEL` | `info` | type it |

Never set `EMAIL_OUTBOX_DIR` on Railway: the api refuses to start with it in production.

## 3. web service

### Settings

| Setting (Railway → web → Settings) | Value |
| --- | --- |
| Source → Root Directory | *(leave empty)* |
| Source → Watch Paths | `/apps/web/**`<br>`/packages/shared/**`<br>`/scripts/**`<br>`/package.json`<br>`/pnpm-lock.yaml`<br>`/pnpm-workspace.yaml`<br>`/turbo.json`<br>`/tsconfig.base.json` |
| Build → Builder | Railpack (default) |
| Build → Custom Build Command | `pnpm --filter @bp/web build` |
| Deploy → Custom Start Command | `node scripts/start.mjs` |
| Deploy → Pre-Deploy Command | *(leave empty)* |
| Deploy → Healthcheck Path | `/login` |
| Networking → Public Networking | **Generate Domain** on port `8080` (or add `team.365yachts.org` as a custom domain). Put this URL in the api's `WEB_ORIGIN`. |

### Variables (Railway → web → Variables)

| Variable | Value | Where it comes from |
| --- | --- | --- |
| `NODE_ENV` | `production` | type it |
| `PORT` | `8080` | type it (matches the domain's target port) |
| `API_INTERNAL_URL` | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` | references to the api service (private network, plain http) |
| `SUPPORT_CONTACT_NAME` | `${{api.SUPPORT_CONTACT_NAME}}` | reference, so both services show the same contact |
| `SUPPORT_WHATSAPP_NUMBER` | `${{api.SUPPORT_WHATSAPP_NUMBER}}` | reference |

`API_INTERNAL_URL` is fixed into the build (Next.js rewrites are compiled at build time). If you change it, redeploy the web service. The web service forwards `/v1/*` and `/api/auth/*` to the api, so the browser only ever talks to the web domain and the login cookie stays first-party (SPEC D10).

## 4. First deploy

1. Deploy **api** first. Its logs should show `Migrations applied.` and `Owner account: created.` from the pre-deploy step, then a healthy `/health`.
2. Deploy **web**, open its domain, and sign in with `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`.
3. Invite yourself as a test broker from **+ Invite a new broker** and open the link on your phone.

## 5. File uploads: direct or proxy

With `STORAGE_UPLOAD_MODE=direct`, phones upload straight to the bucket with presigned URLs, which needs the bucket to accept the web domain (CORS). Railway buckets do support this (checked on Oct 17, 2026: the web domain is allowed, other sites get 403). Run it once per bucket, and again if the web domain changes. The easiest way uses the api's own variables:

```bash
railway run --service api -- pnpm storage:cors
```

Or pass the bucket's credentials yourself (from the bucket's **Credentials** tab):

```bash
WEB_ORIGIN=https://<web domain> \
S3_ENDPOINT=<ENDPOINT> S3_REGION=<REGION> S3_BUCKET=<BUCKET> \
S3_ACCESS_KEY_ID=<ACCESS_KEY_ID> S3_SECRET_ACCESS_KEY=<SECRET_ACCESS_KEY> \
pnpm storage:cors
```

- It prints `Bucket "…" now accepts browser uploads from https://…`: keep `direct`.
- It fails, or uploads in the browser fail with a CORS error: set `STORAGE_UPLOAD_MODE=proxy` on the api. Uploads (10 MB max) then go through the web and api services instead. Nothing else changes (SPEC D11).

## 6. One-off tasks from your laptop

These run locally against production using the Postgres service's public connection string: **Postgres → Variables → `DATABASE_PUBLIC_URL`**. Paste it only into your terminal, never into a file in the repo.

| Task | Command |
| --- | --- |
| Add an admin (Shelly, Max) | `DATABASE_URL=<DATABASE_PUBLIC_URL> WEB_ORIGIN=https://<web domain> pnpm admin:invite -- --name "Shelly Melcher" --email shelly@365yachts.org` (prints the invite link to send them) |
| Read-only login for Metabase / Sheets / the bot | `DATABASE_URL=<DATABASE_PUBLIC_URL> METRICS_READER_PASSWORD=<16+ chars> pnpm db:metrics-user`. It can read only the `broker_metrics` view. The migration needs a Postgres user that may `CREATE ROLE`; Railway's default `postgres` user can. |
| Import existing brokers | Put the files in `data/import/` (README), then `DATABASE_URL=<DATABASE_PUBLIC_URL> S3_ENDPOINT=… S3_REGION=… S3_BUCKET=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… pnpm import:brokers -- --dry-run`, check the summary, then run it again without `--dry-run`. Imported brokers have no password yet: open each profile and click **Resend invite**. |

## 7. The contract & NDA template

Step 2 has a "Download contract & NDA" button only once a template file exists.

1. Upload the blank PDF to the bucket at `templates/contract-and-nda.pdf`, using the bucket's file browser or any S3 tool.
2. In the Postgres **Data** tab, set `onboarding_steps.template_file_key` to `templates/contract-and-nda.pdf` on the row whose `key` is `contract_nda`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Build log: `No start command detected` (Railpack) | You're on an older commit without the root `start` script, or the Custom Start Command is empty. Pull the latest code and set **Deploy → Custom Start Command** to `node scripts/start.mjs` on both services. |
| Build log: `WARN could not detect pnpm lockfile version` | Harmless. pnpm 12 lockfiles start with `---`, which Railpack 0.41 doesn't read; it still installs pnpm 12 from `packageManager` in package.json. |
| Deploy log: `Can't tell which app to start` | The service isn't named `api` or `web`. Rename it, or add the variable `BP_SERVICE=api` (or `web`). |
| api deploy fails in pre-deploy | Open the deploy logs. Usually `DATABASE_URL` is missing or the owner password is shorter than 8 characters. |
| api crashes at start with "Invalid API environment" | The message lists every bad variable, e.g. `WEB_ORIGIN: must use https in production`. |
| Web pages show "Could not load…" or sign-in loops | `API_INTERNAL_URL` is wrong, or the web build happened before it was set. Fix it and redeploy web. Check `API_HOST=::` on the api. |
| "This request did not come from the 365 Yachts portal" | The api's `WEB_ORIGIN` doesn't exactly match the domain in the browser (scheme, host, no trailing slash). |
| Downloads or uploads return 403 from storage | Check the five `S3_*` references and `S3_FORCE_PATH_STYLE`. |
