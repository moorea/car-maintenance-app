# 0003 Screen state in Zustand vanilla screen models

Status: accepted, 2026-10-17

## Decision

Every screen follows one pattern:

1. **Screen model** in core, created with `createStore` from `zustand/vanilla`. It holds all of
   the screen's state as plain data with a `status` union (`loading`, `ready`, `saving`,
   `error`), plus typed actions. It receives its dependencies as arguments and exposes
   `start()` and `dispose()` for subscriptions. See `packages/core/src/features/service-log`.
2. **Screen component** in `apps/mobile/src/screens/<feature>/<Name>Screen.tsx`: creates the
   model with `useScreenModel`, reads it with `useStore(model)`, renders the view. Nothing else.
3. **View component** next to it: a pure function from the model's state and actions to UI.

## Rules

- `useState` and `useReducer` are banned in `apps/mobile/src/screens` (ESLint). Purely visual
  state (an accordion open, an animation running) may use them inside `apps/mobile/src/ui`.
- Form state and validation live in the model; validation uses Zod schemas from core.
- Persistent data is read from live database queries inside the model, never copied into a
  global store.
- No React Hook Form and no TanStack Query: both are React-bound and overlap with the models.
  If we later read lots of uncached server data, use `@tanstack/query-core` inside a model.

## Alternatives considered

XState (strongest runner-up: best for complex multi-step flows, too verbose for forms and
lists), Redux Toolkit (good devtools, but a global store duplicates SQLite), MobX (implicit data
flow), Jotai (state spread across atoms), Legend-State (its sync engine competes with PowerSync),
plain hooks (not headless). Full comparison in the architecture doc.

## Revisit if

A flow outgrows a single status union: model it as an XState machine inside core behind the same
`start`/`dispose` and `useStore` shape, so screens do not change. A second developer who prefers
Redux would also justify revisiting.
