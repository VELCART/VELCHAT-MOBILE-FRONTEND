/**
 * Grouping + date logic for the chat list. The list is NEWEST-FIRST, so the OLDER neighbour
 * of index i sits at i+1 — these tests pin that reversed-boundary behaviour so a run/day
 * separator never lands on the wrong bubble.
 */
import {
  dayCategory,
  isSameDay,
  startsNewDay,
  startsNewRun,
  type GroupableMsg,
} from '../chatModel';

// August is month index 7.
const A = (h: number, m: number): number =>
  new Date(2026, 7, 1, h, m).getTime(); // day A
const B = (h: number, m: number): number =>
  new Date(2026, 7, 2, h, m).getTime(); // day B

// Newest-first (index 0 = newest), mirroring `observeMessages`.
const messages: readonly GroupableMsg[] = [
  { createdAt: B(10, 2), senderId: 'me' }, // 0 newest
  { createdAt: B(10, 1), senderId: 'me' }, // 1
  { createdAt: B(10, 0), senderId: 'peer' }, // 2 oldest of day B
  { createdAt: A(10, 0), senderId: 'peer' }, // 3 oldest overall
];

describe('isSameDay', () => {
  it('is true within a calendar day and false across days', () => {
    expect(isSameDay(B(0, 1), B(23, 59))).toBe(true);
    expect(isSameDay(A(23, 59), B(0, 1))).toBe(false);
  });
});

describe('startsNewDay (reversed list — older neighbour at i+1)', () => {
  it('flags only the oldest message of each day', () => {
    expect(startsNewDay(messages, 0)).toBe(false);
    expect(startsNewDay(messages, 1)).toBe(false);
    expect(startsNewDay(messages, 2)).toBe(true); // oldest of day B
    expect(startsNewDay(messages, 3)).toBe(true); // oldest overall
  });

  it('is false for an out-of-range index', () => {
    expect(startsNewDay(messages, 99)).toBe(false);
  });
});

describe('startsNewRun (top bubble of a same-sender group gets the tail)', () => {
  it('breaks on sender change and on day change', () => {
    expect(startsNewRun(messages, 0)).toBe(false); // same sender as older
    expect(startsNewRun(messages, 1)).toBe(true); // older is a different sender
    expect(startsNewRun(messages, 2)).toBe(true); // day change
    expect(startsNewRun(messages, 3)).toBe(true); // oldest overall
  });

  it('is false for an out-of-range index', () => {
    expect(startsNewRun(messages, 99)).toBe(false);
  });
});

describe('dayCategory', () => {
  const now = new Date(2026, 7, 2, 12, 0).getTime();
  it('classifies today / yesterday / other', () => {
    expect(dayCategory(B(10, 0), now)).toBe('today');
    expect(dayCategory(A(10, 0), now)).toBe('yesterday');
    expect(dayCategory(new Date(2026, 6, 30, 10, 0).getTime(), now)).toBe(
      'other',
    );
  });
});
