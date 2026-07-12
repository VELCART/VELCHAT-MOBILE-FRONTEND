# VelChat Backend — Frontend Integration Reference

> Read-only mapping of the real backend at `D:\Velchat` (pnpm + Turborepo, 13 Nest microservices). Produced 2026-07-11. Every claim is backed by `file:line` citations in the source. This is the **canonical API contract** the mobile client builds against. Where it disagrees with `VelChat-Mobile-Frontend-v1.md`, **the running backend wins** — those deltas are tracked in §"Deviations" and become ADRs at `MP1`.

## 0. TL;DR for the client
- **Dev base URL: `http://localhost:8080`** (dev aggregator). From Android emulator use **`http://10.0.2.2:8080`**; WS = **`ws://10.0.2.2:8080/ws`**.
- **Prod is per-service on Render, NOT single-origin** — confirm ingress strategy before wiring prod URLs.
- **Response envelope:** every JSON is `{ success, statusCode, message, data, requestId }` (errors add `error.code`). Raw routes (`/health`,`/ready`,`/metrics`,`/docs*`,`/.well-known/*`) are unwrapped. → Axios layer must unwrap `data`.
- **No DPoP proof header.** DPoP is only a refresh-token thumbprint binding (`cnfJkt`). Do NOT build an htu/htm/iat/nonce proof signer.
- **No JWT enforcement at the edge yet** — gateways pass `Authorization`/`x-tenant-id` through; services read ids from params/body. Send the header anyway; enforcement will tighten later.
- **Signal prekey upload / device approve-revoke / prekey-bundle fetch REST endpoints are NOT exposed** (only DB tables + service logic + `GET /auth/devices`). Confirm before designing key exchange.
- **`@velchat/shared-types` & `@velchat/proto` are `private:true`; proto codegen not run.** Consume REST/WS; **vendor** the event-payload interfaces.
- **WS = plain `ws` at `/ws`**, JWT via header or `?token=`, frame `{ kind, type, data }`, no resume token — reconnect via `{type:'sync',cursor}` + chat history `afterSeq` cursor.
- **Media upload = init → single PUT** (buffered or streamed), not multipart-part resumable. Resumability applies to *downloads* (storage-provider HTTP Range on a signed URL).

## 1. Run it locally
Prereqs: Node ≥ 20.11, pnpm ≥ 9 (`corepack enable`), Docker (for local data tier). The active `.env` points at managed free-tier providers (Neon/Atlas/Upstash/Cloudinary) with `EVENT_BUS=redis-streams`, so Kafka/local-docker may be optional.
```bash
pnpm install && pnpm build
cp .env.example .env         # edit secrets
pnpm infra:up                # docker datastores (or use managed .env)
pnpm db:migrate
pnpm dev                     # all services (turbo)  — OR —
.\start-all.ps1              # builds dist + runs unified :8080 gateway  (pnpm start:all cross-platform)
```
Frontend base URL after start: `http://localhost:8080`. Health: `GET /health`, `/ready`, `/metrics`, Swagger `/docs`, `/docs-json` per service; unified Swagger at `:8080/docs`.

### Ports
gateway(agg) **8080** · api-gateway 3000 (gRPC 50051) · realtime-gateway **3001 /ws** · auth 3002 · user 3003 · chat 3004 · group-channel 3005 · presence 3006 · notification 3007 · media 3008 · search 3009 · call 3010 · automation 3011 · ai 3012.

Infra (docker/compose.yml): Postgres16 :5432 · Mongo7 :27017 · Valkey8 :6379 · Kafka :9092 · OpenSearch2.17 :9200 · MinIO :9000/:9001. Dev creds `velchat/velchat`.

## 2. Gateway routing (dev :8080, longest-prefix wins)
`/ws`,`/realtime`→realtime · `/auth`→auth · `/users`,`/orgs`,`/workspaces`,`/teams`,`/contacts`→user · `/chat`,`/messages`,`/conversations`,`/polls`→chat · `/channels`,`/groups`,`/communities`→group-channel · `/presence`,`/status`→presence · `/notifications`→notification · `/media`,`/files`→media · `/search`→search · `/calls`,`/meetings`→call · `/automation`,`/bots`,`/workflows`,`/commands`→automation · `/ai`,`/translate`→ai · else→api-gateway(3000).

