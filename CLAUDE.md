# Car maintenance app

Consumer mobile app that knows your specific car: its maintenance schedule, recalls and known
issues, with reminders and an AI assistant grounded in that data. US only at launch.

## Layout

- `packages/core`: all behaviour. Domain types, use cases, screen models, Zod schemas, ports.
  Headless: no React, Expo, Supabase or PowerSync imports (ESLint enforces it).
- `packages/core/src/testing`: in-memory adapters for tests.
- `apps/mobile`: Expo (React Native) app. Thin: screens wire models to pure views.
- `supabase/migrations`: SQL migrations. `supabase/tests`: pgTAP tests for row-level security.
- `docs/adr`: decisions. Read them before changing architecture.

## Conventions

- New screen: copy `features/service-log` (model + tests) and `screens/service-log`
  (Screen + View). See ADR 0003.
- New dependency on the outside world: add a port in `core/src/ports`, an in-memory adapter in
  `core/src/testing`, and the real adapter in the app or an edge function. See ADR 0002.
- Dates are ISO `YYYY-MM-DD` strings handled in UTC (`core/src/lib/date.ts`). Money is integer
  cents. Distances are miles.
- Every behaviour change in core comes with a test. Test names describe behaviour.
- Never put API keys in code. Edge functions read them from Supabase secrets.

## Commands

- `pnpm install`
- `pnpm check`: typecheck, lint, format check and tests. CI runs the same.
- `pnpm --filter @car/core test -- --watch`
- `pnpm --filter @car/mobile start`
