# VelChat — Contact Sync System (Production Architecture)

> Principal-engineer reference for a **privacy-preserving, 100M-user contact sync** system,
> grounded in VelChat's **existing** stack (do not rewrite what works — extend it):
> - **Client:** React Native 0.86 · WatermelonDB (SQLite) · MMKV · React Query · Headless JS / BGTaskScheduler
> - **Server:** NestJS · PostgreSQL (Neon) · Redis/Valkey (Upstash) · **Redis Streams** event bus · api-gateway · Docker/K8s
> - **Discovery:** RSA blind-signature **OPRF** already built (`user-service/discovery`, `@velchat/crypto`, `oprf_discoverable`). This design keeps that as the privacy core and layers **sync** (delta, versioning, real-time) on top.
>
> Nothing here changes running code. It's the target design; the "Maps to" notes point at the real files so it's implementable incrementally.

---

## 0. Design principles (the non-negotiables)

1. **Local DB is the source of truth.** The UI reads SQLite, never the network on the render path. (Maps to: WatermelonDB `observeConversations`/contacts.)
2. **Never full-resync.** Every sync is a **delta** keyed by a monotonic `sync_version` + per-contact fingerprints.
3. **The server never sees a plaintext phone it wasn't already given.** Contact *matching* goes through the **OPRF** (blind) path; only the user's OWN number is known to the server (they signed up with it).
4. **Every long-lived resource is owned + disposable** (timers, sockets, workers) — §M7.
5. **Instant or nothing.** Contact list paints from SQLite in <50 ms; discovery/enrichment happens off the render path and merges reactively.
6. **Idempotent everywhere.** Retries, replays, and duplicate events must be no-ops.

---

## 1. High-level architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                                   CLIENT (RN)                                │
│                                                                              │
│  Address Book ──read──▶ Normalizer(E.164) ──▶ Fingerprint/Hash ──▶ Delta     │
│                                                     │                        │
│  ┌───────────────┐   observe   ┌──────────────┐    │   write   ┌─────────┐   │
│  │  UI (FlashList)│◀───────────│ SQLite (WDB) │◀───┴───────────│ Sync     │   │
│  │  instant paint │             │ contacts     │   merge delta │ Worker   │   │
│  └───────────────┘             │ + directory  │◀──────────────│(headless)│   │
│         ▲                       └──────────────┘               └────┬────┘   │
│         │ reactive                     ▲  MMKV: sync_version, cursors     │   │
│         └── WebSocket (presence, registered.new, contact.changed) ◀──────┘   │
└───────────────────────────────────────────┬──────────────────────────────────┘
                                             │ HTTPS (gzip/br) + WSS
                                             ▼
                                    ┌─────────────────┐
                                    │   API GATEWAY   │ rate-limit · auth (RS256) · keep-warm
                                    └────────┬────────┘
             ┌───────────────┬──────────────┼───────────────┬────────────────┐
             ▼               ▼              ▼               ▼                ▼
      ┌────────────┐  ┌────────────┐  ┌───────────┐  ┌─────────────┐  ┌───────────┐
      │ CONTACT/   │  │ USER/OPRF  │  │ PRESENCE  │  │ NOTIFICATION│  │ REALTIME  │
      │ DIRECTORY  │  │ discovery  │  │ service   │  │ (push)      │  │ GATEWAY   │
      └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  └──────┬──────┘  └─────┬─────┘
            │               │               │               │              │
            ▼               ▼               ▼               │              │ WS
      ┌───────────────────────────────────────────┐         │         (fan-out)
      │   Redis/Valkey  (hot cache + rate limit)   │◀────────┘              │
      └───────────────────────┬───────────────────┘                        │
                              ▼                                             │
      ┌───────────────────────────────────────────┐   Redis Streams events │
      │           PostgreSQL (sharded)             │──────────────────────▶─┘
      │  accounts · identifiers · oprf_discoverable │   user.registered
      │  contact_edges · sync_log                   │   identifier.changed
      └────────────────────────────────────────────┘   presence.changed
