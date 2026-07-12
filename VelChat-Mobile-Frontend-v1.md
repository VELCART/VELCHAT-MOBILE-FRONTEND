# VleChat Mobile Frontend — Production HLD + LLD v1.0

> **Scope:** React Native mobile app (iOS + Android) — the WhatsApp-parity + Teams/Slack-parity client.
> **Companion to:** `NexusChat-Architecture-v2.md` (backend). Section refs like `§B4` refer to the backend doc; refs like `§M4` refer to sections of this document.
> **Non-goal:** feature scope changes — features are frozen by the backend doc; this doc is *how* the client implements them at production quality.
> **Target device profile (the "worst device first" mandate):** 3 GB RAM Android (Android 10), quad-core low-end SoC, eMMC storage, 2G/3G/spotty Wi-Fi, Battery Saver ON, background restrictions ON. **Whatever runs well here, runs great on flagships.**

---

## Table of Contents

**PART M — HIGH LEVEL DESIGN (Mobile)**
- M0. Design philosophy & worst-device engineering
- M1. Tech stack & tooling constraints (locked)
- M2. Cross-platform architecture (iOS + Android, RN + native bridges)
- M3. Layered architecture (UI / Feature / Domain / Infra)
- M4. Module & folder structure
- M5. State architecture (7 kinds of state, strict separation)
- M6. Data flow architecture (single source of truth = local DB)
- M7. Networking engine (Axios + interceptors)
- M8. Realtime engine (WebSocket)
- M9. Offline-first architecture (mandatory)
- M10. Local persistence architecture (WatermelonDB + MMKV)
- M11. Sync engine (server ↔ device)
- M12. **Media & storage architecture** (the 7 missing items + full lifecycle)
- M13. Background execution architecture (iOS + Android)
- M14. Push notifications
- M15. E2EE integration on-device
- M16. Design system & theming
- M17. Navigation architecture
- M18. Accessibility & localization (i18n + RTL)
- M19. Security architecture
- M20. Performance & memory engineering
- M21. Battery & network efficiency
- M22. Observability, logging, crash reporting
- M23. Native modules (iOS + Android)
- M24. Build & release engineering

**PART L — LOW LEVEL DESIGN**
- L1. Conventions (naming, folders, IDs, times)
- L2. UI kernel (App, providers, error boundaries)
- L3. Networking client (Axios interceptors)
- L4. Realtime client (WS state machine)
- L5. Local DB schemas (WatermelonDB)
- L6. Sync engine (cursors, outbox, reconciliation)
- L7. Chat runtime (message send, receive, receipts)
- L8. **Media pipeline & storage manager** (LRU, background cleanup, Manage Storage, re-download)
- L9. Calls runtime (WebRTC glue)
- L10. Status/Stories runtime
- L11. Translation runtime (on-device for E2EE)
- L12. Notifications runtime (FCM/APNs/VoIP)
- L13. Background workers (WorkManager / BGTaskScheduler / headless JS)
- L14. Crypto keystore
- L15. Feature flags, config, remote kill-switch
- L16. Error boundaries, retry & recovery
- L17. Analytics events (privacy-preserving)

**PART F — Screens & flows**
- F1. Auth screens (DAPT + Reverse-OTP UX)
- F2. Chat list + chat screen (offline-first)
- F3. Groups & channels
- F4. Status/Stories
- F5. Calls (1:1, group, meeting, huddle)
- F6. Media viewer + Manage Storage
- F7. Settings, privacy, devices
- F8. Search
- F9. Notifications & DND

**PART R — Reliability & Testing**
- R1. State machines catalog
- R2. Failure scenarios & recovery
- R3. Test strategy (unit / integration / component / E2E / perf / memory / battery / a11y)
- R4. Performance budgets (per screen, per action)
- R5. Memory budgets
- R6. Battery budgets
- R7. Definition of Done (mobile)

**PART C — Claude Code build roles & phased delivery** (mobile track)

**PART A — Appendices**
- A1. Threat model (mobile-specific)
- A2. Native module catalog
- A3. Traceability (feature → module → screen → test)
- A4. Changelog

---

# PART M — HIGH LEVEL DESIGN (MOBILE)

## M0. Design Philosophy & Worst-Device Engineering

### M0.1 Non-negotiables (adopted from operating directive)
1. **Optimize for engineering excellence, not speed of implementation.** Every decision has a written justification + trade-off.
2. **Worst device first.** All perf/memory/battery budgets in this doc are against the 3 GB Android reference device, not the flagship. Flagships get the same code and just run cooler.
3. **Offline-first is mandatory.** Every feature works offline where physically possible; UI never *waits* for the network on the render path.
4. **Local DB is the source of truth for the UI.** The UI reads from local WatermelonDB; the network merely mutates the DB. This removes 90% of loading spinners.
5. **Zero jank on the JS thread.** Heavy work (crypto, media processing, list virtualization prep) runs off-thread (workers, native modules, JSI).
6. **Everything is measured.** Cold start, warm start, list scroll FPS, memory peaks, battery drain — all have budgets in §R4/R5/R6 and CI checks.
7. **No hidden dependencies.** Locked stack (§M1). New library = ADR.
8. **Every feature has an owner state machine** (§R1). No implicit "loading → maybe error → hope for the best" flows.

### M0.2 Worst-device targets (concrete)
| Metric | Target on 3 GB Android | Enforcement |
|--------|------------------------|-------------|
| Cold start (splash → chat list interactive) | ≤ 2.0 s | perf test in CI (Flashlight/Reassure) |
| Warm start | ≤ 700 ms | perf test |
| Chat screen open (from list, cached) | ≤ 250 ms first paint, ≤ 400 ms interactive | perf test |
| List scroll (chat list, chat screen) | ≥ 55 FPS avg, 0 dropped frames > 32 ms in a 10 s scroll | FPS meter test |
| JS bundle size (JS only, post-minify) | ≤ 6 MB | bundle-size CI gate |
| APK size (arm64) | ≤ 45 MB base | size CI gate |
| Peak RSS during chat use | ≤ 220 MB | memory budget test |
| Background RSS after 1 hr idle | ≤ 90 MB | memory soak test |
| Battery drain (1 hr foreground chat) | ≤ 4% on ref device | manual + Firebase perf |
| Battery drain (8 hr background) | ≤ 3% | overnight soak |
| Local DB read (last 30 msgs of a chat) | ≤ 30 ms | DB micro-benchmark |

### M0.3 The "raat bhar background me chhod du" contract
- App must **survive an overnight background** with **no ANR, no wakelock leak, no memory bloat, no dead socket loop**.
- Long-lived resources must be **owned and disposable** — every timer, listener, socket, subscription, worker has a well-defined owner and disposal.
- **Background socket policy:** the app does **not** keep a WebSocket alive in background on either OS. Background wakes come from **push (APNs/FCM)** → on wake, quick sync via cursor → sleep. This is the only battery-safe pattern; anything else drains overnight. (§M13 for details.)
- **Wake budget:** at most ~1 wake/hr for silent maintenance (WorkManager/BGTaskScheduler), coalesced with system windows.

---

## M1. Tech Stack & Tooling Constraints (LOCKED)

Locked. No substitution without an ADR (§L1.6).

| Concern | Choice | Why (in 1 line) |
|---------|--------|-----------------|
| Framework | **React Native** (bare, not Expo Go) | Native modules required (CallKit, ConnectionService, VoIP push, secure enclave, native WebRTC) |
| Language | **TypeScript, strict** (`strict: true`, `noImplicitAny`, `noUncheckedIndexedAccess`) | Non-negotiable per operating directive |
| Client state | **Zustand** (fine-grained slices + selectors) | Small, no boilerplate, no context-hell |
| Server state | **TanStack Query** (React Query v5) | Cache/dedupe/retry/mutations, plays with offline |
| Local DB | **WatermelonDB** (reactive, lazy, indexed) | Scales to 100k+ messages, observes via RxJS, off-thread reads |
| Small KV | **MMKV** | Sync, fast, encrypted; settings, tokens, feature flags |
| Navigation | **React Navigation v6+** (native-stack) | Native perf, deep links, well-supported |
| HTTP | **Axios** with custom interceptors (auth refresh, DPoP, retry, dedupe) | Interceptor ergonomics + cancellation |
| RPC (typed) | **connect-web** or generated TS from proto (buf) | Backend contract source of truth |
| WebSocket | **native `WebSocket`** wrapped in a state-machine (xstate-lite / custom) | Zero deps, works on both OS reliably |
| Realtime lib (calls) | **react-native-webrtc** (LiveKit RN SDK on top) | Only OSS mature option; matches backend §A17 |
| Media | **react-native-image-picker**, **react-native-video** (HLS), **react-native-blob-util** (streaming download), **ffmpeg-kit** (client transcode when needed) | All OSS |
| Crypto | **libsignal-client** (RN binding) | Signal protocol §B6 |
| Secure storage | **react-native-keychain** (iOS Keychain, Android Keystore) | Non-exportable keys where hardware allows |
| Background | **WorkManager** (Android, via bridge), **BGTaskScheduler** (iOS, via bridge), **react-native-background-fetch** for cross-platform coalescing | OS-native + one abstraction |
| Push | **@react-native-firebase/messaging** (FCM), **@react-native-community/push-notification-ios** or **notifee** (APNs/local) | Standard |
| VoIP push | **react-native-voip-push-notification** (iOS PushKit) + FCM high-priority (Android) | Wakes app for incoming call |
| Call UI | **react-native-callkeep** (CallKit/ConnectionService abstraction) | System-native incoming call UI |
| i18n | **i18next** + **react-i18next**, ICU messages | Rich pluralization, RTL, dynamic switch |
| Lists | **@shopify/flash-list** (v2) | Recycler-based, huge win over FlatList on low-end |
| Animations | **react-native-reanimated** v3 (worklets on UI thread) | 60 FPS off JS thread |
| Gestures | **react-native-gesture-handler** | Native-driven gestures |
| Testing | **Jest** (unit), **@testing-library/react-native** (component), **Detox** (E2E), **Reassure** (perf regression), **Flashlight** (device perf metrics) | Standard mobile stack |
| Logging | **pino** (structured) + native crash (Sentry-compatible OSS: **GlitchTip** or self-hosted Sentry) | Aligns with backend §A20 |
| Feature flags | **local config + remote kill-switch** (fetched at boot via TanStack Query, cached in MMKV) | Simple, offline-safe |
| Package manager | **pnpm** (monorepo) + **Turborepo** | Aligns with backend §D3 |

**Explicitly forbidden without ADR:** Redux (rationale: Zustand is sufficient and lighter), AsyncStorage (rationale: unencrypted, slow, string-only; use MMKV/WatermelonDB), unbounded caches (rationale: memory), any library that adds > 100 KB to the bundle without an ADR, any paid SaaS.

---

## M2. Cross-Platform Architecture (iOS + Android)

```text
                     ┌────────────────────────────────────────┐
                     │      JavaScript layer (RN + TS)        │
                     │  UI · features · state · sync engine   │
                     └───────────────┬────────────────────────┘
                          JSI / bridge (typed native modules)
                     ┌───────────────┴────────────────────────┐
                     │        Native modules (per OS)         │
                     │  Keychain/Keystore · CallKit/           │
                     │  ConnectionService · WebRTC · BG task · │
                     │  Push (APNs/FCM/VoIP) · MediaStore /    │
                     │  Photos · file system · biometric ·     │
                     │  battery/network info · attestation     │
                     └───────────────┬────────────────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │             iOS                  │           Android
                    │  Objective-C++/Swift             │   Kotlin
                    │  Keychain · APNs · PushKit ·     │   Keystore · FCM · VoIP high-prio ·
                    │  BGTaskScheduler · CallKit ·     │   WorkManager · ConnectionService ·
                    │  Photos · AVFoundation ·         │   MediaStore · ExoPlayer ·
                    │  DeviceCheck/AppAttest           │   Play Integrity
                    └──────────────────────────────────┘
```

**Rule:** all OS differences live behind a **thin, typed TS interface** (`platform.ts`). No `Platform.OS === 'ios'` checks scattered in feature code; they live inside the platform module. This keeps 95% of code cross-platform.

## M3. Layered Architecture

