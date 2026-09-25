/**
 * Run async work one item at a time, without letting a failure abandon the rest.
 *
 * Both halves matter for queued notification actions (VC-031). SEQUENTIAL, because two inline
 * replies drained concurrently write their outbox rows and mark their conversations read in
 * whatever order the event loop resolves them, which throws away the ordering the pending-event
 * queue preserved. NOT fail-fast, because a reply must still be sent even if a mute that came
 * before it threw — the whole point of draining a queue at wake-up is that it empties.
 *
 * `Promise.allSettled` gives the second property but not the first: it can only wait on promises
 * that have ALREADY been started. That is precisely how this went wrong — the events were mapped
 * to thunks and then mapped again to call them, so everything was in flight before `allSettled`
 * saw it.
 */
export async function runSequentially<T>(
  items: readonly T[],
  run: (item: T) => Promise<void>,
): Promise<PromiseSettledResult<void>[]> {
  const outcomes: PromiseSettledResult<void>[] = [];
  for (const item of items) {
    try {
      await run(item);
      outcomes.push({ status: 'fulfilled', value: undefined });
    } catch (reason) {
      outcomes.push({ status: 'rejected', reason });
    }
  }
  return outcomes;
}
