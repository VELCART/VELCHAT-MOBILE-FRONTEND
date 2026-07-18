# VelChat Mobile — Claude Code Prompt Pack (Frontend Only)

**Use this with:** the mobile architecture doc at `docs/NexusChat-Mobile-Frontend-v1.md` (v1.0) and the backend doc at `docs/NexusChat-Architecture.md` (v2.5+). Backend must be deployed at least to staging before MP2 onwards.

**How to use:**
1. Run `MBOOT-0` once to add the mobile app to the monorepo and set up mobile-specific `.claude/agents/`.
2. Then run `MP0 → MP10` in order. Each phase has clear exit criteria mapped to the mobile doc.
3. Don't paste the doc into prompts — Claude Code already has it via `CLAUDE.md`. Refer by section (`§M12`, `§L8`, `§R4`, etc.).
4. After each phase, run `MOPS-3 code-audit` before moving on.
5. Perf/memory/battery budgets are **hard gates** on the ref device — a phase does not exit until measurements match §R4–R6.

**Token-saving rules:**
- Short prompts, doc references over re-pasting.
- "Use the `<role>` subagent" → loads role from `.claude/agents/<role>.md` (its own context window).
- Phases are vertical slices, not full features at once.
- Perf/memory targets are numeric — no wishful language.

---

## MBOOT-0 — Mobile app bootstrap (run ONCE, main session, no subagent)

```
Add the React Native mobile app to the NexusChat monorepo per @docs/NexusChat-Mobile-Frontend-v1.md.

Stack (LOCKED per §M1, no substitutes without ADR): React Native (bare, TS strict), Zustand + TanStack Query v5, WatermelonDB + MMKV (AsyncStorage forbidden), React Navigation v6+ native-stack, Axios with custom interceptors, react-native-webrtc + LiveKit RN SDK, libsignal-client (RN binding), react-native-keychain, notifee + @react-native-firebase/messaging, react-native-voip-push-notification, react-native-callkeep, react-native-video, react-native-blob-util, @shopify/flash-list, react-native-reanimated v3, react-native-gesture-handler, i18next + react-i18next, pino, Detox, Reassure, Flashlight.

TS config: strict:true, noImplicitAny, strictNullChecks, noUncheckedIndexedAccess, noFallthroughCasesInSwitch, noUnusedLocals, noUnusedParameters, exactOptionalPropertyTypes.

Create exactly the folder tree from §M4:
- apps/mobile/ (RN project + android/ + ios/)
- src/ layers: app, core, platform, design-system, i18n, theme, navigation, infra/, domain/, features/, ui/, tests/
- e2e/ (Detox), perf/ (Reassure), scripts/

Also create:
- Native scaffolding for both iOS (Xcode project) and Android (Gradle 8, Kotlin, target SDK 34, min SDK 24)
- .claude/agents/*.md for mobile roles per §C1–§C7 (mobile-staff-engineer, mobile-perf-engineer, mobile-offline-sync-engineer, mobile-media-engineer, mobile-native-engineer, mobile-security-engineer, mobile-qa-engineer)
- Extend the root .claude/CLAUDE.md with a "Mobile section" pointing to @docs/NexusChat-Mobile-Frontend-v1.md and stating: reference device = 3 GB Android 10; worst-device-first; local DB = UI source of truth; overnight background contract per §M13.
- eslint config with @typescript-eslint strict + eslint-plugin-boundaries enforcing the import layers from §M4
- CI job (extend existing): lint, typecheck, jest unit, RTL component tests, Reassure baseline job on a matrix (iOS Simulator + Android emulator), bundle-size check (≤ 6 MB JS, ≤ 45 MB arm64 APK base), boundary lint gate
- Flashlight harness config for the ref device (Pixel 4a or equivalent 3 GB Android profile)
- Fastlane skeletons for iOS + Android beta upload (no API tokens committed)
- react-native-config with dev/stage/prod flavors; distinct bundle IDs per env

Constraints:
- Locked stack (§M1). No paid SaaS.
- No AsyncStorage anywhere in the codebase (lint rule to enforce).
- No console.log in production (lint rule; pino only).
- Every native module has a typed TS interface in infra/native/ before native code.

Definition of Done: `pnpm i && pnpm --filter mobile ios` and `pnpm --filter mobile android` both launch a blank splash on both simulators; `pnpm --filter mobile test` green; Reassure baseline recorded; boundary lint passes; bundle size gate passes.
```

---

## MP0 — Foundations (platform + observability, no features)