Fine splits (api-gateway regex): `/users/:id/stars` & `/users/:id/conversations/*`→**chat**; `/conversations/dm`, `/conversations/:id/members|notif`, bare `GET /conversations/:id`→**group-channel**, other `/conversations/*`→**chat**; `/feature-flags`→automation; `/.well-known`→auth.

**CORS (dev):** `*`, allowed headers `Content-Type, Authorization, Accept, x-tenant-id, x-account-id, x-trace-id`. **Rate limit:** api-gateway 600 req/60s per IP (`429`+`Retry-After`); auth register 5/number/hour; dev :8080 has none. **Headers:** `Authorization: Bearer`, `x-tenant-id` (+opt `x-account-id`,`x-trace-id`); `x-request-id` echoed. No client-version/DPoP header parsed.

## 3. Auth (`/auth`, auth-service)
**Tokens:** access = RS256 JWT, 15 min, claims `{account_id,device_id,tenant_id?,role?,scope}`, verify via `GET /.well-known/jwks.json`. Refresh = opaque 32B base64url, **rotating with reuse detection** (replay → whole `family_id` revoked), 30-day TTL. **DPoP = `cnfJkt` thumbprint binding on refresh only** (no proof JWT). Device keypair = **Ed25519**, SPKI/DER public key base64 at register; private stays in enclave.

