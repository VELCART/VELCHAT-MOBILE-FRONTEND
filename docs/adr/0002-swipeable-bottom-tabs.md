# ADR 0002 — Swipeable bottom tabs (material-top-tabs on a pager)

- **Status:** Accepted
- **Date:** 2026-07-25
- **Context:** §M1 (locked stack), §M17 (navigation), §F1 (WhatsApp-parity UX).

## Context

Product wants WhatsApp-style navigation: a bottom tab bar **and** left/right swipe
between the tab pages. `@react-navigation/bottom-tabs` gives the bar but no swipe. A
hand-rolled `PanResponder` swipe (the earlier attempt) fights in-page horizontal
gestures and janks on the worst device (§M0) — exactly the UI bugs we must avoid.

## Decision

Use **`@react-navigation/material-top-tabs`** with `tabBarPosition: 'bottom'` and a
**custom `tabBar`**, backed by **`react-native-pager-view`** (native pager) via
`react-native-tab-view`. The pager owns the horizontal swipe; our custom bar renders
the VelChat design (crisp SVG icons, active pill) at the bottom.

Added deps:
- `@react-navigation/material-top-tabs`
- `react-native-tab-view` (the view layer)
- `react-native-pager-view` (native; autolinked)

## Rationale

- **Native swipe, zero jank.** `react-native-pager-view` is the platform ViewPager /
  UIPageViewController — the same primitive WhatsApp/Telegram use — so paging runs off
  the JS thread and never conflicts with our own gestures.
- **Keeps our design.** `tabBarPosition: 'bottom'` + a custom `tabBar` means the swipe
  is standard but the bar is 100% ours (icons, pill, height, a11y).
- **One integration, both platforms.** Same behaviour on iOS + Android.

## Consequences

- Native rebuild after install; iOS needs `pod install` (deferred to Mac/CI).
- `AppTabs` moves from `createBottomTabNavigator` to `createMaterialTopTabNavigator`;
  the custom bar now takes `MaterialTopTabBarProps` (state/descriptors/navigation).
- `lazy` is enabled so off-screen tabs don't mount until first shown (worst-device budget).