```
Use the `mobile-staff-engineer` subagent.

Implement Phase MP0 per §M0–§M11, §M22.

Scope:
1. Providers wired in src/app/App.tsx per §L2: SafeAreaProvider, ErrorBoundary, QueryClientProvider, ThemeProvider, I18nProvider, NavigationContainer, GlobalOverlays.
2. Bootstrap sequence per §L2 (order + non-blocking): pino init with redaction pipeline, MMKV (encrypted with Keychain-derived key), WatermelonDB open + migrations, Crypto init stub, NetworkClient, RealtimeClient (deferred connect), background workers scheduled but not running features.
3. Design system tokens (spacing/typography/elevation/motion/color) + primitives (<Text>, <Pressable>, <Icon>, <Screen>, <Row>, <Column>, <Card>, <Divider>, <Avatar>, <Badge>) per §M16.
4. Theme (light/dark/system) + i18n scaffold (en + one RTL placeholder e.g. ar) per §M18.
5. Navigation shell per §M17: RootStack with AuthStack + AppTabs skeletons; native-stack; deep link scheme registered.
6. Observability: pino structured logs with PII redaction, OTel RN SDK with trace/span propagation on network + WS + state transitions, GlitchTip (self-hosted Sentry-compat) crash SDK with source maps upload in CI, Reassure perf baseline job green, Flashlight cold-start measurement recorded on ref device.
7. Feature flags + remote kill-switch loader per §L15 (fetched at boot, MMKV-cached, min_client_version enforced).
8. Battery-info + network-info native module wrappers per §M23 (thin TS interface + both OS impls).

Rules:
- Cold start budget ≤ 2.0 s on ref device (§M0.2, §R4). Any regression → block.
- No blocking network on the render path (§M9).
- Every effect/subscription/timer has an owner + disposal (§M20.3).
- Layer boundaries per §M4 enforced by lint.

Tests:
- Reassure baseline: App boot render, ChatList shell (empty state) render.
- Component tests for design system primitives.
- Boundary lint: sample violation → CI fails.
- Log redaction test: attempting to log a token / phone number / message content is stripped.
- Cold start measurement: Flashlight run reports ≤ 2.0 s on ref device; failure blocks PR.

Definition of Done (§R7): types clean, boundary lint clean, Reassure baseline green, Flashlight cold-start under budget, GlitchTip receiving a test error, crash source-maps uploaded, no PII in logs.
```

---

## MP1 — Auth (DAPT + Reverse-OTP UX)

```
Use the `mobile-security-engineer` subagent (primary), `mobile-native-engineer` for Keychain/Keystore/Attestation modules.

Implement Phase MP1 per §M15 (crypto), §M19 (security), §L14 (keystore), §F1 (auth screens), and backend §B2 / flows C1, C6, C17, C18.

Native modules (typed TS interface first in infra/native/, then iOS + Android impls):
- Keychain module: generate device keypair (P-256), store in Secure Enclave / StrongBox where available, non-exportable; expose sign() only. Also generic secure KV for tokens.
- Attestation module: Play Integrity verdict (Android) + App Attest (iOS). Returns opaque attestation blob.
- Biometric module: BiometricPrompt (Android) + LocalAuthentication (iOS). Returns success/canceled/failed enum.
- Contacts read module (opt-in, one-time permission) — used later for hashed contact discovery.
- ScreenshotProtection module: FLAG_SECURE / iOS secure window; scoped enable/disable API.

Auth flow (§F1):
- Welcome → EnterPhone → ReverseOTP → LinkPasskey → NameYou screens.
- Reverse-OTP UX per §F1: "Give a missed call" opens native dialer pre-filled; "Send SMS" opens Messages composer with pre-filled token. Android SMS User Consent API for auto-completion after user consent (one-time permission).
- Passkey creation via @simplewebauthn/browser (native passkey APIs on iOS 16+/Android 14+).
- Fallback: email magic-link screen; server-SMS OTP as last resort.

Auth internals:
- AuthMachine per §R1: signed_out | onboarding | verifying | provisioning | active | locked | recovering.
- Token DPoP: every mutating request signs {htu, htm, iat, nonce} with device key (§M7, §L3).
- Refresh flow with reuse-detection per backend §B2.3.
- Device list + revoke UI (Settings → Linked devices).
- Number change flow (C17): current trusted session + new-number Reverse-OTP; atomic re-point on account_id.
- Recovery flow (C18): multi-factor + delay + notify banners; local UI states for delay windows.

Signal prekey lifecycle:
- On device provision, generate identity + signed prekey + N one-time prekeys via libsignal; upload to auth-service.
- Background prekey-refill job (§L13) scheduled when server signals low.

Tests:
- Reverse-OTP UX: dialer pre-fill happy path (Detox); SMS composer path (Detox where possible).
- Device key: sign+verify round-trip; non-exportable enforced (attempt to export fails).
- DPoP: every mutating request carries a valid proof; a request without proof is rejected in a mocked backend test.
- Refresh reuse-detection: replaying a used refresh triggers full-family revoke → forced re-login UX.
- Attestation: mocked failing verdict → enroll blocked with clear error.
- Biometric: chat-lock gates access; on failure → returns to lock screen.
- E2E: full cold signup on ref device (Detox).

DoD (§R7): auth E2E smoke green on iOS + Android; no plaintext key ever crosses JS bridge; keys survive app kill; screenshot protection on backup-key screen verified manually + test.
```

---

## MP2 — Core chat + realtime + E2EE 1:1

