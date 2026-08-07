/**
 * Device-contacts picker for New Chat (§F2/§G2) — the WhatsApp model: read the phone's own
 * address book, normalize every number to E.164, and blind-match it against the VelChat
 * directory (OPRF) to split contacts into "on VelChat" (tap → DM) and "invite".
 *
 * Instant, always-ready (like WhatsApp): the last result is cached in-memory AND persisted to
 * MMKV per account, so re-opening New Chat — or reopening the app — shows contacts immediately
 * with no spinner. {@link prewarmContacts} warms it in the background at app launch. A stale
 * cache refreshes silently and never downgrades a good matched list. The OPRF `evaluate` step
 * is rate-limited (§G2), so the freshness gate also keeps restarts from re-hitting it.
 *
 * Own state machine (§M20.3): checking → needsPermission → loading → ready, plus blocked /
 * unavailable. The async load is guarded by a monotonic sequence. No plaintext number is ever
 * sent — the OPRF pipeline blinds each one client-side.
 *
 * PRIVACY: never log a name or number — only counts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkContactsPermission,
  ensureContactsPermission,
  readDeviceContacts,
  toE164,
  regionFromE164,
  getPhone,
  getAccountId,
  kv,
  KVKeys,
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
  | 'ready';

export interface UseDeviceContacts {
  status: DeviceContactsStatus;
  onVelchat: VelchatContact[];
  invitable: InviteContact[];
  /** True when we read the address book but couldn't check VelChat membership (backend down
   * or no own number). The contacts still show — the UI resolves each one on tap instead. */
  discoveryFailed: boolean;
  /** The signed-in account id (for the "Message yourself" self-chat row), or undefined. */
  self: string | undefined;
  /** Ask for permission (prompts) then load — wired to the "Allow access" button. */
  request: () => void;
  /** Re-run discovery (permission already granted) — wired to pull-to-refresh / retry. */
  reload: () => void;
}

// Bound the OPRF cost: the blinding math is on the JS thread (worker offload is a documented
// follow-up in domain/discovery). A few thousand numbers is already generous for a phone book.
const MAX_DISCOVERY = 2000;
const CACHE_TTL_MS = 5 * 60_000;

interface Snapshot {
  accountId: string | undefined;
  onVelchat: VelchatContact[];
  invitable: InviteContact[];
  discoveryFailed: boolean;
  at: number;
}

// In-memory (session) + MMKV (across restarts) cache, keyed by account so switching users never
// shows the previous account's contacts.
let memSnapshot: Snapshot | null = null;

function persist(s: Snapshot): void {
  memSnapshot = s;
  try {
    kv.set(KVKeys.contactsSnapshot, JSON.stringify(s));
  } catch {
    // best-effort cache; a serialization failure just means the next open re-discovers.
  }
}

function readCache(accountId: string | undefined): Snapshot | null {
  if (memSnapshot && memSnapshot.accountId === accountId) return memSnapshot;
  try {
    const raw = kv.getString(KVKeys.contactsSnapshot);
    if (!raw) return null;
    const s = JSON.parse(raw) as Snapshot;
    if (s.accountId !== accountId || !Array.isArray(s.onVelchat)) return null;
    memSnapshot = s;
    return s;
  } catch {
    return null;
  }
}

/**
 * The core load (permission assumed granted): read the address book, normalize, best-effort
 * discover, and build the two lists. Returns a snapshot, or null if the native module isn't in
 * this build yet. Shared by the hook and {@link prewarmContacts}.
 */
