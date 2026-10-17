# 0002 Headless core behind ports

Status: accepted, 2026-10-17

## Decision

Everything the app does is a use case or screen model in `packages/core`, runnable in a plain
Node test with no React, no device and no network. The mobile app is a thin rendering layer.

Core reaches the outside world only through ports (interfaces in `packages/core/src/ports`):
repositories, the clock, id generation and, later, vehicle data, AI and push. The app supplies
real adapters (PowerSync/SQLite, Supabase, CarMD, Claude); tests use the in-memory adapters in
`@car/core/testing`.

## Rules (enforced by ESLint)

- `packages/core` must not import React, React Native, Expo, Supabase or PowerSync.
- Screens must not import Supabase or PowerSync; they go through a model.

## Why

- Behaviour is tested fast and deterministically, including whole flows such as "log an oil
  change, see the next reminder move".
- Vendors can be swapped by changing one adapter. CarMD versus Vehicle Databases is the first
  likely swap.
- The same rules and validation (Zod schemas) run on the phone and in edge functions.
