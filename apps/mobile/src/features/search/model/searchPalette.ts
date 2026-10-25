/**
 * Search-screen palette (§F1, §M16).
 *
 * These live here, beside the chat thread's own palette, for the same reason that one does:
 * the global tokens are tuned for page chrome and this screen needs pairs the chrome has no
 * use for. Measured against the real token values, the screen it replaces failed as follows.
 *
 * - The placeholder was `textTertiary` on `bgSubtle`: **3.38:1** in light — under the 4.5:1
 *   floor for small text. The "Frequent" header and every result timestamp were `textTertiary`
 *   on `bgBase`: **3.62:1**, same problem.
 * - The search bar, the filter chips and the leading tiles were `bgSubtle` on `bgBase`:
 *   **1.06–1.07:1** in BOTH themes. That is not a quiet boundary, it is no boundary — WCAG
 *   1.4.11 asks 3:1 for the edge of a control. They now carry a real edge.
 * - The frequent-avatar ring was `hairline` on `bgSubtle`: **1.10:1**. Decoration that renders
 *   as nothing is not decoration.
 * - Worst: a highlighted match inside a result TITLE was a **1.00:1** colour change, because
 *   `brandFrom` is defined identical to `textPrimary` in both themes. The only real signal was
 *   one weight step — and on RN the weight IS a different font FILE, so the truncation point of
 *   a one-line row moved as the user typed. The highlight is now a FILL behind the match, at the
 *   same weight and the same face, so nothing reflows and the signal does not depend on hue.
 *
 * Pure data + a pure resolver: no React, no RN imports. Every pair is pinned by a contrast test.
 */

export type Scheme = 'light' | 'dark';

export interface SearchPalette {
  /** The page behind everything (matches the theme's `bgBase`). */
  readonly pageBg: string;
  /** Fill of the search field, the filter chips and the leading tiles. */
  readonly fieldBg: string;
  /**
   * The edge that makes those fills into shapes. It has to clear 3:1 against BOTH the page it
   * sits on and the fill it encloses, which is exactly what `hairline` did not do.
   */
  readonly fieldBorder: string;
  /** Typed query text. */
  readonly inputText: string;
  /** Placeholder text, on `fieldBg`. */
  readonly placeholder: string;
  /** Small meta on the page: the "Frequent" header, the result count, every timestamp. */
  readonly metaText: string;
  /** Inactive filter-chip text, on `fieldBg`. */
  readonly chipText: string;
  /** Selected filter chip. */
  readonly chipActiveBg: string;
  readonly chipActiveText: string;
  /** The match highlight — a chip behind the matched run, NOT a colour or weight change. */
  readonly highlightBg: string;
  readonly highlightText: string;
  /**
   * Loading bars. Deliberately quiet: a skeleton is decoration that stands in for content, and
   * a high-contrast one reads as content that has arrived and is wrong.
   */
  readonly skeleton: string;
}

const LIGHT: SearchPalette = {
  pageBg: '#FFFFFF',
  fieldBg: '#F7F7F8',
  fieldBorder: '#8E8E94',
  inputText: '#0B0B0C',
  placeholder: '#6C6C72',
  metaText: '#6C6C72',
  chipText: '#5E5E64',
  chipActiveBg: '#0B0B0C',
  chipActiveText: '#FFFFFF',
  // Amber, the one colour on an otherwise monochrome screen, and the same convention every
  // find-in-page in the world uses. Told apart from the page by HUE as much as by luminance —
  // which is why the test below measures channel distance and not only a contrast ratio.
  highlightBg: '#FFE3A3',
  highlightText: '#0B0B0C',
  skeleton: '#E9E9EC',
};

const DARK: SearchPalette = {
  pageBg: '#0A0A0B',
  fieldBg: '#121214',
  fieldBorder: '#6E6E76',
  inputText: '#F5F5F7',
  placeholder: '#9A9AA2',
  metaText: '#9A9AA2',
  chipText: '#B0B0B8',
  chipActiveBg: '#FFFFFF',
  chipActiveText: '#0B0B0C',
  highlightBg: '#6B5210',
  highlightText: '#F5F5F7',
  skeleton: '#1F1F23',
};

/** Pure lookup — the same scheme always returns the same object. */
export function searchPalette(scheme: Scheme): SearchPalette {
  return scheme === 'dark' ? DARK : LIGHT;
}
