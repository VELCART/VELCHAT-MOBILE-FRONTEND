# ADR 0001 — react-native-svg for the app icon system

- **Status:** Accepted
- **Date:** 2026-07-25
- **Context:** §M1 (locked stack — a new dependency needs an ADR), §M16 (design system).

## Context

The app had no icon system. Icons were hand-composed from `View`s with borders and
transforms (see the old `AppTabs` tab bar). That approach does not scale: a chat app
needs dozens of crisp, scalable icons (tab bar, chat actions, headers, settings rows),
and shapes like a phone handset or a gear cannot be drawn cleanly with `View`s — the
results read as hacky and break across sizes/densities.

## Decision

Adopt **`react-native-svg`** (`^15.15.5`) as the single icon-rendering primitive. Icons
live in `src/design-system/icons/` as small, typed components (`{ size, color, strokeWidth }`)
that render `<Svg><Path/></Svg>`. The design system owns them; features consume them
through the `design-system` barrel — never by importing the library directly.

## Rationale

- **Industry standard.** `react-native-svg` is the de-facto RN vector primitive; it is
  what every icon library (react-native-svg-transformer, lucide-react-native, etc.) builds on.
- **Crisp on the worst device (§M0).** Vectors are resolution-independent — sharp at any
  size on a 3 GB Android 10 reference device, no per-density PNGs.
- **Cross-platform.** One implementation renders identically on iOS and Android (autolinked).
- **No heavier alternative pulled in.** We hand-author a tiny set of paths rather than
  shipping a full icon font or icon-library dependency, keeping the bundle small.

## Consequences

- Native rebuild required after install (autolinked); iOS needs `pod install` (deferred to
  the Mac/CI build — never reported verified here).
- New icons are added as path components under `design-system/icons/`, reviewed like any
  other design-system primitive.
- If we later need a large icon catalog, we can add `lucide-react-native` (which sits on top
  of `react-native-svg`) without changing this foundation.
