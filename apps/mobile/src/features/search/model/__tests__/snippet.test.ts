/**
 * `snippet` — the window a search result shows around the term that matched (§F1).
 *
 * The defect this encodes: the row used to render the WHOLE message body at
 * `numberOfLines={1}`, so a hit at character 400 was simply off-screen and the user was shown
 * the start of a message with no visible reason for it being in the results at all.
 *
 * The contract is therefore: a bounded window CENTRED on the first match, an ellipsis wherever
 * the body was cut, and the match's position INSIDE that window handed back so the renderer
 * never searches the text a second time. The strongest invariant — asserted on every matched
 * case below — is that `text.slice(offset, offset + length)` is the matched text itself.
 *
 * Pure function, no React, no DB: these run in microseconds and cover the cases that are
 * painful to reproduce on a device (emoji, Devanagari matras, a match longer than the window).
 */
import {
  snippet,
  matchSpans,
  indexOfIgnoreCase,
  collapseWhitespace,
  ELLIPSIS,
} from '../snippet';

/** The window must always be able to name its own match. */
function matchedText(body: string, query: string, budget: number): string {
  const s = snippet(body, query, budget);
  return s.text.slice(s.offset, s.offset + s.length);
}

describe('collapseWhitespace', () => {
  test('a multi-line body becomes one line — the row only has one', () => {
    expect(collapseWhitespace('hello\n\n  there\tworld  ')).toBe(
      'hello there world',
    );
  });
});

describe('indexOfIgnoreCase', () => {
  test('matches regardless of case and reports a UTF-16 index', () => {
    expect(indexOfIgnoreCase('Hello World', 'WORLD')).toBe(6);
    expect(indexOfIgnoreCase('Hello World', 'nope')).toBe(-1);
  });

  test('an empty needle never matches — an empty query is not a hit on everything', () => {
    expect(indexOfIgnoreCase('anything', '')).toBe(-1);
  });

  test('a match after an astral character is reported at its real UTF-16 offset', () => {
    // '🎉' is a surrogate PAIR: 2 code units. A code-point-based index would say 2, and the
    // renderer slicing a JS string with it would cut the emoji in half.
    expect(indexOfIgnoreCase('🎉 party', 'party')).toBe(3);
  });
});

describe('matchSpans', () => {
  test('finds every occurrence, in order, without overlapping', () => {
    expect(matchSpans('aba ABA aba', 'aba')).toEqual([
      { start: 0, length: 3 },
      { start: 4, length: 3 },
      { start: 8, length: 3 },
    ]);
  });

  test('no query and no match both give no spans', () => {
    expect(matchSpans('hello', '')).toEqual([]);
    expect(matchSpans('hello', 'zz')).toEqual([]);
  });

  test('is bounded — a pathological title cannot cost unbounded work', () => {
    expect(matchSpans('a'.repeat(500), 'a', 4)).toHaveLength(4);
  });
});

describe('snippet — where the window sits', () => {
  test('a body that already fits is returned whole, with no ellipsis', () => {
    const s = snippet('see you at six', 'you', 40);
    expect(s.text).toBe('see you at six');
    expect(s.offset).toBe(4);
    expect(s.length).toBe(3);
  });

  test('a match at the START keeps the head and cuts only the tail', () => {
    const body = `needle ${'x'.repeat(200)}`;
    const s = snippet(body, 'needle', 40);
    expect(s.text.startsWith('needle')).toBe(true);
    expect(s.text.endsWith(ELLIPSIS)).toBe(true);
    expect(s.offset).toBe(0);
    expect(matchedText(body, 'needle', 40)).toBe('needle');
  });

  test('a match in the MIDDLE is centred, with an ellipsis at both cuts', () => {
    const body = `${'a'.repeat(200)} needle ${'b'.repeat(200)}`;
    const s = snippet(body, 'needle', 40);
    expect(s.text.startsWith(ELLIPSIS)).toBe(true);
    expect(s.text.endsWith(ELLIPSIS)).toBe(true);
    expect(matchedText(body, 'needle', 40)).toBe('needle');
    // Centred: roughly as much context before the match as after it.
    const before = s.offset;
    const after = s.text.length - (s.offset + s.length);
    expect(Math.abs(before - after)).toBeLessThanOrEqual(4);
  });

  test('a match at the END keeps the tail and cuts only the head', () => {
    const body = `${'x'.repeat(200)} needle`;
    const s = snippet(body, 'needle', 40);
    expect(s.text.startsWith(ELLIPSIS)).toBe(true);
    expect(s.text.endsWith(ELLIPSIS)).toBe(false);
    expect(s.text.endsWith('needle')).toBe(true);
    expect(matchedText(body, 'needle', 40)).toBe('needle');
  });

  test('the window never exceeds the budget (ellipses included)', () => {
    const body = `${'a'.repeat(300)} needle ${'b'.repeat(300)}`;
    for (const budget of [8, 12, 20, 40, 64]) {
      expect(snippet(body, 'needle', budget).text.length).toBeLessThanOrEqual(
        budget,
      );
    }
  });
});

