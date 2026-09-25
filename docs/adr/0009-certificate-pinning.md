# ADR 0009 — Certificate pinning via the Android network security config, shipped with no pins

- **Status:** Accepted (mechanism) / **Blocked on the owner** (the pins themselves)
- **Date:** 2026-09-25
- **Phase:** VC-018 (Jira VC-20), §A1 threat model + backend §D4
- **Deciders:** mobile (security)

## Context

`QA/reports/bugs.json` VC-018: there was no pinning anywhere — no TrustKit, no OkHttp
`CertificatePinner`, and `android/app/src/main/res/xml/` did not exist. §A1/§D4 require pinning
with a stapled fallback.

The exposure is narrower than "any MITM": apps targeting API ≥ 24 already exclude user-added CAs
from the default trust anchors, so a casual proxy on the device is refused without any work from
us. What is left is a **compromised or rogue system CA**, against which ordinary TLS validation
is no help at all — and the traffic it would read is auth tokens, OTPs and phone numbers.

Two properties of this codebase shaped the decision:

1. **Not all TLS goes through React Native's OkHttp client.** `push/PushAckClient.kt` sends the
   delivery receipt over a raw `HttpURLConnection` from a `FirebaseMessagingService`, with the
   app killed and no React context alive. An `OkHttpClientFactory` installed into React Native's
   networking module never sees that socket. VC-018 itself notes the ack path "would need it
   separately".
2. **Production has been moving.** `docs/backend-integration-reference.md` §3 still says prod is
   per-service on Render and flags the ingress strategy as unconfirmed; `.env.prod` — newer, and
   citing `D:\Velchat\docs\RUNBOOK.md §0b` — says prod is a single Azure origin behind Caddy.
   `.env.stage` says in its own comments that both its hosts are placeholders.

## Decision

### 1. The mechanism is the platform network security config, not an OkHttp `CertificatePinner`

`android/app/src/main/res/xml/network_security_config.xml`, referenced from
`AndroidManifest.xml`. The platform applies it to **every** TLS socket in the process, so it
covers the JS `fetch`/axios path, the WebSocket and `PushAckClient`'s `HttpURLConnection` with
one declaration and no code on any request path. A `CertificatePinner` would cover the first of
those three and would have to be installed from `MainApplication` before the first request —
more code, more ordering risk, less coverage. iOS gets its own equivalent when that build is
possible on a Mac; nothing here is verified on iOS.

### 2. **No pin is shipped. Every `<pin-set>` is present and empty.**

This is the load-bearing part of the ADR. An empty pin-set is not enforced by the platform
(`NetworkSecurityTrustManager` returns early when the set is empty), so the app today behaves as
it did before the file existed. That is the intended state, because:

- A pin can only be computed from the **live certificate**. Nothing in this repo contains one.
- A wrong pin is **not recoverable by a server change**. The client aborts the handshake before
  it speaks to us, so every install carrying that pin is permanently unable to connect and can
  only be fixed by an app-store update that those users may never take.

A working mechanism with no pins is a good outcome. A guessed pin is a catastrophe. The
standing rule — never guess a production hostname or bake a guessed pin into a shipping app —
is honoured literally here.

### 3. Hosts are established from the repo, and listed exactly

Taken only from the flavor env files, never invented. Each gets its own `<domain-config>` with
`includeSubdomains="false"`:

| Flavor | Host | Source | Confidence |
| --- | --- | --- | --- |
| prod | `velchat.duckdns.org` (REST + WS) | `.env.prod` | High — file cites RUNBOOK §0b; contradicts the older integration reference |
| dev | `velchat-edge-gateway-2aje.onrender.com` | `.env.dev` | High |
| dev | `velchat-realtime-service-2aje.onrender.com` | `.env.dev` | High — WS bypasses the gateway on purpose |
| stage | `velchat-api-gateway.onrender.com` | `.env.stage` | **Low — the file calls it a placeholder** |
| stage | `velchat-realtime-gateway.onrender.com` | `.env.stage` | **Low — placeholder** |

