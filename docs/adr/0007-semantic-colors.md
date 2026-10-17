# 0007 Colours come from one semantic theme

Status: accepted, 2026-10-17

## Decision

The app's colours are defined once, in `apps/mobile/src/theme`, in two layers:

1. **Palette** (`palette.ts`): raw swatches such as `teal600`. The only file allowed to contain
   colour literals.
2. **Semantic roles** (`colors.ts`): what a colour is for, such as `textSecondary`, `accent`,
   `warning` or `danger`, with one value per role for light mode and one for dark mode.

Screens read roles with `useColors()`, which follows the system appearance. They never see the
palette. The themed `Host` in `src/ui/Host.tsx` passes `accent` to Expo UI as the seed colour,
so native buttons, switches and pickers pick it up with no per-screen code.

## Rules

- ESLint rejects hex, `rgb()` and `hsl()` literals anywhere in the app except `palette.ts` and
  tests, and rejects importing `Host` from `@expo/ui` directly.
- A new role is added only when a screen needs a colour whose meaning no role covers. Name it by
  meaning (`warningSubtle`), never by appearance (`lightOrange`).
- `colors.test.ts` checks every text-on-fill pairing screens use against WCAG AA (4.5:1) in
  both modes, so changing a swatch cannot silently make text unreadable. Add a pairing there when
  a screen starts drawing a new one.

## Alternatives considered

A theming library (Restyle, Tamagui, Unistyles): each brings its own styling system that
overlaps with Expo UI's native components. Platform colours only (`PlatformColor`): adapts to
dark mode for free, but cannot express a brand accent or a warning card and is not portable to
web. A React context provider: only needed once the user can pick a theme in the app.

## Revisit if

We let users choose a theme or accent in settings: move the choice into a context (or a small
store) behind the same `useColors()` hook, so screens do not change.
