# VelChat Frontend — Project Guide (CLAUDE.md)

This is the **VelChat mobile frontend** monorepo (React Native, iOS + Android). It is the WhatsApp-parity + Slack/Teams-parity client for the VelChat backend.

## What this repo is
- **pnpm + Turborepo** workspace. The app lives at [`apps/mobile`](apps/mobile) (React Native **0.86**, bare, TypeScript strict, New Architecture).
- Built **phase-by-phase**: `MBOOT-0` (bootstrap) → `MP0` (foundation) → `MP1…MP10`. See the prompt pack and specs below.

## Source-of-truth documents (read before touching related code)
- **Mobile HLD/LLD** → [`VelChat-Mobile-Frontend-v1.md`](VelChat-Mobile-Frontend-v1.md) — `§M*` HLD, `§L*` LLD, `§F*` flows, `§R*` reliability/budgets, `§C*` roles. **How the client is built.**
- **Phase prompt pack** → [`VelChat-Mobile-ClaudeCode-Prompts.md`](VelChat-Mobile-ClaudeCode-Prompts.md) — `MBOOT-0`, `MP0…MP10`, `MOPS-*`.
- **Backend API contract (real, mapped)** → [`docs/backend-integration-reference.md`](docs/backend-integration-reference.md) — the running backend at `D:\Velchat` (13 services, gateway `:8080`). **When it disagrees with the mobile doc, the running backend wins.**
- **Foundation spec** → [`docs/superpowers/specs/2026-07-11-velchat-mobile-foundation-design.md`](docs/superpowers/specs/2026-07-11-velchat-mobile-foundation-design.md).
- **Design direction (visual)** → [`docs/design-direction.md`](docs/design-direction.md) + mock [`docs/mockups/welcome-onboarding.html`](docs/mockups/welcome-onboarding.html). Clean, light-neumorphic, iOS-modern; bold headings; pill CTAs; avatar motifs; signature violet→pink gradient. **Both light & dark.**
- Backend architecture (for reference) → [`VelChat-Architecture-v2 (2).md`](VelChat-Architecture-v2%20(2).md) (`§B*`, `§G*`, `§A*`, `§D*`).

## Non-negotiables (from §M0)
1. **Worst-device-first.** Reference device = **3 GB RAM Android 10**. All perf/memory/battery budgets (§R4/R5/R6) are against it. Flagships just run cooler.
2. **Offline-first.** UI never waits on the network on the render path.
3. **Local DB (WatermelonDB) is the UI source of truth.** Network mutates the DB; UI observes the DB.
4. **Zero jank on the JS thread.** Crypto/media/list-prep run off-thread (native/JSI/workers).
5. **Everything is measured.** Cold start, scroll FPS, memory, battery — budgets + CI gates.
6. **Locked stack (§M1).** New dependency = an ADR under `docs/adr/`.
7. **Every long-lived resource is owned & disposable** (timer/listener/socket/subscription/worker).
8. **Overnight background contract (§M13):** no background WebSocket; wakes come from push → bounded cursor sync → sleep. Survive an overnight background with no ANR, no wakelock leak, no memory bloat.

## Hard rules (reject a change if it violates these)
- **No AsyncStorage** anywhere (use MMKV / WatermelonDB) — lint-enforced.
- **No `console.log`** in production paths (pino only) — lint-enforced.
- **No plaintext of personal (E2EE) content** in the DB or logs; **no PII in logs** (redaction pipeline).
- **Layer boundaries (§M3/§M4):** UI → Feature → Domain → Infra, never the reverse — `eslint-plugin-boundaries`-enforced.
- **No unbounded caches**; no blocking network on the render path.
- **Native modules:** every one has a typed TS interface in `src/infra/native/` **before** native code (§M23).

## Environment reality (this machine)
- **Windows 11.** Android is built/run/tested here (SDK 34–36, NDK 27, JDK 17, adb). **iOS cannot be built here** — no macOS/Xcode/CocoaPods. iOS code is authored (per §M2 thin platform interfaces) but its build/test is **deferred** to a Mac/CI or the user's future iPhone. Never report iOS as verified.
- Backend runs at `D:\Velchat` → dev base URL `http://localhost:8080`; from the **Android emulator** use `http://10.0.2.2:8080` (WS `ws://10.0.2.2:8080/ws`). Prod is per-service on Render (not single-origin).

## Backend deltas already known (become ADRs at MP1; see backend-integration-reference.md)
1. **No per-request DPoP proof** — only a `cnfJkt` refresh-token thumbprint binding.
2. **No connect-web / proto codegen** — consume REST + WS; vendor `@velchat/shared-types` payload interfaces into `packages/contracts`.
3. **No WS resume token** — reconnect = `{type:'sync',cursor}` + chat `?afterSeq=` backfill.
4. **Signal prekey upload / device approve-revoke REST not yet exposed** — raise with backend before MP1 key-exchange.
5. **Media upload = init→single PUT** (not resumable multipart); resume applies to downloads (storage Range).
6. Response envelope everywhere: `{ success, statusCode, message, data, requestId }` → the Axios layer unwraps `data`.

## Working agreement
- Follow the phase prompts in order; run `MOPS-3` phase-exit audit before advancing; each phase gets its own spec.
- Use the specialized subagents in [`.claude/agents/`](.claude/agents) for role-specific work.
- TDD for feature/bugfix code (test encodes a doc contract; fix the impl, not the test).
- Claim "done" only for what is actually observed (Android here; iOS deferred).

## Commands
- Install: `pnpm install` (root). Network here is flaky — `.npmrc` uses serialized fetch + long timeouts.
- Android: `pnpm android` · Start Metro: `pnpm start` · Tests: `pnpm test` · Lint: `pnpm lint` · Types: `pnpm typecheck`.
