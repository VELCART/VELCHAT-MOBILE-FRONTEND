/**
 * The thread's palette is WhatsApp's, and these are the properties that make it readable rather
 * than merely similar. Contrast is computed from the hex values themselves, so a future tweak
 * that looks fine on a bright desk monitor still has to clear the floor.
 */
import { chatPalette, quoteAccent, quotePreview } from '../chatPalette';

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

/** Largest per-channel gap between two hexes — a crude but honest "are these two colours?". */
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

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const SCHEMES = ['light', 'dark'] as const;

describe('chatPalette', () => {
  it.each(SCHEMES)('message text clears WCAG AA on its bubble (%s)', scheme => {
    const c = chatPalette(scheme);
    expect(contrast(c.outgoingText, c.outgoingBg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.incomingText, c.incomingBg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SCHEMES)(
    'the timestamp clears WCAG AA on its bubble (%s) — it is 11sp small text, not large',
    scheme => {
      const c = chatPalette(scheme);
      expect(contrast(c.outgoingMeta, c.outgoingBg)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(c.incomingMeta, c.incomingBg)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );

  // Deliberately NOT a contrast ratio. Mine and theirs are told apart by HUE — WhatsApp's pale
  // green against white sits at 1.11:1 and is instantly readable — so a luminance test would
  // reject the very design this is meant to protect. What must hold is that the two fills are
  // far enough apart in colour to be seen as two things.
  it.each(SCHEMES)(
    'the two bubbles are unmistakably different fills (%s)',
    scheme => {
      const c = chatPalette(scheme);
      expect(c.outgoingBg).not.toBe(c.incomingBg);
      expect(channelDistance(c.outgoingBg, c.incomingBg)).toBeGreaterThan(40);
    },
  );

  it.each(SCHEMES)(
    'quoted text stays readable on both host bubbles (%s)',
    scheme => {
      const c = chatPalette(scheme);
      expect(
        contrast(c.quoteTextOnOutgoing, c.quoteInOutgoingBg),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(c.quoteTextOnIncoming, c.quoteInIncomingBg),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(SCHEMES)(
    'the read tick is visible on the bubble it appears on — it only ever appears on mine (%s)',
    scheme => {
      const c = chatPalette(scheme);
      expect(contrast(c.tickRead, c.outgoingBg)).toBeGreaterThanOrEqual(3);
      // Every other state rides the timestamp's colour, so that is what it must clear.
      expect(contrast(c.outgoingMeta, c.outgoingBg)).toBeGreaterThanOrEqual(3);
      // Read has to be distinguishable from delivered by more than a shade.
      expect(c.tickRead).not.toBe(c.outgoingMeta);
    },
  );

  it.each(SCHEMES)(
    'the typing accent is legible on the bubble it is drawn in (%s)',
    scheme => {
      const c = chatPalette(scheme);
      expect(contrast(c.typing, c.incomingBg)).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(SCHEMES)(
    'a quote panel is a visible step off the bubble it sits in (%s)',
    scheme => {
      const c = chatPalette(scheme);
      expect(c.quoteInOutgoingBg).not.toBe(c.outgoingBg);
      expect(c.quoteInIncomingBg).not.toBe(c.incomingBg);
      // The author accent is the one thing a reader uses to know WHO is quoted.
      // Each accent is paired with the panel it is drawn on, so each must clear that one.
      expect(
        contrast(c.quoteAccentOnOutgoing, c.quoteInOutgoingBg),
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(c.quoteAccentOnIncoming, c.quoteInIncomingBg),
      ).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(SCHEMES)('light and dark are tuned separately (%s)', scheme => {
    const other = scheme === 'light' ? 'dark' : 'light';
    expect(chatPalette(scheme).outgoingBg).not.toBe(
      chatPalette(other).outgoingBg,
    );
  });

  it('is a pure lookup — the same scheme always gives the same object', () => {
    expect(chatPalette('dark')).toBe(chatPalette('dark'));
  });
});

describe('quoteAccent', () => {
  it('picks the accent for the bubble the quote is drawn inside', () => {
    const c = chatPalette('dark');
    expect(quoteAccent(c, true)).toBe(c.quoteAccentOnOutgoing);
    expect(quoteAccent(c, false)).toBe(c.quoteAccentOnIncoming);
  });
});

describe('quotePreview', () => {
  const L = {
    photo: 'Photo',
    video: 'Video',
    audio: 'Audio',
    document: 'Document',
    message: 'Message',
  };

  it('quotes the words of a text message', () => {
    expect(quotePreview('text', 'hello there', L)).toBe('hello there');
  });

  it('collapses newlines so the single clamped line is never blank', () => {
    expect(quotePreview('text', '\n\n  hello\nthere  ', L)).toBe('hello there');
  });

  it('names the kind when there are no words to quote', () => {
    expect(quotePreview('image', '', L)).toBe('Photo');
    expect(quotePreview('video', null, L)).toBe('Video');
    expect(quotePreview('doc', undefined, L)).toBe('Document');
    expect(quotePreview('text', '   ', L)).toBe('Message');
  });

  it('prefers a caption over the kind, where one exists', () => {
    expect(quotePreview('image', 'at the beach', L)).toBe('at the beach');
  });

  it('never quotes the words of a voice note — there are none to read', () => {
    expect(quotePreview('voice', 'transcript-ish', L)).toBe('Audio');
    expect(quotePreview('audio', '', L)).toBe('Audio');
  });

  it('falls back to the generic label for a type it has never heard of', () => {
    expect(quotePreview('hologram', '', L)).toBe('Message');
  });
});