```
Use the `mobile-staff-engineer` and `mobile-offline-sync-engineer` subagents.

Implement Phase MP2 per §M6–§M11, §L4–§L7, §F2, and backend §B4, §B9, flow C2 + C16.

WatermelonDB schemas (§L5) — create all of: conversations, messages, receipts, conversation_members, users, outbox, drafts, upload_jobs, download_jobs. Add indexes exactly per §L5. Migration v1.

Domain use-cases (§L7):
- sendMessage(): optimistic DB write + outbox enqueue; encrypt-for-devices via libsignal.
- receiveMessage(): dedupe by event_id, decrypt if E2EE, DB batch write, emit local notif if bg.
- markRead(): update last_read_seq + enqueue read receipt.
- edit/delete/react/pin per §B15 / §L7.

Realtime client (§L4):
- WSMachine reducer with typed events; connection lifecycle exactly per §M8 diagram.
- Resume token cheap-reattach (backend §G3-3) vs full cursor sync.
- Heartbeat 25s; jittered backoff 250ms → 30s cap; dedup LRU in MMKV.

Sync engine (§L6):
- Cursor per resource; pull → batch apply in a single transaction → advance.
- Outbox worker: per-conversation ordered drain; retryable errors → backoff; permanent → surface retry UI.
- Reconciliation (§L6.4): server seq wins for order + edits; reactions = set union; read cursor = max.
- Stuck detection: cursor lag > 500 events or > 30 s LIVE → targeted resync.

libsignal integration (§M15):
- Identity + prekeys already provisioned in MP1.
- Sessions cached in memory hot-set; cold sessions lazy from encrypted SQLite via the libsignal wrapper.
- All crypto ops off the JS thread (native worker) — verify by measurement.
- Decryption failure → emit resend-request per backend §G1-1; UI shows "recovering" for the failed msg.

Chat UI (§F2):
- Chat list: FlashList, pinned → unread → recent; swipe-to-mute/archive; instant open (DB source of truth); accessibility labels.
- Chat screen: FlashList reversed with sticky day headers, unread separator, jump-to-latest FAB, tap-to-jump-to-reply, long-press action sheet (reply/forward/copy/star/delete/react).
- Composer: text + emoji + attach + voice note (hold-to-record with amplitude + slide-to-cancel); drafts persisted debounced 300 ms per §L5 drafts table.
- Typing indicator (§F2) fanned via WS.

Perf gates (§R4):
- Chat list first paint ≤ 200 ms p50 / 400 ms p95 on ref device.
- Chat screen open (cached) ≤ 150 ms p50 / 250 ms p95.
- Scroll ≥ 55 FPS avg; 0 frames > 32 ms in a 10 s scroll.
- Send → optimistic render ≤ 20 ms p50.
- Fail PR on Reassure regression > 10%.

Tests:
- Two-device E2EE 1:1 integration (Detox pair): send offline, come online, receive; verify zero plaintext in DB dumps + logs.
- Reconnect-with-cursor: forcibly drop socket mid-flow; reconnect replays exactly the missed events; no duplicates (event_id dedup verified).
- Outbox durability: kill JS engine mid-send; on relaunch, outbox drains cleanly.
- Idempotency: same client_msg_id delivered twice → single row.
- Backpressure: slow consumer drops only ephemeral (typing) — durable messages preserved.
- Perf tests per gates above; Flashlight scroll test on ref device.

DoD (§R7): all perf gates green on ref device; two devices exchange messages offline → online with no loss; DPoP intact on all mutating requests; no plaintext hits DB or logs.
```

---

## MP3 — Groups + multi-device + status/stories

```
Use the `mobile-staff-engineer` (primary) and `mobile-security-engineer` for sender-keys/epoch.

Implement Phase MP3 per §L10, §F3, §F4, and backend §B7, §G1-2, §G1-3, flows C6, C7, C11.

Groups (§F3):
- Group screens: info, members, admin controls, invite via link/QR.
- Announcement channels (only admins post).
- Broadcast lists.
- Communities (group-of-groups + announcement channel).

Multi-device (§M15 + §L14):
- Link-a-new-device flow (§C6): QR scan on new device via react-native-vision-camera; existing trusted device signs the approval; new device provisioned.
- Sender-side per-device fan-out on send: encrypt once per recipient device + own other devices.
- History bundle relay path (server transports opaque E2EE bundles device-to-device).

Sender-Keys client (§M15, §G1-2):
- Track group epoch per conversation.
- SKDM distribute + receive; queue SKDMs missed while offline.
- skdm-request on decrypt-fail for a known epoch; recover from any current member's redistribution.
- Bind sends to current device_list_epoch (§G1-3); on epoch bump, re-fan-out in-flight sends.

Key transparency client (§G1-3):
- Verify Merkle proofs of device-list versions the server hands out.
- On mismatch → refuse to encrypt + show "verify" banner + audit log entry.

Status / Stories (§F4, §L10):
- status_posts, status_views, status_reactions, status_archive, status_mutes tables.
- Author flow: text/image/video/voice status with background/gradient/music; audiences (contacts/except/only).
- Viewer flow: ring row on top of chat list; full-screen story viewer with pre-load next N; reactions + reply → creates a 1:1 message referencing the status.
- View-once + 24h TTL enforcement on device (server also enforces).
- Personal status E2EE (encrypted per audience-member).

Tests:
- Group message across 3 test devices; remove one member → new epoch → removed device fails to decrypt new-epoch ciphertext.
- Offline device rejoins after epoch change → skdm-request → recovered.
- Simultaneous device-link race (2 new devices at once): server serializes; only one succeeds; UI reflects final list.
- Status audience: exclude-user cannot fetch a status; view-once removed from feed after one open.
- Key transparency: forged device-list proof triggers refuse-to-encrypt.

DoD (§R7): G1-1/G1-2/G1-3 scenarios green in tests; status posts expire correctly; multi-device sync converges within 5 s of reconnect.
```

