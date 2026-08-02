/**
 * presenceTimeLabel — the `{{time}}` token for the header's "last seen …" line. Buckets mirror the
 * chat-list time helper: today → time-of-day, yesterday → the localised label, older → short date.
 */
import { presenceTimeLabel } from '../chatModel';

const at = (y: number, mo: number, d: number, h: number, mi: number): number =>
  new Date(y, mo, d, h, mi).getTime();

describe('presenceTimeLabel', () => {
  const now = at(2026, 7, 2, 12, 0); // 2 Aug 2026, noon

  it('returns a time-of-day for a same-day timestamp', () => {
    const label = presenceTimeLabel(at(2026, 7, 2, 9, 30), now, 'Yesterday');
    expect(label).not.toBe('');
    expect(label).not.toBe('Yesterday');
    // contains the minute component regardless of 12/24h locale formatting
    expect(label).toMatch(/30/);
  });

  it('returns the supplied yesterday label for a yesterday timestamp', () => {
    expect(presenceTimeLabel(at(2026, 7, 1, 22, 0), now, 'Yesterday')).toBe(
      'Yesterday',
    );
    expect(presenceTimeLabel(at(2026, 7, 1, 22, 0), now, 'कल')).toBe('कल');
  });

  it('returns a short date for an older timestamp', () => {
    const label = presenceTimeLabel(at(2026, 6, 20, 10, 0), now, 'Yesterday');
    expect(label).not.toBe('');
    expect(label).not.toBe('Yesterday');
    expect(label).toMatch(/20/); // day number present in the short date
  });

  it('is empty for an invalid timestamp', () => {
    expect(presenceTimeLabel(NaN, now, 'Yesterday')).toBe('');
  });
});
