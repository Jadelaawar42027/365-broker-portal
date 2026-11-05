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
| `SUPPORT_CONTACT_NAME` | `365 Yachts AI` | type it (the web service references it, so set it here even though it's the default) |
| `SUPPORT_WHATSAPP_NUMBER` | `19547381542` | type it (the 365 Yachts AI on WhatsApp; international format, digits only; empty hides the WhatsApp buttons) |
| `SEED_OWNER_NAME` | `Aj` | type it (first deploy) |
| `SEED_OWNER_EMAIL` | your email | type it (first deploy) |
| `SEED_OWNER_PASSWORD` | a long password | type it (first deploy). You can delete the three `SEED_OWNER_*` variables after the first successful deploy. |
| `LOG_LEVEL` | `info` | type it |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the whole JSON key file, pasted as one value | Google Cloud → IAM → Service accounts → your provisioning account → Keys → Add key → JSON (see section 9). Leave unset until ready: Google shows "Not configured" |
| `GOOGLE_ADMIN_SUBJECT` | e.g. `aj@365yachts.org` | a Workspace **super admin** the service account acts as |
| `GOOGLE_DOMAIN` | `365yachts.org` | type it |
| `GOOGLE_ORG_UNIT` | e.g. `/Brokers` (optional) | Admin console → Directory → Organizational units. Empty puts new users in the top-level unit |
| `GHL_AGENCY_TOKEN` | `pit-…` | GHL agency view → Settings → Private Integrations → create one with scopes `users.readonly`, `users.write`, `locations.readonly` (section 8). Leave unset until ready |
| `GHL_COMPANY_ID` | your agency (company) id | GHL agency Settings → Company, or the `companyId` in any agency API answer |
| `GHL_LOCATION_ID` | the 365 Yachts sub-account id | GHL sub-account → Settings → Business Profile (Location ID) |
| `PROVISIONING_WORKER` | `on` (default) | type `off` only to stop this service running provisioning tasks |
| `PROVISIONING_MODE` | `live` (default) or `dry-run` | type `dry-run` to try onboarding without creating anything in Google or GHL (section 9) |
| `AI_ROSTER_SYNC_ENABLED` | `false` (default) | type `true` only when real brokers are being added: each new broker is then added to the 365 Yachts AI roster (it texts them a welcome) and each deleted broker is deactivated there. Anything other than `true` keeps it off |
| `AI_ROSTER_API_URL` | the AI bot's public address, e.g. `https://<bot>.up.railway.app` | the AI bot's Railway service → Settings → Networking |
| `AI_ROSTER_API_SECRET` | the bot's `ROSTER_API_SECRET` | copy it from the AI bot's Railway variables |

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

These run locally against production using the Postgres service's public connection string: **Postgres → Variables → `DATABASE_PUBLIC_URL`**. It only exists once the database has a public address: **Postgres → Settings → Networking → TCP Proxy** on port `5432` (turn it off again afterwards if you like). Paste it only into your terminal, never into a file in the repo. With the Railway CLI linked to the project you can skip the copying: `railway run --service Postgres -- sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm import:brokers -- --dry-run'`.

| Task | Command |
| --- | --- |
| Add an admin (Shelly, Max) | `DATABASE_URL=<DATABASE_PUBLIC_URL> WEB_ORIGIN=https://<web domain> pnpm admin:invite -- --name "Shelly Melcher" --email shelly@365yachts.org` (prints the invite link to send them) |
| Read-only login for Metabase / Sheets / the bot | `DATABASE_URL=<DATABASE_PUBLIC_URL> METRICS_READER_PASSWORD=<16+ chars> pnpm db:metrics-user`. It can read only the `broker_metrics` view. The migration needs a Postgres user that may `CREATE ROLE`; Railway's default `postgres` user can. |
| Import existing brokers | Put the files in `data/import/` (README), then `DATABASE_URL=<DATABASE_PUBLIC_URL> S3_ENDPOINT=… S3_REGION=… S3_BUCKET=… S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… pnpm import:brokers -- --dry-run`, check the summary, then run it again without `--dry-run`. Imported brokers have no password yet: open each profile and send them the sign-in link shown there (Copy link or Send via WhatsApp). |

## 7. The contract & NDA template

Step 2 has a "Download contract & NDA" button only once a template file exists.

1. Upload the blank PDF to the bucket at `templates/contract-and-nda.pdf`, using the bucket's file browser or any S3 tool.
2. In the Postgres **Data** tab, set `onboarding_steps.template_file_key` to `templates/contract-and-nda.pdf` on the row whose `key` is `contract_nda`.

## 8. Account provisioning: what the GoHighLevel API v2 docs say

Read on Oct 18, 2026 from the official OpenAPI files in [github.com/gohighlevel/api-v2-docs](https://github.com/gohighlevel/api-v2-docs) (`apps/users.json`, `apps/locations.json`, `docs/oauth/Scopes.md`), which the marketplace docs are generated from. The client in `apps/api/src/services/provisioning/ghl.ts` is built to exactly this.

| What | The docs say | What the portal does |
| --- | --- | --- |
| Base URL and version | `https://services.leadconnectorhq.com`, header `Version: 2021-07-28` (the only allowed value on the users endpoints) | Sends both on every call |
| Token type | `Authorization: Bearer …` with an Agency access token **or an agency Private Integration Token**. `POST /users/search/filter-by-email` accepts **Agency-Access only**; create, update, delete and search accept agency or sub-account tokens | Uses an **agency Private Integration Token** (`GHL_AGENCY_TOKEN`) |
| Scopes | `users.readonly` (search, filter by email, get), `users.write` (create, update, delete), `locations.readonly` (`GET /locations/{locationId}`) | Needs exactly those three |
| Search users by email | `POST /users/search/filter-by-email` with `companyId` (required), `emails` (comma-separated, required), `deleted`, `skip`, `limit`, `projection` | One address, `deleted: false`, exact match on the returned email |
| Create user | `POST /users/` with required `companyId`, `firstName`, `lastName`, `email`, `password`, `type`, `role`, `locationIds`; optional `phone`, `permissions`, `scopes` | `type: "account"`, `role: "user"`, `locationIds: [GHL_LOCATION_ID]`, the corporate email, first and last name, the personal phone, and a random password that is never stored |
| Update user | `PUT /users/{userId}`; "Email update is no longer supported due to security reasons" | Not used |
| Deactivate or delete | There is **no deactivate or suspend endpoint**. `DELETE /users/{userId}` answers `{"succeded": true, "message": "Queued deleting user … Will take effect in a few minutes."}` | Offboarding deletes the GHL user. Reactivating creates a new GHL user (after looking the email up first) and stores the new id |
| Invite email | The docs don't say whether GHL emails a new user, and the API requires a password at creation | The broker signs in to GHL with their 365 email and uses **Forgot password** the first time (step 10) |
| Test connection | `GET /locations/{locationId}` (`locations.readonly`) | "Test connection" reads the location and shows its name |

## 9. Turning on account provisioning

Until the Google and GHL variables are set, the api logs one warning per system at start-up (`Google Workspace provisioning is not configured: Missing …`), the Integrations panel on the overview says **Not configured**, and nothing is sent anywhere. Adding the variables and redeploying turns each system on. No code change is needed.

**Dry run (no Google or GHL calls, no Workspace billing):** set `PROVISIONING_MODE=dry-run` on the api and redeploy. No Google or GHL credentials are needed; `GOOGLE_DOMAIN` (default `365yachts.org`) and `GHL_LOCATION_ID` are used if set. Both systems show a **Dry run** badge on the Integrations panel. New brokers still get their 365 address picked (`firstname@…`, then `firstname.lastname@…`), saved on their profile and made their portal login, and their Accounts panel shows both accounts as created, with ids starting `dry-run-`. Every call that would have been made is written to the api log as `[dry-run] Google: would create …`. The temporary password on step 9 works nowhere. `pnpm provision:verify` ignores this setting and always talks to the real services.

Before going live: set `PROVISIONING_MODE=live` (or delete it), add the real variables, redeploy, then for each broker who was onboarded in dry run open their profile → Accounts and use **Link existing account** or **Retry** so they get real ids (their dry-run ids point at nothing).

**Google Workspace (Admin SDK Directory API):**

1. Google Cloud console, in a project owned by the 365 Yachts Workspace: **APIs & Services → Enable APIs → Admin SDK API**.
2. **IAM & Admin → Service accounts → Create service account** (no roles needed). Open it → **Keys → Add key → JSON**, and paste the whole file into `GOOGLE_SERVICE_ACCOUNT_JSON`. Note its **Client ID** (a long number).
3. Workspace Admin console → **Security → Access and data control → API controls → Manage domain-wide delegation → Add new**: the Client ID, scope `https://www.googleapis.com/auth/admin.directory.user`.
4. `GOOGLE_ADMIN_SUBJECT` = a super admin's address, `GOOGLE_DOMAIN` = `365yachts.org`, optionally `GOOGLE_ORG_UNIT` = `/Brokers` (it must already exist).

New brokers get `firstname@365yachts.org`; if that is taken, `firstname.lastname@365yachts.org`, then `firstname.lastname2@`, `3`, … (accents and punctuation stripped, middle names dropped), a random temporary password that must be changed at first sign-in, the org unit, and their personal phone as recovery phone. The password is never stored or logged; the broker sees a fresh one with **Reveal my temporary password** on step 9 (3 times a day).

**GoHighLevel:** an agency Private Integration token with `users.readonly`, `users.write` and `locations.readonly`, plus `GHL_COMPANY_ID` and `GHL_LOCATION_ID`. Section 8 has what the API does.

**Check it:** open the overview → Integrations → **Test connection** for each. Then run the end-to-end check from your laptop. It creates "Provisioning Check" with a unique `provisioning.check.<timestamp>@365yachts.org`, creates both users, confirms them, suspends both, deletes both and the broker row, and prints PASS or FAIL per step. It never touches another user.

```bash
railway run --service api -- pnpm provision:verify
```

**Existing brokers:** on each profile, type their 365 email under Accounts and click **Link existing account**; or put a `corporate_email` column (and optionally `crm_phone`) in `data/import/brokers.csv` and run `pnpm import:brokers -- --link` (with `GOOGLE_DOMAIN` set, an `email` on that domain counts as the corporate email). The api's worker looks each address up in both systems and stores the ids. It never creates users for a link.

**Failures** show on the broker's Accounts panel in plain words (for example "Google: the service account isn't authorized. Check domain-wide delegation for the admin.directory.user scope."). Network trouble and rate limits retry after 30 s, 1, 2 and 4 minutes (5 attempts); bad credentials or refused input fail at once. Fix the cause, then click **Retry**.

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
