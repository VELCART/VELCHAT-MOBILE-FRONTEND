/**
 * Live realtime store (§C4/§A15) — the ephemeral, cross-cutting reactive state for TYPING and
 * PRESENCE. Like `activeTab`, it is a tiny zustand store in `core` so both the navigation-adjacent
 * chat list (feature) and the chat header (feature) can read it, while the SyncEngine (domain)
 * writes it — without a reverse feature→domain dependency.
 *
 * NON-NEGOTIABLE: this is EPHEMERAL. Nothing here is ever persisted to WatermelonDB (§C4 typing is
 * never stored; presence is a live signal). Maps are replaced on every write so zustand selectors
 * re-run and only the affected conversation/user re-renders. Typing entries carry an `expiresAt` and
 * are treated as expired on read (`isTypingActive`) — the SyncEngine additionally owns a per-entry
 * timer that removes the stale row (the state change is what actually re-renders the indicator away).
 */
import { create } from 'zustand';

/** Typing indicator time-to-live (~5s), matching the server's auto-expire contract (§C4). */
export const TYPING_TTL_MS = 5_000;

/**
 * Availability values we may store. The REST `GET /presence/:id` returns the fine availability
 * (`available|busy|dnd|away|brb|incall|offline`); the WS `presence.changed` coarse bucket may send
 * `online`. Anything unrecognised normalises to `offline` (fail-closed).
 */
export type PresenceStatus =
  | 'available'
  | 'busy'
  | 'dnd'
  | 'away'
  | 'brb'
  | 'incall'
  | 'offline'
  | 'online';

export interface TypingEntry {
  readonly userId: string;
  /** Epoch ms after which the indicator is stale and must not render. */
  readonly expiresAt: number;
}

export interface PresenceEntry {
  readonly status: PresenceStatus;
  /** Epoch ms of last-seen when offline, else `null` (online or privacy-hidden). */
  readonly lastSeen: number | null;
}

/** Pure: is a typing entry still live at `now`? Exported so the expiry logic is unit-testable. */
export function isTypingActive(
  entry: TypingEntry | undefined,
  now: number,
): boolean {
  return entry !== undefined && entry.expiresAt > now;
}

const KNOWN_STATUSES: readonly PresenceStatus[] = [
  'available',
  'busy',
  'dnd',
  'away',
  'brb',
  'incall',
  'offline',
  'online',
];

/** Pure: coerce an arbitrary server status string to a known `PresenceStatus` (else `offline`). */
export function normalizePresenceStatus(raw: string): PresenceStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(raw)
    ? (raw as PresenceStatus)
    : 'offline';
}

interface RealtimeState {
  /** conversationId → who is currently typing (auto-expiring). */
  readonly typingByConversation: ReadonlyMap<string, TypingEntry>;
  /** userId → live presence snapshot. */
  readonly presenceByUser: ReadonlyMap<string, PresenceEntry>;
  /** Writer (domain): set/refresh a conversation's typing indicator. */
  setTyping: (
    conversationId: string,
    userId: string,
    expiresAt: number,
  ) => void;
  /** Writer (domain): clear a conversation's typing indicator. */
  clearTyping: (conversationId: string) => void;
  /** Writer (domain): set a user's presence snapshot. */
  setPresence: (userId: string, entry: PresenceEntry) => void;
  /** Writer (domain): drop every typing indicator (e.g. socket dropped — peers no longer trusted). */
  resetTyping: () => void;
  /** Writer (domain): full dispose (engine stop) — clears typing AND presence. */
  reset: () => void;
}

export const useRealtimeStore = create<RealtimeState>(set => ({
  typingByConversation: new Map<string, TypingEntry>(),
  presenceByUser: new Map<string, PresenceEntry>(),
  setTyping: (conversationId, userId, expiresAt) =>
    set(s => {
      const next = new Map(s.typingByConversation);
      next.set(conversationId, { userId, expiresAt });
      return { typingByConversation: next };
    }),
  clearTyping: conversationId =>
    set(s => {
      if (!s.typingByConversation.has(conversationId)) return s;
      const next = new Map(s.typingByConversation);
      next.delete(conversationId);
      return { typingByConversation: next };
    }),
  setPresence: (userId, entry) =>
    set(s => {
      const next = new Map(s.presenceByUser);
      next.set(userId, entry);
      return { presenceByUser: next };
    }),
  resetTyping: () =>
    set(s =>
      s.typingByConversation.size === 0
        ? s
        : { typingByConversation: new Map<string, TypingEntry>() },
    ),
  reset: () =>
    set({
      typingByConversation: new Map<string, TypingEntry>(),
      presenceByUser: new Map<string, PresenceEntry>(),
    }),
}));

/**
 * Selector: the userId typing in a conversation right now, or `null`. Expired entries read as
 * `null` (guarded even if the owning timer is momentarily late). Only re-renders when THIS
 * conversation's entry changes (Object.is on the entry ref).
 */
export function useTypingUser(conversationId: string): string | null {
  const entry = useRealtimeStore(s =>
    s.typingByConversation.get(conversationId),
  );
  return isTypingActive(entry, Date.now())
    ? (entry as TypingEntry).userId
    : null;
}

/** Selector: a user's live presence, or `undefined` if unknown. `null` id → always `undefined`. */
export function usePresence(userId: string | null): PresenceEntry | undefined {
  return useRealtimeStore(s =>
    userId ? s.presenceByUser.get(userId) : undefined,
  );
}