---

## MP4 — Media + Manage Storage + E2EE backup (the section you specifically flagged)

```
Use the `mobile-media-engineer` subagent (primary). This phase implements §M12 + §L8 in full. Every §M12 invariant must have a test.

Scope:
1. MediaManager per §L8.1 (allocatePath, reserve, registerFile, markAccessed, markKeep, delete, usageTotal, usagePerChat, runLRU, onMissing, applyCaps). Owns every file the app creates.
2. Filesystem folder strategy per §M12.2: iOS Library/Application Support paths + Android filesDir/cacheDir; sub-shard `{first2 of sha256(conv_id)}/`; backup exclusion (NSURLIsExcludedFromBackupKey iOS, allowBackup=false + dataExtractionRules Android).
3. Cache caps per §M12.4: total default 1 GB on ref device (halved automatically if free disk < 1 GB; distress profile 100 MB if free disk < 300 MB). Per-tier caps (images/videos/audio/voice/docs/thumbs/playback/uploads/downloads-partial). User-adjustable sliders in Settings → Storage.
4. LRU eviction per §M12.5 + §L8.3: last_accessed_at throttled (1/min per file); protect keep_forever + in-flight + last-24h; bounded per-run (≤ 1000 rows / 50 MB); regenerable tiers evicted first.
5. UploadManager per §L8.7: resumable multipart against backend media-service; per-part progress persisted in upload_jobs; survives app kill.
6. DownloadManager per §L8.6: resumable via Range header; partial in downloads.partial/; priority queue (user-visible > requested > prefetch); bounded concurrency 3+1; opportunistic cancel on off-screen.
7. Re-download strategy per §M12.8: MediaImage/MediaVideo components check media_files.status + file exists at render; on missing with server_url → auto-enqueue user-visible download; render blurhash placeholder + progress; status=failed → retry UI.
8. Per-chat storage stats per §M12.9: chat_storage_stats materialized table maintained via WatermelonDB write-side hooks; nightly reconcile from full sums to correct drift.
9. Background cleanup worker per §M12.6 + §L8.5: WorkManager (Android, 24h period, BATTERY_NOT_LOW) + BGProcessingTaskRequest (iOS, submitted after foregrounding). Bounded budget: hard 30 s worker time cap on iOS, ~10 min on Android. Steps: (a) reconcile FS↔DB (orphan sweep + missing-file marking), (b) delete partials > 48h, (c) clean uploaded staging, (d) clean failed > 7d, (e) per-tier LRU to 90% of cap, (f) SQLite vacuum if fragmentation > 30%.
10. Manage Storage screen per §M12.7 + §L8.4 + §F6:
    - Overview: total usage + free-device space + donut per media type + auto-tune status.
    - Per-chat drill-down: aggregated size + kind split + FlashList grid + multi-select + "Free up X MB in this chat".
    - Filters: media type, size range (>5 MB, >50 MB), age (>30 d), forwarded-only, view-once expired, favorites excluded.
    - Actions: Delete from device (keep in cloud) / Star (keep forever) / Export.
    - Settings row: per-type cap sliders, auto-download rules (Wi-Fi / cellular / never per kind), "Clear all cache" (double confirm), "Reset caps to default".
    - Query perf: chat list opens sub-100 ms using chat_storage_stats.
11. Media viewer per §F6: pinch/zoom (Reanimated), swipe siblings, HLS video (react-native-video), download button, forward, save-to-gallery, delete.
12. E2EE chat backup + restore per §C21:
    - Recovery-key generation UX (show once, verify entry, offer optional Shamir social recovery placeholder).
    - Argon2id parameters (memory 64 MB, time 3, parallelism 1 tuned for ref device).
    - Backup: bundle local chats + media keys → encrypt with derived key → upload ciphertext to media-service backup bucket.
    - Restore: on new device after DAPT, download blob → passphrase → decrypt → rehydrate WatermelonDB + media file placeholders (files re-download on-demand via §M12.8).
    - Lost passphrase = unrecoverable — explicit warning UX and clear terminology.
13. View-once media lifecycle per §C22: single-use key; render → mark viewed → local delete → server 410 for future fetches; row tombstoned.

Every §M12 invariant is a test (per §L8.8 matrix):
- Reserve-then-write for every file created.
- Every managed file has a media_files row (fuzz test: no file appears without a row).
- Screen never renders a "missing" file without scheduling a re-download (integration test).
- Never delete a file currently in the viewport (Detox verifies).
- Cleanup respects OS budget; jobs bounded and idempotent (unit test with mocked budgets).
- Disk-full during write → deferred + banner (mock statfs → assert defer).
- Orphan reconciliation deletes files not in DB.
- Missing-file re-download restores playback within 5 s on Wi-Fi in the test harness.
- Per-chat stats stay accurate under concurrent writes (property test).
- View-once file deleted immediately after render + server 410 stubbed.

Perf gates:
- Manage Storage overview opens ≤ 250 ms p95 with 5000 media rows fixture on ref device.
- Per-chat drill-down opens ≤ 300 ms p95.
- LRU sweep of 1000 rows ≤ 200 ms.

DoD (§R7): all §L8.8 matrix rows covered by tests, all §M12 invariants proven, Manage Storage passes Reassure baseline, backup round-trip works on a new install, no unbounded cache in any code path (grep + review).
```

