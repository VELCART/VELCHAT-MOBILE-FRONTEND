# VelChat Mobile — Foundation Sub-Project Design (MBOOT-0 + MP0)

- **Date:** 2026-07-11
- **Status:** Draft for user review
- **Author:** Claude (with aj@decodeup.email)
- **Scope of this spec:** ONLY the foundation sub-project — `MBOOT-0` (monorepo + app bootstrap) followed by `MP0` (platform + observability foundation, no product features). Later phases (`MP1…MP10`) are out of scope here and each gets its own spec → plan → build cycle.

> This spec is the **execution record** for the first slice. It does **not** re-derive the architecture — the architecture is frozen in the three source docs and is referenced by section:
> - `VelChat-Mobile-Frontend-v1.md` → `§M*` (HLD), `§L*` (LLD), `§F*` (flows), `§R*` (reliability/budgets), `§C*` (roles).
> - `VelChat-Mobile-ClaudeCode-Prompts.md` → phase prompts (`MBOOT-0`, `MP0…MP10`).
> - `VelChat-Architecture-v2 (2).md` → backend `§B*`, flows `C*`, `§G*`, `§A*`, `§D*`.

---

## 1. Context & goal

Build the mobile client for VelChat — a WhatsApp-parity + Slack/Teams-parity, offline-first, E2EE chat app — at production quality, on the **worst-device-first** mandate (3 GB Android 10 reference device, `§M0`).

The backend already exists and is real: a pnpm + Turborepo monorepo at `D:\Velchat` with 13 microservices behind an **api-gateway on `http://localhost:8080`**, a Postman collection (API contract), and reusable `libs/proto` + `libs/shared-types`. The mobile app will be built against this exact backend from `MP1` onward.

**Goal of the foundation sub-project:** stand up an industry-grade, measurable, layered React Native codebase that a real Android build launches from, with every architectural guardrail (layer boundaries, strict TS, observability, budgets) in place **before** any product feature is written — so all later phases inherit correctness by construction.

## 2. Environment & platform reality (the honest constraints)

| Fact | Consequence for this sub-project |
|---|---|
| Host is **Windows 11** | iOS **cannot be built, run, or tested here** — no macOS/Xcode/CocoaPods. |
| Android toolchain present (`JDK 17`, Android SDK `D:\Android\sdk`, `adb`, Node 22, pnpm 11) | Android is built, run, and **verified for real** in every checkpoint. |
| User decision: **both platforms' code** | iOS native scaffold + all iOS code is authored per `§M2` (thin, typed platform interfaces), but its build/test is **deferred** to the user's future iPhone or a Mac/CI runner. |
| Backend lives at `D:\Velchat`, gateway `http://localhost:8080` (CONFIRMED) | Dev env flavor points at the gateway. From the **Android emulator**, `localhost` = host is `http://10.0.2.2:8080` (WS `ws://10.0.2.2:8080/ws`); from a physical device, the LAN IP. `MBOOT-0`/`MP0` do **not** call the API (network/realtime clients are deferred/stubbed), so a running backend is **not required** for this sub-project. |

> **The backend has been fully mapped** — see [`docs/backend-integration-reference.md`](../../backend-integration-reference.md) for the citation-backed REST/WS contract, run steps, and (critically) the **6 deviations** where the running backend differs from `VelChat-Mobile-Frontend-v1.md` (no per-request DPoP proof — only `cnfJkt`; no connect-web/proto codegen; no WS resume token; Signal-prekey REST not yet exposed; media upload is init→single-PUT not resumable-multipart; prod is per-service not single-origin). Those become ADRs at `MP1` and do **not** affect this foundation sub-project — but the network client we scaffold (dormant) will unwrap the `{ success, statusCode, message, data, requestId }` response envelope.
| No git repo yet in `D:\Velchat-Frontend` | `MBOOT-0` initializes it. This spec is committed as the first artifact. |

**Verification policy:** "Done" is only claimed for what is actually observed. Android = observed here. iOS = "authored, build/test deferred" — never reported as verified.

## 3. Locked stack (`§M1`) + version-pinning strategy

The stack is **locked by `§M1`**; no substitutions without an ADR (`§L1.6`). Key choices carried in verbatim: React Native **bare** (not Expo Go), TypeScript strict, Zustand + TanStack Query v5, WatermelonDB + MMKV (**AsyncStorage forbidden**), React Navigation v6+ native-stack, Axios, react-native-webrtc + LiveKit RN, libsignal-client, react-native-keychain, notifee + @react-native-firebase/messaging, react-native-voip-push-notification, react-native-callkeep, react-native-video, react-native-blob-util, @shopify/flash-list, react-native-reanimated v3, react-native-gesture-handler, i18next + react-i18next, pino, Detox, Reassure, Flashlight; pnpm + Turborepo.

