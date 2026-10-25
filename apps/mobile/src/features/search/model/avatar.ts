/**
 * The leading avatar for a search result.
 *
 * DUPLICATION, on purpose and with an expiry: the chat list derives exactly this — a stable
 * per-name colour and an initial — inside `features/chat/ui/ChatsList.tsx`, where it is private
 * to that file. The same conversation appearing as a grey icon tile in search and a coloured
 * initial in the inbox is the thing the two lists were asked to stop doing, and reaching across
 * into another feature's UI file would be a worse answer than restating twelve lines here.
 * The real home is a design-system `Avatar`; this goes away when that lands.
 */

const AVATAR_COLORS = [
  '#7C3AED',
  '#DB2777',
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0891B2',
  '#9333EA',
];

/** Same hash as the inbox row, so one conversation keeps one colour across both lists. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#7C3AED';
}

/** The initial to draw, or '' when the name is a placeholder and there is nothing to draw. */
export function avatarInitial(name: string): string {
  const first = name.trim().charAt(0);
  return /[\p{L}\p{N}]/u.test(first) ? first.toUpperCase() : '';
}
