/**
 * Turning a flat result list into something a person can read.
 *
 * Searching a common word returned fifty rows that looked IDENTICAL: the same avatar, the
 * same chat name, fifty times down the screen, differing only in a short snippet most of the
 * way across. Every one was a true match, and the list still read as duplicates — which is the
 * complaint that produced this file.
 *
 * Two changes, both structural rather than cosmetic:
 *
 *  - CHATS AND MESSAGES ARE DIFFERENT ANSWERS and get their own sections. "Which chat is
 *    called this" and "where was this said" are not the same question, and interleaving them
 *    by timestamp made the first kind impossible to find.
 *  - A RUN OF MESSAGES FROM ONE CHAT NAMES THAT CHAT ONCE. The rows after the first carry the
 *    snippet alone, so the eye travels down the thing that differs instead of past fifty
 *    copies of the thing that does not.
 *
 * Pure — no React, no theme, no i18n. The caller supplies the section titles so this file
 * never holds a string a translator would need.
 */
import type { SearchResult } from './types';

export type SearchRow =
  | { readonly kind: 'header'; readonly id: string; readonly title: string }
  | {
      readonly kind: 'result';
      readonly id: string;
      readonly result: SearchResult;
      /**
       * Draw the avatar and the chat name on this row?
       *
       * False for the second and later messages from the SAME conversation, which is what
       * stops one chat printing its own name fifty times.
       */
      readonly showChrome: boolean;
    };

export interface SectionTitles {
  readonly chats: string;
  readonly messages: string;
}

/**
 * Flatten results into header/result rows, chats first.
 *
 * Order WITHIN each section is left exactly as given — ranking is the hook's job and this must
 * not quietly re-sort it. A section with nothing in it contributes no header, so a query that
 * only matches message bodies does not grow an empty "Chats" heading.
 */
export function sectionise(
  results: readonly SearchResult[],
  titles: SectionTitles,
): readonly SearchRow[] {
  const rows: SearchRow[] = [];

  const chats = results.filter(r => r.kind === 'chat');
  if (chats.length > 0) {
    rows.push({ kind: 'header', id: 'h_chats', title: titles.chats });
    for (const r of chats) {
      rows.push({ kind: 'result', id: r.id, result: r, showChrome: true });
    }
  }

  const messages = results.filter(r => r.kind === 'message');
  if (messages.length > 0) {
    rows.push({ kind: 'header', id: 'h_messages', title: titles.messages });
    // `previous`, not a Set: only a CONSECUTIVE repeat is suppressed. If the ranking ever
    // interleaves two conversations, each run still announces whose it is — a row that
    // silently belonged to a chat named twelve rows earlier would be worse than a repeat.
    let previous: string | null = null;
    for (const r of messages) {
      rows.push({
        kind: 'result',
        id: r.id,
        result: r,
        showChrome: r.conversationId !== previous,
      });
      previous = r.conversationId;
    }
  }

  return rows;
}
