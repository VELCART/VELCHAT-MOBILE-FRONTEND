/**
 * Chat wallpaper resolution (§F2). Pure — the paint values are data, so the rules that matter
 * can be pinned without rendering anything.
 *
 * The contract that protects existing installs: a conversation whose `wallpaper` column is
 * empty — which is every conversation today — resolves to `plain`, the exact background the
 * app ships with. Nothing changes until someone picks.
 */
import {
  WALLPAPERS,
  resolveWallpaperId,
  wallpaperPaint,
  type WallpaperId,
} from '../wallpaper';

describe('resolveWallpaperId', () => {
  it('an unset wallpaper is plain — every existing chat keeps todays background', () => {
    expect(resolveWallpaperId(undefined)).toBe('plain');
    expect(resolveWallpaperId(null)).toBe('plain');
    expect(resolveWallpaperId('')).toBe('plain');
  });

  it('keeps a value the user actually picked', () => {
    expect(resolveWallpaperId('frosted')).toBe('frosted');
    expect(resolveWallpaperId('blush')).toBe('blush');
    expect(resolveWallpaperId('plain')).toBe('plain');
  });

  it('falls back to plain for a value it does not recognise', () => {
    // A row written by a newer build (or corrupted) must not blank the chat background.
    expect(resolveWallpaperId('neon-tiger')).toBe('plain');
  });

  it('tolerates surrounding whitespace and casing from a hand-edited row', () => {
    expect(resolveWallpaperId('  blush ')).toBe('blush');
    expect(resolveWallpaperId('Frosted')).toBe('frosted');
  });
});

describe('wallpaperPaint', () => {
  const ids: WallpaperId[] = ['plain', 'frosted', 'blush'];

  it('every wallpaper is defined for BOTH schemes', () => {
    for (const id of ids) {
      for (const scheme of ['light', 'dark'] as const) {
        const paint = wallpaperPaint(id, scheme);
        expect(typeof paint.base).toBe('string');
        expect(paint.base).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(Array.isArray(paint.blooms)).toBe(true);
      }
    }
  });

  it('plain paints a flat ground with nothing on top — the cheapest to render', () => {
    for (const scheme of ['light', 'dark'] as const) {
      const paint = wallpaperPaint(id0(), scheme);
      expect(paint.blooms).toHaveLength(0);
      expect(paint.incomingTint).toBeNull();
    }
    function id0(): WallpaperId {
      return 'plain';
    }
  });

  it('plain uses the theme background exactly, so it is indistinguishable from today', () => {
    expect(wallpaperPaint('plain', 'light').base).toBe('#FFFFFF');
    expect(wallpaperPaint('plain', 'dark').base).toBe('#0A0A0B');
  });

  // The thread's bubbles carry WhatsApp's own solid fills and are separated from whatever is
  // behind them by a shadow, the way WhatsApp separates them from its patterned wallpaper. A
  // translucent override would undo both the colour and that 3:1 boundary (VC-060), so every
  // wallpaper now decorates the GROUND and leaves the bubbles alone.
  it('a decorated wallpaper decorates the ground and never the bubble', () => {
    for (const id of ['frosted', 'blush'] as WallpaperId[]) {
      for (const scheme of ['light', 'dark'] as const) {
        const paint = wallpaperPaint(id, scheme);
        expect(paint.blooms.length).toBeGreaterThan(0);
        expect(paint.incomingTint).toBeNull();
        expect(paint.incomingBorder).toBeNull();
      }
    }
  });

  it('light and dark are tuned separately, never the same values', () => {
    for (const id of ['frosted', 'blush'] as WallpaperId[]) {
      expect(wallpaperPaint(id, 'light').base).not.toBe(
        wallpaperPaint(id, 'dark').base,
      );
    }
  });

  it('WALLPAPERS drives the picker and leads with plain', () => {
    expect(WALLPAPERS.map(w => w.id)).toEqual(['plain', 'frosted', 'blush']);
    for (const w of WALLPAPERS)
      expect(w.labelKey).toMatch(/^chat\.wallpaper\./);
  });
});
