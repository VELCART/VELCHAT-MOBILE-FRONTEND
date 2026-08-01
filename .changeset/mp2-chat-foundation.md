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

- **Chat screen** — tap a row → the conversation: a reversed FlashList of message bubbles
  (mine right / theirs left, ✓/✓✓ ticks) reading the DB, and a keyboard-aware composer
  that sends OPTIMISTICALLY (writes the DB → the bubble appears instantly; the MP2 outbox
  transmits + reconciles later). Dev-seeded messages until sync lands.

Needs a native rebuild (WatermelonDB + FlashList are native modules).
