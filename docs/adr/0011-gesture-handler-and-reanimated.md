# ADR-0011: `react-native-gesture-handler` + `react-native-reanimated` for chat-row gestures

- **Status:** Accepted
- **Date:** 2026-10-24
- **Context refs:** §M0 (worst-device-first, zero jank on the JS thread), §M1 (locked stack),
  §R4 (scroll gates), §F2 (chat screen), ADR-0006 (FlashList).

## Context

The chat thread needs two gestures that sit **on a list row**: swipe-right-to-reply, and a
long press that opens a message's actions. Both were first built with React Native's own
`PanResponder` + `Animated`, which is what the locked stack already contained.

That version was measured and it was not acceptable. Release build, reference emulator, six
swipe cycles per run, `dumpsys gfxinfo`:

| build                                        | janky frames | p90   |
| -------------------------------------------- | ------------ | ----- |
| baseline, before any of this work             | 3.24%        | 30 ms |
| `PanResponder` + per-row entrance animation   | 19.82%       | 48 ms |
| per-row entrance animation alone              | 12.80%       | 53 ms |
| neither                                       | 3.88%        | 34 ms |

The reason is structural, not a coding mistake. `PanResponder` negotiates every touch move on
the **JS thread**, and `Animated` without the native driver drives every frame from there too —
on a surface whose entire job is to scroll. `useNativeDriver` fixes the driving but not the
negotiating, and a gesture that must decide "is this a scroll or a swipe?" cannot use it for the
decision. Per §M0 rule 4 that work does not belong on the JS thread at all.

So the honest choice was: ship the chat without the gestures, or take the dependency that moves
them off the JS thread. The owner asked for WhatsApp-parity gestures and for no performance
regression, which is exactly the trade this ADR records.

## Decision

Adopt **`react-native-gesture-handler` 2.x** and **`react-native-reanimated` 4.x** (with its
required `react-native-worklets` peer), for **gestures and animation that live inside a list
row**.

- Gesture recognition runs in the native layer. A pan that is dominantly vertical is never
  claimed, so the list's own scrolling is untouched — the negotiation does not reach JS.
- Row animations run as worklets on the **UI thread**. A drag or a spring-back costs the JS
  thread nothing, so a message arriving mid-gesture cannot stutter it, and a gesture cannot
  stutter the list.

**Scope, deliberately narrow.** This is not a licence to animate everything:

- Row-level gestures and the animations they drive — swipe-to-reply, the long-press action
  sheet's entrance.
- Anything already smooth with RN `Animated` and **outside** a list stays on `Animated`: the
  typing dots, the send-button feedback, `FadeInUp`, `SpinningRing`, the bottom sheet. Replacing
  working code would be churn with its own regression risk and no measured gain.

**The gate.** Any use of these libraries inside a list cell has to come with the same
`dumpsys gfxinfo` measurement as the table above, against the same baseline. The number, not
the intention, is what makes it acceptable.

## Consequences

- **Requires a native rebuild.** Both autolink; gesture-handler additionally needs the app
  wrapped in `GestureHandlerRootView` and, on Android, `MainActivity` to extend the
  gesture-handler-aware activity delegate.
- **Babel.** Reanimated's plugin must be **last** in `babel.config.js`, and worklets must be
  configured alongside it.
- **Jest.** Both need setup entries: gesture-handler ships `jestSetup`, Reanimated ships a mock.
  Neither must be allowed to make existing suites depend on a native module that is not there.
- **App size.** Two more native libraries in the APK. Measured after adoption and recorded
  against the §R5 budget.
- **New Architecture.** Both support it; the app is New Arch only (RN 0.86), so no interop
  shim is involved.

## Alternatives considered

- **Keep `PanResponder` + `Animated`.** Measured: 19.82% janky frames against a 3.24% baseline,
  six times worse on the app's most-used screen. Rejected on the number.
- **Ship without the gestures.** This is what the previous commit did, and it is a genuinely
  defensible position — reply via long press works and the thread scrolls at baseline. Rejected
  because the owner asked for the gestures and because the dependency buys them at no measured
  cost, which is a better outcome than doing without.
- **Hand-written native modules for the two gestures.** All of the maintenance of a dependency,
  none of the testing, for a worse version of what these libraries already do. Rejected.
- **Reanimated without gesture-handler.** Does not help: Reanimated animates on the UI thread
  but has no gesture recogniser of its own, so the pan negotiation would stay on the JS thread —
  which is the half that was actually costing frames.