```

**Service responsibilities**

| Service | Owns | Real file (today) |
|---|---|---|
| api-gateway | routing, RS256 auth, edge rate-limit, keep-warm | `apps/api-gateway` |
| user-service (directory + OPRF) | profiles, OPRF key + tokens, discovery | `apps/user-service/src/discovery` |
| contact-service (NEW, or a module in user-service) | per-user contact edges, delta/sync-version, change detection | *new* `apps/contact-service` |
| presence-service | online / last-seen | `apps/presence-service` |
| notification-service | push (silent sync-wake + normal) | `apps/notification-service` |
| realtime-gateway | WS fan-out of events to online sockets | `apps/realtime-gateway` |

> **Recommendation:** implement contact-sync as a **module inside user-service** first (it already owns identity + OPRF + the shared DB), and split into `contact-service` only when it needs independent scaling. Same DB, same events — no premature microservice tax.

---

## 2. Client data model (SQLite / WatermelonDB + MMKV)

### 2.1 SQLite schema (add to the WatermelonDB schema + a migration)

```
TABLE device_contacts            -- raw address book (what the phone gave us)
  id                 text PK      -- device recordId
  display_name       text
  phones_json        text         -- ["+9199...","+9198..."]  (raw, pre-normalize)
  fingerprint        text         -- sha256(name + sorted normalized phones + photoHash)
  updated_at         integer

TABLE directory                  -- who is on VelChat (the matched set)
  e164               text PK      -- normalized number
  account_id         text         -- null until matched
  display_name       text         -- their VelChat profile name (enrichment)
  avatar_media_id    text
  about              text
  is_contact         boolean      -- in my address book?
  last_seen_hint     integer
  presence_hint      text         -- online|offline (ephemeral, may be stale)
  key_version        integer      -- OPRF key version that produced the match
  updated_at         integer

INDEX directory_account_idx  ON directory(account_id)
INDEX directory_contact_idx  ON directory(is_contact)
```

- `device_contacts` = the **local mirror** of the address book, so we can diff it against the last snapshot without re-reading everything.
- `directory` = the **discovered** set (contact ⨝ registered users), read directly by the New-Chat list and chat headers.
- Keep them **separate**: the address book changes for reasons unrelated to VelChat membership; a contact joining VelChat changes `directory` without touching `device_contacts`.

> Maps to today: `useDeviceContacts` currently holds this in an MMKV snapshot. The upgrade is to move it into SQLite so it's queryable, indexable, and observable (reactive UI) rather than a JSON blob.

### 2.2 MMKV keys (small, hot, synchronous)

```
sync.contactsVersion      → last server sync_version we merged (monotonic int)
sync.deviceBookHash       → hash of the whole address book at last sync (fast "did anything change?")
sync.lastFullScanAt       → epoch of last full local scan
sync.discoveryKeyVersion  → OPRF key version we tokenized against
avatar.<accountId>        → { mediaId, url, at }   (DP cache — already implemented)
```

MMKV is for **cursors + flags** (sub-ms, synchronous, survives restart). Never store lists in MMKV — that's SQLite's job.

---

## 3. Change detection — fingerprints, incremental hashing, bloom filter

### 3.1 Per-contact fingerprint

```
fingerprint(contact) = sha256(
    normalizedName            +
    e164Phones.sort().join(",") +
    photoContentHash          // hash of the local thumbnail bytes, if any
)
```

A contact is "changed" iff its fingerprint differs from the stored one. This catches renames, added/removed numbers, and photo changes — **without** comparing every field.

### 3.2 Whole-book hash (the <5ms "anything changed?" gate)

```
deviceBookHash = sha256( allContacts.map(fingerprint).sort().join() )
```

On launch: compute `deviceBookHash`; if it equals `sync.deviceBookHash` → **the address book is unchanged, skip the diff entirely.** This is the common case (books rarely change) and it's a pure-CPU check with zero I/O beyond the read.

### 3.3 Diff (only when the book hash changed)

```
prev = SELECT id, fingerprint FROM device_contacts          -- last snapshot
curr = read address book → map(fingerprint)