---

## MP5 — Notifications + background + overnight-battery contract

```
Use the `mobile-native-engineer` (primary, iOS + Android bg APIs) and `mobile-offline-sync-engineer` (sync-on-wake).

Implement Phase MP5 per §M13 (background), §M14 (push), §L12 (notif runtime), §L13 (bg workers). This is the "raat bhar background me chhod du" contract.

Push wiring:
- FCM (@react-native-firebase/messaging) registration + token rotation handling.
- APNs setup + push entitlements + service extension for rich content + local decryption.
- VoIP push via react-native-voip-push-notification (iOS PushKit) → wired to CallKeep incoming UI within 5 s.
- notifee for rich notifications with inline reply (Android + iOS 12+).
- Web Push not applicable on native (web app only).

Push handling (§M14):
- Regular data push → wake bounded sync (iOS ≤ 20 s, Android ≤ 30 s) → cursor pull → apply DB → local notif via notifee.
- E2EE push carries NO content → app fetches ciphertext, decrypts locally, shows decrypted title/preview.
- Duplicate suppression via event_id LRU in MMKV (survives cold start).
- Suppress local notif if foreground WS already delivered.
- DND/mute/quiet-hours honored client-side (server-side too).

Background execution (§M13):
- No background WebSocket. WSMachine → SUSPENDED on app background.
- Android: WorkManager PeriodicWorkRequest for media-cleanup (24h), outbox-drain (constraints: network + battery-not-low), prekey-refill, contacts-sync (weekly, Wi-Fi), db-vacuum (monthly), token-refresh (constraint-based).
- iOS: BGProcessingTaskRequest for cleanup, BGAppRefreshTaskRequest for a quick cursor sync (~30 s). Register expiration handlers to save state and exit cleanly.
- In-call foreground service (Android) only during an active call, with mediaProjection/microphone/camera as required.
- Wake budget target ≤ 1/hr for silent maintenance.

Inline notification reply:
- Android: headless JS task on tap → write to outbox → return; sync drains on next opportunity.
- iOS: NotificationServiceExtension modifies payload; UNNotificationAction routes into app on tap → outbox write.

Overnight battery test rig (Flashlight + Firebase Test Lab or local):
- 8-hour soak on ref device, DND off, no active call, no user interaction.
- Assert: peak RSS ≤ 90 MB after soak; battery drain ≤ 3%; ≤ 8 wakes total; no wakelock leak (dumpsys); no ANR; sync cursor caught up at end.

Tests:
- Push happy path (data + E2EE): payload with no content → app decrypts and shows preview → tap opens correct chat.
- VoIP push → CallKit within 5 s (perf assertion).
- Push dedup: same event_id sent twice → single notification.
- Background wake budget: WorkManager stub reports ≤ 30 s runtime per wake.
- Overnight soak (nightly CI on device farm): drain + memory budgets green.
- Cold open after overnight: unread badges reflect server truth within 3 s.

DoD (§R7): overnight soak green on ref device; wake budget respected; no phantom notifications; no zombie downloads; §R6 battery budgets all met; killed features (via kill-switch) don't schedule work.
```

---

## MP6 — Calls & meetings

```
Use the `mobile-native-engineer` (WebRTC/CallKit/ConnectionService) and `mobile-staff-engineer` (call runtime + UI).

Implement Phase MP6 per §M17 (nav), §L9 (calls runtime), §F5, backend §B12, flows C8, C9.

WebRTC + LiveKit:
- react-native-webrtc + LiveKit RN SDK integrated; token obtained via call-service.
- SFU media routing; simulcast on send; active-speaker selection on receive.
- 1:1 fallback to P2P where advantageous; groups always SFU.
- coturn used automatically by SDK for TURN.

CallKeep:
- Incoming: VoIP push (iOS) / FCM high-priority (Android) → CallKeep incoming UI within budget.
- Outgoing: reportNewIncomingCall(false) equivalents; system integration.
- End-of-call cleanup: release tracks, stop native foreground service (Android), dispose peer connections.

In-call UI (§F5):
- Grid + spotlight + speaker view; pinch-to-spotlight.
- Controls: mute, camera, flip, screen share (Android FGS with mediaProjection; iOS screen broadcast extension optional/skipped for MP6), reactions, raise-hand.
- Picture-in-picture on both OSes.
- Reanimated worklets for smooth track switching.
- Battery-aware: below 15% battery → cap send bitrate + no PiP.

Scheduled meetings (§C9):
- Join link deep-link handler.
- Lobby wait UI with host admit.
- Breakout rooms: move/return participants.
- In-call chat panel.

Huddles (Slack-style, per backend):
- Persistent audio room bound to a channel; join/leave without a call setup UI; sticky bar at top of channel screen.

Tests:
- 1:1 video call setup on emulators (Detox harness with mocked SFU where needed): offer/answer/ICE exchanged; both connect.
- Incoming VoIP push → CallKit UI within 5 s (perf assertion).
- Screen share request → Android FGS starts; end call → FGS stops.
- Battery-aware downgrade: mock battery 10% → assert bitrate cap applied.
- Overnight bg while a huddle is "joined but muted" → app in bg → sockets suspended per §M13; on re-open, huddle rejoined via presence.

DoD (§R7): 1:1 + group + meeting + huddle flows work on both OS; foreground service starts only during call; no native resource leak (verified via profiler run); §R4 call join latency budget met.
```

