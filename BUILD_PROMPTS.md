# Claude Code prompts for the weekend build

Paste these into Claude Code one at a time, in order. Wait for each phase to finish, check it yourself, then send the next one.

---

## Prompt 0 - plan first (use plan mode: press Shift+Tab until it says "plan mode")

```
Read CLAUDE.md, docs/SPEC.md, docs/ARCHITECTURE.md, every image in docs/mockups/, and skim the manual in docs/manual/.

We are building the MVP described in docs/SPEC.md this weekend. Do not write any code yet.

Give me:
1. Any questions or conflicts you found between the spec, the architecture doc and the mockups.
2. The folder structure you will create.
3. A plan split into the phases A to F below, with the files and tests each phase produces.

Phases:
A. Monorepo scaffold: pnpm + Turborepo, apps/web, apps/api, packages/db, packages/shared, TypeScript, ESLint, Vitest, Playwright, docker-compose.yml with Postgres 16 and MinIO, .env.example, README with setup steps.
B. Database: Drizzle schema, first migration, broker_metrics view, metrics_reader role, seed script (the 11 onboarding steps, an owner account from env vars, three sample brokers in different states), the shared state machine and metrics helpers with unit tests.
C. API: Better Auth, invites, broker step routes, presigned upload and download, admin routes (overview, brokers, profile, persona, reviews, approve, send back, mark done, metrics), audit log, email notifications behind RESEND_API_KEY, OpenAPI at /docs. Integration tests for every route, including the permission tests.
D. Broker screens (1a to 1d) in apps/web, mobile-first, matching the mockups. Run the visual-check skill on each.
E. Admin screens (3a to 3d) with the Persona panel on the profile page instead of training. Run the visual-check skill on each.
F. Import script for existing brokers, Playwright end-to-end tests for every journey in the spec, docs/DEPLOY.md with the exact Railway settings for web and api (no railway.json files, see SPEC.md), final README.

Follow every rule in CLAUDE.md, especially the file-header comment rule and never pushing to GitHub.
```

Read the plan. Answer its questions. If something is wrong, tell it to change the plan before you approve.

---

## Prompt 1 - build phase by phase (after you approve the plan)

```
Plan approved. Build phase A now.

At the end of every phase:
- Run pnpm lint, pnpm typecheck and pnpm test and fix anything failing.
- For phases D and E, run the visual-check skill on every screen you built.
- Check that every file you created or changed has an up-to-date header comment and no inline comments.
- Make one local git commit named "phase X: <summary>". Never push.
- Stop and give me a short summary: what you built, which tests you added, how I can try it, and anything I need to do (env vars, accounts).

Then wait for me to say "continue" before starting the next phase.
```

After each phase, try it yourself (the summary tells you how), then send:

```
continue
```

---

## Useful follow-up prompts

When a test keeps failing:

```
pnpm test is failing on <test name>. Find the root cause, explain it in two sentences, fix the code (not the test, unless the test is wrong), and rerun everything.
```

When a screen looks off:

```
Run the visual-check skill on <route> against docs/mockups/<file>.png and fix the differences.
```

To audit the comment rule:

```
Go through every source file and check the header comment lists every function correctly and there are no inline comments. Fix any that don't follow CLAUDE.md. Show me the list of files you changed.
```

Before you deploy:

```
Prepare for the first Railway deploy: check docs/DEPLOY.md lists, for web and api, the exact Railway service settings (watch paths, build, start, pre-deploy, healthcheck) and every environment variable with where its value comes from. Confirm both apps build and start from a clean clone with those exact commands. Do not run any railway or git push commands.
```
