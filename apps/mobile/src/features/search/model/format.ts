/**
 * Compact WhatsApp-style timestamp for a search result: HH:MM if today, "Yesterday" for
 * yesterday, else a short "5 Aug"-style date. Mirrors the chat-list row label so search and
 * the inbox read consistently. Returns '' for a missing/invalid timestamp.
 */
export function timeLabel(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
