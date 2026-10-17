# Car maintenance app

A mobile app that knows your specific car: its maintenance schedule, recalls and known issues,
with reminders and an AI assistant grounded in that data.

## Getting started

Requires Node 24 and pnpm 10.

```sh
pnpm install
pnpm check                      # typecheck, lint, format check, tests
pnpm --filter @car/mobile start # run the app in a development build
```

The app uses native SQLite (PowerSync), so it runs in a development build rather than Expo Go:
`npx expo run:ios` or `npx expo run:android` from `apps/mobile` builds and installs one.

Without backend settings the app runs on in-memory demo data. To use a real backend, copy
`apps/mobile/.env.example` to `apps/mobile/.env.local` and fill in the Supabase and PowerSync
URLs and the Supabase anon key. The PowerSync instance needs `powersync/sync-rules.yaml`.

## How the code is organised

All behaviour lives in `packages/core` and runs without React or a device. The app in
`apps/mobile` only renders state from core screen models. See `docs/adr` for the reasoning and
`CLAUDE.md` for conventions.
