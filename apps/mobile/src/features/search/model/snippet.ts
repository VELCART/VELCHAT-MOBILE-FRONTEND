/**
 * Result snippets + match spans (§F1) — pure text work, no React, no DB.
 *
 * A search result has to answer ONE question before anything else: why is this row here? The
 * first version of this screen answered it by putting the whole message body in the subtitle
 * and clamping it to one line, so a hit at character 400 was off-screen and the row showed the
 * opening words of an unrelated-looking message.
 *
 * So: `snippet` returns a bounded window CENTRED on the first match, an ellipsis wherever the
 * body was cut, and the match's position INSIDE that window. The renderer slices by those
 * offsets and never searches the text again — the old `Highlight` compiled a fresh RegExp per
 * text node per render (~200 compilations per keystroke on a full result set).
 *
 * Offsets are UTF-16 indices into `text`, because that is what `String.prototype.slice` — and
 * therefore the renderer — speaks. Window edges are moved off anything that would cut a
 * character in half: surrogate pairs, ZWJ sequences, skin-tone modifiers, variation selectors,
 * combining marks, Devanagari matras and Arabic harakat.
 */

/** A run of text to emphasise, as UTF-16 offsets into the string it belongs to. */
export interface HighlightSpan {
  readonly start: number;
  readonly length: number;
}

/** A windowed subtitle plus where its match sits inside the window (`offset: -1` = none). */
export interface Snippet {
  readonly text: string;
  readonly offset: number;
  readonly length: number;
}

export const ELLIPSIS = '…';

const EMPTY: Snippet = { text: '', offset: -1, length: 0 };

/** The body of a chat message is multi-line; a result row is one line. Fold it first. */
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Case folding can change a string's LENGTH (Turkish dotted capital I folds to two code
 * units), which would desync every offset below. When that happens we fall back to a scan that
 * compares slice by slice instead of trusting a folded index.
 */
function foldsInPlace(s: string): boolean {
  return s.toLowerCase().length === s.length;
}

/**
 * Case-insensitive `indexOf` that returns a UTF-16 index into `hay`. An empty needle never
 * matches — an empty query is not a hit on everything.
 */
export function indexOfIgnoreCase(
  hay: string,
  needle: string,
  from = 0,
): number {
  if (needle === '' || hay === '') return -1;
  const lowNeedle = needle.toLowerCase();
  if (foldsInPlace(hay) && lowNeedle.length === needle.length) {
    return hay.toLowerCase().indexOf(lowNeedle, Math.max(0, from));
  }
  for (let i = Math.max(0, from); i + needle.length <= hay.length; i += 1) {
    if (hay.slice(i, i + needle.length).toLowerCase() === lowNeedle) return i;
  }
  return -1;
}

/**
 * Every non-overlapping occurrence of `query` in `text`, pre-computed once so the row renders
 * by slicing. Bounded by `limit`: a title is short, but nothing here should be able to cost
 * unbounded work on a pathological row.
 */
export function matchSpans(
  text: string,
  query: string,
  limit = 8,
): HighlightSpan[] {
  const q = query.trim();
  const spans: HighlightSpan[] = [];
  if (!q || !text || limit <= 0) return spans;
  let from = 0;
  while (spans.length < limit) {
    const at = indexOfIgnoreCase(text, q, from);
    if (at < 0) break;
    spans.push({ start: at, length: q.length });
    from = at + q.length;
  }
  return spans;
}

const ZWJ = 0x200d;

/** Code points that belong to the character BEFORE them, so a cut in front of one orphans it. */
function isCombining(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // combining diacritics
    (cp >= 0x0483 && cp <= 0x0489) ||
    (cp >= 0x064b && cp <= 0x065f) || // Arabic harakat
    cp === 0x0670 ||
    (cp >= 0x06d6 && cp <= 0x06ed) ||
    (cp >= 0x0900 && cp <= 0x0903) || // Devanagari signs
    (cp >= 0x093a && cp <= 0x094f) || // Devanagari matras + virama
    (cp >= 0x0951 && cp <= 0x0957) ||
    (cp >= 0x0962 && cp <= 0x0963) ||
    (cp >= 0x1ab0 && cp <= 0x1aff) ||
    (cp >= 0x1dc0 && cp <= 0x1dff) ||
    (cp >= 0x20d0 && cp <= 0x20ff) || // enclosing marks (keycaps)
    (cp >= 0xfe00 && cp <= 0xfe0f) || // variation selectors
    (cp >= 0xfe20 && cp <= 0xfe2f) ||
    (cp >= 0x1f3fb && cp <= 0x1f3ff) // emoji skin-tone modifiers
  );
}

function isRegionalIndicator(cp: number): boolean {
  return cp >= 0x1f1e6 && cp <= 0x1f1ff;
}

/** The code point ENDING at `i` (i.e. the one just before the cut), or -1 at the start. */
function codePointBefore(s: string, i: number): number {
  if (i <= 0) return -1;
  const lo = s.charCodeAt(i - 1);
  if (lo >= 0xdc00 && lo <= 0xdfff && i >= 2) {
    const hi = s.charCodeAt(i - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) return s.codePointAt(i - 2) ?? lo;
  }
  return lo;
}

