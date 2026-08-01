# ADR-0005: WatermelonDB as the local DB (UI source of truth)

- **Status:** Accepted
- **Date:** 2026-08-01
- **Context refs:** §M0 (offline-first, local DB is the UI source of truth), §M10, §L5, §L6 (sync), MP2.

## Context

VelChat is offline-first: the UI must render from a local store and never wait on the
network (§M0). The store has to scale to 100k+ messages, support reactive queries
(observe → re-render), lazy loading, and off-thread reads (§M0 "zero jank"). MMKV covers
small key-values but not relational, queryable, observable message/conversation data.

## Decision

Adopt **WatermelonDB 0.28** (SQLite) as the local database — the UI's source of truth.
The network mutates the DB (sync engine, MP2 §L6); the UI observes collections and
re-renders. It lives in `src/infra/db` (schema, models, adapter, queries), behind the
infra barrel; features observe it through their own hooks (feature-UI never imports
infra directly — `eslint-plugin-boundaries`).

- Adapter: `SQLiteAdapter` with `jsi: true` (New Architecture → off-thread reads).
- Schema v1 = the MP2 core tables (§L5): conversations, messages, receipts,
  conversation_members, users, outbox, drafts, upload_jobs, download_jobs — each indexed
  for the queries it serves. Migrations are added as the version bumps.
- Models use legacy property decorators → babel `@babel/plugin-proposal-decorators`
  (`{ legacy: true }`, pinned to v7 for babel-7) + tsconfig `experimentalDecorators` +
  `useDefineForClassFields: false`.
- Jest: the native SQLite adapter is absent → stubbed in `jest.setup.ts` so importing the
  db module doesn't crash (tests don't exercise real queries).

## Consequences

- **Requires a native rebuild** (`pnpm android`). WatermelonDB's Android module autolinks;
  if the JSI adapter needs manual wiring on this RN/New-Arch build, add the JSI installer
  per the WatermelonDB Android setup docs.
- One SQLite DB file (`velchat`). Schema evolution is additive-first with versioned
  migrations; a corrupt/incompatible DB boots to a safe re-sync (§M0/§R).
- iOS authored only (build deferred on this Windows machine).

## Alternatives considered

- **MMKV / AsyncStorage only** — not relational/observable; can't scale to message
  history or reactive lists. (AsyncStorage is lint-banned anyway.) Rejected.
- **SQLite (raw / op-sqlite / drizzle)** — no built-in reactivity/lazy models; we'd
  re-implement WatermelonDB's observation layer. Rejected.
- **Realm** — heavier, licensing/maintenance concerns for the budget. Rejected.