```text
┌──────────────────────────── UI LAYER ────────────────────────────┐
│  Screens · Components · Design system · Themes · a11y · i18n     │
└────────────────────┬─────────────────────────────────────────────┘
                     │ props / view-models (selectors from state)
┌────────────────────┴─────────────────────────────────────────────┐
│                        FEATURE LAYER                              │
│  chat/ · groups/ · status/ · calls/ · media/ · auth/ · settings/  │
│  (each feature = ui/ model/ (zustand) api/ hooks/ sockets/ db/)   │
└────────────────────┬─────────────────────────────────────────────┘
                     │ hooks / commands
┌────────────────────┴─────────────────────────────────────────────┐
│                        DOMAIN LAYER                               │
│  entities · use-cases · state machines · sync engine · crypto     │
└────────────────────┬─────────────────────────────────────────────┘
                     │ ports (interfaces)
┌────────────────────┴─────────────────────────────────────────────┐
│                     INFRASTRUCTURE LAYER                          │
│  network (Axios) · realtime (WS) · db (WatermelonDB) ·            │
│  kv (MMKV) · fs (file system) · push · background · native shims  │
└──────────────────────────────────────────────────────────────────┘
```

**Dependency rule:** UI → Feature → Domain → Infra. **Never the reverse.** Domain owns interfaces; Infra implements them; the UI never imports from Infra directly. This makes every layer independently testable (mock the layer below).

DOCEOF
echo "M0-M3 done"

## M4. Module & Folder Structure

```text
apps/mobile/
├── android/                     # native project
├── ios/                         # native project
├── src/
│   ├── app/                     # bootstrap: providers, root nav, error boundaries, deep links
│   ├── core/                    # cross-feature: config, env, feature flags, logger, telemetry
│   ├── platform/                # OS abstractions (iOS/Android) exposed as TS interfaces
│   ├── design-system/           # tokens, primitives, atoms, molecules; NO business logic
│   ├── i18n/                    # translations, ICU, RTL utils
│   ├── theme/                   # light/dark/system, dynamic
│   ├── navigation/              # stacks, tabs, linking, guards
│   ├── infra/                   # LAYER: implementations of ports
│   │   ├── network/             # Axios client + interceptors
│   │   ├── realtime/            # WS client + state machine
│   │   ├── db/                  # WatermelonDB adapter + models + migrations
│   │   ├── kv/                  # MMKV wrapper (encrypted)
│   │   ├── fs/                  # file system + media dir manager (§M12/§L8)
│   │   ├── push/                # FCM/APNs + VoIP push
│   │   ├── background/          # WorkManager/BGTask wrappers
│   │   ├── crypto/              # libsignal wrapper + keystore
│   │   └── native/              # thin TS wrappers around each native module
│   ├── domain/                  # LAYER: pure TS, no RN imports
│   │   ├── entities/            # Message, Conversation, User, Media, Call, Status …
│   │   ├── use-cases/           # sendMessage, syncConversations, playVideo …
│   │   ├── ports/               # interfaces implemented by infra
│   │   ├── sync/                # SyncEngine, cursors, outbox
│   │   ├── state-machines/      # ws, sync, upload, download, call, auth …
│   │   └── errors/              # typed errors + normalization
│   ├── features/                # LAYER: composed feature slices
│   │   ├── auth/
│   │   │   ├── ui/              # screens + components
│   │   │   ├── model/           # zustand slice
│   │   │   ├── api/             # TanStack Query hooks
│   │   │   └── index.ts         # public feature API
│   │   ├── chat/                # (same shape) — send/receive/list, threads, reactions
│   │   ├── conversations/       # list, pin, archive, mute
│   │   ├── channels/
│   │   ├── groups/
│   │   ├── status/              # stories
│   │   ├── calls/
│   │   ├── media/               # viewer, gallery, Manage Storage screen
│   │   ├── search/
│   │   ├── contacts/
│   │   ├── settings/
│   │   ├── notifications/
│   │   ├── translation/
│   │   └── admin/               # enterprise admin views
│   ├── ui/                      # screen-agnostic building blocks (Screen, EmptyState, ...)
│   └── tests/                   # E2E specs; unit/component tests co-located with code
├── e2e/                         # Detox
├── perf/                        # Reassure baselines + scripts
├── scripts/                     # codegen, size-check, migrations, storybook build
└── package.json
```

**Feature module contract (every feature follows this shape):**
- `ui/` — screens + presentational components (no direct infra imports)
- `model/` — Zustand slice(s) for client state
- `api/` — TanStack Query hooks (calls infra/network)
- `hooks/` — feature-scoped hooks (composes model + api + selectors)
- `db/` — WatermelonDB queries specific to this feature (imports from `infra/db`)
- `index.ts` — the **only** public export of the feature (nothing else can be imported from outside)

**Import lint (enforced in CI, `eslint-plugin-boundaries`):**
- `ui/*` can import from `design-system`, `theme`, `features/*/ui`, `features/*/hooks`, `navigation`
- `features/*/ui` cannot import from `infra/*`
- `domain/*` cannot import RN or infra
- `infra/*` cannot import from `features/*` or `ui/*`

## M5. State Architecture (7 kinds, strict separation)

Per the operating directive: **never mix concerns.**

| # | Kind | Owner | Store | Persistence | Example |
|---|------|-------|-------|-------------|---------|
| 1 | **Server state** | TanStack Query | Query cache | in-memory + optional persister | fetched profile, org members |
| 2 | **Persistent app state** | Domain (via DB) | **WatermelonDB** | disk (SQLite) | messages, conversations, media meta |
| 3 | **Client state (feature UI)** | Zustand slice per feature | in-memory | none (or MMKV for a few) | current search query, composer draft |
| 4 | **Navigation state** | React Navigation | its own | ephemeral | current route, params |
| 5 | **Realtime state** | Realtime slice (Zustand) | in-memory | none | WS status, typing, presence |
| 6 | **Temporary UI state** | Component local (`useState`) | component | none | modal open, dropdown |
| 7 | **Global config / auth** | Zustand + MMKV mirror | in-memory + MMKV | disk | current user, tokens, feature flags |

**Rules:**
- The **UI never reads from the network**. It reads from Zustand selectors (client) or WatermelonDB observers (persistent). TanStack Query populates the DB, then the UI reacts. This is the "local DB is source of truth" principle.
- **No global "app state" mega-store.** Each feature owns its slice; cross-feature reads go through selectors on the domain layer.
- **No context providers with mutable state** other than React Navigation, theme, and i18n. Zustand replaces them (no unnecessary re-renders).

## M6. Data Flow Architecture

```text
┌─────────────┐        subscribe/observe        ┌──────────────┐
│  Screen /   │  ──────────────────────────────▶│ WatermelonDB │◀── writes ── SyncEngine
│  Component  │◀── selectors ── Zustand slice   │ (source of   │             ▲
└─────┬───────┘                                 │  truth)      │             │
      │ user action                             └──────┬───────┘        pull /apply
      ▼                                                │                changes
┌───────────┐    optimistic write to DB       ┌────────┴────────┐   ┌─────────────┐
│ Use-case  │ ──────────────────────────────▶ │  Outbox / drafts│   │  Realtime    │
│ (domain)  │    enqueue to Outbox            │  (WatermelonDB) │   │  (WS + push) │
└─────┬─────┘                                 └────────┬────────┘   └──────┬──────┘
      │                                                │                    │
      │ command                                       │ retries             │ events
      ▼                                                ▼                    ▼
┌──────────────────────────────────────── Network engine (Axios) ────────────────────┐
│  auth · retry · dedupe · idempotency · cancellation · backoff · network awareness  │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Read path (screen open):** DB observer emits current data → screen renders instantly (no spinner). SyncEngine wakes if data is stale → applies deltas → DB emits → UI updates.

**Write path (send message):** use-case writes an **optimistic** message row (`state='sending'`) → enqueues to Outbox → returns immediately. Outbox worker sends over WS/HTTP → on ACK, updates row (`state='sent'`, `seq=…`) → on failure, retries with backoff and marks `state='failed'` after N attempts. UI reflects state changes via DB observer.

**Golden property:** the UI is **causally consistent** with the DB, and the DB **converges** with the server via the Sync Engine — but the UI is never blocked on the server.

## M7. Networking Engine (Axios + Interceptors)

```text
Axios instance ── req interceptor ─┬── attach access JWT + DPoP proof (device-key sig of req hash + nonce)
                                   ├── attach trace-id + client version + tenant id
                                   ├── request dedupe by (method, url, body-hash) within 500 ms
                                   ├── idempotency-key for mutating requests (client-msg-id / uuid)
                                   └── network awareness: reject early if offline for non-queueable ops
                    ── res interceptor ┬── on 401: refresh (DPoP-bound) → retry once; parallel calls queue
                                       ├── on 5xx / network err: exponential backoff (250ms → 4s, jitter)
                                       │                        + circuit breaker per host (open 30s after 5 failures)
                                       ├── on 429: honor Retry-After
                                       ├── normalize error → typed AppError
                                       └── emit telemetry (RED metric per endpoint) — no PII
```

- **Cancellation** via `AbortController` on every request; navigation-away cancels pending screen reqs.
- **Refresh serialization**: only one refresh in flight; concurrent 401s wait on the same promise.
- **Global timeouts**: 15s default (mutations 30s, uploads none — chunked).
- **DPoP binding** (backend §B2.3): every request signs `htu + htm + iat + nonce` with the device private key; server rejects if not bound.
- **No unbounded retry on POST unless idempotent** (uses `Idempotency-Key` header + backend `client_msg_id`).
- **Progressive JPEG/HLS** preferred where the server supports it — perceived-perf boost on slow networks.

Structured module: `infra/network/axios.ts`, `interceptors/`, `errors/` (typed), `retry.ts`, `dpop.ts`, `metrics.ts`. All exported through `infra/network/index.ts`.

## M8. Realtime Engine (WebSocket)

Backed by an explicit **state machine**:

```
             ┌────────┐   app start / manual
             │  IDLE  │──────────────────────────▶┐
             └────┬───┘                            ▼
      network up  │                        ┌──────────────┐  fail (429 / auth) 
                  │                        │  CONNECTING  │─────────┐
                  ▼                        └──────┬───────┘         │
              ┌──────┐  socket open + auth        │                 ▼
              │HANDSHAKE│◀───────────────────────┘         ┌─────────────────┐
              └───┬──────┘   handshake ok                 │  BACKOFF(jitter)│
                  ▼                                        └───────┬─────────┘
             ┌────────┐  ping ok                                    │ timer
             │  LIVE  │──── consume → apply → observers            ▼
             └────┬───┘◀───────────────────────────────────┐  CONNECTING…
     socket drop │                                          │
                 ▼                                          │
             ┌───────────┐  network back / fg                │
             │  DROPPED  │──────────────────────────────────┘
             └────┬──────┘
    background   │
                 ▼
             ┌────────────┐ (see §M13: sockets shut down in bg by policy)
             │ SUSPENDED  │
             └────────────┘
