/**
 * Pure presence payload normalisers (§A15) — no `api`/RN imports, so the field-tolerance logic is
 * unit-tested in isolation (mirrors `conversationShape.ts`). Casing/shape is normalised defensively:
 * REST `GET /presence/:id` → `PresenceResult`; a live WS frame's `data` (`PresenceChangedPayload`)
 * → `PresenceEvent`.
 */

export interface PresenceResult {
  /** Fine availability from REST (`available|away|offline|…`) or coarse `online` from WS. */
  status: string;
  emoji?: string;
  text?: string;
  /** Epoch ms of last-seen, or `null` (online / hidden / unknown). */
  lastSeen: number | null;
}

/** A live presence event parsed from a WS frame's `data`, or `null` when unusable. */
export interface PresenceEvent {
  userId: string;
  status: string;
  lastSeen: number | null;
}

/** Coerce a number | ISO-8601 string | nullish into epoch ms, or `null`. */
export function toEpochMs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Normalise a `GET /presence/:id` body (already `data`-unwrapped by the axios interceptor). */
export function normalizePresence(raw: unknown): PresenceResult {
  const d =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: PresenceResult = {
    status: typeof d.status === 'string' ? d.status : 'offline',
    lastSeen: toEpochMs(d.lastSeen ?? d.last_seen),
  };
  if (typeof d.emoji === 'string') out.emoji = d.emoji;
  if (typeof d.text === 'string') out.text = d.text;
  return out;
}

/**
 * Pure: parse a live presence WS frame's `data` into a `PresenceEvent`, or `null` if it lacks a
 * usable account id. Accepts `account_id` (the `PresenceChangedPayload` field) or `userId`/`user_id`;
 * derives `lastSeen` from an explicit `lastSeen`/`last_seen`, else from `changed_at` when offline.
 */
export function normalizePresenceEvent(data: unknown): PresenceEvent | null {
  const d =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const userId =
    typeof d.account_id === 'string'
      ? d.account_id
      : typeof d.userId === 'string'
        ? d.userId
        : typeof d.user_id === 'string'
          ? d.user_id
          : undefined;
  if (userId === undefined) return null;
  const status = typeof d.status === 'string' ? d.status : 'offline';
  const explicit = d.lastSeen ?? d.last_seen;
  const lastSeen =
    explicit !== undefined && explicit !== null
      ? toEpochMs(explicit)
      : status === 'offline'
        ? toEpochMs(d.changed_at)
        : null;
  return { userId, status, lastSeen };
}
