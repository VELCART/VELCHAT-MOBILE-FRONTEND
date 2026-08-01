# ADR-0004: `@react-native-community/blur` for frosted-glass UI

- **Status:** Accepted
- **Date:** 2026-08-01
- **Context refs:** §M1 (locked stack — new dependency needs an ADR), §M16 (design-system).

## Context

The profile long-press peek uses circular "glass" action buttons. A pure SVG/View
gradient (`GlassBubble`) fakes gloss but cannot **blur** what is behind it — real
frosted glass needs a native gaussian blur. This was an explicit visual requirement
(a premium, more-transparent, theme-aware frosted look).

## Decision

Adopt **`@react-native-community/blur` (4.4.x, Fabric/New-Architecture ready)** and wrap
it in a `FrostedCircle` design-system atom:

- `FrostedCircle` = native `BlurView` (theme-aware `blurType`: `light` in light mode,
  `dark` in dark mode; high `blurAmount`) + a thin milky tint + the `GlassBubble` gloss
  (sheen, specular highlight, rim) + the caller's content on top.
- The blur module is **loaded lazily and guarded** (`loadBlurView()`), matching the
  cropper (ADR-0003): if the native side isn't in the binary yet (dep added, app not
  rebuilt) `FrostedCircle` **falls back** to a heavier translucent tint + gloss so it
  still reads as glass and nothing crashes. Real blur appears after a rebuild.
- Jest: `BlurView` is mocked as a plain host component in `jest.setup.ts`.

## Consequences

- **Requires a native rebuild** (`pnpm android`) — same rebuild already needed for the
  cropper (ADR-0003).
- One extra native view component; only used by `FrostedCircle` today.
- iOS authored only (build deferred on this Windows machine); `BlurView` has native iOS
  support and needs no Info.plist entry.

## Alternatives considered

- **SVG/View gradient only (`GlassBubble`)** — no true blur; rejected as the sole
  solution, but kept as the gloss layer + graceful fallback.
- **`expo-blur`** — pulls in Expo modules; not aligned with this bare RN app. Rejected.
