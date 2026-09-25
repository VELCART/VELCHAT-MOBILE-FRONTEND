# ADR 0010 — The four §A1 threat-model controls, decided one at a time

- **Status:** Accepted (clipboard, root signal, screen capture) / **Blocked** (Play Integrity)
- **Date:** 2026-09-25
- **Phase:** VC-019 (Jira VC-21), §A1 threat model + backend §D4
- **Deciders:** mobile (security)

## Context

`QA/reports/bugs.json` VC-019 groups four controls under one P2: no `FLAG_SECURE`, no Play
Integrity, no clipboard auto-clear, no root signal. They are grouped because none of them
existed, not because they are one decision — and treating them as one would have produced
exactly the wrong outcome on two of the four. They are decided separately below.

## 1. Screenshot protection (`FLAG_SECURE`) — mechanism shipped, **default OFF**

`android/app/src/main/java/com/velchat/security/ScreenCapturePolicy.kt`, applied from
`MainActivity.onCreate`.

**Not enabled.** This is a product decision, and it belongs to the owner:

- **WhatsApp does not set it globally.** It is applied to a few screens (view-once media, the
  in-app browser) and nowhere else. Users screenshot conversations constantly and expect to.
- **It is enforced against the wrong adversary.** `FLAG_SECURE` blocks the device's own
  screenshot path. It does nothing about a camera pointed at the screen, which is how a
  conversation actually leaks. The screen-recorder case it does cover is already mostly handled
  by the `MediaProjection` consent prompt.
- **It breaks this project's QA loop.** Screenshot-driven testing on the two devices this repo
  is exercised on is how defects get filed; `FLAG_SECURE` also blacks out the recents thumbnail.

It is applied at `onCreate` rather than lazily because the system snapshots a window the moment
it is first drawn — a flag raised later leaves a readable thumbnail behind from the launch that
set it. The `false` branch **clears** the flag rather than doing nothing, so the call is
authoritative and the window always reflects what the file says.

**Turning it on is the owner's call.** Two ways:

- flip `ScreenCapturePolicy.BLOCK_SCREEN_CAPTURE` to `true` for an app-wide block; or
- (what §A1 actually asks for) apply it **per screen** — phone entry, OTP, recovery phrase,
  view-once media — and leave chat alone. That needs a small React Native module so JS can raise
  and lower the flag as those screens mount, and registering a module means editing
  `MainApplication`, which was outside the change that introduced this file.

## 2. Clipboard auto-clear — shipped

`apps/mobile/src/infra/native/clipboard.ts`. The Android clipboard is a single process-wide
buffer with no owner and no expiry: whatever was last copied stays readable by any foregrounded
app until something overwrites it. `copyWithAutoClear` writes, then clears after
`CLIPBOARD_AUTO_CLEAR_MS` (60 s — long enough to switch apps and paste, short enough to be gone
before the phone is put down).

The subtle half is **not** clearing the wrong thing. Between the copy and the timer the user may
have copied something else — a URL, a password out of their manager — and blindly wiping would
destroy data the app never owned, untraceably. So `clipboardClearPlan` is pure and tested, and
the rule is narrow: only clear a clipboard that still holds **exactly** what we put in it.
Anything else, including a trimmed variant, is left alone.

One pending timer exists at a time, module-scoped and replaced on each copy (§M20.3: a screen
that allows repeated copying would otherwise accumulate one live timer per tap, each aimed at a
value no longer on the clipboard). `copyWithAutoClear` returns a disposer for the owning
screen's teardown.

**No new dependency.** `react-native`'s core `Clipboard` is used rather than
`@react-native-clipboard/clipboard`, to keep the §M1 locked stack intact. It is deprecated in
core and logs one warning on first access; when a future React Native release removes it,
swapping in the community module is a two-line change behind this same surface — and gets its
own ADR then.

**Not yet wired to a call site.** Nothing in `src/` currently writes to the clipboard, so there
is no leak today; the helper exists so that the first copy feature uses the clearing path
instead of `Clipboard.setString` directly.

## 3. Root / emulator detection — shipped as a **signal**, never a gate

`apps/mobile/src/infra/native/deviceIntegrity.ts`.

§A1 asks for a "root/jailbreak **soft-signal**", and soft is the whole design. There is no
`blocked` field and no code path that refuses anything:

- Client-side root detection is defeated by the same tooling that does the rooting, so blocking
  stops nobody who matters.
- It would lock out the owner's own handset and every emulator this app is developed and QA'd
  on. **Never brick a rooted device.**
- What it is genuinely worth is **risk context**: an enrollment from a device that self-reports
  as unofficial deserves a different server-side risk score. That decision belongs to the
  backend.

Signals read: the platform's `isEmulator()` heuristic, `Build.TAGS` (`test-keys` → an
AOSP-signed image, the classic custom-ROM tell — *not* proof of root, and not named as if it
were), and `Build.FINGERPRINT` (emulator markers; `:userdebug/` and `:eng/` builds).

**§M19 constrains the output as hard as the logic.** `Build.FINGERPRINT` and `Build.TAGS` name
the vendor, the model and the exact build — together they identify a handset. They are read,
matched and thrown away; only a closed set of lower-case reason codes leaves the module, and a
test asserts that no device-identifying substring can reach them.

The read is defensive for the same reason `secureStore.ts` is: it runs on the way to the login
screen, and an older build, iOS, or a platform that throws must all land on "nothing observed"
rather than taking the launch down.

A stronger check (an `su` binary on PATH, Magisk's package or unix sockets) needs native code,
and a native module needs registering in `MainApplication`. When that lands it becomes another
field on `DeviceIntegritySignals` and the pure assessment absorbs it unchanged.

## 4. Play Integrity — **NOT shipped. Blocked.**

Deliberately not added, not even partly. Play Integrity is not a client library you drop in; it
is a three-part system:

1. **A Google Play Console project** for the application id, with the Integrity API enabled, and
   a cloud project number that the client must be compiled with. This repo has no Play Console
   project — it does not even have a `google-services.json` for `dev`/`stage` (see ADR 0008,
   which makes the Firebase plugin conditional precisely because of that).
2. **A server-side verifier.** The client receives an opaque, encrypted token that is worthless
   until the backend decodes it against Google's API and decides what a given verdict means for
   enrollment. Nothing in `docs/backend-integration-reference.md` exposes such an endpoint —
   and §3 there already lists device approve/revoke REST as not yet exposed.
3. **A policy** for what happens on `MEETS_DEVICE_INTEGRITY` failing, which is a product
   decision with the same "never brick the owner's device" constraint as root detection, plus a
   known false-positive rate on custom ROMs and emulators.

Adding the Gradle dependency and a token request without (1) and (2) would produce a call that
always fails, a dependency that ships in every APK, and a control that looks present in a
security review while verifying nothing. That is worse than the current honest absence.

**To unblock:** a Play Console project + cloud project number, a backend endpoint that accepts
and verifies the token at `/auth` enrol time, and a decision on what a failed verdict does.
Then it is one Gradle dependency (`com.google.android.play:integrity`), one native module, and
an ADR.

## Consequences

- Screenshots still work, including in the recents thumbnail — screenshot-driven QA is
  unaffected. That is deliberate and reversible in one line.
- Clipboard auto-clear is available but unused until a copy feature calls it.
- The device-integrity signal is computed but not yet reported anywhere: wiring it to enrollment
  needs a backend field to put it in.
- Play Integrity remains absent and is reported as blocked rather than half-wired.
- No new dependency in any of the above; `react-native-device-info` was already in the stack.
