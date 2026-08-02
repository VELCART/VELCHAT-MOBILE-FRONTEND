/**
 * Search result shapes (§F1) — the view model the search UI renders and the hook produces.
 * Kept in `model/` so both the UI (`ui/`) and the data hook (`hooks/`) share one contract.
 */

/**
 * The kinds a result can be. `chat` + `message` are the ONLY kinds backed by real local data
 * today. The media kinds (`image`/`video`/`file`/`audio`/`link`) and `contact` remain in the
 * union so the type filters + leading-avatar rendering stay intact; there is no local media
 * index yet, so those filters honestly yield an empty state rather than fabricated rows.
 */
export type ResultKind =
  | 'chat'
  | 'message'
  | 'image'
  | 'video'
  | 'file'
  | 'audio'
  | 'link'
  | 'contact';

export interface SearchResult {
  id: string;
  kind: ResultKind;
  title: string;
  subtitle: string;
  time?: string;
  unread?: boolean;
  /** Navigation target — set for `chat`/`message` hits so a tap opens the chat. */
  conversationId?: string;
  /** The conversation name to hand the Chat route (its header title). */
  conversationName?: string;
}

/** A frequent/recent conversation shown in the browse-state avatar row. */
export interface FrequentChat {
  id: string;
  name: string;
}