---

## MP7 — Search + translation + AI

```
Use the `mobile-staff-engineer` (search UI + local FTS) and `mobile-offline-sync-engineer` (on-device translation runtime).

Implement Phase MP7 per §L11 (translation runtime), §F8 (search), backend §A26, §B20, flows C19, C20.

Search (§F8):
- Server search UI: filters (from:, in:, has:, before:), respects ACL; results screen with jump-to-message.
- On-device SQLite FTS via WatermelonDB for personal E2EE (since server can't index those).
- Unified search screen switches source transparently based on the conversation kind.

Chat translation (§A26.2):
- user_language + chat_translate_pref tables per §L11.
- Auto mode toggle (global + per-chat): on incoming, detect lang (fastText tiny model); if ≠ pref, translate.
  - Personal → on-device NLLB compact model (download on first-use over Wi-Fi, ~40–70 MB per language pair, stored under media/models/).
  - Enterprise → ai-service call + cache.
- Manual mode: "Translate" bottom-sheet action on any message.
- Compose translation: optional, translates the outgoing message on send.

Real-time call captions (§A26.3):
- Enterprise: subscribe to server-emitted translated captions via realtime-gw; overlay on in-call UI per listener's preferred language.
- Personal (opt-in on capable devices): tiny Whisper streaming STT on decoded audio + NLLB translation → local captions. Never sends audio to server.
- TTS voice output (Piper): optional, mixed via a local audio track for the listener.

AI features UI:
- Meeting summaries screen (enterprise): displays generated summary + action items.
- Semantic search results toggle (enterprise).

Privacy fork enforcement (hard rule):
- Any translation/STT call from the mobile app is tagged (personal-E2EE=true|false).
- Personal-E2EE calls MUST NOT hit ai-service; they run on-device. Test asserts no network call fires for personal path.
- Enterprise calls include the tenant_id header for server routing.

Tests:
- Personal chat translated on-device (integration test intercepts all network — expects zero calls to ai-service).
- Enterprise translation cache hit on 2nd view.
- Live meeting fixture: 2 mocked listeners with different langs receive captions in their languages.
- Model download over cellular is blocked by default; Wi-Fi allowed.

DoD (§R7): personal translation privacy fork proven by "zero-network" test; caption latency ≤ 3 s on ref device with compact models; models are re-downloadable and eviction of a model triggers re-download on next use.
```

---

## MP8 — Enterprise + admin + workflows client

```
Use the `mobile-staff-engineer`.

Implement Phase MP8 per §M13 (multi-tenancy client side), §F3 (channels), §F7 (settings/admin), backend §B7, §A13, §A4.7.

Enterprise:
- SSO login via Keycloak using system browser (react-native-inappbrowser or SFAuthenticationSession) — NOT a WebView (security).
- OIDC PKCE flow; token exchange server-side.
- Workspace/Org switcher UI (Slack-style rail) with fast-swap; state per tenant kept in memory + cache.
- Tenant context propagation to every request (§G6 in backend doc): tenant_id in JWT + header + optional gRPC metadata.
- Channel screens: public/private/announcement/broadcast semantics; threads (parent + replies) per §B15.
- Directory + people search (org-scoped).

Admin (features/admin/):
- Members + roles table.
- Retention policy + legal hold toggles.
- Audit-log viewer (paged) + compliance export request.
- DLP settings (org-level policy list).

Automation client (§B17):
- Slash-command UX in composer (`/`-triggered menu, autocomplete).
- Bot modal renderer (block-kit-like: text/image/section/action/context blocks).
- Workflow trigger UI + reminders (`/remind`) list.
- Interactive component callbacks (button/menu/modal open → automation-service round-trip).

Polls (§B16):
- Create poll → render → vote (anonymous option) → live tallies from realtime updates.

Canvas / Clips / Lists (minimal client from §A4.7):
- View + create canvas (JSON block editor stub, extensible).
- Record and post a clip (short async video/audio).
- Lists CRUD in a channel.

Tests:
- SSO login round-trips (system browser mocked in Detox).
- Tenant guard: attempting to access another org's channel from the client returns 403; UI shows correct empty state.
- Slash command HMAC verification: bot response with bad signature is rejected.
- Poll anonymous mode: voter ids not visible to non-admins in UI.

DoD (§R7): a user in 2 orgs can switch cleanly; SSO flow works; admin can trigger retention export; workflows round-trip; §G6 tenant guardrails intact from the client's perspective (headers correct + no cross-tenant leaks in local cache/DB).
```