added   = curr - prev            (new recordIds)
removed = prev - curr            (deleted recordIds)
changed = fingerprint differs for same recordId

Only {added ∪ changed}.phones need (re)discovery. `removed` just flips is_contact=false locally.
```

### 3.4 Bloom filter optimization (server → client, "who's NOT worth asking about")

The server publishes a **Bloom filter of the registered-user token space** per shard (rebuilt hourly, versioned). The client tests each contact token against it **locally**:

- **Definitely not registered** → skip the network match entirely (Bloom has no false negatives).
- **Maybe registered** → include in the batched match request (Bloom's false positives are resolved by the real lookup).

For a 10k-contact user where only 300 are on VelChat, the Bloom filter drops ~97% of match candidates **before** any request → massive bandwidth + server-load savings.

```
GET /discovery/bloom?version=<n>   → { version, m, k, bits (base64, br-compressed) }
Client caches it in MMKV; refresh when the server advertises a new version (via WS `bloom.rotated`).
```

> This is the single biggest lever for "minimize server load" at 100M scale — most contacts of most users are not on the app, and Bloom answers that offline.

---

## 4. Privacy-preserving discovery (OPRF — the existing core)

VelChat already implements a **Chaum-style RSA blind-signature OPRF** (`@velchat/crypto`, `user-service/discovery`). Keep it. The contact-sync layer just **batches + deltas** it.

```
Client                                  Server (user-service)
  GET /discovery/oprf/key   ───────────▶ { n, e, version }        (cached; rotate → new version)
  blind(e164) for each new/changed #   
  POST /discovery/oprf/evaluate         ─▶ evaluate(blinded, d)   (server never sees the number)
     { accountId, blinded[], keyVersion }  { evaluated[] }
  unblind(evaluated) → token = sha256(...)
  POST /discovery/oprf/match            ─▶ SELECT account_id FROM oprf_discoverable WHERE token = ANY(...)
     { accountId, tokens[] }               { matches: { token: accountId } }
  merge matches → SQLite `directory`
```

**Own-number registration is SERVER-SIDE** (already added): at phone-verify, the server computes `directToken(ownNumber, key)` and upserts `oprf_discoverable` — so every account is discoverable without a client round-trip. (Maps to: `auth.service.verifyOtp → registerForDiscovery`.)

**Rate limits** are the anti-enumeration guard (per account, per hour): tune `OPRF_EVALUATE_LIMIT` / `OPRF_MATCH_LIMIT`. Because the Bloom filter culls most candidates and results are cached 30 min client-side, a real user makes ≪ the cap.

**Key rotation:** bump `oprf_keys.version`; the server re-derives every `oprf_discoverable.token` under the new key in the background; clients re-tokenize lazily when they see a higher `version`. Old tokens stay valid until the sweep completes (dual-write window).

---

## 5. Sync protocol — versioning + delta

### 5.1 The contract

Every device holds `sync.contactsVersion`. The server keeps an append-only **`sync_log`** per user:

```
TABLE sync_log
  user_id     uuid
  version     bigint          -- monotonic per user (sequence)
  entity      text            -- 'directory' | 'presence' | 'profile'
  op          text            -- 'upsert' | 'delete'
  account_id  uuid            -- the changed peer
  payload     jsonb           -- minimal changed fields
  created_at  timestamptz
  PRIMARY KEY (user_id, version)
```

```
GET /contacts/sync?since=<version>&limit=500
  → { version: <latest>, changes: [ {version, entity, op, account_id, payload}... ], hasMore }
```

- Client applies each change to SQLite in one transaction, then stores `version = latest`.
- `since=0` on first install = full snapshot (paged). Everything after is a **delta**.
- The response is **gzip/br** compressed; payloads carry only changed fields.

### 5.2 Who writes to `sync_log`?

The event consumer (Redis Streams) — on `user.registered`, `identifier.changed`, `profile.updated`, it computes **which users have this account in their contact graph** (`contact_edges`) and appends a `sync_log` row for each. That's how "a contact of mine just joined" reaches me as a delta, not a re-scan.

```
TABLE contact_edges           -- the reverse index: who has whom as a contact
  owner_id    uuid            -- me
  peer_token  text            -- OPRF token of the contact number I hold (NOT the plaintext)
  peer_id     uuid            -- resolved account_id once matched (nullable)
  PRIMARY KEY (owner_id, peer_token)
