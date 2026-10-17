# Car maintenance app

A mobile app that knows your specific car: its maintenance schedule, recalls and known issues,
with reminders and an AI assistant grounded in that data.

## Getting started

Requires Node 22 and pnpm 10.

```sh
pnpm install
pnpm check                      # typecheck, lint, format check, tests
pnpm --filter @car/mobile start # run the app in Expo Go or a simulator
```

## How the code is organised

All behaviour lives in `packages/core` and runs without React or a device. The app in
`apps/mobile` only renders state from core screen models. See `docs/adr` for the reasoning and
`CLAUDE.md` for conventions.
