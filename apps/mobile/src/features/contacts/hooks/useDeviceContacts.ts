/**
 * Device-contacts picker for New Chat (§F2/§G2) — the WhatsApp model: read the phone's own
 * address book, normalize every number to E.164, and blind-match it against the VelChat
 * directory (OPRF) to split contacts into "on VelChat" (tap → DM) and "invite".
 *
 * Own state machine (§M20.3): checking → needsPermission → loading → ready, plus the terminal
 * blocked / unavailable / error branches. The async load is guarded by a monotonic sequence so
 * a fast reload/unmount never applies a stale result. No plaintext number is ever sent — the
 * OPRF pipeline blinds each one client-side (see domain/discovery).
 *
 * PRIVACY: never log a name or number — only counts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkContactsPermission,
  ensureContactsPermission,
  readDeviceContacts,
  toE164,
  regionFromE164,
  getPhone,
  getAccountId,
  type DeviceContact,
} from '../../../infra';
import { discoverContacts } from '../../../domain';

/** A contact confirmed on VelChat — tapping it starts (or resumes) the DM. */
export interface VelchatContact {
  key: string;
  accountId: string;
  name: string;
  phoneE164: string;
  thumbnailPath?: string;
}

/** A contact NOT on VelChat — offered for an invite (share sheet). */
export interface InviteContact {
  key: string;
  name: string;
  phoneE164: string;
  thumbnailPath?: string;
}

export type DeviceContactsStatus =
  | 'checking'
  | 'needsPermission'
  | 'blocked'
  | 'unavailable'
  | 'loading'
  | 'ready'
  | 'error';

export interface UseDeviceContacts {
  status: DeviceContactsStatus;
  onVelchat: VelchatContact[];
  invitable: InviteContact[];
  /** Ask for permission (prompts) then load — wired to the "Allow access" button. */
  request: () => void;
  /** Re-run discovery (permission already granted) — wired to pull-to-refresh / retry. */
  reload: () => void;
}

// Bound the OPRF cost: the blinding math is on the JS thread (worker offload is a documented
// follow-up in domain/discovery). A few thousand numbers is already generous for a phone book.
const MAX_DISCOVERY = 2000;

export function useDeviceContacts(): UseDeviceContacts {
  const [status, setStatus] = useState<DeviceContactsStatus>('checking');
  const [onVelchat, setOnVelchat] = useState<VelchatContact[]>([]);
  const [invitable, setInvitable] = useState<InviteContact[]>([]);

  // Alive flag + load sequence: ignore results from a superseded/aborted run (§M20.3).
  const aliveRef = useRef(true);
  const seqRef = useRef(0);

  const runLoad = useCallback(async (): Promise<void> => {
    const seq = ++seqRef.current;
    const settle = (fn: () => void): void => {
      if (aliveRef.current && seq === seqRef.current) fn();
    };
    settle(() => setStatus('loading'));

    // The caller's own number seeds the region (local-format contacts) and is the discovery
    // input; without it we can't normalize or match.
    const rawOwn = getPhone();
    const myPhoneE164 = rawOwn ? (toE164(rawOwn) ?? rawOwn) : undefined;
    if (!myPhoneE164) {
      settle(() => setStatus('error'));
      return;
    }
    const region = regionFromE164(myPhoneE164);
    const myAccount = getAccountId();

    let contacts: DeviceContact[];
    try {
      contacts = await readDeviceContacts();
    } catch {
      // Native module not linked into this build yet → ask the user to update.
      settle(() => setStatus('unavailable'));
      return;
    }

    // Normalize each contact's numbers to a deduped E.164 set; drop those with none valid.
    const perContact = contacts
      .map(c => ({
        c,
        e164s: [
          ...new Set(
            c.phones
              .map(p => toE164(p, region))
              .filter((x): x is string => x !== null),
          ),
        ],
      }))
      .filter(x => x.e164s.length > 0);

    // The global, deduped number set to discover (capped).
    const seen = new Set<string>();
    const numbers: string[] = [];
    for (const { e164s } of perContact) {
      for (const n of e164s) {
        if (n === myPhoneE164) continue; // never discover/invite yourself
        if (!seen.has(n)) {
          seen.add(n);
          numbers.push(n);
        }
      }
    }
    const capped = numbers.slice(0, MAX_DISCOVERY);

    let matches: Map<string, string>;
    try {
      matches = await discoverContacts(myPhoneE164, capped);
    } catch {
      settle(() => setStatus('error'));
      return;
    }

    const vel: VelchatContact[] = [];
    const inv: InviteContact[] = [];
    const usedAccounts = new Set<string>();
    for (const { c, e164s } of perContact) {
      // First of this contact's numbers that resolved to a VelChat account.
      let acc: string | undefined;
      let phone: string | undefined;
      for (const n of e164s) {
        const m = matches.get(n);
        if (m) {
          acc = m;
          phone = n;
          break;
        }
      }
      if (acc && phone) {
        if (acc === myAccount) continue; // it's me
        if (usedAccounts.has(acc)) continue; // same person saved under two entries
        usedAccounts.add(acc);
        const row: VelchatContact = {
          key: acc,
          accountId: acc,
          name: c.name,
          phoneE164: phone,
        };
        if (c.thumbnailPath) row.thumbnailPath = c.thumbnailPath;
        vel.push(row);
      } else {
        const first = e164s[0];
        if (!first || first === myPhoneE164) continue;
        const row: InviteContact = {
          key: c.recordId,
          name: c.name,
          phoneE164: first,
        };
        if (c.thumbnailPath) row.thumbnailPath = c.thumbnailPath;
        inv.push(row);
      }
    }
    vel.sort((a, b) => a.name.localeCompare(b.name));
    inv.sort((a, b) => a.name.localeCompare(b.name));

    settle(() => {
      setOnVelchat(vel);
      setInvitable(inv);
      setStatus('ready');
    });
  }, []);

  const request = useCallback((): void => {
    void (async () => {
      const access = await ensureContactsPermission();
      if (!aliveRef.current) return;
      if (access === 'granted') {
        void runLoad();
      } else if (access === 'blocked') {
        setStatus('blocked');
      } else if (access === 'unavailable') {
        setStatus('unavailable');
      } else {
        setStatus('needsPermission');
      }
    })();
  }, [runLoad]);

  const reload = useCallback((): void => {
    void runLoad();
  }, [runLoad]);

  // On mount: silently check permission (no prompt). Load if already granted, else show the
  // explainer so the OS dialog only fires on the user's tap.
  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      const access = await checkContactsPermission();
      if (!aliveRef.current) return;
      if (access === 'granted') void runLoad();
      else if (access === 'unavailable') setStatus('unavailable');
      else setStatus('needsPermission');
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [runLoad]);

  return { status, onVelchat, invitable, request, reload };
}
