# ADR-0006: `@shopify/flash-list` for large chat lists

- **Status:** Accepted
- **Date:** 2026-08-01
- **Context refs:** §F2 (chat list/screen), §R4 (perf gates: 55+ FPS scroll, 0 frames > 32 ms), MP2.

## Context

The chat list and (MP2) chat screen render potentially thousands of rows and must hold
55+ FPS with zero dropped frames on the 3 GB reference device (§R4). React Native's
`FlatList` recycles poorly at scale and can jank on a low-end device.

## Decision

Adopt **`@shopify/flash-list` 2.x** for the chat list (and the reversed chat screen in
MP2). It recycles views aggressively (low memory, high FPS) and is the de-facto standard
for large RN lists. Used only in feature UI, fed by WatermelonDB observers (ADR-0005).

## Consequences

- **Requires a native rebuild** (autolinks cleanly).
- Jest: the native recycler view is absent → stubbed as a plain component in
  `jest.setup.ts`.
- v2 auto-sizes items (no required `estimatedItemSize`).

## Alternatives considered

- **`FlatList`** — ships with RN, but weaker recycling → risk of missing the §R4 scroll
  gates on the reference device. Kept as a mental fallback; not used for the hot lists.
- **`RecyclerListView`** (FlashList's underlying engine, used directly) — lower-level,
  more boilerplate. Rejected in favour of FlashList's ergonomics.
