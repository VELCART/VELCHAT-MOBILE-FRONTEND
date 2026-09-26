/**
 * Chat wallpapers (§F2) — pure data + resolution. No React, no I/O.
 *
 * Three grounds a chat can sit on, picked per conversation the way WhatsApp does it and stored
 * in the `conversations.wallpaper` column that has existed unused since the MP2 schema. The
 * bubbles, ticks and monochrome palette are identical on all three; only the ground changes.
 *
 * PERFORMANCE (§M0 worst-device-first, CLAUDE.md "no heavy blur stacks on the render path"):
 * the frosted look is a handful of soft radial blooms painted ONCE behind a fixed, non-scrolling
 * layer — not a live blur pass over scrolling content. On the 3 GB reference device a real
 * `BlurView` under a moving list costs a composite every frame; this costs one draw and then
 * nothing, and reads the same.
 */

export type WallpaperId = 'plain' | 'frosted' | 'blush';
export type Scheme = 'light' | 'dark';

/** One soft radial wash. Positions/radii are fractions of the surface, so it scales to any phone. */
export interface Bloom {
  /** Centre, 0–1 across the surface. */
  readonly cx: number;
  readonly cy: number;
  /** Radius, as a fraction of the surface's larger edge. */
  readonly r: number;
  readonly color: string;
  readonly opacity: number;
}

export interface WallpaperPaint {
  /** Flat fill under everything. Always an opaque hex. */
  readonly base: string;
  /** Painted over the base, in order. Empty for `plain`. */
  readonly blooms: readonly Bloom[];
  /**
   * Override for the INCOMING bubble on this ground, or `null` for the thread's own colour.
   *
   * Every wallpaper now passes `null`, and that is the point rather than an oversight. The
   * translucent tints these used to carry were an answer to a bubble that had no colour of its
   * own: an opaque `bgSubtle` rectangle sat on a decorated wash like a sticker, so the bubble
   * was made see-through instead. The thread's bubbles are now WhatsApp's — solid white or
   * solid #1F2C33, separated from whatever is behind them by a shadow, exactly as WhatsApp
   * does it on its own patterned wallpaper. A translucent bubble on top of that would undo
   * both the colour and the 3:1 boundary the shadow buys (VC-060).
   *
   * The field stays because a future wallpaper may genuinely need it — a photo background, say,
   * where even a shadow is not enough separation.
   */
  readonly incomingTint: string | null;
  readonly incomingBorder: string | null;
}

/** The picker's contents and order. `plain` leads because it is the default and the fastest. */
export const WALLPAPERS: readonly {
  readonly id: WallpaperId;
  readonly labelKey: string;
}[] = [
  { id: 'plain', labelKey: 'chat.wallpaper.plain' },
  { id: 'frosted', labelKey: 'chat.wallpaper.frosted' },
  { id: 'blush', labelKey: 'chat.wallpaper.blush' },
];

const IDS: readonly WallpaperId[] = ['plain', 'frosted', 'blush'];

/**
 * What a stored column value means. Anything unrecognised — an empty column (every chat that
 * exists today), a row from a newer build, a corrupted value — resolves to `plain`, so the
 * worst case is the background the app already ships rather than a blank screen.
 */
export function resolveWallpaperId(
  stored: string | null | undefined,
): WallpaperId {
  const key = stored?.trim().toLowerCase();
  if (!key) return 'plain';
  return (IDS as readonly string[]).includes(key)
    ? (key as WallpaperId)
    : 'plain';
}

const PAINT: Record<WallpaperId, Record<Scheme, WallpaperPaint>> = {
  // Exactly the theme's own background — indistinguishable from the app before wallpapers.
  plain: {
    light: {
      base: '#FFFFFF',
      blooms: [],
      incomingTint: null,
      incomingBorder: null,
    },
    dark: {
      base: '#0A0A0B',
      blooms: [],
      incomingTint: null,
      incomingBorder: null,
    },
  },
  // Cool, desaturated washes. Kept low-opacity so message text keeps its full contrast.
  frosted: {
    light: {
      base: '#FBFBFC',
      blooms: [
        { cx: 0.14, cy: 0.08, r: 0.62, color: '#788CBE', opacity: 0.16 },
        { cx: 0.88, cy: 0.26, r: 0.56, color: '#C496BE', opacity: 0.15 },
        { cx: 0.62, cy: 0.96, r: 0.64, color: '#82AFB9', opacity: 0.15 },
      ],
      incomingTint: null,
      incomingBorder: null,
    },
    dark: {
      base: '#0A0A0B',
      blooms: [
        { cx: 0.14, cy: 0.08, r: 0.62, color: '#6E87C8', opacity: 0.2 },
        { cx: 0.88, cy: 0.26, r: 0.56, color: '#AA78AF', opacity: 0.17 },
        { cx: 0.62, cy: 0.96, r: 0.64, color: '#5A96A5', opacity: 0.15 },
      ],
      incomingTint: null,
      incomingBorder: null,
    },
  },
  // Pink at the top fading out downward, so the composer end of the screen stays calm.
  blush: {
    light: {
      base: '#FFFFFF',
      blooms: [
        { cx: 0.5, cy: 0.0, r: 0.95, color: '#FF6FB5', opacity: 0.14 },
        { cx: 0.5, cy: 0.34, r: 0.8, color: '#FFC2D8', opacity: 0.1 },
      ],
      incomingTint: null,
      incomingBorder: null,
    },
    dark: {
      base: '#0A0A0B',
      blooms: [
        { cx: 0.5, cy: 0.0, r: 0.95, color: '#E85CA0', opacity: 0.16 },
        { cx: 0.5, cy: 0.34, r: 0.8, color: '#7A3E63', opacity: 0.12 },
      ],
      incomingTint: null,
      incomingBorder: null,
    },
  },
};

export function wallpaperPaint(
  id: WallpaperId,
  scheme: Scheme,
): WallpaperPaint {
  return PAINT[id][scheme];
}