describe('snippet — the awkward cases', () => {
  test('a match LONGER than the budget is shown from its start, clipped', () => {
    const term = 'supercalifragilistic';
    const body = `${'z'.repeat(50)}${term}${'z'.repeat(50)}`;
    const s = snippet(body, term, 12);
    expect(s.text.length).toBeLessThanOrEqual(12);
    expect(s.offset).toBeGreaterThanOrEqual(0);
    // Clipped, so `length` describes what is VISIBLE — never a span past the end of the text.
    expect(s.offset + s.length).toBeLessThanOrEqual(s.text.length);
    expect(s.length).toBeGreaterThan(0);
    expect(term.toLowerCase()).toContain(
      s.text.slice(s.offset, s.offset + s.length).toLowerCase(),
    );
  });

  test('NO match still gives a readable head, and says so with offset -1', () => {
    const body = 'a'.repeat(200);
    const s = snippet(body, 'needle', 40);
    expect(s.offset).toBe(-1);
    expect(s.length).toBe(0);
    expect(s.text.endsWith(ELLIPSIS)).toBe(true);
    expect(s.text.length).toBeLessThanOrEqual(40);
  });

  test('an empty query is not a match — the head is shown, unhighlighted', () => {
    const s = snippet('hello there', '', 40);
    expect(s.text).toBe('hello there');
    expect(s.offset).toBe(-1);
  });

  test('an empty body gives an empty window rather than an ellipsis', () => {
    expect(snippet('', 'x', 40)).toEqual({ text: '', offset: -1, length: 0 });
  });

  test('newlines in the body are collapsed before windowing, so offsets still line up', () => {
    const s = snippet('line one\nline two\nneedle here', 'needle', 40);
    expect(s.text).not.toContain('\n');
    expect(s.text.slice(s.offset, s.offset + s.length)).toBe('needle');
  });

  test('case is ignored but the ORIGINAL casing is what gets shown', () => {
    const s = snippet('Meeting at NOON tomorrow', 'noon', 40);
    expect(s.text.slice(s.offset, s.offset + s.length)).toBe('NOON');
  });
});

describe('snippet — multi-byte text is never cut in half', () => {
  /** A lone surrogate is the signature of a sliced astral character. */
  function hasLoneSurrogate(s: string): boolean {
    for (let i = 0; i < s.length; i += 1) {
      const c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const next = s.charCodeAt(i + 1);
        if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
        i += 1;
      } else if (c >= 0xdc00 && c <= 0xdfff) {
        return true;
      }
    }
    return false;
  }

  test('a wall of emoji is cut only between emoji, never through one', () => {
    const body = `${'🎉'.repeat(60)}needle${'🎈'.repeat(60)}`;
    for (const budget of [9, 10, 11, 12, 20, 41]) {
      const s = snippet(body, 'needle', budget);
      expect(hasLoneSurrogate(s.text)).toBe(false);
      expect(s.text.length).toBeLessThanOrEqual(budget);
    }
  });

  test('a ZWJ family emoji is kept whole — it is one character to the reader', () => {
    const family = '👨‍👩‍👧';
    const body = `${family.repeat(12)} needle ${family.repeat(12)}`;
    for (let budget = 10; budget <= 44; budget += 1) {
      const s = snippet(body, 'needle', budget);
      expect(hasLoneSurrogate(s.text)).toBe(false);
      // A window may not begin or end on a joiner: that renders as a dangling half-family.
      expect(s.text.replace(/…/g, '').startsWith('‍')).toBe(false);
      expect(s.text.replace(/…/g, '').endsWith('‍')).toBe(false);
    }
  });

  test('a skin-tone modifier stays attached to the emoji it modifies', () => {
    const body = `${'👍🏽'.repeat(40)}needle`;
    for (let budget = 10; budget <= 30; budget += 1) {
      const s = snippet(body, 'needle', budget);
      expect(hasLoneSurrogate(s.text)).toBe(false);
      expect(s.text.replace(/…/g, '').startsWith('\u{1f3fd}')).toBe(false);
    }
  });

  test('Devanagari is not cut between a consonant and its matra', () => {
    // नमस्ते — the ् (virama) and े (matra) are separate code points that belong to the
    // syllable before them; a window starting on one renders as an orphaned mark.
    const body = `${'नमस्ते '.repeat(30)}needle`;
    for (let budget = 10; budget <= 30; budget += 1) {
      const s = snippet(body, 'needle', budget);
      const visible = s.text.replace(/…/g, '');
      expect(/^[ऺ-ॏ॑-ॗ]/.test(visible)).toBe(false);
    }
  });

  test('Arabic harakat stay with their letter', () => {
    const body = `${'مَرْحَبًا '.repeat(30)}needle`;
    for (let budget = 10; budget <= 30; budget += 1) {
      const s = snippet(body, 'needle', budget);
      const visible = s.text.replace(/…/g, '');
      expect(/^[ً-ٰٟ]/.test(visible)).toBe(false);
    }
  });

  test('a match that is itself an emoji is located and reported correctly', () => {
    const body = `${'x'.repeat(100)} 🎉 party ${'y'.repeat(100)}`;
    const s = snippet(body, '🎉', 40);
    expect(s.text.slice(s.offset, s.offset + s.length)).toBe('🎉');
  });
});

describe('snippet — degenerate budgets', () => {
  test('a zero or negative budget yields nothing rather than throwing', () => {
    expect(snippet('hello', 'ell', 0)).toEqual({
      text: '',
      offset: -1,
      length: 0,
    });
    expect(snippet('hello', 'ell', -5)).toEqual({
      text: '',
      offset: -1,
      length: 0,
    });
  });

  test('a budget of one or two still returns something coherent', () => {
    for (const budget of [1, 2, 3]) {
      const s = snippet('abcdefghij needle klmnop', 'needle', budget);
      expect(s.text.length).toBeLessThanOrEqual(budget);
      expect(s.offset + s.length).toBeLessThanOrEqual(s.text.length);
    }
  });
});
