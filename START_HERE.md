# Start here: build the Broker Portal MVP this weekend

Follow these steps in order. Everything is for a Mac. Commands go in the Terminal app (Cmd+Space, type "Terminal").

What's already in this folder:

| File | What it is |
| --- | --- |
| `CLAUDE.md` | The rules Claude Code follows every time: stack, comment rule, never push, tests, UI |
| `docs/SPEC.md` | Exactly what to build this weekend |
| `BUILD_PROMPTS.md` | The prompts you paste into Claude Code, in order |
| `.claude/settings.json` | Blocks `git push`, `gh`, `railway` and reading `.env` files at the tool level |
| `.claude/skills/visual-check/` | The skill that screenshots each screen and compares it with the mockups |
| `docs/templates/` | Persona template and a sample CSV for importing your current brokers |
| `docs/manual/` | The onboarding manual PDF |
| `docs/mockups/` | Every screen as a PNG, broker screens also at phone width |
| `docs/ARCHITECTURE.md` | The long-term architecture, with diagrams in `docs/architecture/` |
| `.gitignore` | Keeps secrets and real broker data out of GitHub |

Files starting with a dot are hidden in Finder. Press Cmd+Shift+. to show them.

---

## Step 1: Install the tools (about 30 minutes, Friday night)

1. **Homebrew** (installs everything else):
   `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
   At the end it prints two "Next steps" commands. Run them.
2. **Node, pnpm and git:**
   `brew install node pnpm git`
3. **Docker Desktop:** `brew install --cask docker`, then open Docker from Applications once and let it finish starting. Tests and local development run a throwaway Postgres in Docker.
4. **Claude Code:**
   `curl -fsSL https://claude.ai/install.sh | bash`
   Open a new Terminal window and check: `claude --version`
5. **VS Code** (to read the code Claude writes): `brew install --cask visual-studio-code`

Check everything worked: `node -v`, `pnpm -v`, `git --version`, `docker -v`, `claude --version`. Each should print a version.

## Step 2: Put this kit in your folder

1. Unzip the kit and move everything inside `brokerPortal/` into `Desktop/365yachts/brokerPortal/`.
2. In Terminal: `cd ~/Desktop/365yachts/brokerPortal`
3. Start a local git repo, so Claude can save checkpoints you can undo:
   `git init && git add -A && git commit -m "starter kit"`
   You create the GitHub repo and push yourself, whenever you choose.

## Step 3: Mockups and architecture doc (already done)

The mockups are already in `docs/mockups/` (13 screens, plus phone-size versions of the broker screens), and the architecture doc is in `docs/ARCHITECTURE.md` with its diagrams in `docs/architecture/`. Nothing to do here. If you change a design on the canvas later, replace the matching PNG with the same file name.

## Step 4: Create the Railway project (10 minutes)

You'll develop locally against Docker, and Railway hosts the real thing.

1. Go to railway.com, then **New Project → Empty Project**. Name it `365-broker-portal`.
2. Click **Create → Database → PostgreSQL**. This is the production database.
3. Click **Create** and add a **Bucket** (Storage Bucket). This is private file storage for contracts, IDs and W-9s.
4. Don't create the web or api services yet. You'll do that after Claude has built them and you've pushed to GitHub (Step 8).

## Step 5: Set up Claude Code in the folder

1. `cd ~/Desktop/365yachts/brokerPortal` then run `claude`. Log in with your Claude account the first time.
2. Inside Claude Code, install the design plugin:
   `/plugin install frontend-design@claude-plugins-official`
   Choose the **project** scope when asked.
3. Exit Claude Code (type `/exit`), then add the Playwright browser tool it uses to take screenshots:
   `claude mcp add --transport stdio playwright -- npx @playwright/mcp@latest`
4. Start `claude` again, then check:
   - `/mcp` shows playwright connected.
   - `/status` shows `.claude/settings.json` loaded.
   - Typing `/` lists the `visual-check` skill.
5. Test the push block: ask Claude "run git push". It must refuse, because of the deny rule.

## Step 6: Build it (Saturday and Sunday)

Open `BUILD_PROMPTS.md` and follow it.

1. Press Shift+Tab until the status line says **plan mode**, then paste **Prompt 0**. Claude reads everything and gives you a plan plus questions, without writing code. Answer the questions and approve the plan.
2. Paste **Prompt 1**. Claude builds phase A, runs all tests, makes a local commit, and stops.
3. After each phase, try what it built (the summary tells you how), then type `continue`.

A realistic schedule:

| When | Phases |
| --- | --- |
| Saturday morning | A (scaffold) and B (database) |
| Saturday afternoon | C (API + integration tests) |
| Saturday evening | D (broker screens) |
| Sunday morning | E (admin screens + personas) |
| Sunday afternoon | F (import, end-to-end tests, Railway config) |
| Sunday evening | Import real brokers, deploy, invite one test broker |

If a phase runs long, finish it properly rather than skipping its tests.

## Step 7: The tests, in plain terms

- **Unit tests** check one small piece of logic in isolation, for example "a step that was sent back can be resubmitted, but an approved step can't". They take milliseconds. Command: `pnpm test`.
- **Integration tests** check that the pieces work together. They start a real Postgres in Docker, call the API the way the website would, and check what landed in the database. This is where "broker A can never see broker B's W-9" gets proven. Also part of `pnpm test`.
- **End-to-end tests** (Playwright) drive a real browser through whole journeys: invite, sign up, upload, approve, onboarded. They run on a phone-sized screen too. Command: `pnpm test:e2e`.
- **Visual check** is the skill that screenshots each page and compares it with your mockups.

## Step 8: Deploy to Railway

1. You push to GitHub: create a private repo on github.com, then follow GitHub's "push an existing repository" commands.
2. In your Railway project, click **Create → GitHub Repo** twice, once for `web` and once for `api`, both pointing at your repo.
3. Open `docs/DEPLOY.md`, which Claude writes in phase F. For each service, copy its build, start and pre-deploy commands, watch paths and healthcheck into that service's **Settings**, and add the variables it lists under **Variables**. Use Railway's variable references for the database and bucket, so you never paste secrets by hand.
   Railway has deprecated `railway.json` config files for new services, which is why this is done in the dashboard. Its newer "Infrastructure as Code" (`.railway/railway.ts`) is a good upgrade later, but it can delete resources missing from the file, so leave it until you're comfortable.
4. Deploy. The api runs the database migrations automatically before starting.
5. Log in with the owner account, then invite yourself as a test broker from your phone.

## Step 9: Adding your current brokers, their files and personas

There are three ways, from most to least everyday.

**1. The admin screens (normal use).**
- Add a broker with "Invite a new broker".
- Write their persona on their profile page.
- Upload their existing paperwork to a step on their behalf, also from the profile page. It's marked approved and records that you uploaded it.

**2. The bulk import (for everyone you already have).**
1. Create a folder `data/import/`. It's gitignored, so it never goes to GitHub.
2. Copy `docs/templates/brokers-import-example.csv` to `data/import/brokers.csv` and fill one row per broker.
3. Optional: put persona docs at `data/import/personas/<their-email>.md`.
4. Optional: put files at `data/import/files/<their-email>/w9.pdf`, `photo_id.jpg` and so on. File names are the step keys in `docs/SPEC.md`.
5. Run `pnpm import:brokers -- --dry-run` to see what would change, then without `--dry-run` to do it. It's safe to run again: it updates by email and never deletes.

**3. Editing the database directly (for quick fixes).**
- Locally: `pnpm db:studio` opens Drizzle Studio, a spreadsheet-like view of every table in your browser.
- Production: in Railway, open the Postgres service and use its **Data** tab, or connect a desktop app like TablePlus using the `DATABASE_PUBLIC_URL` from the Postgres service's Variables tab.

Rules for direct editing:
- Edit values, never the structure. New columns or tables always go through Claude and a migration, or the next deploy will fight your change.
- Don't change `status` fields by hand, because it skips the audit log and the onboarding logic. Use the admin screens for that.
- Files can't be added this way. They live in the bucket, not the database, so use the admin screens or the import.
- Before a big manual change in production, make a backup from the Postgres service in Railway.

## Step 10: Personas

Each broker has one free-text persona, edited on their profile page and visible to admins only. When it's empty it starts from `docs/templates/persona-template.md`:
- background
- personality and communication style
- strengths
- clients they click with
- who to avoid pairing them with
- languages
- wins from good matches

The James example belongs under "Background" ("veteran") and "Wins from good matches" (the veteran lead, the deal in progress). The brokers table search also searches persona text, so typing "veteran" finds every veteran broker when you route a lead.

Keep personas about professional background and working style, and only include personal details a broker has shared and is comfortable with. Leave out things like race, religion, health or age. They shouldn't drive lead routing, and the profile is a record about a real person.

Later, the AI bot can read personas through the API to suggest the best broker for a new lead. That's phase 3 in the architecture doc.
