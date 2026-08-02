/**
 * Load the signed-in user's contacts for the new-chat picker (§F2/§B3). Own state machine:
 * `loading → (contacts | error)`, with a `reload`. Blocked contacts are filtered out (you
 * don't start a DM with someone you blocked). The async fetch is owned by an `active` flag so
 * a fast unmount (e.g. navigating away) never sets state on a dead component (§M20.3).
 */
import { useCallback, useEffect, useState } from 'react';
import { getAccountId, isAppError } from '../../../infra';
import { getContacts, type Contact } from '../api/contactsApi';

export function useContacts(): {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    const userId = getAccountId();
    if (!userId) {
      setContacts([]);
      setError(null);
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    setError(null);
    getContacts(userId)
      .then(list => {
        if (active) setContacts(list.filter(c => !c.blocked));
      })
      .catch((e: unknown) => {
        if (active) {
          setError(isAppError(e) ? e.message : 'Could not load your contacts.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [nonce]);

  return { contacts, loading, error, reload };
}
