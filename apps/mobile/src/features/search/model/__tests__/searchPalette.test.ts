/**
 * The search screen's palette, measured rather than eyeballed — the same approach the thread's
 * palette takes. Every ratio below is computed from the hex itself, so a later tweak that looks
 * fine on a bright desk monitor still has to clear the floor on the reference device.
 *
 * The numbers these replace, computed from the real tokens the screen used to reference:
 *   placeholder (`textTertiary` on `bgSubtle`, light) ............ 3.38:1
 *   "Frequent" header + timestamps (`textTertiary` on `bgBase`) .. 3.62:1
 *   search bar / chips / tiles (`bgSubtle` on `bgBase`) .......... 1.06:1 light, 1.07:1 dark
 *   frequent-avatar ring (`hairline` on `bgSubtle`) .............. 1.10:1
 *   TITLE match highlight (`brandFrom` vs `textPrimary`) ......... 1.00:1  (identical hexes)
 */
import { searchPalette } from '../searchPalette';

function srgb(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Largest per-channel gap — "are these two colours?", for pairs told apart by hue. */
function channelDistance(a: string, b: string): number {
  const ha = a.replace('#', '');
  const hb = b.replace('#', '');
  let worst = 0;
  for (let i = 0; i < 6; i += 2) {
    const d = Math.abs(
      parseInt(ha.slice(i, i + 2), 16) - parseInt(hb.slice(i, i + 2), 16),
    );
    if (d > worst) worst = d;
  }
  return worst;
}

const SCHEMES = ['light', 'dark'] as const;

describe('searchPalette — text', () => {
  it.each(SCHEMES)(
    'the placeholder clears WCAG AA inside the search field (%s)',
    scheme => {
      const p = searchPalette(scheme);
      expect(contrast(p.placeholder, p.fieldBg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(SCHEMES)('the typed query clears WCAG AA (%s)', scheme => {
    const p = searchPalette(scheme);
    expect(contrast(p.inputText, p.fieldBg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)(
    'meta text — "Frequent", the result count, every timestamp — clears AA on the page (%s)',
    scheme => {
      // 13sp. Small text, so 4.5:1, not the 3:1 large-text allowance the old value leaned on.
      const p = searchPalette(scheme);
      expect(contrast(p.metaText, p.pageBg)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(SCHEMES)('both filter-chip states clear AA (%s)', scheme => {
    const p = searchPalette(scheme);
    expect(contrast(p.chipText, p.fieldBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.chipActiveText, p.chipActiveBg)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe('searchPalette — surfaces', () => {
  it.each(SCHEMES)(
    'the search field has an edge against the page AND against its own fill (%s)',
    scheme => {
      // WCAG 1.4.11: 3:1 for the boundary of a control. `bgSubtle` on `bgBase` was 1.06:1 —
      // the field, the chips and the leading tiles had no perceivable boundary at all.
      const p = searchPalette(scheme);
      expect(contrast(p.fieldBorder, p.pageBg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.fieldBorder, p.fieldBg)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(SCHEMES)(
    'the selected chip is unmistakably a different object from an unselected one (%s)',
    scheme => {
      const p = searchPalette(scheme);
      expect(contrast(p.chipActiveBg, p.fieldBg)).toBeGreaterThanOrEqual(3);
    },
  );
});

describe('searchPalette — the match highlight', () => {
  it.each(SCHEMES)(
    'the highlight is a FILL, so it does not depend on a colour step the theme cannot make (%s)',
    scheme => {
      // The defect: `brandFrom` is defined IDENTICAL to `textPrimary` in both themes, so
      // highlighting a match in a title was a 1.00:1 colour change and the only real signal was
      // one weight step — which, on RN, swaps the font file and moves the truncation point.
      const p = searchPalette(scheme);
      expect(p.highlightBg).not.toBe(p.pageBg);
      expect(p.highlightBg).not.toBe(p.fieldBg);
      expect(channelDistance(p.highlightBg, p.pageBg)).toBeGreaterThan(40);
    },
  );

  it.each(SCHEMES)('the matched text is readable on its chip (%s)', scheme => {
    const p = searchPalette(scheme);
    expect(contrast(p.highlightText, p.highlightBg)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe('searchPalette — shape', () => {
  it.each(SCHEMES)('light and dark are tuned separately (%s)', scheme => {
    const other = scheme === 'light' ? 'dark' : 'light';
    expect(searchPalette(scheme).highlightBg).not.toBe(
      searchPalette(other).highlightBg,
    );
    expect(searchPalette(scheme).pageBg).not.toBe(searchPalette(other).pageBg);
  });

  it('is a pure lookup — the same scheme always gives the same object', () => {
    expect(searchPalette('dark')).toBe(searchPalette('dark'));
  });
});
