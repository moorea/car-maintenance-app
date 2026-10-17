# Car maintenance app

Consumer mobile app that knows your specific car: its maintenance schedule, recalls and known
issues, with reminders and an AI assistant grounded in that data. US only at launch.

## Layout

- `packages/core`: all behaviour. Domain types, use cases, screen models, Zod schemas, ports.
  Headless: no React, Expo, Supabase or PowerSync imports (ESLint enforces it).
- `packages/core/src/testing`: in-memory adapters for tests.
- `packages/data`: real adapters for the core ports over PowerSync (on-device SQLite) and the
  Supabase upload connector. Headless too: takes the database as a parameter and is tested on
  Node with `@powersync/node`. See ADR 0004.
- `packages/server`: the AI assistant's edge function (ADR 0009). Bundled into
  `supabase/functions/assistant` by `pnpm --filter @car/server build`; tested on Node.
- `powersync/sync-rules.yaml`: which rows sync to each user's phone. Tested in `packages/data`.
- `apps/mobile`: Expo (React Native) app. Thin: screens wire models to pure views.
  `src/bootstrap/deps.ts` is the composition root that picks real or demo adapters.
- `apps/site`: static landing, privacy policy and support pages, built from the listing copy,
  `docs/app-store/privacy-policy.md` and the app's colour roles. Deployed to GitHub Pages.
- `supabase/migrations`: SQL migrations. `supabase/tests`: pgTAP tests for row-level security.
- `docs/adr`: decisions. Read them before changing architecture.

## Conventions

- New screen: copy `features/service-log` (model + tests) and `screens/service-log`
  (Screen + View). See ADR 0003.
- New dependency on the outside world: add a port in `core/src/ports`, an in-memory adapter in
  `core/src/testing`, and the real adapter in the app or an edge function. See ADR 0002.
- Colours: use a semantic role from `useColors()` (`apps/mobile/src/theme`), never a literal.
  Add a role rather than a one-off colour. See ADR 0007.
- Dates are ISO `YYYY-MM-DD` strings handled in UTC (`core/src/lib/date.ts`). Money is integer
  cents. Distances are miles.
- Every behaviour change in core comes with a test. Test names describe behaviour.
- Never put API keys in code. Edge functions read them from Supabase secrets.

## Pull requests

PRs group one logical change and are the checkpoint before main. Do not wait for human approval:
open the PR, wait for CI to pass, run an independent review (a fresh subagent reading the diff),
fix what it finds, then merge once the goal is met and the change is safe. Add static analysis
and tests to CI whenever they make merging safer.

## Commands

- `pnpm install`
- `pnpm check`: typecheck, lint, format check and tests. CI runs the same.
- `pnpm --filter @car/core test -- --watch`
- `pnpm --filter @car/mobile start`
