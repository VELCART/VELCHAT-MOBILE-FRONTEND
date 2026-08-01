---
'@velchat/mobile': minor
---

MP2 foundation — offline-first chat:

- **WatermelonDB** as the local DB / UI source of truth (ADR-0005). Schema v1 with the
  core tables (§L5): conversations, messages, receipts, conversation_members, users,
  outbox, drafts, upload_jobs, download_jobs — each indexed for its queries. JSI adapter
  (off-thread reads), legacy decorators, jest-stubbed.
- **Chats list** — WhatsApp-style rows on **FlashList** (ADR-0006) that OBSERVE the DB
  (pinned → most-recent, unread pills, instant open). Replaces the Chats placeholder; a
  dev seed fills it until the MP2 sync engine feeds real conversations.

Needs a native rebuild (WatermelonDB + FlashList are native modules).
