/**
 * QA regression guard — queued notification actions run ONE AT A TIME (VC-031).
 *
 * The drain claimed to be sequential in its own comment but was not: mapping the events to
 * thunks and then immediately mapping again to CALL them started every handler before
 * `allSettled` ever waited. Two inline replies then wrote their outbox rows and ran
 * `markConversationRead` concurrently inside one 30s wake window, which is exactly the ordering
 * `collapsePendingEvents` works to preserve — so replies typed into a notification could arrive
 * out of order.
 */
import { runSequentially } from '../runSequentially';

describe('VC-031 — draining queued notification actions', () => {
  it('the exact defect: never starts one action before the previous has finished', async () => {
    let active = 0;
    let maxActive = 0;
    const finished: number[] = [];

    await runSequentially([1, 2, 3], async n => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      // Yield, so an eager implementation would interleave here.
      await new Promise(r => setTimeout(r, 5));
      finished.push(n);
      active -= 1;
    });

    expect(maxActive).toBe(1);
    expect(finished).toEqual([1, 2, 3]);
  });

  it('one failing action does not abandon the rest — a reply still goes out after a failed mute', async () => {
    const ran: string[] = [];

    const results = await runSequentially(['mute', 'reply'], async item => {
      ran.push(item);
      if (item === 'mute') throw new Error('mute failed');
    });

    expect(ran).toEqual(['mute', 'reply']);
    expect(results[0]?.status).toBe('rejected');
    expect(results[1]?.status).toBe('fulfilled');
  });

  it('reports outcomes positionally, so a failure can be logged against its own event', async () => {
    const results = await runSequentially(['a', 'b', 'c'], async item => {
      if (item === 'b') throw new Error('boom');
    });

    expect(results.map(r => r.status)).toEqual([
      'fulfilled',
      'rejected',
      'fulfilled',
    ]);
  });

  it('is a no-op for an empty queue', async () => {
    expect(await runSequentially([], async () => undefined)).toEqual([]);
  });
});