---

## MP9 — Accessibility + i18n + polish

```
Use the `mobile-staff-engineer` (a11y sweep + i18n; considers using an accessibility-specialist mindset per §M0/§M18).

Implement Phase MP9 per §M18, §R3 (a11y tests).

Accessibility (§M18):
- accessibilityLabel + accessibilityRole + accessibilityHint on every interactive component.
- Focus order for VoiceOver/TalkBack; custom focus in modals.
- 44×44 minimum touch targets audited on every screen.
- Dynamic type scaling to 200% without truncation on core screens (chat, list, settings, Manage Storage).
- Reduce-motion honored: animations → fades ≤ 100 ms.
- Color contrast WCAG AA everywhere; AAA on body text.
- Screen-reader "New message" announcements throttled to avoid overload.

Localization (§M18):
- 5+ locales including English + at least one RTL (Arabic or Urdu).
- ICU message format for pluralization.
- Runtime language switch UI + state-preserving reload.
- RTL layouts audited: logical spacing (marginStart/End), icon mirroring for directional icons only, RTL numerals where locale expects.
- Date/time via Intl; formatted per locale.

Polish:
- Dark/light theme parity pass; contrast pass across all screens.
- Haptics on key interactions (send, receive, error) with respect-reduce-motion.
- Empty states + error states + skeletons designed and consistent.
- Wallpaper + per-chat theming applied consistently.

Tests:
- @testing-library/react-native a11y assertions on every screen.
- RTL snapshot for 3 key screens (chat list, chat, Manage Storage).
- Manual a11y sweep (VoiceOver + TalkBack) with a checklist per screen.
- Locale switch: state preserved across reload.

DoD (§R7): WCAG AA verified via automated + manual sweep on all core screens; 5 locales including 1 RTL work end-to-end; reduce-motion respected everywhere; dynamic type does not break any core screen.
```

---

## MP10 — Hardening & release

```
Use the `mobile-qa-engineer` (primary) + `mobile-perf-engineer` for budget gates + `mobile-security-engineer` for final security sweep.

Implement Phase MP10 per §M24 + §R4/R5/R6 + backend §D4 mobile rows.

Hard perf gates in CI (§R4):
- Cold start ≤ 2.0 s p95 on ref device (Flashlight).
- Warm start ≤ 700 ms.
- Chat list first paint ≤ 400 ms p95.
- Chat open (cached) ≤ 250 ms p95.
- Scroll ≥ 55 FPS avg, 0 frames > 32 ms in a 10 s scroll.
- Send optimistic render ≤ 50 ms p95.
- Failing any gate blocks release.

Memory gates (§R5):
- Chat list idle ≤ 130 MB peak RSS.
- Chat open 100 msgs ≤ 180 MB.
- Media viewer 1080p ≤ 240 MB.
- Video call ≤ 260 MB.
- Background after 1h ≤ 90 MB.

Battery gates (§R6):
- 1h foreground chatting ≤ 4%.
- 1h video call ≤ 12%.
- 8h background ≤ 3%.
- Overnight soak (nightly on ref device) ≤ 3%.

Security final sweep (backend §D4 mobile rows + §A1):
- No plaintext of personal content in DB or logs (grep + integration assertion).
- No PII in logs (redaction pipeline verified).
- Certificate pinning enabled with stapled fallback list (test cert rotation scenario).
- Attestation required on every enroll.
- Screenshot protection on sensitive screens (chat lock, backup key, TOTP).
- Root/jailbreak soft-signal disables backup-key viewing; app remains functional.
- Clipboard auto-clear on secure fields verified.
- Cert pinning bypass test (mocked MITM cert) → connection rejected.
- Feature flag kill-switch: force-kill "calls" flag → UI degrades gracefully with a clear message.

Release engineering (§M24):
- Fastlane lanes for internal / TestFlight / Play internal / Play production with staged rollout config (5% → 25% → 100%).
- Store listings + screenshots + privacy manifest (iOS 17+).
- Symbol upload for GlitchTip.
- Kill-switch dry-run: flip a flag in staging → live devices react within one boot cycle.
- No JS OTA updates (all ships through stores).
- Rollback via feature flag, not app rollback.

Overnight regression suite:
- Nightly matrix: iOS Simulator (min + latest), Android emulator (min SDK + latest), 1 physical ref device.
- Runs: full Detox E2E + Reassure + Flashlight + battery soak.
- Any red → release blocked.

DoD (§R7): all gates green; release candidate built + signed on both stores; kill-switch tested; documentation updated (RELEASE_NOTES.md + runbook); §D4 mobile threat model rows have passing tests; on-call runbook exists.
```

---

# REUSABLE OPERATING PROMPTS (mobile)

## MOPS-1 — Review my last change

