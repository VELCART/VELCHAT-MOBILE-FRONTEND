/**
 * Pure grouping + date helpers for the chat message list (§F2). No React / RN imports so
 * the run-boundary logic — the error-prone part — is unit-tested in isolation.
 *
 * The list is NEWEST-FIRST (index 0 = newest) and rendered into a REVERSED FlashList, so
 * on screen the OLDER neighbour of `messages[i]` sits at `messages[i + 1]` (visually above).
 * Every boundary decision reads that older neighbour.
 */

/** Minimal shape the grouping needs — `Message` rows satisfy it structurally. */
export interface GroupableMsg {
  readonly createdAt: number;
  readonly senderId: string;
}

/** Local-midnight epoch for `ts` — the calendar-day bucket. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Same local calendar day? */
export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/**
 * Does `messages[i]` open a new calendar day when the list is read oldest→newest — i.e. is
 * it the OLDEST message of its day (the one a date separator sits above)? True when there
 * is no older neighbour (oldest message overall) or the older neighbour is a different day.
 */
export function startsNewDay(
  messages: readonly GroupableMsg[],
  i: number,
): boolean {
  const cur = messages[i];
  if (!cur) return false;
  const older = messages[i + 1];
  if (!older) return true;
  return !isSameDay(cur.createdAt, older.createdAt);
}

/**
 * Does `messages[i]` start a new same-sender run — the top bubble of its group, the one that
 * gets the tail? A run breaks on a sender change or a day change. True at the oldest message
 * overall, at a day boundary, or when the older neighbour is a different sender.
 */
export function startsNewRun(
  messages: readonly GroupableMsg[],
  i: number,
): boolean {
  const cur = messages[i];
  if (!cur) return false;
  if (startsNewDay(messages, i)) return true;
  const older = messages[i + 1];
  if (!older) return true;
  return older.senderId !== cur.senderId;
}

/**
 * Time-of-day token (12-hour, e.g. "9:05 AM") — the bubble timestamp and the header's
 * presence line share it. `toLocaleTimeString` is ICU over JNI on Hermes, so callers must
 * resolve this ONCE per DB emission, never per row per render (§R4). '' for an invalid ts.
 */
export function compactTime(ts: number): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export type DayCategory = 'today' | 'yesterday' | 'other';

/** Classify `ts` relative to `now` for the date-separator label (DST-safe). */
export function dayCategory(ts: number, now: number): DayCategory {
  if (isSameDay(ts, now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(ts, yesterday.getTime())) return 'yesterday';
  return 'other';
}

/**
 * Compact last-seen token for the header presence line (§A15): time-of-day when it was today,
 * a caller-supplied localised "yesterday" word for yesterday, else a short date. Mirrors the
 * chat-list `timeLabel` buckets so the two surfaces read consistently. Empty string for an
 * invalid timestamp. The `chat.lastSeen` i18n string wraps this as its `{{time}}` param.
 */
export function presenceTimeLabel(
  ts: number,
  now: number,
  yesterdayLabel: string,
): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const cat = dayCategory(ts, now);
  if (cat === 'today') return compactTime(ts);
  if (cat === 'yesterday') return yesterdayLabel;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * What the chat header calls this conversation (VC-053).
 *
 * Three sources in order of authority: the name the navigation passed (the chat list and search
 * both know it), then the conversation row the header already observes, then a generic label.
 *
 * The row matters because ONE entry point carries no name at all — the notification deep link is
 * `chat/:conversationId` and nothing else — and without this that path rendered the bottom-tab
 * label "Chats" as the peer's name. Blank is treated as absent in both sources: an unresolved row
 * carries an empty string, and `??` would have accepted it and drawn an empty header.
 */
export function chatTitle(
  routeName: string | undefined,
  rowName: string | undefined,
  fallback: string,
): string {
  const fromRoute = routeName?.trim();
  if (fromRoute) return fromRoute;
  const fromRow = rowName?.trim();
  if (fromRow) return fromRow;
  return fallback;
}

/** What a chat-list row shows for itself. `initial` absent → the avatar draws its person glyph. */
export interface ConversationRowIdentity {
  readonly title: string;
  readonly initial: string | undefined;
}

/**
 * What the chat LIST calls a conversation, and the avatar initial that must agree with it
 * (VC-070). Lives beside {@link chatTitle} because the list and the header are the same
 * decision on two surfaces, and a user who taps a row must not be shown a different answer.
 *
 * The row used to decide this three times over — `name ?? '—'` for the title, `?? 'Chat'` for
 * the accessibility label, `?? '?'` for the initial — so an unresolved conversation rendered as
 * a bare em-dash beside a generic avatar (seen live, with a two-character preview as the only
 * clue to who it was), while a screen reader was told the untranslated word "Chat". Deriving all
 * of it here is what keeps the eye and the screen reader on the same answer.
 *
 * WHY NOT THE PEER'S PHONE NUMBER, which is what WhatsApp puts here: this device does not have
 * it. The conversation row denormalises `peer_id` and the photo, not a number; the members
 * endpoint returns bare account ids and the peer profile carries no phone at all — contact
 * discovery is OPRF precisely so a number can never be looked up from an account. The one
 * number↔account map we do hold is the discovered address book, and a peer found there already
 * resolves to a name, because the device reader falls back to the number itself for an entry
 * saved without one. So a row that reaches this fallback is, by construction, one whose number
 * could only come from a request — and the render path may not make one (§M0 rule 2).
 *
 * `initial` is `undefined` rather than the old '?' sentinel: only a REAL name may colour an
 * avatar disc, since a lone letter from a generic label reads as a person who is not there. The
 * sentinel also meant a name genuinely starting with '?' was demoted to the generic avatar.
 */
export function conversationRowIdentity(
  name: string | undefined,
  fallback: string,
): ConversationRowIdentity {
  const resolved = name?.trim();
  if (!resolved) return { title: fallback, initial: undefined };
  return { title: resolved, initial: resolved.charAt(0).toUpperCase() };
}
