/**
 * Search result shapes (§F1) — the view model the search UI renders and the hook produces.
 * Kept in `model/` so both the UI (`ui/`) and the data hook (`hooks/`) share one contract.
 */
import type { HighlightSpan } from './snippet';

/**
 * The kinds a result can be — and the ONLY two, deliberately.
 *
 * The union used to also carry `image`/`video`/`file`/`audio`/`link`/`contact` "so the filters
 * stay intact". Nothing ever produced one: there is no local media index, so those chips fell
 * through to "No results — try a different word", which blamed the user's spelling for a
 * feature that does not exist. The chips now say plainly that the filter is not available yet,
 * and the type says plainly what search can return. The media kinds come back with the media
 * pipeline that can actually populate them (§M12).
 */
export type ResultKind = 'chat' | 'message';

/**
 * The screen's owner state machine (§R1). `browsing` used to be derived from the query alone,
 * so the zero state rendered during the debounce + DB round trip and every search began by
 * saying "No results for “a”"; a rejected query was swallowed into an empty result, so a DB
 * failure was indistinguishable from a chat nobody had.
 */
export type SearchStatus = 'idle' | 'searching' | 'done' | 'error';

export interface SearchResult {
  readonly id: string;
  readonly kind: ResultKind;
  /** The conversation name (for both kinds — a message hit is shown under its chat). */
  readonly title: string;
  /** Pre-computed highlight runs in `title`, so the row never searches the text again. */
  readonly titleSpans: readonly HighlightSpan[];
  /** A WINDOW around the match (see `snippet`), not the whole body. */
  readonly subtitle: string;
  /** Pre-computed highlight runs in `subtitle` (offsets are into the window, not the body). */
  readonly subtitleSpans: readonly HighlightSpan[];
  /** Formatted timestamp, or '' when the row has none. */
  readonly time: string;
  /** Unread messages in the conversation — drawn as the same pill the inbox row draws. */
  readonly unreadCount: number;
  /** Navigation target — every kind search can produce opens a chat. */
  readonly conversationId: string;
  /** The conversation name to hand the Chat route (its header title). */
  readonly conversationName: string;
}

/** A frequent/recent conversation shown in the browse-state avatar row. */
export interface FrequentChat {
  readonly id: string;
  readonly name: string;
}