INDEX contact_edges_peer_idx ON contact_edges(peer_id)   -- "who has ME as a contact"
```

> Privacy note: `contact_edges` stores the **OPRF token**, never the plaintext number. "Who has me as a contact" is answerable (for the registered-after-sync flow) without the server ever holding contact plaintext.

---

## 6. The flows (all 20)

Notation: **C** = client, **S** = server, **WDB** = SQLite, **BF** = bloom filter.

### 6.1 App launch (returning user) — target <50 ms to paint
```
C: read MMKV sync.contactsVersion (sync)             ~0ms
C: SELECT * FROM directory WHERE is_contact ORDER BY name  →  paint FlashList   <50ms
C: (background, after interactions) computeDeviceBookHash
     if == sync.deviceBookHash: no local diff
   GET /contacts/sync?since=version   → apply delta → WDB → UI auto-refreshes (observe)
   open WebSocket → live updates
```

### 6.2 First install
```
C: request Contacts permission (contextual, on New-Chat, not launch)
C: full read → normalize → fingerprint → store device_contacts + deviceBookHash
C: fetch BF; cull; tokenize survivors (OPRF evaluate, batched 500) ; match
C: write directory ; GET /contacts/sync?since=0 (enrichment: names, avatars) ; store version
C: register OWN number is already done server-side at signup
```

### 6.3 Returning user — covered by 6.1 (delta only).

### 6.4 Background sync (headless)
```
Android: WorkManager / Headless JS  every ~6–12h (or on connectivity regained), constraints: unmetered + charging preferred
iOS: BGTaskScheduler (BGAppRefreshTask), opportunistic
Task: computeDeviceBookHash → if changed, diff + discover delta ; GET /contacts/sync?since=version
Never block; respect battery (skip if low + not charging).
```

### 6.5 Incremental sync — `GET /contacts/sync?since=version`. Only rows with `version > since`.

### 6.6 Delta sync — same endpoint; the "delta" IS the `sync_log` slice. Client never asks for the whole set again.

### 6.7 Contact update (rename / new number on an existing contact)
```
C: local diff marks it `changed` → re-fingerprint ; if a NEW number appears, tokenize+match just that number.
No server call for a pure local rename (the VelChat name comes from the peer's profile, not your label).
```

### 6.8 Contact delete
```
C: diff marks recordId `removed` → UPDATE directory SET is_contact=false WHERE e164 IN(...).
Local only. The peer's account/token is untouched (they're still a VelChat user, just not your contact).
```

### 6.9 New contact added
```
C: diff `added` → tokenize its number(s) → BF cull → match → if hit, upsert directory(is_contact=true, account_id).
Also: POST /contacts/edges { tokens:[...] } so the server records the edge (for future registered-after-sync).
```

### 6.10 User registered AFTER I synced (the classic)
```
S: peer signs up → identifier.changed(phone) event
S: consumer computes token(phone) → SELECT owner_id FROM contact_edges WHERE peer_token = token
S: for each owner → append sync_log(upsert directory, account_id=peer)
S: emit WS `contact.registered` to online owners; push silent-wake to offline owners
C: WS/delta → directory row flips to matched → the contact appears "on VelChat" live, no re-scan.
```

### 6.11 User changed phone number
```
S: identifier.changed(old→new) → re-derive tokens ; move oprf_discoverable(token) to new token ;
   contact_edges: old token owners get sync_log(delete) for the stale match + (if they also hold the new #) upsert.
C: applies delta; the contact re-resolves under the new number if it's in the book.
```

### 6.12 Contact permission revoked
```
C: detect on next read (permission denied) → DO NOT wipe directory (keep matched chats working) ;
   stop the diff/discovery ; show the "grant access" banner. Existing conversations keep working (they're in WDB).
C: optionally POST /contacts/edges/clear to stop receiving registered-after-sync deltas (privacy) — user choice.
```

### 6.13 Offline sync
```
All reads are SQLite → app fully usable offline. Writes (new contact discovery, edges) queue in an
outbox table; the sync worker drains on connectivity regained. `since=version` guarantees no gap.
```

### 6.14 Retry — see §7. 6.15 Conflict — see §8. 6.16 Sync versioning — see §5.
### 6.17 Event-driven — see §9. 6.18 WebSocket — see §10. 6.19 Push-based — silent FCM/APNs `content-available` wakes the sync worker to pull deltas when the socket is down.

---

## 7. Retry mechanism

```
Exponential backoff w/ full jitter, capped:  delay = min(cap, base * 2^attempt) ± jitter
- IDEMPOTENT reads (GET /contacts/sync, evaluate, match): retry on network/timeout/5xx, up to N.
- NON-IDEMPOTENT writes (POST /contacts/edges, register): DO NOT auto-retry on timeout — the first
  attempt may have landed; use an idempotency key + let the next delta reconcile. (Maps to: the
  client already only retries idempotent methods — this is why cold-start bursts don't double-send.)
- Honor 429 Retry-After; never retry a 429 with the same batch.
Circuit breaker per endpoint: after K consecutive failures, open for T seconds (fail fast, save battery).
```

---

## 8. Conflict resolution

- **Server wins for identity/membership** (account_id, key_version) — it's authoritative.
- **Device wins for the local label** (your name for the contact) — never overwritten by the peer's profile name; both are stored (`device_contacts.display_name` vs `directory.display_name`), UI shows your label with the peer's DP.
- **Last-writer-wins by `version`** for directory rows; a delta with `version <= stored` is ignored (idempotent replay-safe).
- Presence/last-seen are **hints**, never persisted authoritatively; newest timestamp wins, stale is fine.

---

## 9. Event-driven backbone (Redis Streams — already the bus)

**Topics (streams) + payloads**

```
user.registered        { account_id, tenant_id, created_at }
identifier.changed     { account_id, kind:'phone'|'email', old_token?, new_token?, changed_at }
profile.updated        { account_id, fields:['display_name','avatar_media_id'] , at }
presence.changed       { account_id, status:'online'|'offline', last_seen, at }
contact.edge.added     { owner_id, peer_token }
bloom.rotated          { version }
```

**Consumer groups**
- `contact-fanout` (contact-service): registered/identifier/profile → compute affected owners via `contact_edges` → append `sync_log` + emit `contact.*` to realtime-gateway.
- `presence-fanout` (realtime-gateway): presence.changed → route to online contacts' sockets.

> Maps to today: `apps/*/events.ts` publish; `search-service`/`realtime-gateway` consume. The gap to close: a `contact_edges` reverse index + the `contact-fanout` consumer (that's the "registered-after-sync" magic).

---

## 10. Real-time (WebSocket) + presence

```
WS frames (client ⇄ realtime-gateway):
  ▶ subscribe        { conversationIds?, presenceOf:[accountId...] }
  ◀ contact.registered { account_id, e164_token }     → flip directory row live
  ◀ profile.updated    { account_id, display_name?, avatar_media_id? } → refresh enrichment + bust avatar cache
  ◀ presence.changed   { account_id, status, last_seen } → update presence_hint (ephemeral)
  ◀ bloom.rotated      { version }                    → schedule BF refresh
```

- Presence is **subscribe-on-view** (only the peers you're looking at), coalesced, never persisted as truth.
- Last-seen respects privacy settings server-side (`everyone|contacts|nobody`) before it's ever emitted.
- When the socket is down, `content-available` push wakes a headless pull of `/contacts/sync?since=version` (durability backstop).

---

## 11. Performance — how "instant" is achieved

| Goal | Technique |
|---|---|
| Contact list <50 ms | Paint from SQLite index (`directory_contact_idx`), never await network. FlashList (recycled rows). |
| Instant search | SQLite `LIKE`/FTS5 index on `display_name` + `e164`; debounced; fuzzy via trigram (`pg_trgm` server-side, FTS5 tokenizer client-side). |
| Instant scroll | FlashList `getItemType`, stable keys, memoized rows keyed on **primitives** (WDB mutates rows in place). |
| Minimal API | Delta-only (`since=version`) + Bloom cull + 30-min discovery cache + coalesced presence subs. |
| Minimal DB queries | Server: Redis read-through for hot directory rows; batched `token = ANY($1)` match (one query per batch of 500). |
| Minimal battery | Background sync gated on connectivity/charging; whole-book-hash short-circuit; no polling — push/WS driven. |
| Minimal bandwidth | gzip/br; delta payloads; Bloom filter; avatars lazy + disk-cached by stable mediaId. |
| ~Zero loading screen | Cache-first everywhere; enrichment merges reactively behind the already-painted list. |

Avatar pipeline: resolve `mediaId → signed URL` (cached), download once to disk keyed by **mediaId** (stable), show the local path; re-download only when `avatar_media_id` changes (via `profile.updated`). (Maps to: `useContactAvatar` — today it caches the URL in MMKV; the disk-file upgrade needs a FS lib — an ADR + `react-native-blob-util`.)

---

## 12. Security

- **Enumeration prevention:** OPRF makes a token cost a live, **rate-limited, attested** round-trip; no offline dictionary over the E.164 space. Per-account hourly caps on evaluate/match. Bloom filter is a *coarse* set (false positives), never reveals membership precisely.
- **Rate limiting:** edge (gateway, per-IP) + per-account (Redis token bucket) + per-endpoint. 429 + Retry-After.
- **Abuse/spam:** velocity checks (N new contacts/min), device attestation (Play Integrity / App Attest) gating discovery, shadow-ban tokens.
- **Replay:** request nonce + short-TTL signed timestamp; reject stale/duplicate nonces (Redis `SETNX nonce EX`).
- **Encryption:** TLS in transit; at rest, no plaintext contact numbers server-side (only tokens/hashes). Client SQLite encrypted (SQLCipher / WDB adapter key from Keychain/Keystore).
- **Token validation:** RS256 access token, `iss` + expiry + `account_id`/`device_id` claims verified by every service's `JwtAuthGuard` (public key distributed via env/JWKS — **must be provisioned**, else 401s everywhere).

---

## 13. Scalability (100M users, 1B+ edges)

```
Sharding: PostgreSQL by hash(user_id) → N shards (Citus / Vitess-style). oprf_discoverable + contact_edges
          co-located by the same key so fan-out joins stay in-shard.
Redis:    cluster; keys namespaced by shard; directory hot-rows read-through, TTL 5–10 min.
Bus:      Redis Streams (or Kafka at scale) partitioned by user_id; consumer groups scale horizontally.
Fan-out:  the registered-after-sync fan-out is the hot path — a viral number can be in millions of books.
          Cap per-event fan-out, spill to a batched sweep (write sync_log lazily, let clients pull), never
          block the event loop on a million-row write.
Multi-region: read replicas per region; writes to home region; OPRF key set replicated read-only.
Zero-downtime: rolling deploys, versioned sync protocol (server supports since<version> from older clients).
DR: PITR on Postgres; Redis is a cache (rebuildable); event streams have retention for replay.
```

**Common mistakes to avoid**
1. Full contact re-upload on every launch (bandwidth + battery killer). → delta + book-hash gate.
2. Storing plaintext numbers server-side "just for matching." → OPRF tokens only.
3. Fan-out on write to every contact-holder synchronously. → cap + lazy `sync_log` + client pull.
4. Ephemeral JWT signing key not shared with verifiers → **every guarded call 401s** (VelChat hit exactly this). Provision a stable keypair.
5. Rate limits tuned for abusers but tripping real users (5/hr). → tune to real p99, keep the abuse ceiling far above.
6. Caching signed media URLs long-term (they expire). → cache the **mediaId**, resolve/download on demand.
7. Re-running discovery on every New-Chat open. → cache 30 min + prewarm at launch (VelChat does this now).
8. Persisting presence as truth. → it's a hint.

---

## 14. Folder structure (Clean Architecture)

**Client (`apps/mobile/src`)** — extends the current layering (UI → Feature → Domain → Infra):
```
features/contacts/
  ui/            ContactsList, NewChat rows
  hooks/         useDeviceContacts, useContactSync, useConversationPeer
  api/           contactSyncApi (GET /contacts/sync, POST /contacts/edges)
domain/
  contact-sync/  diff.ts (fingerprint, delta), bloom.ts, merge.ts (pure, unit-tested)
  discovery/     discoverContacts (OPRF)   ← exists
infra/
  db/            watermelon: device_contacts, directory tables + migrations
  native/        deviceContacts (react-native-contacts), backgroundSync (WorkManager/BGTask)
  util/          phone (E.164)              ← exists
```

**Server (`apps/contact-service` or a `contact` module in user-service)**:
```
src/
  contact/
    contact.controller.ts   GET /contacts/sync, POST /contacts/edges
    contact.service.ts      delta assembly, edge upsert (pure logic testable)
    contact.repository.ts    sync_log, contact_edges (parameterized SQL only)
    contact.consumer.ts     Redis Streams: registered/identifier/profile → fan-out → sync_log
    bloom.service.ts        build/rotate the registered-token bloom filter
  discovery/                OPRF (key, evaluate, match, register)  ← exists
```

---

## 15. API reference (payloads)

```
GET  /contacts/sync?since=<v>&limit=500
      → 200 { version, changes:[{version,entity,op,account_id,payload}], hasMore }

POST /contacts/edges            { tokens: string[] }          → 200 { added }
DELETE /contacts/edges           (auth)                        → 204   (privacy: stop fan-out)

GET  /discovery/oprf/key                                      → { n, e, version }         (exists)
POST /discovery/oprf/evaluate   { accountId, blinded[], keyVersion } → { version, evaluated[] }   (exists)
POST /discovery/oprf/match      { accountId, tokens[] }       → { matches:{token:accountId} }      (exists)
PUT  /discovery/oprf/register   { accountId, token, keyVersion } → { message }             (exists; also server-side at signup)
GET  /discovery/bloom?version=<n>                             → { version, m, k, bits(br,b64) }   (NEW)

GET  /users/:id/profile         (auth)                        → profile (name, avatar_media_id, about)  (exists, cached)
GET  /media/:id/url?ttl=600     (auth)                        → { url, mime }              (exists)
```

**Redis keys**
```
rl:oprf:evaluate:{account}      token-bucket (per-hour)
rl:oprf:match:{account}
directory:hot:{account}         cached directory row (read-through, TTL 5–10m)
bloom:registered:v{n}           the current bloom bitset
members:{conversationId}        (realtime fan-out membership — exists)
nonce:{id}                      replay guard (SETNX EX)
```

---

### Where VelChat is today vs. this design (gap list to implement, in order)
1. ✅ OPRF discovery (key/evaluate/match/register) + server-side self-register.
2. ✅ Client cache (MMKV snapshot) + prewarm + 30-min TTL + instant nav + avatar cache.
3. ⬜ Move contact/directory cache from MMKV blob → **SQLite tables** (queryable, reactive).
4. ⬜ `contact_edges` reverse index + `contact.fanout` consumer → **registered-after-sync live**.
5. ⬜ `sync_log` + `GET /contacts/sync?since=` delta endpoint (kills full-resync).
6. ⬜ Bloom filter endpoint + client cull (biggest server-load win).
7. ⬜ Headless background sync (WorkManager/BGTask) + silent-push wake.
8. ⬜ Disk avatar cache (needs a FS lib ADR).

Implement 3→5 first (delta + reverse-index fan-out) — that's 80% of the "WhatsApp feel" with the OPRF privacy you already have.