```

- **Reconnect uses resume token** (backend §G3-3) — cheap reattach vs full sync.
- **Sync cursor** replay covers any missed events (§B5).
- **Heartbeat:** ping every 25s; miss → drop → BACKOFF.
- **Backoff:** exponential with full jitter (250 ms → 30 s cap), reset after 60 s LIVE.
- **Duplicate detection:** every inbound event carries `event_id`; consumer maintains a bounded LRU of last N event_ids in MMKV to survive process restarts.
- **Ordering:** rely on server `seq` per conversation (backend §B4.3); never trust client timestamps for order.
- **Foreground-only lifecycle:** enter SUSPENDED when app backgrounds (§M13); wake by push → transient LIVE for sync → SUSPENDED again.
- **Backpressure:** drop coalescable ephemeral events (typing, presence) under CPU pressure; **never drop durable events** — they're re-syncable by cursor anyway.

Implemented in `infra/realtime/` with a small state-machine helper (no xstate dep to keep bundle lean; a hand-rolled reducer with typed events + guards).


## M9. Offline-First Architecture

**Rule:** the app is fully usable with **no network** for anything that does not fundamentally require the server (read history, compose drafts, view cached media, search cached content, view profile, etc.). The user should not see "network error" for these actions — ever.

| Capability offline | How | Backing store |
|--------------------|-----|---------------|
| Open app, see chats | UI reads DB directly | WatermelonDB |
| Read message history | DB observer | WatermelonDB |
| Compose message → shown as "sending" | Outbox pattern | Outbox table |
| Voice note record | file → outbox with local path | FS + outbox |
| Send media | queued in upload manager | FS + upload_jobs |
| React / edit / delete | queued as pending mutation | mutation_queue |
| Search cached | on-device SQLite FTS (WatermelonDB) | FTS index |
| View cached media | file system (§M12) | FS |
| Draft (typing) | debounced write | drafts table |
| Contacts view | last-known snapshot | WatermelonDB |
| Presence display | last-known + "?" if stale | in-memory + hint |
| Read receipts (queue) | queued to send on reconnect | mutation_queue |

**Conflict resolution** (§L6.4): server `seq` and `edit_lamport` are authoritative. Local optimistic edits are stamped with `client_seq` (monotonic per device). Reconciliation:
- **Message edit conflict** → server wins (last-writer-wins by `edit_lamport`); local optimistic diff kept as "unsaved" if newer.
- **Reactions** → set union (both add wins), single-emoji-per-user constraint enforced by (user, emoji, msg) unique key.
- **Membership** → server wins; local optimistic UI reverts.
- **Read cursor** → max of local and server `last_read_seq`.

**Outbox semantics** (§L6.3): every outgoing action is a durable row; the outbox worker processes in insertion order per conversation, with per-item retry state; drained on reconnect. Outbox survives process kill.

**"Save action, never lose it"** invariant: any tap that changes user data writes to the local DB before returning from the handler. Network is downstream of the DB, always.

## M10. Local Persistence (WatermelonDB + MMKV)

### M10.1 Split of responsibilities
| Data | Store | Why |
|------|-------|-----|
| Messages, conversations, members, reactions, media metadata, outbox, mutation queue, drafts, search FTS | **WatermelonDB** (SQLite) | Reactive queries, lazy loading, off-thread reads, huge scale |
| Auth tokens, DPoP key handles, device id, current user id, feature flags, per-chat settings, small caches | **MMKV** | Sync API, encrypted, tiny, no I/O overhead |
| Actual media files | **File system** (§M12) | Not in a DB |
| Ephemeral state | in-memory | — |

### M10.2 WatermelonDB properties leveraged
- **Lazy** — collections don't load until queried; scales to 100k+ messages without RAM cost.
- **Observable** — screens subscribe via `enhanceWithObservables`; DB update → UI update, no manual refresh.
- **Batched writes** — sync engine writes many rows in one transaction.
- **Migrations** — versioned, additive-first (schema evolution).
- **JSI adapter** (SQLite) — reads off the JS thread on Android and iOS.

### M10.3 MMKV encryption
- Instance created with a random 256-bit key stored in Keychain/Keystore (not in MMKV itself). Rotated on major security events.

### M10.4 SQLite hygiene
- WAL mode, `synchronous=NORMAL`, indexed columns on hot queries (see §L5 schemas).
- Vacuum scheduled by background worker when free-space > 20% (rare).

## M11. Sync Engine (server ↔ device)

Independent module in `domain/sync/`. Runs on foreground + on push wake.

```
SyncEngine
├── cursors: per (device, resource) — {conversations, messages, receipts, contacts, channels, keys}
├── pull(): stream deltas from server since cursor → apply to DB in a transaction → advance cursor
├── push(): drain Outbox → send in order → mark sent/ackd
├── reconcile(): resolve conflicts (§M9) → repair inconsistencies
└── schedule(): foreground → tight loop when LIVE; background → coalesced push-triggered
```

**Guarantees:**
- **At-most-once user-visible effect**: consumer dedupes by `event_id`; outbox dedupes by `client_msg_id`.
- **Convergence**: given enough time online, local state == server state.
- **No stuck state**: if any resource cursor lags > 30 s while LIVE, engine triggers a targeted resync.
- **Chunking**: pulls are chunked (e.g., 200 events at a time) to keep UI responsive.

**Push-driven sync (backend §G4):** push notifications are hints; on receipt (foreground or background wake), SyncEngine runs a short cursor-only pull. Server truth reconciles unread counts and badges.


## M12. Media & Storage Architecture (deep dive — the 7 requirements)

> This section explicitly covers every item you flagged:
> ① mobile media cache size limit (e.g. max 1 GB) · ② LRU cleanup policy · ③ Manage Storage feature · ④ local filesystem folder strategy · ⑤ background cleanup worker · ⑥ re-download strategy if local file deleted · ⑦ per-chat storage usage calculation. All are first-class here with a clear owner (Media Manager) and a state machine.

### M12.1 Design goals
- **Bounded** — total media on disk cannot exceed the user-configurable **cache cap** (defaults per §M12.4). No unbounded growth, ever.
- **Predictable** — a user always knows how much space the app uses, per chat, per media type; can clear it granularly.
- **Resilient** — if a media file is missing on disk (user cleared it, OS reclaimed, corrupted), the app **re-downloads on-demand** transparently; the message never breaks.
- **Battery-safe** — cleanup runs in the background inside OS-provided coalesced windows.
- **Correct on both OSes** — filesystem strategy respects iOS sandbox + Android scoped storage.
- **E2EE-aware** — encrypted at rest for personal-content media (the file on disk is the encrypted blob or is stored inside the app-private area; keys never touch shared storage).

### M12.2 Filesystem folder strategy (iOS + Android)

**Root:** all app-managed media lives under the app's private, sandboxed directory. **We never write user's personal encrypted content to shared galleries.**

| Purpose | iOS path | Android path | Backed up? |
|---------|----------|--------------|------------|
| Persistent per-chat media (encrypted at rest for personal) | `Library/Application Support/NexusChat/media/` | `filesDir/media/` (internal) | **No** (excluded from iCloud/Google Backup) |
| Transient thumbnails / previews (regenerable) | `Library/Caches/NexusChat/thumbs/` | `cacheDir/thumbs/` | No (OS can reclaim) |
| Transcoded / decrypted playback files (short-lived) | `Library/Caches/NexusChat/playback/` | `cacheDir/playback/` | No |
| In-progress upload staging | `Library/Application Support/NexusChat/uploads/` | `filesDir/uploads/` | No |
| In-progress download partial (resumable) | `Library/Caches/NexusChat/downloads.partial/` | `cacheDir/downloads.partial/` | No |
| User-exported media (only when they tap "Save to Gallery") | Photos app | MediaStore (`Pictures/NexusChat`) | Managed by user |

**Sub-folder shape** (both OSes), keyed to spread inode load and enable fast per-chat cleanup:
```
media/
├── images/{conversation_id_hash_first2}/{media_id}.{ext}
├── videos/{conversation_id_hash_first2}/{media_id}.{ext}
├── audio/{conversation_id_hash_first2}/{media_id}.{ext}
├── docs/{conversation_id_hash_first2}/{media_id}.{ext}
├── voice/{conversation_id_hash_first2}/{media_id}.{ext}
└── stickers/{pack_id}/{sticker_id}.webp        # shared across chats
```
- `conversation_id_hash_first2` = first 2 hex chars of `sha256(conversation_id)` → ~256 shard dirs, avoids "10k files in one folder" perf cliffs on Android.
- **Never** embed user data in filenames beyond `media_id`.
- **Files excluded from OS backup:** on iOS via `NSURLIsExcludedFromBackupKey`; on Android by living under `filesDir` (internal storage, not auto-backed by default; we also add `allowBackup="false"` for the sensitive dirs via `dataExtractionRules`).

### M12.3 Media Manager — the owner

A single module `infra/fs/media-manager.ts` owns **every** file the app creates. Feature code never touches the filesystem directly.

Responsibilities:
- Allocate paths (`allocatePath(kind, mediaId, conversationId, ext)`)
- Write / read / delete files (atomic where the OS supports it)
- Track every managed file in the **`media_files` table** (metadata; see below)
- Enforce cache cap (LRU eviction)
- Provide per-chat and per-type usage aggregates (§M12.9)
- Handle missing files gracefully (§M12.8 re-download)

**`media_files` metadata table (WatermelonDB, §L5):**
```ts
media_files {
  id: string,                    // media_id (server or client-generated)
  conversation_id: string,
  kind: 'image' | 'video' | 'audio' | 'voice' | 'doc' | 'thumb' | 'sticker',
  path: string,                  // relative to media root
  size_bytes: number,
  mime: string,
  encrypted: boolean,            // true for personal E2EE
  content_hash: string,          // sha256 for dedupe
  server_url: string | null,     // for re-download; null for outbound-only
  server_media_id: string | null,
  keep_forever: boolean,         // starred/kept messages, user-pinned
  last_accessed_at: number,      // epoch ms — LRU signal
  created_at: number,
  status: 'downloading' | 'ready' | 'missing' | 'failed'
}
```

Indexes: `(conversation_id)`, `(kind)`, `(last_accessed_at)`, `(content_hash)` for dedupe.

### M12.4 Cache cap & tiers (bounded storage)

**Default caps** (per media type, user-adjustable in Settings → Storage):

| Tier | Default cap (3 GB Android profile) | Default cap (higher-end) | Notes |
|------|-----------------------------------:|-------------------------:|-------|
| **Total media** | 1.0 GB | 2.0 GB | Hard ceiling; LRU triggers well before |
| Images | 300 MB | 600 MB | |
| Videos | 400 MB | 900 MB | Largest tier |
| Audio + voice | 100 MB | 200 MB | |
| Docs | 100 MB | 200 MB | |
| Thumbs (Caches/) | 50 MB | 100 MB | Regenerable |
| Playback (Caches/) | 50 MB | 100 MB | Regenerable |
| Downloads-partial | 100 MB | 200 MB | Auto-cleared after 48 h |
| Uploads staging | 100 MB | 200 MB | Cleared on ACK |

**Auto-tuning:**
- On first launch and monthly thereafter, Media Manager samples `getFreeDiskStorage()`.
- If free disk < 1 GB, all caps are automatically halved.
- If free disk < 300 MB, caps drop to a "distress" profile (100 MB total) and a non-dismissable banner suggests Manage Storage.
- User can override any value in Settings.

**Hard-limit enforcement:** every write path calls `mediaManager.reserve(bytes, kind)` first; if it would overflow, LRU eviction runs synchronously to make room (bounded time budget, else write fails with a typed error and the download is deferred).

### M12.5 LRU cleanup policy

Signal: `last_accessed_at`, updated whenever a message is viewed / media is played / thumb rendered. Update is throttled to at most once/minute per file to avoid write amplification.

**Eviction algorithm (per tier):**
```
1. Query media_files WHERE kind IN tier AND keep_forever = false
   ORDER BY last_accessed_at ASC, size_bytes DESC   -- oldest & largest first
2. Sum sizes of candidates; keep evicting until (used - cap - headroom) freed
   where headroom = 10% of cap (avoid oscillating at the boundary)