/** Would cutting `s` at index `i` split one character the reader sees as whole? */
function cutUnsafe(s: string, i: number): boolean {
  if (i <= 0 || i >= s.length) return false;
  const cur = s.charCodeAt(i);
  const prev = s.charCodeAt(i - 1);
  // Mid surrogate pair.
  if (cur >= 0xdc00 && cur <= 0xdfff && prev >= 0xd800 && prev <= 0xdbff) {
    return true;
  }
  // Either side of a zero-width joiner (👨‍👩‍👧 is one character to the reader).
  if (prev === ZWJ || cur === ZWJ) return true;
  const cp = s.codePointAt(i) ?? cur;
  if (isCombining(cp)) return true;
  // Between the two halves of a flag.
  if (isRegionalIndicator(cp) && isRegionalIndicator(codePointBefore(s, i))) {
    return true;
  }
  return false;
}

function safeForward(s: string, i: number): number {
  let n = i;
  while (n < s.length && cutUnsafe(s, n)) n += 1;
  return n;
}

function safeBack(s: string, i: number): number {
  let n = Math.min(i, s.length);
  while (n > 0 && cutUnsafe(s, n)) n -= 1;
  return n;
}

/** The raw [start, end) window for a given inner budget, before ellipses are accounted for. */
function windowFor(
  flat: string,
  at: number,
  mlen: number,
  inner: number,
): { start: number; end: number } {
  let start: number;
  let end: number;
  if (at < 0) {
    start = 0;
    end = Math.min(flat.length, inner);
  } else if (mlen >= inner) {
    // The match alone overflows the row: show it from its start and clip the rest.
    start = at;
    end = Math.min(flat.length, at + inner);
  } else {
    const pad = Math.floor((inner - mlen) / 2);
    start = Math.max(0, at - pad);
    end = start + inner;
    if (end > flat.length) {
      end = flat.length;
      start = Math.max(0, end - inner);
    }
  }
  start = safeForward(flat, start);
  end = safeBack(flat, end);
  if (end <= start) end = safeForward(flat, Math.min(flat.length, start + 1));
  return { start, end };
}

/**
 * A `budget`-long window of `body` centred on the first case-insensitive occurrence of
 * `query`, with `…` wherever the body was cut. `offset`/`length` locate the match inside
 * the returned `text` (`offset: -1` when nothing matched, so the caller shows a plain head).
 *
 * `text.length` never exceeds `budget` — the ellipses are paid for out of it, and are dropped
 * rather than overflow when the budget is too small to carry both them and a character.
 */
export function snippet(body: string, query: string, budget: number): Snippet {
  if (budget <= 0) return EMPTY;
  const flat = collapseWhitespace(body);
  if (!flat) return EMPTY;

  const q = query.trim();
  const at = q ? indexOfIgnoreCase(flat, q) : -1;
  const mlen = at >= 0 ? q.length : 0;

  if (flat.length <= budget) {
    return { text: flat, offset: at, length: at >= 0 ? mlen : 0 };
  }

  // Whether an ellipsis is needed depends on the window, and the window depends on how much
  // budget the ellipses take. Two passes settle it; a third guarantees termination.
  let lead = false;
  let trail = false;
  let start = 0;
  let end = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    const inner = Math.max(1, budget - (lead ? 1 : 0) - (trail ? 1 : 0));
    ({ start, end } = windowFor(flat, at, mlen, inner));
    const nextLead = start > 0;
    const nextTrail = end < flat.length;
    if (nextLead === lead && nextTrail === trail) break;
    lead = nextLead;
    trail = nextTrail;
  }
  lead = start > 0;
  trail = end < flat.length;

  // Decoration is the first thing to go when the budget cannot carry it, then content — and a
  // content cut is still made on a character boundary.
  if (1 + (lead ? 1 : 0) + (trail ? 1 : 0) > budget) {
    lead = false;
    trail = false;
  }
  let coreLen = end - start;
  if (coreLen + (lead ? 1 : 0) + (trail ? 1 : 0) > budget) {
    if (trail) trail = false;
  }
  if (coreLen + (lead ? 1 : 0) + (trail ? 1 : 0) > budget) {
    if (lead) lead = false;
  }
  if (coreLen > budget) {
    const core = flat.slice(start, end);
    coreLen = Math.max(0, safeBack(core, budget));
    end = start + coreLen;
  }

  const text =
    (lead ? ELLIPSIS : '') + flat.slice(start, end) + (trail ? ELLIPSIS : '');

  if (at < 0 || coreLen === 0) return { text, offset: -1, length: 0 };
  const visibleStart = Math.max(at, start);
  const visibleEnd = Math.min(at + mlen, end);
  if (visibleEnd <= visibleStart) return { text, offset: -1, length: 0 };
  return {
    text,
    offset: visibleStart - start + (lead ? 1 : 0),
    length: visibleEnd - visibleStart,
  };
}