async function computeContacts(): Promise<Snapshot | null> {
  const rawOwn = getPhone();
  const myPhoneE164 = rawOwn ? (toE164(rawOwn) ?? rawOwn) : undefined;
  const region = regionFromE164(myPhoneE164);
  const myAccount = getAccountId();

  let contacts: DeviceContact[];
  try {
    contacts = await readDeviceContacts();
  } catch {
    return null; // native module not linked yet
  }

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

  let matches = new Map<string, string>();
  let failed = false;
  if (myPhoneE164) {
    const seen = new Set<string>();
    const numbers: string[] = [];
    for (const { e164s } of perContact) {
      for (const n of e164s) {
        if (n === myPhoneE164) continue;
        if (!seen.has(n)) {
          seen.add(n);
          numbers.push(n);
        }
      }
    }
    try {
      matches = await discoverContacts(
        myPhoneE164,
        numbers.slice(0, MAX_DISCOVERY),
      );
    } catch {
      failed = true;
    }
  } else {
    failed = true;
  }

  const vel: VelchatContact[] = [];
  const inv: InviteContact[] = [];
  const usedAccounts = new Set<string>();
  const usedInvitePhones = new Set<string>();
  for (const { c, e164s } of perContact) {
    let acc: string | undefined;
    let phone: string | undefined;
    if (!failed) {
      for (const n of e164s) {
        const m = matches.get(n);
        if (m) {
          acc = m;
          phone = n;
          break;
        }
      }
    }
    if (acc && phone) {
      if (acc === myAccount) continue; // it's me
      if (usedAccounts.has(acc)) continue; // same person saved twice
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
      if (usedInvitePhones.has(first)) continue; // same number saved under two names
      usedInvitePhones.add(first);
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
  return {
    accountId: myAccount,
    onVelchat: vel,
    invitable: inv,
    discoveryFailed: failed,
    at: Date.now(),
  };
}

/**
 * Warm the contacts cache at app launch (background, best-effort) so New Chat is instant. No-op
 * unless contacts permission is already granted and the cache is stale — never prompts, never
 * throws, never re-hits the rate-limited discovery within the TTL.
 */
export async function prewarmContacts(): Promise<void> {
  try {
    if ((await checkContactsPermission()) !== 'granted') return;
    const cached = readCache(getAccountId());
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return;
    const snap = await computeContacts();
    if (snap && (!snap.discoveryFailed || !cached || cached.discoveryFailed)) {
      persist(snap);
    }
  } catch {
    // best-effort warmup
  }
}

export function useDeviceContacts(): UseDeviceContacts {
  const [status, setStatus] = useState<DeviceContactsStatus>('checking');
  const [onVelchat, setOnVelchat] = useState<VelchatContact[]>([]);
  const [invitable, setInvitable] = useState<InviteContact[]>([]);
  const [discoveryFailed, setDiscoveryFailed] = useState(false);
  const self = useMemo(() => getAccountId(), []);

  const aliveRef = useRef(true);
  const seqRef = useRef(0);

  const apply = useCallback((s: Snapshot): void => {
    setOnVelchat(s.onVelchat);
    setInvitable(s.invitable);
    setDiscoveryFailed(s.discoveryFailed);
    setStatus('ready');
  }, []);

  // `silent` = a background refresh over a shown cache: don't flip to the spinner, and never
  // downgrade a good (matched) list to a degraded one on a transient backend blip.
  const runLoad = useCallback(
    async (silent: boolean): Promise<void> => {
      const seq = ++seqRef.current;
      const settle = (fn: () => void): void => {
        if (aliveRef.current && seq === seqRef.current) fn();
      };
      if (!silent) settle(() => setStatus('loading'));
      const snap = await computeContacts();
      if (!snap) {
        if (!silent) settle(() => setStatus('unavailable'));
        return;
      }
      settle(() => {
        if (
          silent &&
          snap.discoveryFailed &&
          memSnapshot &&
          !memSnapshot.discoveryFailed
        ) {
          return;
        }
        apply(snap);
        persist(snap);
      });
    },
    [apply],
  );

  const request = useCallback((): void => {
    void (async () => {
      const access = await ensureContactsPermission();
      if (!aliveRef.current) return;
      if (access === 'granted') void runLoad(false);
      else if (access === 'blocked') setStatus('blocked');
      else if (access === 'unavailable') setStatus('unavailable');
      else setStatus('needsPermission');
    })();
  }, [runLoad]);

  const reload = useCallback((): void => {
    void runLoad(false);
  }, [runLoad]);

  useEffect(() => {
    aliveRef.current = true;

    // Instant: a cached result (memory or MMKV, this account) shows immediately — no spinner.
    // Refresh silently if stale.
    const cached = readCache(getAccountId());
    if (cached) {
      apply(cached);
      if (Date.now() - cached.at > CACHE_TTL_MS) void runLoad(true);
      return () => {
        aliveRef.current = false;
      };
    }

    // First ever open: silently check permission (no prompt). Load if granted, else explain.
    void (async () => {
      const access = await checkContactsPermission();
      if (!aliveRef.current) return;
      if (access === 'granted') void runLoad(false);
      else if (access === 'unavailable') setStatus('unavailable');
      else setStatus('needsPermission');
    })();
    return () => {
      aliveRef.current = false;
    };
  }, [apply, runLoad]);

  return {
    status,
    onVelchat,
    invitable,
    discoveryFailed,
    self,
    request,
    reload,
  };
}
