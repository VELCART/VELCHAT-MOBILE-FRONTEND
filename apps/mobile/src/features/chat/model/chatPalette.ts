/**
 * Message-bubble palette (§F2).
 *
 * The THREAD's shape is WhatsApp's — the tail, the timestamp sitting on the last line of text,
 * the quote panel, the run spacing. Its COLOUR is this app's: near-monochrome, black on white
 * and white on black (§M16, docs/design-direction.md). A first cut used WhatsApp's greens and
 * the owner asked for the app's own palette back, to be customised later; the geometry is what
 * was wanted from WhatsApp, not the brand.
 *
 * The values live HERE rather than in the token set because a thread needs pairs the chrome has
 * no use for — a fill for a quote inside a dark bubble AND one inside a light one, a timestamp
 * that has to stay legible on both — and deriving them at the call site is how a bubble ends up
 * with a timestamp nobody can read. Every pair below is pinned by a contrast test.
 *
 * Pure data + a pure resolver: no React, no RN imports, trivially testable.
 */

export type Scheme = 'light' | 'dark';

export interface ChatPalette {
  /** Bubble fills. */
  readonly outgoingBg: string;
  readonly incomingBg: string;
  /** Message body. */
  readonly outgoingText: string;
  readonly incomingText: string;
  /** Timestamp beside the ticks. */
  readonly outgoingMeta: string;
  readonly incomingMeta: string;
  /**
   * The read tick, and only that one. Every other tick state rides `outgoingMeta` — the ticks
   * sit against the timestamp and have to weigh the same as it, which is exactly what WhatsApp
   * does. `read` is the one state that earns its own colour.
   */
  readonly tickRead: string;
  /** Quoted-reply block, one fill per host bubble. */
  readonly quoteInOutgoingBg: string;
  readonly quoteInIncomingBg: string;
  /** The quoted body text (always a step below the host bubble's own text). */
  readonly quoteTextOnOutgoing: string;
  readonly quoteTextOnIncoming: string;
  /**
   * The quote's left bar and its author line. Keyed on the HOST bubble, not on who is quoted:
   * without colour to spend, who is being answered is carried by the name itself ("You" or
   * theirs), and the bar's job is to be legible against whatever it sits on.
   */
  readonly quoteAccentOnOutgoing: string;
  readonly quoteAccentOnIncoming: string;
  /** Typing: the dots in the thread and the header's "typing…" line. */
  readonly typing: string;
  /**
   * The composer bar and the input inside it. They are separate from the app's `bgSubtle` on
   * `bgBase` for a reason: those two are 1.04:1 apart in light and 1.06:1 in dark, so the
   * input field had no boundary at all (WCAG 1.4.11 wants 3:1 for one) and the bar's edge
   * against the wallpaper read as the wallpaper simply stopping, in a straight line, mid-screen.
   */
  readonly barBg: string;
  readonly inputBg: string;
  readonly inputText: string;
  readonly inputPlaceholder: string;
  /**
   * The input's own edge. WhatsApp's white-on-#F0F2F5 field is 1.12:1 against its bar, which
   * is not a boundary — the field is identified by its icons, its placeholder and its position.
   * This hairline is what makes it identifiable as a SHAPE as well, without turning a soft bar
   * into a boxed form control.
   */
  readonly inputBorder: string;
  /**
   * The incoming bubble's edge.
   *
   * A hairline, NOT a drop shadow. Shadows were tried and reverted: `elevation` on every row of
   * a list is a separate render pass per cell, and with ~20 bubbles on screen the scroll went
   * from smooth to visibly hitchy on the reference device (§M0 worst-device-first). A 1px
   * border costs nothing and does the same job — telling the bubble apart from the wallpaper
   * behind it, which `hairline` at 1.18:1 did not (VC-060).
   */
  readonly bubbleBorder: string;
}

/**
 * WhatsApp's light thread. `incomingBg` is pure white and `outgoingBg` the pale green; both are
 * separated from the wallpaper by the shadow below rather than by a border, which is how
 * WhatsApp does it and what keeps a white bubble visible on a white `plain` wallpaper.
 */
const LIGHT: ChatPalette = {
  outgoingBg: '#0B0B0C',
  incomingBg: '#F7F7F8',
  outgoingText: '#FFFFFF',
  incomingText: '#0B0B0C',
  outgoingMeta: '#B8B8BE',
  incomingMeta: '#6C6C72',
  tickRead: '#0A84FF',
  quoteInOutgoingBg: '#26262A',
  quoteInIncomingBg: '#E9E9EC',
  quoteTextOnOutgoing: '#B8B8BE',
  // A shade darker than `incomingMeta`: the quote panel is itself a step darker than the
  // bubble, so the same grey that clears AA on the bubble does not clear it on the panel.
  quoteTextOnIncoming: '#65656B',
  quoteAccentOnOutgoing: '#FFFFFF',
  quoteAccentOnIncoming: '#0B0B0C',
  // The one colour in the thread, and the owner asked for it by name: typing has to read as
  // live from the corner of the eye without being read.
  typing: '#008069',
  barBg: '#F2F2F4',
  inputBg: '#FFFFFF',
  inputText: '#0B0B0C',
  inputPlaceholder: '#6C6C72',
  inputBorder: 'rgba(11,11,12,0.12)',
  bubbleBorder: 'rgba(11,11,12,0.13)',
};

const DARK: ChatPalette = {
  outgoingBg: '#F5F5F7',
  incomingBg: '#1C1C1F',
  outgoingText: '#0B0B0C',
  incomingText: '#F5F5F7',
  outgoingMeta: '#5A5A60',
  incomingMeta: '#9A9AA1',
  tickRead: '#0A84FF',
  quoteInOutgoingBg: '#E2E2E6',
  quoteInIncomingBg: '#2A2A2E',
  quoteTextOnOutgoing: '#5A5A60',
  quoteTextOnIncoming: '#9A9AA1',
  quoteAccentOnOutgoing: '#0B0B0C',
  quoteAccentOnIncoming: '#F5F5F7',
  typing: '#00A884',
  barBg: '#0F0F11',
  inputBg: '#1C1C1F',
  inputText: '#F5F5F7',
  inputPlaceholder: '#9A9AA1',
  inputBorder: 'rgba(245,245,247,0.12)',
  bubbleBorder: 'rgba(245,245,247,0.14)',
};

export function chatPalette(scheme: Scheme): ChatPalette {
  return scheme === 'dark' ? DARK : LIGHT;
}

/** The bar-and-author colour for a quote drawn inside `hostIsMine`'s bubble. */
export function quoteAccent(palette: ChatPalette, hostIsMine: boolean): string {
  return hostIsMine
    ? palette.quoteAccentOnOutgoing
    : palette.quoteAccentOnIncoming;
}

/**
 * The one-line preview a quote shows for a message. Text messages quote their own words;
 * everything else quotes what it IS, because a quoted photo has no words to show and an empty
 * grey line reads as a rendering failure.
 *
 * Newlines collapse to spaces: the quote is a single clamped line, and a leading blank line
 * would otherwise render the preview as empty whitespace.
 */
export function quotePreview(
  type: string,
  contentPlain: string | null | undefined,
  labels: {
    readonly photo: string;
    readonly video: string;
    readonly audio: string;
    readonly document: string;
    readonly message: string;
  },
): string {
  const body = (contentPlain ?? '').replace(/\s+/g, ' ').trim();
  if (type === 'image') return body || labels.photo;
  if (type === 'video') return body || labels.video;
  if (type === 'audio' || type === 'voice') return labels.audio;
  if (type === 'doc' || type === 'file') return body || labels.document;
  return body || labels.message;
}