**`Tokens` shape:** `{ accountId, deviceId, access, refresh, expiresIn }` — note fields are `access`/`refresh` (Postman sample's `accessToken` is a bug).

| Flow | Method+Path | Request | Response |
|---|---|---|---|
| Cold register | `POST /auth/register` | `{phone,platform,devicePubkeyBase64}` | `{sessionId,expiresIn}` |
| Fetch tokens (after OTP) | `POST /auth/session` | `{sessionId}` | `Tokens` |
| Device-key login step1 | `POST /auth/challenge` | `{deviceId}` | `{nonce,expiresIn:120}` |
| Device-key login step2 | `POST /auth/login/device-key` | `{deviceId,signature}` | `Tokens` |
| Rotating refresh | `POST /auth/token/refresh` | `{refreshToken,cnfJkt?}` | `Tokens` |
| List devices | `GET /auth/devices?accountId=` | — | `DeviceRow[]` |
| Magic-link begin/verify | `POST /auth/magic/begin` `{email,platform,devicePubkeyBase64}` / `POST /auth/magic/verify` `{token}` | | `{sent:true}` / `Tokens`(limited) |
| Link device (QR) | `POST /auth/link/request` `{devicePubkeyBase64,platform}` → `{linkId,challenge}`; `/auth/link/approve` `{linkId,approverDeviceId,signature}`; `/auth/link/poll` `{linkId}` → pending\|`Tokens` | | |
| Passkey | `POST /auth/passkey/{register\|login}/{options\|verify}` (WebAuthn JSON via `@simplewebauthn/server`) | | |
| Number change | `POST /auth/number-change/begin` `{accountId,newPhone,trustedDeviceId}` → `{sessionId}` (re-runs Reverse-OTP on new number) | | |
| Recovery | `POST /auth/recovery/{begin\|factor\|backup-code\|complete}` (2 factors + delay; complete revokes all refresh) | | |
| Backup codes | `POST /auth/backup-codes/issue` `{accountId}` → `{codes[]}` | | |

Reverse-OTP proof (`POST /auth/revotp/webhook`) is **server-to-server** (SIP gateway → server); the client only triggers a missed-call/SMS to the DID and then polls `POST /auth/session`.

**NOT exposed (flag):** Signal prekey upload/fetch, device approve/revoke, versioned device-list/key-transparency REST — service logic + tables exist, no controller routes.

## 4. Realtime / WebSocket (`ws` lib, realtime-gateway)
- URL: `ws://<host>/ws` → dev `ws://10.0.2.2:8080/ws?token=<access>`. JWT via `Authorization` header or `?token=`. Missing `account_id`/`device_id` → close **4001**.
- On connect: `{kind:'durable',type:'connected',data:{connId}}`.
- **Frame envelope (both dirs): `{ kind:'durable'|'ephemeral', type, data }`.** `event_id`/`seq`/`conversation_id` live *inside* `data` (e.g. `message` frame → `MessageSentPayload {conversation_id,message_id,seq,ciphertext_ref?,text?,sender_account_id,sent_at}`). Durable never dropped; ephemeral (typing/presence/receipt/caption) coalesced under backpressure.
- Client→server types: `ping`(→`pong`), `sync {cursor}`(→echo), `delivered`/`read {conversationId,seq}`, `skdm {conversationId,epoch,targets[]}`, `skdm-request {conversationId,epoch}`, `typing {conversationId,state}`.
- Server→client types: `connected, pong, sync, message`(durable), `receipt, caption`(ephemeral), `skdm`(per-device), `reconnect`(drain → close 1001).
- **No resume token.** Reconnect = `{type:'sync',cursor:<lastSeq>}` + backfill via chat `GET /chat/conversations/:id/messages?afterSeq=`. WS push best-effort; durable bus + cursor is the no-loss backstop.
- Heartbeat: server pings **25s**; registry TTL 30s (refreshed on ping). Client should ping within ~25s.
- **No explicit subscribe frame** — server routes from a membership projection; per-device targeting for E2EE/SKDM. Presence subscribe is a separate REST `POST /presence/subscribe`.

## 5. Chat + sync (chat-service)
**Send** `POST /chat/messages` — `{ conversationId, senderId, clientMsgId, type?, content(string|object), replyTo?, threadRoot?, mentions?, tenantId?, encrypted? }` → `SendAck {messageId, seq, serverTs}`. Idempotency by `(conversationId, clientMsgId)`. `seq` = atomic Valkey `INCR seq:{conversationId}` (sort by seq, never timestamp).
**History/catch-up cursor** `GET /chat/conversations/:id/messages?afterSeq=<n>&limit=<≤100>` — THE missed-event sync endpoint (per conversation).
**Ops:** react `POST /chat/messages/:id/reactions {conversationId,userId,emoji}` (+ `DELETE`); edit `PATCH /chat/messages/:id {conversationId,editorId,content,...}`; delete `DELETE /chat/messages/:id {conversationId,actorId,scope:'me'|'everyone'}`.
**Pins/stars/state (extras):** `/conversations/:cid/pins/:mid`, `/users/:uid/stars/:mid`, `/users/:uid/conversations/:cid/{archive|pin-chat|mute}` + list variants.
**Receipts:** WS `delivered`/`read` → durable `message.delivered`/`message.read` (`MessageReceiptPayload {conversation_id,up_to_seq,user_id,state,at}`), cumulative (≤ seq). No REST receipt endpoint.
**E2EE resend:** `POST /messages/:mid/resend-request`, `/resend-fulfill`, `GET /messages/resend/pending?senderId=`.
**Conversations created in group-channel-service:** `POST /conversations/dm {a,b}`, `POST /groups {creator,name,members[]}`, `POST /channels {tenantId,creator,name,visibility,isAnnouncement}`, `/conversations/:id/members`, communities.

## 6. Media (media-service)
Upload: `POST /media/uploads {ownerId,mime?,conversationId?,tenantId?,encrypted?,viewOnce?}` → `{mediaId,uploadPath}`; then bytes via `PUT /media/uploads/:id` (multipart `file`, cap 100 MB, content-addressed dedupe) **or** `PUT /media/uploads/:id/stream` (raw body, for large video). Download: `GET /media/:id/url?ttl=` → `{url,mime}` short-lived signed URL (client fetches storage directly; **Range/resume delegated to storage provider**). View-once: `POST /media/:id/view` (consumes; replay → **410**). Renditions (enterprise worker): `PATCH /media/:id/renditions {renditions?,thumbKey?,blurhash?,...}`. Gallery/usage: `GET /media?conversationId=&limit=&before=`, `GET /media/usage?ownerId=`, `GET /media/usage/conversation/:id`, `POST /media/availability {mediaIds[]}`, `DELETE /media/:id?actorId=`. **E2EE backup:** `POST /backups/:accountId` (multipart ciphertext+salt, cap 500 MB, versioned), `GET /backups/:accountId/latest?ttl=` → `{version,size,kdf,salt,downloadUrl,createdAt}`. Full client spec: `D:\Velchat\docs\CLIENT-MEDIA-CACHE.md`.

## 7. Reusable typed contracts
- **`@velchat/proto`** — `private:true`, buf v2 + ts-proto → `libs/shared-types/src/gen` (currently **empty**, not generated). Only 3 minimal `.proto` (auth sample, common `EventEnvelope`, health) describing **internal gRPC**, not the REST surface. **Do not generate a client from these.**
- **`@velchat/shared-types`** — `private:true`, hand-written event-payload interfaces + ID aliases (`AccountId,TenantId,DeviceId,ConversationId,Iso8601`), 26 payloads (`MessageSentPayload`, `MessageReceiptPayload`, `PresenceChangedPayload`, `FileUploadedPayload`, `CallStartedPayload`, `StatusPostedPayload`, `DeviceListChangedPayload`, `GroupEpochChangedPayload`, `FeatureFlagChangedPayload`, …) + `EventPayloads` topic→payload map. **These are exactly the WS `data` shapes** — vendor them into the FE `packages/contracts`.

## 8. Env / config the client needs
- **Base URLs:** dev unified `http://localhost:8080` (+`ws://…/ws`); prod = per-service Render hosts (`velchat-auth-service`, `velchat-chat-service`, …) on injected `PORT` — no unified prod origin configured (flag).
- **Push:** register at `POST /notifications/endpoints {deviceId,userId,platform:'web'|'ios'|'android',token?,voipToken?,subscription?}`; prefs `PUT/GET /notifications/prefs`. Client uses its own Firebase config (no sender-id endpoint). **Push for personal/E2EE carries no content — only conversation id + type.** Server FCM currently logs-only (client_email/private_key unset).
- **Calls:** `POST /calls` / `POST /calls/:id/join` → `{callId,roomName,url(LiveKit wss),token}`; `GET /calls/ice-servers?userId=` → `{iceServers[]}` (coturn; currently empty as TURN env unset). `503 CALLS_NOT_CONFIGURED` if LiveKit unset.
- **Tenancy:** `x-tenant-id` (+ `x-account-id`,`x-trace-id`); prod source of truth = JWT `tenant_id`; enterprise writes also pass `tenantId` in body. Inter-service signed header: `x-velchat-signature`.
- **Feature flags / kill-switch:** `POST /feature-flags/evaluate {tenantId?,context}` → `{flags:{key:{on,value,variant?,reason}},announcement,maintenance}`; single `GET /feature-flags/evaluate/:key?...`; kill `POST /feature-flags/:key/disable`; maintenance `PUT /feature-flags/platform/maintenance`; announcement `PUT /feature-flags/platform/announcement`. Live refresh: backend emits `featureflag.changed` → WS "refetch" signal → client re-evaluates. Spec: `D:\Velchat\docs\FEATURE-FLAGS.md`.
- Other: `JWT_ISSUER=https://auth.velchat.local`, `JWT_ACCESS_TTL_SECONDS=900`, AI translate `AI_BASE_URL`/`AI_TRANSLATE_URL`.
- **Security:** the committed `D:\Velchat\.env` holds LIVE free-tier secrets — the client must never embed them; it only needs public base URLs + its own Firebase config.

## 9. Backend docs worth reading (in `D:\Velchat\docs`)
`API-ENDPOINTS.md` (canonical route list, HIGH) · `CLIENT-MEDIA-CACHE.md` (media/LRU/Manage-Storage, HIGH) · `FEATURE-FLAGS.md` (HIGH) · `VelChat-Architecture.md` (source HLD/LLD, HIGH) · `INTEGRATIONS.md` (push/calls/OTP env truth, HIGH) · `API-TEST-REPORT.md` (auth payload samples, MED) · `AI-SERVER.md` (translation, MED) · `PRODUCTION-READINESS-*` (reveals stubs, MED).

## Deviations from `VelChat-Mobile-Frontend-v1.md` (become ADRs at MP1)
1. **RPC transport (§M1):** doc says "connect-web / generated TS from proto". Backend has no connect-web and empty proto codegen. → **ADR: mobile consumes REST + WS; vendor `shared-types` payload interfaces.**
2. **DPoP (§M7/§L3):** doc says sign `htu+htm+iat+nonce` per request. Backend has no proof header, only `cnfJkt` refresh binding. → **ADR: implement `cnfJkt` binding; no per-request DPoP proof (device-key signing reserved for `/auth/challenge` login + link-approve).**
3. **Realtime resume (§M8):** doc assumes a resume token (backend §G3-3). Real WS has none. → **ADR: reconnect = `sync` cursor + chat `afterSeq` backfill.**
4. **Signal prekeys (§M15/MP1):** upload/fetch/approve/revoke REST not exposed. → **Blocker to raise with backend team before MP1 key-exchange.**
5. **Media multipart (§L8.7):** doc assumes resumable multipart *upload*. Backend is init→single PUT. → **ADR: resumable applies to downloads (Range on signed URL); uploads are single-shot (buffered ≤100 MB / streamed).**
6. **Prod origin:** per-service Render hosts, not single-origin. → env config must support per-service base URLs for prod.