```
Use the `mobile-security-engineer` subagent.
Review the most recent commit against @docs/NexusChat-Mobile-Frontend-v1.md §M19, §A1 (mobile threat model), and backend §D4.
For each issue: severity (S1/S2/S3) + 1-line fix. Reject if: plaintext of personal content leaks, PII in logs, unbounded cache, blocked JS thread, timer/listener/socket without disposal, native resource without release, or a stack deviation without ADR.
```

## MOPS-2 — Fix a failing test (don't relax it)

```
Test failing: <paste 5–10 lines of the failure>.
Fix the implementation, not the test. The test encodes a contract from @docs/NexusChat-Mobile-Frontend-v1.md.
If the test itself is wrong vs. the doc, cite the section that disagrees and propose a doc clarification — do NOT silently weaken the assertion.
```

## MOPS-3 — Phase exit audit (mobile)

```
Use the `mobile-qa-engineer` subagent.
Phase MP<N> exit audit. Walk the diff since the last phase tag and produce a Markdown table of:
[check, status (green/red), evidence].

Verify:
1. All Definition-of-Done bullets in the phase prompt are satisfied.
2. Perf gates (§R4) pass on ref device — attach Reassure/Flashlight output.
3. Memory gates (§R5) pass — attach measurement.
4. Battery budgets (§R6) relevant to this phase pass — attach soak result if applicable.
5. Every §R2 failure scenario relevant to this phase has a test.
6. Layer boundary lint clean, no AsyncStorage anywhere, no console.log in production paths.
7. Every long-lived resource (timers, listeners, sockets, native handles) has an owner + disposal.
8. No new dependency without an ADR.
9. §M12 invariants intact (if MP4 already merged): reserve-then-write, media_files row present, no viewport-file deletion, LRU bounded.
10. No PII in logs (grep pattern check).

Block the phase if any S1/S2 row is red.
```

## MOPS-4 — Add a test for a flow

```
Add an integration test (Jest + @testing-library/react-native + WatermelonDB in-memory + Detox for E2E where needed) for flow <Cxx / Mxx> from @docs/NexusChat-Mobile-Frontend-v1.md.
The test must cover:
(a) happy path,
(b) at least 2 §R2 / backend §D4 failure modes,
(c) idempotency where applicable (event_id / client_msg_id dedup).
Place the test co-located with the module. Use existing fixtures; do not add dependencies.
```

## MOPS-5 — Investigate a mobile-specific symptom

```
Symptom: <describe — e.g. "list scroll drops frames on ref device only", "battery drain 8% overnight", "media doesn't re-download after eviction on Android">.
Use Reassure/Flashlight/dumpsys/Instruments reasoning first — do not jump to code.
Produce: hypothesis tree → 1 most-likely root cause → minimal experiment to confirm → fix plan referencing the relevant §M/§L section.
```

## MOPS-6 — Media/Storage regression check

```
Use the `mobile-media-engineer` subagent.
Run the §L8.8 failure-case matrix in test form:
- App killed mid-download → resume works.
- App killed mid-upload → resume works.
- Disk full during write → defer + banner.
- File on disk but no row → cleanup deletes orphan.
- Row but no file → auto re-download on render.
- "Delete from device" during view → blocked while on-screen.
- View-once opened → immediate deletion.
- Server-side delete → local file removed.
- Sticker pack uninstall → batch delete.

Report which are covered, which are missing, and add tests for missing rows. Fail if any invariant from §M12.11 is violated.
```

---

# ORDER OF OPERATIONS (copy this checklist)

1. **MBOOT-0** → mobile app added to monorepo + native scaffolds + `.claude/agents/` mobile roles + CI + Reassure/Flashlight baselines.
2. **MP0** → foundations (design system + providers + observability + Reassure baseline).
3. **MP1** auth (DAPT + Reverse-OTP UX) → **MOPS-3** → tag `mobile-mp1`.
4. **MP2** chat + realtime + E2EE 1:1 → **MOPS-3** → tag.
5. **MP3** groups + multi-device + status → **MOPS-3** → tag.
6. **MP4** media + Manage Storage + backup → **MOPS-6** + **MOPS-3** → tag. (This is the phase your requirements most needed; treat it with extra care.)
7. **MP5** notifications + background + overnight-battery → **MOPS-3** including overnight soak → tag.
8. **MP6** calls & meetings → **MOPS-3** → tag.
9. **MP7** search + translation + AI → **MOPS-3** including privacy-fork zero-network test → tag.
10. **MP8** enterprise + admin + workflows → **MOPS-3** → tag.
11. **MP9** a11y + i18n + polish → **MOPS-3** with a11y sweep → tag.
12. **MP10** hardening + release → final gates + release candidate.

Between any two prompts, if Claude Code starts hallucinating or pulling too much context, open a fresh session — CLAUDE.md + subagents + doc are persistent so nothing is lost.

**Special note on MP4 and MP5:** these two phases carry your explicit requirements (media/storage + overnight-background contract). Do not merge them until the full failure matrix (§L8.8) and the overnight soak (§R6) are green on the reference device. These are not "nice to have" — they are the difference between a hobby app and a WhatsApp-grade one.

*End of mobile prompt pack.*
