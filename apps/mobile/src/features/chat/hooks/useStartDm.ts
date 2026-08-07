/**
 * Start a DM from the UI (§F2). A thin, stable callback over `startDm` — resolves to the
 * conversationId so the caller can `navigation.replace('Chat', …)`. The UI owns the busy /
 * error state around the returned promise (offline-first: the network call is off the render
 * path — the chat list reacts to the local upsert, not to this promise).
 */
import { useCallback } from 'react';
import { startDm } from '../api/startDm';

export function useStartDm(): (
  peerAccountId: string,
  preferredName?: string,
) => Promise<string> {
  return useCallback(
    (peerAccountId: string, preferredName?: string) =>
      startDm(peerAccountId, preferredName),
    [],
  );
}