**Pinning strategy (a deliberate deviation in *mechanics*, not in *choices*):** the exact React Native version and the native-module version matrix are **pinned at scaffold time by resolving peer compatibility**, not guessed in this spec. Rationale: the app carries an unusually heavy native-module set (WatermelonDB, libsignal, webrtc, callkeep, notifee, reanimated) whose compatibility with a given RN version is the single biggest scaffold risk. We target the **latest stable RN with the New Architecture (Fabric/TurboModules/JSI) enabled**, then pin every native lib to a version proven compatible with it, and record the resolved matrix in `apps/mobile/docs/stack-matrix.md`. New Architecture satisfies the doc's "off-JS-thread / JSI" mandates (`§M0.5`, `§M15`).

TS config (locked, `MBOOT-0`): `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`.

## 4. Repo & monorepo layout

`D:\Velchat-Frontend` becomes a **frontend-only** pnpm + Turborepo workspace (mirrors the backend's tooling, no backend code):

```
Velchat-Frontend/
├── apps/
│   └── mobile/                 # the RN app (android/, ios/, src/, e2e/, perf/, scripts/)
├── packages/                   # (future) shared FE packages — e.g. packages/contracts (vendored @velchat/shared-types event payloads + hand-written REST types)
├── docs/                       # this spec + architecture docs live here
├── .claude/agents/             # mobile role subagents (§C1–§C7)
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── tsconfig.base.json
```

`apps/mobile/src/` follows the **exact `§M4` tree**: `app/ core/ platform/ design-system/ i18n/ theme/ navigation/ infra/{network,realtime,db,kv,fs,push,background,crypto,native} domain/{entities,use-cases,ports,sync,state-machines,errors} features/* ui/ tests/`.

**Known risk — pnpm + RN + Metro:** RN inside a pnpm monorepo needs deliberate config (Metro `watchFolders`, `node-linker`/hoisting, symlink handling). This is a known, solvable industry setup and is treated as a first-class task in `MBOOT-0`, validated by the app actually building.

## 5. MBOOT-0 deliverables (the immediate checkpoint)

1. **Workspace scaffold** — pnpm-workspace + Turborepo + root TS base config; git init; `.gitignore`.
2. **RN bare app** at `apps/mobile` (TS strict, New Architecture on), with `android/` (Gradle 8, Kotlin, target SDK 34, min SDK 24) and `ios/` (Xcode project authored, not built here).
3. **`§M4` folder tree** created with `index.ts` barrels and layer placeholders.
4. **Boundary enforcement** — eslint `@typescript-eslint` strict + `eslint-plugin-boundaries` encoding the `§M4` import rules; a sample violation fails lint.
5. **Guard lint rules** — no `AsyncStorage` anywhere; no `console.log` in production paths (pino only).
6. **Native-module discipline** — convention + lint that every native module has a typed TS interface in `infra/native/` before native code (`§M23`).
7. **`react-native-config` flavors** — dev/stage/prod, distinct bundle IDs; dev → backend gateway (`http://10.0.2.2:8080` on Android emulator).
8. **`.claude/agents/*.md`** — mobile roles per `§C1–§C7` (staff, perf, offline-sync, media, native, security, qa).
9. **Root `CLAUDE.md`** — mobile section: reference device = 3 GB Android 10; worst-device-first; local DB = UI source of truth; overnight background contract (`§M13`).
10. **CI (GitHub Actions)** — lint, typecheck, jest, RTL, boundary-lint gate, bundle-size gate (≤ 6 MB JS / ≤ 45 MB arm64 APK base), Reassure baseline job. iOS matrix jobs are **authored but gated** (run on a Mac runner when available); Android jobs are the ones validated now.
11. **Perf harness** — Reassure config + baseline; Flashlight config targeting the Android ref-device profile (runs against whatever Android emulator/device is attached).
12. **Fastlane skeletons** — iOS + Android beta lanes (no secrets committed). iOS lanes authored, not executed here.

**MBOOT-0 Definition of Done (Windows-adapted):**
- ✅ `pnpm i` clean; `pnpm --filter mobile android` **launches a blank splash on an Android emulator/device** (observed).
- ✅ `pnpm --filter mobile test` green; boundary lint passes; a deliberate boundary violation fails CI; bundle-size gate passes; Reassure baseline recorded.
- ⛔→deferred: `pnpm --filter mobile ios` launching an iOS simulator (Mac/CI only) — scaffold authored, marked deferred.

→ **CHECKPOINT: user reviews the running Android app + scaffold before MP0 begins.**

## 6. MP0 deliverables (after checkpoint approval)

Per the `MP0` prompt + `§M0–§M11`, `§M16–§M18`, `§M22`, `§L2`, `§L15`, `§M23`:

1. **Providers** (`§L2`, `src/app/App.tsx`): SafeAreaProvider → ErrorBoundary → QueryClientProvider → ThemeProvider → I18nProvider → NavigationContainer → GlobalOverlays.
2. **Bootstrap sequence** (`§L2`, ordered, non-blocking on render): pino init + PII-redaction pipeline; MMKV (encrypted, key derived via Keychain/Keystore); WatermelonDB open + migrations (v0 empty schema); crypto init **stub**; NetworkClient constructed (no calls); RealtimeClient constructed (deferred connect); background workers **scheduled but idle**.
3. **Design system** (`§M16`): tokens (spacing/typography/elevation/motion/color) + primitives `<Text> <Pressable> <Icon> <Screen> <Row> <Column> <Card> <Divider> <Avatar> <Badge>`.
4. **Theme + i18n** (`§M18`): light/dark/system; i18n scaffold with `en` + one RTL placeholder (`ar`), ICU format, runtime switch.
5. **Navigation shell** (`§M17`): RootStack = AuthStack + AppTabs **skeletons**; native-stack; deep-link scheme registered.
6. **Observability** (`§M22`): pino structured logs w/ PII redaction; OTel RN SDK (trace/span on network + WS + state transitions — wired, dormant until features exist); GlitchTip crash SDK + CI source-map upload; Reassure baseline (App boot, ChatList empty shell); Flashlight cold-start measurement on the Android ref profile.
7. **Feature flags + kill-switch** (`§L15`): loaded at boot, MMKV-cached, `min_client_version` enforced.
8. **Native wrappers** (`§M23`): battery-info + network-info modules — thin typed TS interface + Android impl now; iOS impl authored, deferred.

**MP0 Definition of Done (`§R7`, Windows-adapted):** types clean; boundary lint clean; Reassure baseline green; Flashlight **cold-start ≤ 2.0 s** on the attached Android device/emulator (best-effort vs the 3 GB target — flagged if hardware differs); GlitchTip receiving a test error; source-maps uploaded in CI; **no PII in logs** (redaction test); no blocking network on render path; every timer/listener/subscription has an owner + disposal. iOS-specific bullets marked deferred.

## 7. Cross-cutting invariants enforced from day one

- **Layer dependency rule** (`§M3`): UI → Feature → Domain → Infra, never reverse — enforced by lint, not convention.
- **Local DB = UI source of truth** (`§M0.4`, `§M6`): scaffolded even though no data exists yet.
- **Everything measured** (`§M0.6`): budgets wired into CI from the first commit.
- **Owned & disposable resources** (`§M0.3`, `§M20.3`): the disposal pattern is established in the bootstrap layer so features copy it.

## 8. Testing strategy (foundation)

- **Unit/component (Jest + @testing-library/react-native):** design-system primitives; theme switching; log-redaction (token/phone/message-content stripped); feature-flag loader + min-version gate.
- **Boundary test:** a sample cross-layer import fails CI.
- **Perf (Reassure):** App boot render + ChatList empty-shell render baselines.
- **Device (Flashlight):** cold-start measurement on the attached Android device/emulator.
- **E2E (Detox):** smoke — app launches to the shell (Android; iOS deferred).

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| pnpm + RN + Metro symlink/hoisting breakage | First-class `MBOOT-0` task; success = app actually builds; documented Metro/pnpm config. |
| Native-module version incompatibility with chosen RN | Resolve peer matrix at scaffold time; pin + record in `stack-matrix.md`; add libs incrementally, building after each. |
| iOS drift (code never compiled here) | Keep OS differences behind `platform/*.ts`; author iOS impls; explicit "deferred" status; CI iOS jobs ready for a Mac runner. |
| Flashlight budget on non-ref hardware | Measure on the attached Android device; report device profile; treat ≤ 2.0 s as target, flag deviation rather than fake a pass. |
| Backend connectivity from emulator | Dev flavor uses `10.0.2.2:8080`; documented; not exercised until `MP1`. |
| Heavy native deps slow Windows Android builds | Accept slower first build; use Turbo/Gradle caching; keep debug builds for the dev loop. |

## 10. Non-goals (explicitly out of scope for this sub-project)

No auth, no chat, no realtime traffic, no media, no calls, no product screens beyond empty skeletons. No backend calls. No iOS build. Those arrive in `MP1+`, each with its own spec.

## 11. Sequencing

1. `MBOOT-0` → Android blank app launches (verified) → **checkpoint / user review**.
2. On approval → `MP0` foundation → `§R7` gates (Android-verified, iOS deferred) → checkpoint.
3. Then `MOPS-3` phase-exit audit, tag, and proceed to `MP1` under a fresh spec.