3. For each evicted file: delete file from disk; update media_files.status = 'missing',
   keep the row for re-download hint (don't lose server_url)
4. Emit telemetry: {evicted_count, freed_bytes, tier}
```

**Never evicted:**
- `keep_forever = true` (starred, kept messages, per-user "always keep")
- Files with an in-flight upload/download reference (uploads staging, download-partial)
- Files created in the last **24 hours**, unless free disk is critical (avoid deleting media the user just saw)

**Playback / thumbs tiers** are evicted more aggressively (they're regenerable):
- OS may also reclaim them (Android especially reclaims `cacheDir` under memory pressure). Media Manager handles that transparently (rows go to `status='missing'`).

### M12.6 Background cleanup worker

Runs inside the OS-native background frameworks — never as a long-running foreground process.

- **Android:** WorkManager periodic worker (`MediaCleanupWorker`), 24-hour interval, `NetworkType.NOT_REQUIRED`, `requiresBatteryNotLow=true`, `requiresDeviceIdle=true`.
- **iOS:** `BGProcessingTaskRequest` scheduled with `requiresNetworkConnectivity=false`, `requiresExternalPower=false`, submitted after every app foregrounding.

**Work performed each run (all bounded — hard 30 s time budget on iOS, ~10 min on Android):**
1. Refresh `used_bytes` per tier (fast, indexed sums).
2. If any tier > cap, run LRU eviction for that tier.
3. Delete download-partial files older than 48 h.
4. Delete upload-staging files that have been ACKed (safety net; normally deleted synchronously on ACK).
5. Delete `status='failed'` media older than 7 days.
6. Vacuum SQLite if fragmentation > 30% (rare).
7. Reconcile filesystem vs `media_files` table:
   - Files on disk but not in DB → orphans → delete.
   - Rows in DB but file missing → set `status='missing'` (re-download later, §M12.8).
8. Emit a compact telemetry event with totals only (no PII).

**Foreground-triggered cleanup** (opportunistic, non-blocking): after any large download or send, Media Manager posts a low-priority idle-callback that runs a mini-cleanup (~200 ms budget) to keep caps honored between worker runs.

### M12.7 Manage Storage — feature architecture (Settings → Storage)

WhatsApp/Teams-grade. UI: `features/media/ui/ManageStorageScreen.tsx`.

**Screen structure:**
1. **Header** — total NexusChat usage, free device storage, animated donut per media type.
2. **Per-chat list** — top storage users, sortable by size / date / kind. Each row: chat name, size, count. Tap → drill-down (see below).
3. **Filters** — media type (images/videos/audio/docs), size range (`>5 MB`, `>50 MB`), age (`older than 30 d`), forwarded-only, view-once expired, favorites (excluded).
4. **Actions per selection** — Delete from device (keep in cloud), Star / keep forever, Export.
5. **Settings row** — cap sliders per type, auto-download rules (Wi-Fi / cellular / never per kind), "clear all cache" (with confirmation), "reset caps to default".

**Per-chat drill-down** (`ManageStorageChatScreen`):
- Aggregated: total size, split by kind.
- List of media items (grid, thumb + size + date + kind badge).
- Multi-select → Delete / Star.
- "Free up X MB in this chat" quick action (runs LRU only within this chat).

**Query performance:**
- Per-chat usage computed via indexed aggregation `SUM(size_bytes) GROUP BY conversation_id` on `media_files`; result cached in MMKV with a 60 s TTL so the screen opens instantly.
- Grid uses FlashList with virtualization; thumbnails loaded lazily and disposed on scroll.

**Streaming compute for large libraries:** aggregation runs in a WatermelonDB worker query; UI shows the header immediately and streams per-chat rows as they compute (progressive rendering).

### M12.8 Re-download strategy (media file missing)

Files may be missing because: LRU evicted, OS reclaimed the cache dir, user cleared cache, user tapped "delete from device", corruption. In every case the message must still work.

**On UI render of a media message:**
```
1. Look up media_files by media_id.
2. If status == 'ready' and file exists on disk → render.
3. If status == 'missing' OR file check fails:
   - if server_url is null (E2EE outbound only, was our upload) → mark broken with retry option
   - else transition to 'downloading' → enqueue in DownloadManager (priority = 'user-visible')
   - render placeholder (blurhash + spinner over it)
4. On download success → status='ready' → DB observer triggers UI update automatically.
5. On download failure → status='failed' → show retry button → exponential backoff on auto-retries.
```

**DownloadManager** (`infra/fs/download-manager.ts`):
- Bounded concurrency: 3 simultaneous user-visible downloads; 1 background prefetch.
- Resumable via `Range` header + partial file in `downloads.partial/`.
- Priority queue: user-visible > user-requested (Manage Storage "download all") > prefetch.
- Cancels if user leaves the screen and item is off-screen (unless queued from a batch action).
- **E2EE**: for personal content, download ciphertext → decrypt to `playback/` (short-lived) or verify to `media/` (long-lived encrypted at rest).

**Prefetch policy** (opt-in, Wi-Fi only by default):
- Prefetch next-N images in an open chat (viewport + 5 ahead) at low priority.
- Prefetch voice-note first 5 s only (so tap-to-play feels instant); rest streams.
- **No auto-download of videos over cellular** by default (data saver friendly). User can override per chat.

### M12.9 Per-chat storage usage calculation

- **Live aggregate table** (materialized) — `chat_storage_stats(conversation_id, size_bytes_total, size_by_kind JSON, count, updated_at)` updated on media add/remove via WatermelonDB write-side hooks.
- **Query path** (Manage Storage list): reads from `chat_storage_stats` in a single indexed scan (fast, no per-file sum).
- **Reconciliation:** background cleanup worker recomputes stats from `media_files` sums nightly to correct any drift.
- **Displayed to user in real-time** in Manage Storage; per-chat header of a chat can optionally show "X MB used" (opt-in).

### M12.10 Media state machine (per file)

```
        create/receive
              │
              ▼
       ┌──────────────┐   OS reclaim / evict / user delete
       │  DOWNLOADING │──────────────────────────────┐
       └──────┬───────┘                              │
    finish   │  fail (retryable)                    │
              ▼                                      ▼
       ┌──────────────┐   evict/OS reclaim   ┌──────────────┐
       │   READY      │──────────────────────▶│   MISSING    │
       └──────┬───────┘◀── re-download ok ────┘   (row kept) │
    star      │                                              │
              ▼                                              │
       ┌──────────────┐                                      │
       │ KEEP_FOREVER │──────────────── same as READY, exempt from eviction
       └──────────────┘
      (permanent fail after N retries → FAILED, exposed as retry-able tombstone)
```

### M12.11 Corner cases & invariants
- **Very large videos** (>100 MB): download only when user explicitly taps (never auto), stream via HLS when possible.
- **Storage full during upload:** upload-staging respects its own cap; if full, oldest ACKed leftovers are cleaned first, else the send is deferred with a clear UX ("Storage full — free space to send").
- **Concurrent access** to the same media_id from two components: DownloadManager coalesces duplicate requests.
- **Sticker packs** (`stickers/{pack_id}/`) are shared across chats, exempt from per-chat aggregates; their own small cap (~30 MB).
- **View-once media** (backend C22): deleted immediately after view, regardless of cap; row tombstoned, cannot be re-downloaded (server enforces 410).
- **Invariant:** `sum(size_bytes) on disk ≤ cap + headroom`, always, in steady state — enforced by reserve-then-write.
- **Invariant:** `every path a screen renders is either present on disk OR a re-download is scheduled` — enforced by the render lookup in §M12.8.
- **Invariant:** the app **never** deletes a file whose message is currently in the user's viewport.


## M13. Background Execution Architecture (the overnight contract)

**The problem:** long-lived sockets and unbounded work in background = battery drain, OS-kills, ANR. Both iOS and Android *severely* restrict background work; fighting them is a lost cause and burns battery. **We cooperate with the OS.**

### M13.1 Foreground vs background lifecycle
```
FOREGROUND (active)
  ▪ WS: LIVE (heartbeat 25s)
  ▪ SyncEngine: eager
  ▪ TanStack Query: refetchOnWindowFocus, refetchOnReconnect
  ▪ Media: full pipeline
BACKGROUND (app hidden)
  ▪ WS: SUSPENDED (closed, no reconnect loop)      ← key battery decision
  ▪ SyncEngine: dormant unless woken by push
  ▪ Timers: paused / not scheduled
  ▪ Media: pause downloads/uploads (see below)
WOKEN BY PUSH
  ▪ Silent OS window: run a bounded sync (≤ 20 s iOS, ≤ 30 s Android budget)
    - pull cursor
    - update DB
    - show local notification
    - close cleanly
BACKGROUND MAINTENANCE (system-scheduled)
  ▪ MediaCleanupWorker (§M12.6): daily-ish
  ▪ DB vacuum: opportunistic
  ▪ Retry sender for outbox: if plugged & idle
```

### M13.2 iOS background strategy
- **PushKit VoIP push** for calls (wakes app; must call CallKit within ~5 s or iOS penalizes).
- **APNs silent push** for messaging wake (best-effort, throttled by iOS; we don't rely on it as the *only* delivery guarantee — the source of truth is the server, syncing on next foreground).
- **`BGProcessingTaskRequest`** for cleanup (opportunistic, iOS decides when).
- **`BGAppRefreshTaskRequest`** for a quick cursor sync (~30 s).
- **No background WebSocket.** Trying to keep a WS alive in bg on iOS burns battery and gets the app killed.
- All background tasks **register expiration handlers** — save state, cancel work, close the task cleanly.

### M13.3 Android background strategy
- **FCM high-priority messages** for calls (wakes app; must display CallKeep incoming UI within ~10 s).
- **FCM normal-priority data messages** for chat wake — SyncEngine runs a bounded pull.
- **WorkManager** for periodic maintenance (media cleanup, retry outbox when constraints met).
- **No `Service` foreground long-running loop** just to keep a WS alive; only during an active call.
- **Doze / App Standby respected:** no attempts to work around them.
- **Bluetooth / VPN edge cases** handled — we never crash on state changes.

### M13.4 In-call foreground service (Android)
- During an **active call**, we run a **foreground service with `mediaProjection`/`microphone`/`camera`** as required, with a persistent notification (Android requirement). This is the *only* long-running foreground service the app runs, and only while the call state is active.
- On call end → service stopped immediately.

### M13.5 Wake budgets and coalescing
- The app aims for **≤ 1 background wake per hour** for silent maintenance, and reacts opportunistically to push.
- All background work is **idempotent** — repeated wakes are safe.
- All background work has a **hard budget** (`iOS: 20 s, Android: 30 s`) — over budget → save state, exit; resume next cycle.

### M13.6 What the user sees when they open the app after a night
- Chat list is instant (DB source of truth).
- Unread badges are correct (server truth reconciled on foreground).
- Messages received during the night are present (either delivered by push-wake sync, or fetched now on foreground cursor sync).
- Battery drain report ≤ 3% (§M0.2).
- **No dropped socket loop, no phantom notifications, no zombie downloads.**

## M14. Push Notifications (mobile side)

Aligned with backend §B10 / §G4 — **push is a hint, cursor sync is the truth.**

**Registration:**
- FCM (Android) / APNs (iOS) tokens registered with backend `auth-service` on login and refresh.
- VoIP push token (iOS PushKit) separately registered for call wake.
- Tokens rotate — client detects and re-registers.

**Handling:**
- **Regular data push** → wake bounded sync (§M13.2/3) → apply DB updates → OS-native local notification with content.
- **E2EE push** → payload has NO content (just conv id) → app fetches ciphertext, decrypts on-device, shows notification with the decrypted title/preview *locally*. Server never sees plaintext.
- **VoIP push** (iOS) → immediately call `CallKit` with the incoming caller info (must be within ~5 s or iOS blocks future VoIP pushes for this app).
- **Data-only** on Android with high priority for calls, normal for chat.

**Suppression:**
- If a message arrives via WS while foreground, no push is shown (server already suppresses via presence in §B10, but client also de-dupes by `event_id`).
- Respect DND, muted chats, quiet hours (client-side + server-side both applied).

**Reconciliation:**
- After any push wake, the sync cursor pull re-establishes truth. If push was missed / lost, the next foreground picks up all changes.

## M15. E2EE Integration On-Device

- **libsignal-client** RN binding wraps native libs. All ratchet state stored in an encrypted SQLite (dedicated), keys in Keychain/Keystore.
- **Identity + prekeys** provisioned on first device enroll (backend §B2); refilled by a background worker when the server signals low prekey inventory.
- **Session cache** — in-memory sessions for hot conversations; cold sessions load lazily.
- **Encrypt path:** send flow calls `crypto.encryptFor(recipientDeviceList)` → returns per-device ciphertexts; sent as a single API call to chat-service; the fan-out is server-side by device.
- **Decrypt path:** on inbound event, the ciphertext for *this* device is picked → `crypto.decrypt(...)` → plaintext → written to DB.
- **Decryption failure → resend protocol** (backend §G1-1) — client emits `resend-request{msg_id}`.
- **Safety numbers** stored per contact; key change triggers a UI warning banner.
- **Threading:** crypto runs in a native worker (no JS thread); results delivered via callback.
- **On-device translation for E2EE** (backend §A26.1): decrypt → run local NLLB → render. Server never involved.

## M16. Design System & Theming

- **Design tokens** — spacing, radius, elevation, typography, motion durations, easings — declared as TS objects (`design-system/tokens.ts`), consumable in JS + Reanimated worklets.
- **Primitives** — `<Text>`, `<Pressable>`, `<Icon>`, `<Screen>`, `<Row>`, `<Column>`, `<Card>`, `<Divider>`, `<Avatar>`, `<Badge>`, `<Chip>` — each with variants and a11y wired.
- **Themes** — `light`, `dark`, `system`, plus **user themes** (color-scheme overrides) — hot-swappable at runtime; no reload.
- **Motion** — Reanimated 3; shared-element transitions for media viewer; reduce-motion respected (a11y).
- **Dark mode** — full parity; contrast checked (WCAG AA).
- **RTL** — logical spacing (`marginStart`/`End`), mirror-safe icons, i18n via i18next; runtime language switch via app restart guarded by a state-preserving reload.
- **Adaptive layouts** — phone, large phone, tablet split-view (chat list + chat pane), foldables (aware of `LayoutEvent` + `useWindowDimensions`).

## M17. Navigation Architecture

- **React Navigation** with native-stack.
- **Hierarchy:**
  ```
  RootStack
   ├── AuthStack (Welcome → EnterPhone → ReverseOTP → Passkey → NameYou)
   └── AppTabs
        ├── ChatsTab (ChatList → Chat → Info)
        ├── StatusTab
        ├── CallsTab
        └── SettingsTab
  RootModals: MediaViewer, IncomingCall, ManageStorage, Search
  ```
- **Deep links** — `nexuschat://chat/:id`, `nexuschat://join/:invite`, `nexuschat://call/:id`.
- **Guards** — auth guard on AppTabs (redirect to AuthStack if unauthenticated); tenant guard for enterprise screens.
- **Screen preload** — the chat screen begins its DB query on `focus` **event**, not on `mount`, so the render is instant.
- **Persistence** — nav state restored on cold start (last chat can be reopened).

## M18. Accessibility & Localization

- **Screen reader** — every interactive element has `accessibilityLabel`, `accessibilityRole`, `accessibilityHint` where non-obvious.
- **Focus order** — logical; custom focus for modals.
- **Touch targets** — minimum 44×44 pt/dp.
- **Dynamic type** — respects OS text-size settings; text scales up to 200% without truncation on core screens.
- **Reduce motion** — replaces animations with fades ≤ 100 ms.
- **Color contrast** — WCAG AA minimum, AAA for body text.
- **i18n** — i18next; ICU messages; pluralization; RTL layouts; language switch UI; on-device translation independent (§M15).
- **Testing** — `jest-axe`-style checks in component tests; manual a11y sweep per phase.

## M19. Security Architecture (mobile)

Aligned with backend §A14 / §D4.

- **Secure storage** — Keychain (iOS) / Keystore (Android) for device private key, backup key, refresh token; **non-exportable** where hardware allows.
- **DPoP proofs** — every mutating request signed by the device key (§M7).
- **Token rotation** — refresh with reuse-detection; on suspicion, revoke and force re-login.
- **Biometric gate** — app-lock (optional), chat-lock (for locked chats), sensitive-action re-auth (change number, remove device, view backup key).
- **Clipboard** — sensitive fields (OTP, backup key) marked `secure`; auto-clear clipboard after 60 s where set programmatically.
- **Screenshot protection** — enabled globally optionally; forced on for locked chats and backup-key display (Android `FLAG_SECURE`, iOS `secure text` + hidden window on background).
- **Root/jailbreak detection** — soft signal; on high risk, restrict sensitive actions (viewing backup key), never *block* the app.
- **Certificate pinning** — optional pins for the API host; graceful degradation on cert rotation via a stapled fallback list (avoids app-brick during a legitimate rotation).
- **Attestation** — Play Integrity / App Attest verdicts included at enroll and periodically (backend §B2.2).
- **Secure logging** — pino with a redaction filter (no tokens, no message content, no phone numbers).
- **Privacy compliance** — GDPR account export/delete UX; contact upload consent screen; discoverability toggle.

## M20. Performance & Memory Engineering

### M20.1 Cold start budget breakdown (target ≤ 2.0 s on ref device)
```
0–300 ms  : native launch, RN engine init
300–800 ms: JS bundle parse + minimal providers (theme, i18n, nav)
800–1200 : SyncEngine bootstrap (schedule pending; no blocking work)
1200–1700: ChatList first paint from DB (observer emits synchronously)
1700–2000: ChatList interactive; background: refresh via cursor pull
```
- **Splash → first paint** never blocks on network.
- Bundle: Hermes engine, inline-requires, RAM bundles on Android where beneficial, tree-shaking (metro config), split by feature via `import()` for rarely-used screens (Manage Storage, Admin).

### M20.2 Rendering rules
- **FlashList** for every long list (chat list, messages, media grid).
- **Memoize** all list items (`React.memo` + stable props); `useCallback` for handlers passed as props.
- **Selectors** — Zustand selectors + shallow compare; avoid subscribing entire slice.
- **No heavy work in render** — computations in `useMemo`, side effects in `useEffect` with dependencies audited.
- **No inline objects/functions** in hot components; extracted or memoized.
- **Reanimated** for animations; worklets bypass the JS thread.
- **Image sizing** — always resize to the display size on load (never render 4000×3000 into a 100×100 slot).

### M20.3 Memory rules
- **Bounded caches only** — every cache declares a max size and eviction policy. No `Map` accumulating over time.
- **Streaming APIs** for large lists — no `Array.map` on 100k items.
- **Dispose native resources** — video players `release()` on unmount; camera released on screen leave; sockets on background; timers cleared on unmount.
- **Weak-ref semantics via unsub arrays** in every effect (`const unsubs = []; return () => unsubs.forEach(u => u())`).
- **No global setInterval without owner** — every recurring timer is owned by a lifecycle (screen focus, WS LIVE, foreground).
- **List item unmount** frees its own thumbs (release URL, dispose Image if kept as a ref).

### M20.4 Bridge & thread rules
- **Never** send large payloads across the RN bridge (>1 MB in one call). Chunk or move to JSI.
- **JSI-first** for hot native modules (crypto, DB, WebRTC signaling).
- **UI thread** owns gestures + animations (Reanimated); JS thread owns state + logic; native threads own IO.

## M21. Battery & Network Efficiency

- **Coalesced network** — the SyncEngine batches reads; TanStack Query dedupes; no-op refreshes suppressed when data is fresh.
- **Background socket = never** (§M13). Push-driven wakes only.
- **No polling** — the app has zero periodic HTTP polls. Everything is push- or event-driven.
- **Data-saver mode** — respect OS setting; downgrade auto-download; use lower bitrate calls; use progressive JPEG; disable auto-video-play.
- **Adaptive quality** — call bitrate adapts to network via LiveKit; media downloads pick smallest sufficient rendition.
- **Radio hygiene** — coalesce short bursts of requests via microtask batching to keep the radio from cycling.
- **Battery monitor** — a `battery-info` module reads state; below 15% we disable prefetch and auto-video-play (unless plugged in).

## M22. Observability, Logging, Crash Reporting

- **Structured logs** (pino) with levels; a redaction pipeline strips tokens, phone numbers, message content, media paths.
- **OpenTelemetry** RN SDK — traces on every network call and every state-machine transition; sampled 5% by default, 100% for errors.
- **Crash reporting** — GlitchTip / self-hosted Sentry; source maps uploaded; PII scrubbed.
- **Client metrics** — cold start, warm start, JS FPS (via Reassure / a lightweight sampler), memory pressure events, background work outcomes, WS reconnect counts.
- **Debug menu** (dev / QA builds only) — inspect DB, force sync, force LRU, list background wakes, toggle feature flags. Not shipped to prod.
- **Remote kill-switch** — feature flags fetched at boot include a `min_client_version` and per-feature kills; enforced client-side.
- **Never log PII.** Enforced by lint rule for `console.*` and by log-schema tests.

## M23. Native Modules (catalog)

Each has a **thin TS interface** in `infra/native/` + native implementations in `android/` and `ios/`.

| Module | Purpose | iOS impl | Android impl |
|--------|---------|----------|--------------|
| Keychain | Store device key, backup key, tokens | Keychain Services | Keystore (StrongBox where available) |
| Attestation | Play Integrity / App Attest | DeviceCheck / AppAttest | Play Integrity |
| CallKeep | System call UI | CallKit | ConnectionService |
| VoIPPush | Incoming call wake | PushKit | FCM high-priority |
| WebRTC | Media | WebKit WebRTC | libjingle |
| MediaStore | Export to gallery | Photos framework | MediaStore |
| BackgroundTask | Wrap OS bg APIs | BGTaskScheduler | WorkManager |
| Biometric | Face/Touch/Fingerprint | LocalAuthentication | BiometricPrompt |
| NetworkInfo | Type, metered? | NetworkExtension / Reachability | ConnectivityManager |
| BatteryInfo | Level, plugged | UIDevice | BatteryManager |
| ScreenshotProtection | FLAG_SECURE / hidden window | UIApplication window | FLAG_SECURE |
| Notifications | Rich, actions | UNUserNotificationCenter | NotificationManager |
| ContactsPicker | (opt-in) | Contacts framework | ContactsContract |
| FilePickerSAF | Docs / files | UIDocumentPicker | Storage Access Framework |

## M24. Build & Release Engineering

- **Monorepo** — pnpm + Turborepo; shared `packages/proto` and `packages/shared-types`.
- **Native config isolation** — env-per-flavor (dev/stage/prod) via `react-native-config` + Android productFlavors + iOS configurations. Bundle IDs differ per env so 3 apps coexist.
- **Build automation** — Fastlane (free) for beta/store uploads; local emulators + real-device farm for CI.
- **CI (Woodpecker / GitHub Actions free)** — lint → typecheck → unit → component tests → Reassure perf regression → APK/IPA build → size check → Detox smoke on emulator/simulator → Trivy scan → SBOM → cosign.
- **CD** — internal track first; staged rollout (5% → 25% → 100%) with a kill-switch flag ready.
- **OTA** — no OTA JS updates (stability > convenience). All ships go through the stores.
- **Rollbacks** — feature-flag-based, not app-rollback. Every feature has a kill switch.
- **Migration safety** — DB migrations are additive; schema version guarded; on migration failure app boots to a "safe mode" that re-syncs from server.


---

# PART L — LOW LEVEL DESIGN

## L1. Conventions

- **Files:** `kebab-case.tsx` for components, `camelCase.ts` for others, `PascalCase` for classes/types. One default export per file where used.
- **Naming:** components in `PascalCase`, hooks `useThing`, stores `useThingStore`, state machines `thingMachine`, types `Thing`, enums as string unions (`type Kind = 'a' | 'b'`).
- **IDs:** all client-generated IDs are UUIDv7 (time-sortable). Message `client_msg_id` prefixed `cm_`, media `me_`, upload jobs `uj_`, download jobs `dj_`.
- **Times:** all times = epoch ms (number); server-authoritative for ordering; client wall-clock only for display.
- **Async errors:** never swallowed silently; either handled with typed `AppError`, surfaced via UI, or logged with context.
- **ADRs:** any new dep or deviation from stack (§M1) → `docs/adr/NNNN-title.md` written before merge.
- **Public API of a module:** only `index.ts` exports; deep imports lint-fail.

## L2. UI Kernel

`src/app/App.tsx` — bootstraps:
```
<SafeAreaProvider>
  <ErrorBoundary onError={report}>            // last-resort crash UI + report
    <QueryClientProvider client={qc}>          // TanStack Query
      <ThemeProvider>                          // theme tokens; system-aware
        <I18nProvider>                         // i18next
          <NavigationContainer linking>        // deep links + persistence
            <RootStack />
          </NavigationContainer>
          <GlobalOverlays />                   // Incoming call, toasts, network banner
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
</SafeAreaProvider>
```

Startup sequence (in `bootstrap.ts`, invoked before first render):
1. Init pino logger + telemetry (deferred network send until online).
2. Init MMKV (encrypted).
3. Init WatermelonDB (open + run pending migrations).
4. Init crypto (load keys from Keychain; verify identity).
5. Init NetworkClient (Axios with interceptors).
6. Init RealtimeClient (does not connect yet; scheduled after nav ready).
7. Register push tokens if logged in.
8. Schedule background workers.

No step 1–8 makes a blocking network call.

## L3. Networking Client

```ts
// infra/network/axios.ts (shape)
export const http = axios.create({ baseURL, timeout: 15_000 });
http.interceptors.request.use(withAuth, withDPoP, withTrace, withIdempotency, withNetworkAwareness);
http.interceptors.response.use(onSuccessMetric, chainErrorHandlers(
  handle401Refresh, handleRateLimit429, handleRetryableNetwork, normalizeError
));

// domain/ports/network.ts (interface used by features)
export interface Network {
  get<T>(url: string, opts?: ReqOpts): Promise<T>;
  post<T>(url: string, body: unknown, opts?: ReqOpts): Promise<T>;
  // ...
  stream<T>(url: string, opts?: ReqOpts): AsyncIterable<T>;   // SSE / chunked
}
```

Retry policy (see L16 for full table):
- GET: 3 retries, expo backoff 250 → 4000 ms, jitter 50%, only on network / 5xx / 408 / 429.
- POST/PUT with idempotency key: 3 retries, same policy.
- POST without idempotency: 0 retries (surface to caller).

Circuit breaker per host: OPEN after 5 consecutive failures in 10 s; HALF-OPEN after 30 s.

## L4. Realtime Client (state machine)

```ts
// domain/state-machines/ws-machine.ts (types)
type WSState = 'idle' | 'connecting' | 'handshake' | 'live' | 'dropped' | 'backoff' | 'suspended';
type WSEvent =
  | { t: 'appForeground' }
  | { t: 'appBackground' }
  | { t: 'networkUp' }
  | { t: 'networkDown' }
  | { t: 'socketOpen' }
  | { t: 'socketClose'; code?: number }
  | { t: 'handshakeOk' }
  | { t: 'handshakeFail'; reason: 'auth' | 'rateLimit' | 'server' }
  | { t: 'inbound'; ev: unknown }
  | { t: 'backoffElapsed' };

const reducer = (s: WSState, e: WSEvent): WSState => { /* per M8 diagram */ };
```

Owned by `RealtimeClient`; observers (SyncEngine, presence slice, call slice) subscribe to events. All state is a plain enum + typed events → trivially unit-testable, deterministic.


## L5. Local DB Schemas (WatermelonDB)

Only the client-side tables are declared here; backend schemas live in the backend doc. Every table indexed for the queries it supports.

```ts
// domain/entities schemas (WatermelonDB shape)

conversations {
  id: string (pk)                       // matches server conversation_id
  type: 'dm' | 'group' | 'channel' | 'broadcast' | 'community'
  tenant_id?: string
  name?: string
  avatar_media_id?: string
  is_announcement: boolean
  is_pinned: boolean
  is_archived: boolean
  is_muted_until?: number
  is_locked: boolean                    // chat lock (biometric)
  last_message_id?: string
  last_message_seq?: number
  last_message_preview?: string         // small, for chat list
  last_message_at?: number
  unread_count: number                  // computed server-truth (recomputed on cursor sync)
  mention_count: number
  notif_level: 'all' | 'mentions' | 'none'
  wallpaper?: string
  created_at: number
  updated_at: number
  server_updated_at: number             // conflict resolution
}
// idx: (is_pinned, is_archived, last_message_at DESC)
// idx: (tenant_id)

messages {
  id: string (pk)                       // server message_id (or client_msg_id before ACK)
  client_msg_id: string (uq)
  conversation_id: string (idx)
  seq?: number                          // server-assigned; null while sending
  sender_id: string
  type: 'text' | 'image' | 'video' | 'audio' | 'voice' | 'doc' | 'location' | 'contact' | 'poll' | 'system'
  content_encrypted?: Buffer            // for personal E2EE (opaque)
  content_plain?: string                // for enterprise (server-readable)
  reply_to_id?: string
  thread_root_id?: string
  mentions?: string                     // JSON array of {user_id, kind}
  reactions?: string                    // JSON map {emoji: [user_ids]}
  attachments?: string                  // JSON array of {media_id, kind, blurhash, w, h, dur}
  state: 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted'
  ephemeral_ttl?: number                // disappearing messages
  edited_at?: number
  edit_history?: string                 // JSON
  deleted: boolean
  deleted_scope?: 'me' | 'everyone'
  view_once: boolean
  starred: boolean
  created_at: number
  server_ts?: number
}
// idx: (conversation_id, seq DESC)
// idx: (conversation_id, created_at DESC)     // fallback for optimistic (seq null)
// idx: (state) partial where state='sending'  // outbox scan
// FTS: content_plain (only enterprise; personal E2EE indexed after decrypt in ram → local FTS)

receipts {
  id, conversation_id (idx), message_seq, user_id, state: 'delivered' | 'read', ts
}

conversation_members {
  conversation_id (idx), user_id, role, notif_level, last_read_seq, joined_at
}

users {
  id (pk), account_id, display_name, avatar_media_id, about, presence_hint,
  last_seen_hint, is_contact, is_blocked, updated_at
}

media_files {                          // per §M12.3 — the storage manager's ledger
  id (pk), conversation_id (idx), kind (idx), path, size_bytes,
  mime, encrypted, content_hash (idx), server_url, server_media_id,
  keep_forever, last_accessed_at (idx), created_at, status
}

chat_storage_stats {                   // per §M12.9
  conversation_id (pk), size_bytes_total, size_by_kind, count, updated_at
}

outbox {
  id (pk), kind: 'message.send' | 'message.edit' | 'message.delete' | 'reaction.add' | 'reaction.remove' | 'receipt' | 'call.signal' | 'presence' | 'media.upload'
  conversation_id?: string
  payload: string                       // JSON
  state: 'queued' | 'sending' | 'ackd' | 'failed'
  attempts: number
  next_attempt_at?: number
  last_error?: string
  created_at, updated_at
}
// idx: (state, next_attempt_at) for worker scan

drafts {
  conversation_id (pk), text, reply_to_id?, attachments?, updated_at
}

upload_jobs {
  id (pk), media_id, path, size_bytes, uploaded_bytes, multipart_id?, parts?, state, priority, created_at
}
download_jobs {
  id (pk), media_id, url, target_path, downloaded_bytes, total_bytes?, state, priority, created_at
}
// idx on (state, priority)

status_posts { id (pk), user_id, kind, media_id?, text?, bg?, caption?, e2ee, view_once, audience?, created_at, expires_at (idx) }
status_views { status_id (idx), viewer_id, viewed_at }

call_history { id (pk), conversation_id, type, direction, started_at, ended_at?, duration_s?, missed: boolean }

signal_sessions {                       // via a separate encrypted SQLite the libsignal wrapper uses
  ...opaque to app, managed by crypto module
}

kv (in MMKV, not WatermelonDB):
  auth.access_jwt, auth.refresh_id_ref, auth.device_key_ref,
  device.id, device.attestation_ts, sync.cursors,
  ws.event_id_lru, flags.*, media.caps.*, media.autoDownload.*,
  ui.theme, ui.locale, notif.dnd
```

Migrations are additive; on schema change bump `schemaVersion` and provide `add`/`create` migrations. Destructive migrations require a resync path.

## L6. Sync Engine (Cursors, Outbox, Reconciliation)

### L6.1 Cursors
- Per resource: `messages`, `receipts`, `conversations`, `members`, `contacts`, `channels`, `keys`.
- Stored in MMKV as `{ resource_id → last_server_seq | server_ts }`.
- Advanced only after a batch is durably persisted (transaction commit).

### L6.2 Pull loop
```
1. If WS LIVE: pull ← WS event stream (server pushes deltas).
2. Else (foreground reopen / push wake): request pull(cursor) → HTTP.
3. Batch apply in a transaction (up to N=200 events).
4. Advance cursor. Emit sync progress event.
5. Loop until server says 'no more'.
```

### L6.3 Outbox worker
```
Every foreground tick / WS LIVE transition:
  read outbox WHERE state='queued' OR (state='failed' AND next_attempt_at<=now)
  process in insertion order per conversation (to preserve intent)
  send via appropriate channel (WS message send / HTTP endpoint)
  on success → state='ackd' → delete after grace
  on retryable failure → attempts++, next_attempt_at = now + backoff(attempts), state='failed'
  on permanent failure → surface in UI (retry / delete)
```

### L6.4 Reconciliation
- On any inbound event, look up local by (conversation_id, client_msg_id) and merge:
  - If local is optimistic and server assigned a `seq`, update in place.
  - If local and server disagree on content (edits raced), server wins.
  - If message was deleted for everyone on server, tombstone local.

### L6.5 Progress / stuck detection
- If any cursor lags behind `WS heartbeat.last_server_seq` by > 500 or > 30 s, trigger a targeted resync.
- Metric `sync.lag.p95` alerted.

## L7. Chat Runtime

Screen `Chat.tsx` composition:
```
<Chat>
  <MessagesList observable={messagesQuery(conv)} />   // FlashList, virtualized, sticky headers by date
  <Composer draftFrom={drafts(conv)} onSend={sendMessage} />
  <TypingIndicator observable={typing(conv)} />
  <SelectionToolbar />                                 // reply, forward, copy, delete
  <MediaViewerHost />                                  // opens on tap
</Chat>
```

`sendMessage()` use-case:
```
1. Build msg (client_msg_id, type, content, replies…)
2. If personal → crypto.encryptFor(devices) → attach ciphertexts
3. DB.write:
   - insert into messages state='sending'
   - insert into outbox {kind: 'message.send', payload}
4. Return immediately; UI shows the message with sending state
5. Outbox worker sends, ACK updates state → observer re-renders
```

`receiveMessage()`:
```
1. WS event arrives with {conversation_id, ciphertext (if E2EE), meta}
2. Dedupe by event_id
3. If E2EE → crypto.decrypt → plaintext
4. DB.write batch (with related receipts) in a transaction
5. Emit local notification if backgrounded (via native)
```


## L8. Media Pipeline & Storage Manager (LLD)

Modules under `infra/fs/`:
```
media-manager.ts        // ownership, path allocation, reserve/write/delete, LRU eviction
upload-manager.ts       // resumable multipart uploads, priorities, retries
download-manager.ts     // resumable downloads, priorities, prefetch
usage-stats.ts          // per-chat aggregates, live updates
cleanup-worker.ts       // wired into WorkManager/BGTask (via infra/background)
paths.ts                // OS-aware path constants, sanitization
```

### L8.1 MediaManager API (typed contract)

```ts
type MediaKind = 'image' | 'video' | 'audio' | 'voice' | 'doc' | 'thumb' | 'sticker';

interface MediaManager {
  allocatePath(kind: MediaKind, mediaId: string, conversationId: string, ext: string): string;

  reserve(bytes: number, kind: MediaKind): Promise<'ok' | 'reserved-after-eviction' | 'no-space'>;

  registerFile(input: {
    mediaId: string;
    conversationId: string;
    kind: MediaKind;
    path: string;
    sizeBytes: number;
    mime: string;
    encrypted: boolean;
    contentHash: string;
    serverUrl?: string;
    serverMediaId?: string;
    keepForever?: boolean;
  }): Promise<void>;

  markAccessed(mediaId: string): void;                                    // throttled 1/min
  markKeep(mediaId: string, keep: boolean): Promise<void>;
  delete(mediaId: string): Promise<void>;                                 // user-triggered
  deleteMissingFromDisk(): Promise<{ removedRows: number }>;              // reconciliation

  usageTotal(): Promise<{ bytes: number; byKind: Record<MediaKind, number> }>;
  usagePerChat(): Promise<Array<{ conversationId: string; bytes: number; byKind: Record<MediaKind, number> }>>;

  runLRU(tier: MediaKind | 'total', freeBytes: number): Promise<{ freed: number; evicted: number }>;

  onMissing(mediaId: string): Promise<void>;                              // triggers re-download flow

  applyCaps(caps: MediaCaps): Promise<void>;                              // updates and enforces immediately
}
```

### L8.2 Write path (received media)

```
1. chat runtime receives attachment meta with server_media_id + url + kind + size + hash
2. Insert media_files row status='downloading' (row exists BEFORE file exists)
3. downloadManager.enqueue({priority: user-visible ? 'high' : 'prefetch'})
4. On chunk progress → row updated (throttled)
5. On complete → verify hash → decrypt if E2EE → move to media/ path
6. mediaManager.reserve(size, kind)      // if needed, LRU runs synchronously
7. rename partial → final path; row status='ready'
8. UI observer picks up 'ready' → renders
```

### L8.3 LRU eviction (implementation)

```ts
// pseudo-SQL against WatermelonDB via the SQLite adapter for performance
async function runLRU(tier, freeBytesTarget) {
  const rows = await q.select(`
    SELECT id, path, size_bytes FROM media_files
    WHERE kind IN (:tier) AND keep_forever = 0
      AND created_at < :now - 86_400_000               -- protect last 24h
      AND id NOT IN (SELECT media_id FROM upload_jobs WHERE state IN ('queued','sending'))
      AND id NOT IN (SELECT media_id FROM download_jobs WHERE state IN ('queued','downloading'))
    ORDER BY last_accessed_at ASC, size_bytes DESC
  `);
  let freed = 0, evicted = 0;
  for (const r of rows) {
    if (freed >= freeBytesTarget) break;
    await fs.unlink(r.path).catch(swallow);                    // file may already be gone
    await db.write(() => r.update(m => { m.status = 'missing'; }));
    freed += r.size_bytes; evicted++;
  }
  telemetry.count('media.lru.evicted', evicted, { tier });
  telemetry.gauge('media.lru.freed_bytes', freed, { tier });
  return { freed, evicted };
}
```

- Bounded per-run: max **1000 rows** or **50 MB** per invocation → prevents mega-stalls.
- On multi-tier overrun: run each tier's LRU independently (order: playback → thumbs → docs → audio → images → videos), because regenerable tiers should go first.

### L8.4 Manage Storage screen — data hooks

```ts
// features/media/hooks/useStorageOverview.ts
export function useStorageOverview() {
  const q = useQuery({
    queryKey: ['storage', 'overview'],
    queryFn: () => mediaManager.usageTotal(),
    staleTime: 60_000,
    initialData: cachedInMMKV('storage.overview'),
  });
  // subscribe to DB changes on media_files to invalidate
  useDBObserver('media_files', () => queryClient.invalidateQueries(['storage']));
  return q;
}
```
Per-chat list uses `chat_storage_stats` for O(rows-of-chats) not O(files) → sub-100 ms open.

### L8.5 CleanupWorker (background)

```ts
export async function cleanupWorker(ctx: { budgetMs: number; onLowBattery: boolean }) {
  const start = Date.now();
  const budget = ctx.budgetMs - 2000; // safety margin
  const tick = () => Date.now() - start < budget;

  if (!tick()) return;
  await mediaManager.deleteMissingFromDisk();                    // reconcile
  if (!tick()) return;
  await cleanExpiredPartials(48 * 3600_000);
  if (!tick()) return;
  await cleanUploadedStaging();
  if (!tick()) return;
  await cleanFailedOlderThan(7 * 86400_000);
  if (!tick()) return;
  const caps = getCurrentCaps();
  const usage = await mediaManager.usageTotal();
  for (const [tier, cap] of Object.entries(caps.byKind)) {
    if (!tick()) break;
    const over = usage.byKind[tier] - cap * 0.9;                 // headroom
    if (over > 0) await mediaManager.runLRU(tier as MediaKind, over);
  }
  if (tick() && sqliteFragmentation() > 0.3) await db.vacuum();
}
```

Wired via `infra/background`:
```
Android: WorkManager PeriodicWorkRequest ('media-cleanup', 24h, requiresBatteryNotLow, requiresDeviceIdle=false, backoff)
iOS:     BGProcessingTaskRequest ('nexus.media-cleanup', requiresNetworkConnectivity=false)
```

### L8.6 Re-download on render (implementation)

```ts
// design-system/MediaImage.tsx
function MediaImage({ mediaId }: { mediaId: string }) {
  const row = useMediaRow(mediaId);       // DB observer
  useEffect(() => {
    if (row?.status === 'missing' && row.server_url) {
      downloadManager.enqueue({ mediaId, priority: 'user-visible' });
    }
  }, [row?.status]);
  if (!row) return <BlurhashPlaceholder />;
  if (row.status === 'ready' && fsExists(row.path)) return <Image source={{ uri: row.path }} onLoad={mark} />;
  if (row.status === 'downloading' || row.status === 'missing') return <DownloadingPlaceholder blurhash={row.blurhash} progress={row.progress} />;
  return <RetryPlaceholder onRetry={() => downloadManager.enqueue({ mediaId, priority: 'user-visible' })} />;
}
```

### L8.7 Upload manager

- Resumable multipart to backend `media-service` (§B11).
- Per-part progress written to `upload_jobs`; survives app kill via WatermelonDB.
- On completion: server confirms `file.uploaded`; attachment reference is written to the outbox message payload.
- Retries: exponential; abandoned after N failures with a UX affordance.

### L8.8 Failure & corner cases (matrix)

| Case | Behavior |
|------|----------|
| App killed mid-download | Partial preserved; resume next foreground |
| App killed mid-upload | Same; resume from last successful part |
| Disk full during write | Reserve fails → download deferred + banner in Manage Storage |
| File on disk but no row | Cleanup worker deletes orphan |
| Row but no file | On next render → auto re-download |
| User "delete from device" during view | Blocked while message is on-screen; delayed until off-screen |
| View-once opened | File deleted immediately; row tombstoned |
| Media message deleted server-side | Row deleted; file removed (unless kept-forever explicitly) |
| Sticker pack uninstalled | Batch-delete pack folder |

## L9. Calls Runtime (WebRTC glue)

- `features/calls/model` — Zustand slice: `currentCall`, `mediaTracks`, `participants`.
- `infra/native/CallKeep` — incoming call UI (CallKit/ConnectionService).
- `infra/webrtc` — RN WebRTC + LiveKit RN SDK; token obtained from backend call-service.
- On incoming VoIP push (§M14) → display CallKit within 5 s → user answers → connect to LiveKit room.
- Foreground service (Android) started for active call only (§M13.4).
- Screen share (Android FGS with `mediaProjection`), picture-in-picture on both OSes.
- End-of-call cleanup: release tracks, stop native services, dispose peer connections.

## L10. Status/Stories Runtime

- Feed screen — DB observer on `status_posts WHERE expires_at > now ORDER BY user_id, created_at`.
- Ring indicator computed from unseen count per user.
- Story viewer — full-screen, pre-loads next N media (Wi-Fi or if small), respects reduce-motion.
- Author view — viewer list (from `status_views`), delete story → optimistic + server confirm.
- Personal E2EE status: encrypted per audience; decrypted on-device before render.

## L11. Translation Runtime (on-device for E2EE)

- Compact NLLB/Marian model downloaded on first-use over Wi-Fi (~40–70 MB per language pair); stored under `media/models/`.
- Chat translation:
  - **Personal:** decrypt → detect lang (fastText, tiny) → if ≠ pref, on-device translate → cache result in `translations` table keyed by `(msg_id, target_lang)`.
  - **Enterprise:** call ai-service; cache result.
- Real-time call translation (personal): decode audio locally → tiny Whisper → NLLB → captions overlay in call UI (opt-in on capable devices).
- User controls: auto/manual mode, target language per chat, "show original" toggle.

## L12. Notifications Runtime

- Registration on login (`auth-service` receives token per platform).
- `notifee` (Android + iOS) for rich notifications with actions ("Reply", "Mark read"), inline reply where supported.
- Inline reply → writes to outbox from a headless JS task (Android) / notification service extension (iOS) → syncs on next opportunity.
- Dedup by `event_id` (survives across cold starts using MMKV LRU).
- Muted/DND chats suppress local display; still increment unread from server-truth cursor.

## L13. Background Workers

Common interface `BackgroundJob { name, run(ctx) }`. OS-specific dispatcher wires to WorkManager / BGTaskScheduler.

Registered jobs:
- `media-cleanup` (daily-ish) — §L8.5
- `outbox-drain` (network + not-low-battery) — attempts stuck outbox items
- `prekey-refill` — refills libsignal one-time prekeys when server signals low
- `contacts-sync` (weekly, Wi-Fi) — re-sends hashed contacts (opt-in)
- `db-vacuum` (monthly)
- `token-refresh` — proactive refresh when close to expiry, only if useful

Every job is idempotent, bounded (≤ ctx.budget), and reports outcomes.

## L14. Crypto Keystore

- Identity key generated on device enrollment; stored in Keychain/Keystore via native module.
- Marked non-exportable where hardware supports (StrongBox / Secure Enclave).
- Access gated by biometric on high-security operations (view backup key, disable 2FA).
- Backup key derived from user passphrase (Argon2id) at backup time; passphrase never persisted.

## L15. Feature Flags, Config, Kill-switch

- Boot: fetch `/config?client_ver=X` (cached; MMKV mirror).
- Response: `{ features: {…}, min_client_version, killed: string[] }`.
- Guards on features check `flag.enabled(name)`; killed features render a soft message.
- Local overrides for dev/QA in Debug menu.
- All flags are booleans / small enums — no complex logic on device.

## L16. Errors, Retry, Recovery

Typed error hierarchy:
```
AppError
├── AuthError (401, needs-refresh, needs-relogin)
├── NetworkError (timeout, offline, dns, tls)
├── RateLimitError (retry-after)
├── ServerError (5xx, transient/permanent)
├── ValidationError
├── PermissionError (OS: camera denied, etc.)
├── StorageError (no-space, corrupt)
├── CryptoError (session-lost, decrypt-fail → triggers resend)
├── UnknownError
```

Retry policy per error kind (declarative table in `domain/errors/policy.ts`) so no ad-hoc retry logic in features.

Global error boundary (`ErrorBoundary`) catches uncaught render errors → shows a compact retry screen → reports.

## L17. Analytics Events (privacy-preserving)

- Only event **names + numeric metadata** are sent — no content, no ids beyond opaque hashes.
- Client-side sampling; user opt-out honored globally.
- Examples: `chat.open{count_bucket}`, `send.duration_ms{bucket}`, `sync.lag_ms{bucket}`, `media.lru.evicted{tier,count_bucket}`, `bg.wake{reason}`.
- Sent in batches when online; buffered in MMKV up to a small cap.


---

# PART F — SCREENS & FLOWS

## F1. Auth screens (DAPT + Reverse-OTP UX)

Screens: `Welcome → EnterPhone → ReverseOTP(Missed-call / SMS user-sends) → LinkPasskey → NameYou`.

Reverse-OTP UX (backend §B2.2, ₹0 cost):
- Show the DID number + a **"Give a Missed Call"** button that opens the dialer with the number pre-filled → user taps call → hangs up → the app polls a lightweight endpoint or waits for a push confirming the CLI match → auto-advance.
- Alternate: **"Send SMS"** button pre-fills `<TOKEN>` and opens Messages composer.
- On Android, if the user grants the (one-time) permission, the app uses the **SMS User Consent API** to read the confirmation SMS the server sends back (if used).
- On failure: fallback to email magic-link → last-resort server-SMS (rare).

New-device linking (§C6): QR scanning from an old device (`react-native-vision-camera` OSS), signed approval, then passkey creation.

## F2. Chat list + chat screen (offline-first)

Chat list: pinned → unread → recent; virtualized; swipe-actions (mute/archive); accessibility labels ("2 unread from X, tap to open").

Chat screen: date headers, sticky day chip, jump-to-latest, unread separator, reply threading toggle, message actions bottom sheet, media grid preview. FlashList with `estimatedItemSize`.

Composer: text + emoji + media pick + voice note (hold-to-record with amplitude visualization + slide-to-cancel). Draft persisted on every keystroke (debounced 300 ms).

## F3. Groups & channels
Members list; admin controls; invite via link/QR; announcement channels; community view (group-of-groups + announcement).

## F4. Status/Stories
Ring row, viewer, camera composer (text/photo/video/voice), audiences editor.

## F5. Calls
Recent calls list, in-call UI (grid + spotlight + speaker + reactions + raise-hand), incoming CallKit UI, huddles bar in a channel.

## F6. Media viewer + Manage Storage
Media viewer: pinch/zoom, swipe between siblings in the same chat, HLS video with quality selector, download button, forward, save-to-gallery, delete.

Manage Storage: overview + per-chat drill-down (§M12.7). Selection toolbar for bulk actions.

## F7. Settings, privacy, devices
- Profile, About, Avatar
- Privacy (last-seen, read receipts, profile visibility, discoverability)
- Notifications & DND schedules
- **Storage** (this is Manage Storage entry)
- Data usage (auto-download by network)
- Chats (theme, wallpaper, backup)
- Linked devices (list, revoke)
- Account (change number, delete account, export)
- Security (2FA, app-lock, chat-lock, screenshot protection)

## F8. Search
Global (server, ACL-scoped) + on-device (local FTS, includes personal E2EE); filters (from:, in:, has:, before:).

## F9. Notifications & DND
Prefs per chat/channel; keyword highlights; digest email opt-in.

---

# PART R — RELIABILITY & TESTING

## R1. State Machines Catalog

Each is a plain reducer with typed events, unit-tested exhaustively (state-transition coverage):
- **WSMachine** (§M8): `idle | connecting | handshake | live | dropped | backoff | suspended`
- **SyncMachine**: `idle | pulling | pushing | reconciling | resyncing | paused`
- **UploadJobMachine**: `queued | preparing | uploading | verifying | done | failed | cancelled`
- **DownloadJobMachine**: `queued | downloading | verifying | done | failed | cancelled`
- **MediaFileMachine** (§M12.10): `downloading | ready | missing | keep_forever | failed`
- **CallMachine**: `idle | incoming | outgoing | connecting | connected | onhold | ended`
- **AuthMachine**: `signed_out | onboarding | verifying | provisioning | active | locked | recovering`
- **AppLifecycle**: `foreground | inactive | background | suspended`

Every transition is a pure function; tests enumerate the state × event matrix.

## R2. Failure Scenarios & Recovery (matrix)

| Scenario | Detection | Recovery | User impact |
|----------|-----------|----------|-------------|
| WS drop | pong miss | reconnect w/ jittered backoff → resume token | banner (subtle) |
| Push not received | never surfaces to user as truth (push=hint) | next foreground/cursor sync catches up | none |
| Send failure (network) | HTTP/WS err | outbox retries; UI shows "sending" then "failed" w/ retry | tap-to-retry |
| Decrypt failure | libsignal throws | emit resend-request; renders "message unavailable, tap to resend" | 1-tap recovery |
| Storage full mid-download | reserve fails | defer + banner in Manage Storage | user unblocks |
| App killed mid-upload | crash / OOM | resume from last part on next foreground | none |
| DB corruption | migration/open error | boot to Safe Mode → fresh DB → resync from server | one-time longer open |
| Token invalid | 401 | refresh; if refresh fails → sign-out UX | rare |
| Overnight background | app killed / socket dropped | on open, cursor sync catches up in ≤ 3 s | none — unread badges correct |
| OS clears cache dir | file check fails on render | auto re-download | small delay + placeholder |
| Clock skew | server ts trusted, only display uses local | no impact on order | none |
| Simultaneous device linking race | server serializes; client retries | only one succeeds; UI reflects final list | rare |

## R3. Test Strategy

- **Unit** (Jest) — pure logic, reducers, state machines, use-cases (mock ports). Coverage gate: ≥85% for domain/, ≥80% for features/.
- **Component** (@testing-library/react-native) — screens with mocked stores/queries; snapshot for atoms only.
- **Integration** — with in-memory WatermelonDB + mocked network/WS; end-to-end flows within the JS layer.
- **E2E** (Detox) — real devices/emulators; smoke on every PR (login → send → receive → call setup), full suite nightly.
- **Perf regressions** (Reassure) — measure key screen renders on every PR; fail on > 10% regression.
- **Device metrics** (Flashlight) — nightly on ref device: cold start, memory, FPS while scrolling chat.
- **Battery** (manual + Firebase perf) — soak overnight; assert drain budgets.
- **Accessibility** — labels/hints coverage lint; VoiceOver/TalkBack manual sweep per phase.
- **Offline** — Detox network toggles; airplane-mode scenarios (send, receive on reconnect, media absent → re-download).
- **Memory** — leak tests: navigate 100 chats, memory grows < 20 MB and returns to baseline after unmount.
- **Security regression** — one test per §D4 mobile-relevant row (secure storage, no-plaintext-logged, screenshot protection on locked screens).

## R4. Performance budgets (per screen / action)

| Screen/action | p50 | p95 (ref device) |
|---------------|-----|------------------|
| Cold start → interactive | 1500 ms | 2000 ms |
| Warm start | 500 ms | 700 ms |
| Chat list first paint | 200 ms | 400 ms |
| Open chat (cached) | 150 ms | 250 ms |
| Send message → optimistic render | 20 ms | 50 ms |
| WS send → server ACK (LIVE, good net) | 80 ms | 300 ms |
| WS deliver → screen updated | 40 ms | 120 ms |
| List scroll dropped frames per 10 s | 0 | ≤ 3 |
| Media open (thumb → full, cached) | 100 ms | 250 ms |

## R5. Memory budgets

| State | Peak RSS |
|-------|----------|
| Idle chat list | ≤ 130 MB |
| Chat open (100 msgs visible) | ≤ 180 MB |
| Media viewer w/ 1080p video | ≤ 240 MB |
| Active 1:1 video call | ≤ 260 MB |
| Background (after 1 hr idle) | ≤ 90 MB |

CI enforces via a Flashlight harness on the ref device.

## R6. Battery budgets

| Scenario | Drain (ref device) |
|----------|--------------------|
| 1 hr foreground chatting | ≤ 4% |
| 1 hr foreground video call | ≤ 12% |
| 8 hr background (idle) | ≤ 3% |
| Overnight (8 hr) background | ≤ 3% |

## R7. Definition of Done (mobile)

A change is not "done" until:
1. Types pass (`tsc --noEmit`), lint clean, imports lint clean (boundary rules).
2. Unit + component tests updated and passing.
3. Reassure baseline for touched screens updated with justification if regressed.
4. E2E smoke passes on emulator + simulator.
5. All new I/O has a **typed error** path and a **retry policy** if applicable.
6. Any long-lived resource has an **owner + disposal**.
7. No new dependency without an ADR.
8. Docs (feature README) + docstrings for public functions updated.
9. No PII in logs (grep + lint pass).
10. §R2 failure scenarios relevant to the change have a test.

---

# PART C — CLAUDE CODE BUILD ROLES & PHASED DELIVERY (MOBILE TRACK)

Aligned with backend `.claude/agents/`. Add these mobile-specific roles under `.claude/agents/`:

### C1. Subagent — Mobile Staff Engineer (RN)

```md
---
name: mobile-staff-engineer
description: Owns RN app architecture — layers, state, sync, navigation, feature composition.
  Use for any change that spans multiple features or introduces domain-level constructs.
tools: Read, Edit, Write, Bash, Grep
---
You are a Staff mobile engineer (10y) on NexusChat. Follow @docs/NexusChat-Mobile-Frontend-v1.md.

Rules:
- Locked stack (§M1). No new deps without an ADR.
- Layered dependency rule (§M3). UI never imports infra.
- Local DB = source of truth for the UI (§M6). No screen waits on network.
- Every long-lived resource (timers, sockets, listeners, native handles) has an owner + disposal.
- Every change respects the perf/memory/battery budgets (§R4–R6).
Definition of Done: §R7 all boxes.
```

### C2. Subagent — Mobile Performance Engineer

```md
---
name: mobile-perf-engineer
description: Owns cold/warm start, list scroll, memory, battery, network efficiency.
  Use for any perceived jank or budget regression.
tools: Read, Edit, Write, Bash, Grep
---
Your budgets are §R4–R6. Prove them with Reassure/Flashlight before/after. Never optimize away correctness. Justify each optimization; roll back if the perf delta is < 3%.
```

### C3. Subagent — Mobile Offline & Sync Engineer

```md
---
name: mobile-offline-sync-engineer
description: Owns local DB, outbox, sync engine, cursors, reconciliation, background wake.
  Use for anything touching WatermelonDB, MMKV, sync, or background workers.
tools: Read, Edit, Write, Bash, Grep
---
Rules: idempotency by design; every effect keyed by event_id/client_msg_id; conflict resolution documented; DB migrations additive; background work bounded per §M13.
```

### C4. Subagent — Mobile Media & Storage Engineer

```md
---
name: mobile-media-engineer
description: Owns the media pipeline & storage manager — caps, LRU, Manage Storage, re-download,
  per-chat stats, background cleanup. Use for any change touching files, media, or storage UI.
tools: Read, Edit, Write, Bash, Grep
---
Follow §M12 + §L8 exactly. Invariants (must never violate):
1. Reserve-then-write for every file created.
2. Every managed file has a media_files row.
3. Screen never renders a missing file without scheduling a re-download.
4. Never delete a file currently in the viewport.
5. Cleanup respects the OS budget; jobs bounded and idempotent.
Definition of Done includes: LRU test with synthetic caps, cleanup-worker test w/ mocked OS budgets,
disk-full test, re-download-after-eviction test, per-chat stats test.
```

### C5. Subagent — Mobile Native Bridge Engineer

```md
---
name: mobile-native-engineer
description: iOS (Swift/Obj-C++) + Android (Kotlin) native modules — Keychain/Keystore,
  CallKit/ConnectionService, VoIP push, WebRTC glue, background tasks, MediaStore/Photos,
  biometric, attestation. Use for any native module work.
tools: Read, Edit, Write, Bash, Grep
---
Every native module has a TS interface first, then two parallel native impls. Contracts documented in
infra/native/*.ts. No native leak — every allocated resource has a symmetrical release path.
Foreground service on Android only during an active call.
```

### C6. Subagent — Mobile Security Engineer

```md
---
name: mobile-security-engineer
description: Owns secure storage (Keychain/Keystore), DPoP proofs, biometric gating,
  screenshot protection, cert pinning, attestation, secure logging. Use for auth, crypto, or privacy work.
tools: Read, Edit, Write, Bash, Grep
---
Non-negotiable: no plaintext of personal content on wire or server; no PII in logs; no secrets in code;
keys non-exportable where hardware allows; DPoP-bind tokens; refresh reuse-detection. Every change is
audited against backend §D4 mobile-relevant rows.
```

### C7. Subagent — Mobile QA / Test Engineer

```md
---
name: mobile-qa-engineer
description: Test strategy — unit, component, integration, Detox E2E, Reassure perf, Flashlight metrics,
  offline, battery, a11y. Use for adding/maintaining tests and CI gates.
tools: Read, Edit, Write, Bash, Grep
---
Enforce §R3. For each phase, ensure §R2 failure scenarios have a test. Wire perf/memory/battery gates in CI.
```

## C8. Phased delivery (mobile)

Runs alongside the backend phases in the main doc; mobile phases assume the corresponding backend is up in staging.

- **MP0 — Foundation.** Monorepo add-on for mobile, native scaffolds (iOS + Android), design system atoms, providers (theme/i18n/nav), pino logger, MMKV, WatermelonDB with initial schema, base network client, WS state machine skeleton, CI (lint/type/unit) + Reassure baseline job. **Exit:** app boots to a blank welcome screen on both OSes with observability wired.

- **MP1 — Auth (DAPT + Reverse-OTP).** Auth screens (§F1), Keychain/Keystore module, attestation, biometric, device provisioning (identity + prekeys upload), passkeys, token DPoP. **Exit:** cold-signup on ref device works end-to-end with ₹0 OTP, re-login uses device-key, dev can list & revoke devices.

- **MP2 — Core chat + realtime + E2EE 1:1.** WatermelonDB schemas (§L5), Sync engine (§L6), Outbox, WS machine, chat list, chat screen with FlashList, composer + drafts, libsignal integration, receipts, typing, reconnect-with-cursor. **Exit:** two devices exchange E2EE messages offline-then-online without loss; §R4 budgets met.

- **MP3 — Groups + multi-device + status.** Group screens, sender-keys client wiring, multi-device link UX (QR + signed approval), status/stories full (F4), per-audience E2EE. **Exit:** group message across devices, offline device rejoin re-syncs, status posts work.

- **MP4 — Media + Manage Storage + backup.** MediaManager, upload/download managers, ManageStorage screen (F6), background cleanup worker, E2EE chat backup UX (recovery key generation + restore). **Exit:** LRU + caps enforced on ref device, orphan reconciliation works, re-download-after-eviction works, backup round-trip works.

- **MP5 — Notifications + background + battery.** FCM/APNs + notifee + VoIP push wiring, DND/mute UX, WorkManager/BGTaskScheduler jobs, wake-budget test. **Exit:** overnight background soak passes drain + memory budgets (§R6).

- **MP6 — Calls & huddles.** WebRTC + LiveKit RN SDK, CallKeep, in-call UI, huddles bar. **Exit:** 1:1 + group + huddle call flows work; call in bg → wake within budget.

- **MP7 — Search + translation + AI.** On-device SQLite FTS for personal + server search UI with ACL; on-device NLLB/Whisper for personal translation; server translation UX for enterprise; meeting captions. **Exit:** personal chat translated on-device (server never sees plaintext); enterprise cached translations; live captions in a 2-language meeting.

- **MP8 — Enterprise + admin + workflows.** SSO login (Keycloak WebView with system browser), org switcher, admin views, bots/slash/workflows client. **Exit:** SSO login works, admin can trigger retention/legal-hold flow.

- **MP9 — Accessibility + i18n + polish.** Full a11y sweep, RTL languages, dynamic type, dark/light polish, reduce-motion. **Exit:** WCAG AA on all core screens; 5+ languages including 1 RTL.

- **MP10 — Hardening & release.** Perf/memory/battery regression suite in CI as hard gates; store readiness; staged rollout config; kill-switch tests. **Exit:** store submissions ready, budgets green on ref device, kill-switch tested.

Every phase runs through `mobile-qa-engineer` OPS-3-style audit before exit.

---

# PART A — APPENDICES

## A1. Mobile Threat Model (extends backend §D4)

| Threat | Mitigation |
|--------|-----------|
| Malicious app reads our storage | Files internal-only; encrypted at rest; Keychain/Keystore for keys |
| Screenshot of secrets | FLAG_SECURE + secure-window on iOS for sensitive screens |
| Backup extraction (adb/iCloud) | Sensitive dirs excluded from OS backup |
| Root/jailbreak escalation | Soft-signal restrictions on sensitive actions |
| Clipboard sniffing | Sensitive fields marked; auto-clear |
| MITM on API | TLS + optional cert pinning w/ fallback list |
| Downgrade attack via feature flag | Min-client-version enforced; killed features soft-refuse |
| OTP phishing overlay | Native OTP autofill; no in-app dialogs simulate SMS |
| Rogue notification action | Actions signed by app; server verifies |
| Session token in memory dump | Short TTL + rotation; DPoP prevents lift-and-shift |
| Local DB tamper | WatermelonDB integrity checks; SQLite auth (Android Keystore-derived key optional) |
| Notification content leak (E2EE) | Push carries no content; app decrypts locally before display |

## A2. Native Module Catalog (see §M23) — full ABI is documented in `infra/native/README.md`.

## A3. Traceability (feature → module → screen → test)

Excerpt:
| Feature | Modules | Screens | Tests |
|---------|---------|---------|-------|
| Send message (E2EE 1:1) | crypto, chat, outbox, ws | Chat | unit(reducers), integration(send+recv), E2E(smoke) |
| Manage Storage | media-manager, usage-stats, cleanup-worker | ManageStorage | unit(LRU), integration(reserve/write), component(screen), E2E(bulk delete) |
| Re-download after eviction | media-manager, download-manager, MediaImage | Chat / MediaViewer | integration(evict then render) |
| Overnight background | ws-machine, background workers, MediaCleanupWorker | (invisible) | Detox overnight soak |
| Call incoming | VoIP push, CallKeep, calls | Incoming CallKit | E2E |
| Reverse-OTP UX | auth API, native dialer | ReverseOTP screen | E2E happy + fallback |
| Chat translate (personal) | crypto, translation runtime | Chat | integration (no server call ever fires) |

## A4. Changelog

- **v1.0** — initial mobile HLD+LLD; explicit coverage for the 7 media/storage items (§M12 + §L8); overnight-background contract (§M13); worst-device budgets (§M0.2, §R4–R6); Claude Code mobile subagents + 11-phase mobile roadmap.

*End of document — NexusChat Mobile Frontend v1.0.*