Matching is exact. `includeSubdomains` is deliberately not used: a parent entry makes a
subdomain *look* covered, and removing that attribute later silently unpins it.

### 4. Backup pin + expiry are mandatory, and enforced by a test

Two rules, both asserted in `apps/mobile/src/infra/native/__tests__/transportSecurity.test.ts`
against the real XML and the real `.env.*` files:

- **Never one pin.** At least two: the key in use plus a backup whose private key is held
  offline and not yet deployed (or the issuing CA's key). One pin plus one routine rotation is
  how an app bricks itself.
- **Always an `expiration`.** Past that date the platform stops enforcing pins rather than
  failing every connection. It is the only fail-open valve available and the last thing between
  a forgotten rotation and a dead install base. 6–12 months, and always inside the window in
  which updates will still be shipped.

The same test also asserts that every env host has a `<domain-config>` (a missing host is
silently unpinned, which is indistinguishable at runtime from a correctly pinned one) and that
no backend host is reachable over cleartext.

### 5. Cleartext policy is restated, because the manifest attribute stops being read

Once a network security config exists, `android:usesCleartextTraffic` is **ignored** on every
API level this app supports (minSdk 24). The base config therefore denies cleartext, and one
`<domain-config>` re-permits it for `localhost`, `127.0.0.1`, `10.0.2.2` and `10.0.3.2` — Metro
and a locally-run backend, which `pnpm android` / `pnpm reverse` reach over plain http.

That block is not limited to debug builds, because cleartext rules cannot live in
`<debug-overrides>` and a per-buildType config would need `src/debug/res/xml/`. What it leaves
in a release APK is cleartext to loopback and to the emulator's host alias — not reachable from
a network, and still strictly narrower than the `usesCleartextTraffic=true` debug builds
carried before. **If Metro is ever run over a LAN address, that IP must be added or the bundle
will not load.**

### 6. Debuggable builds additionally trust user CAs

`<debug-overrides>` adds user-installed anchors when `android:debuggable` is true, and per the
platform's rules those anchors also override pins. No shipped APK is affected. This is what
makes the control testable: proxy a debug build to watch traffic, then prove a release build
refuses the same proxy once pins are real.

## What the owner must supply before anything is pinned

1. **Decide what is pinned for prod.** `velchat.duckdns.org` is served by Caddy with Let's
   Encrypt, which generates a **fresh key on every renewal** by default. Pinning that leaf means
   a dead app roughly every 60 days. Either pin the issuing CA's SPKI, or have the VM owner
   commit to a fixed key (Caddy `key_type` plus a reused key) and publish a backup key. This is
   a backend/infrastructure commitment, not a client choice.
2. **Confirm the stage hosts**, which `.env.stage` itself marks as placeholders.
3. **Reconcile prod topology** — `.env.prod` (single Azure origin) vs
   `backend-integration-reference.md` §3 (per-service Render). If the latter is still true for
   any environment, each service host needs its own entry.
4. **Produce the pins**, once per certificate to accept:

   ```
   openssl s_client -servername <host> -connect <host>:443 -showcerts </dev/null \
     | openssl x509 -pubkey -noout \
     | openssl pkey -pubin -outform der \
     | openssl dgst -sha256 -binary | openssl enc -base64
   ```

   Paste into the matching `<pin-set>` in `network_security_config.xml`, add the `expiration`,
   and update the "ships NO pins yet" expectation in `transportSecurity.test.ts` — which is
   deliberately a tripwire, so that the single most dangerous edit in this repo cannot land on a
   green board unnoticed.

## Consequences

- **Today:** no behaviour change beyond the cleartext narrowing. Pinning is wired and idle.
- **`PushAckClient` is covered for free** when pins land — no change to `push/**`.
- Adding a backend host to any `.env` without adding a `<domain-config>` fails the test suite.
- The `<pin-set>` ↔ `.env` relationship is checked by a test that reads both files directly, so
  there is no TypeScript mirror of the config to drift.
- **iOS is untouched and unverified** (no macOS/Xcode here, §M2). It needs its own pinning when
  that build exists.
- No new dependency. Zero bundle cost: the TS helpers are imported only by their test.
