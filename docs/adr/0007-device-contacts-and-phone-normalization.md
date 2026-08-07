# ADR 0007 — Device contacts + phone normalization for private discovery

- **Status:** Accepted
- **Date:** 2026-08-02
- **Phase:** Contact discovery increment (§G2 / §F2)
- **Deciders:** mobile

## Context

New Chat must work the WhatsApp way: read the user's own phone address book and show which
of those people are on VelChat (tap → DM) versus not (invite). The private-discovery pipeline
already exists (`domain/discovery` — RSA blind-signature OPRF, bit-exact to the backend) and
takes **E.164** numbers as input. Two capabilities were missing on the client:

1. **Read the device address book** (names + phone numbers), behind a contextual runtime
   permission (`READ_CONTACTS`, already declared in the manifest).
2. **Normalize** every human-entered number (`0 98…`, `(202) 555…`, `00…`, spaces/dashes) to
   canonical E.164, using the user's own number to supply the default region for local-format
   entries — the OPRF match is byte-exact, so `+9198…` and `09 8…` must collapse to one token.

Both are new runtime dependencies, so per §M1 (locked stack) they need an ADR.

## Decision

Add two dependencies to `apps/mobile`:

- **`react-native-contacts` (^8)** — read the address book. Chosen over `expo-contacts`
  because this is a bare React Native app (no Expo runtime). It ships TypeScript types.
  Wrapped behind a thin typed module `infra/native/deviceContacts.ts` (§M23) so features never
  import the third-party module directly, and so an un-linked build (JS installed, native not
  yet rebuilt) degrades to a typed `unavailable` state instead of crashing.
- **`libphonenumber-js` (^1)** — E.164 normalization. Pure JS (no native, no rebuild),
  Google's libphonenumber metadata. Wrapped in `infra/util/phone.ts` (`toE164`,
  `regionFromE164`), pure + unit-tested. Chosen over a hand-rolled parser (E.164 rules per
  region are famously error-prone) and over the full `google-libphonenumber` (heavier, needs
  Closure).

## Consequences

- **Native rebuild required** for `react-native-contacts` (autolinked). Android is rebuilt
  here (`pnpm android`); iOS is authored but its build stays deferred (§M2) and will need an
  `NSContactsUsageDescription` Info.plist string before it runs on device.
- **Bundle:** `libphonenumber-js` adds ~130 KB (min) of metadata; acceptable and lazy on the
  discovery path. `react-native-contacts` is native, negligible JS.
- **Privacy (§M19):** numbers are normalized **on device**; only blinded OPRF tokens leave it.
  The wrapper never logs a name or number — only counts.
- **Perf (§M0.4):** the OPRF blinding math is on the JS thread; discovery is capped
  (`MAX_DISCOVERY = 2000`) and off the render path. Moving the BigInt math to a worker is a
  documented follow-up in `domain/discovery`.

## Alternatives considered

- **`expo-contacts`** — cleaner API but pulls the Expo modules core into a bare app; rejected.
- **Backend-side directory list** (`/users/:id/contacts`) — already exists and stays for the
  server-curated contact list, but it is NOT the phone address book, so it can't answer
  "who in my phone is on VelChat". Kept as a separate surface.
