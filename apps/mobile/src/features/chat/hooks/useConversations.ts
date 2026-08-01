/**
 * Observe the chat list from the local DB (§F2, §M0). The UI reads WatermelonDB, never
 * the network — an instant, offline-first render that reacts to every DB write. A dev
 * seed fills the list once until the MP2 sync engine feeds it real conversations.
 */
import { useEffect, useState } from 'react';
import {
  observeConversations,
  seedDevConversations,
  Conversation,
} from '../../../infra';

export function useConversations(): Conversation[] {
  const [rows, setRows] = useState<Conversation[]>([]);
  useEffect(() => {
    seedDevConversations().catch(() => undefined);
    let sub: { unsubscribe: () => void } | undefined;
    try {
      // getDatabase() throws if the native module isn't in the binary yet (pre-rebuild) —
      // degrade to an empty list instead of crashing the tab.
      sub = observeConversations().subscribe(setRows);
    } catch {
      setRows([]);
    }
    return () => sub?.unsubscribe();
  }, []);
  return rows;
}
