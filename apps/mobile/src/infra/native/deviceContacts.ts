/**
 * Device address-book reader (§G2, §M23). A thin typed wrapper over `react-native-contacts`
 * so features never touch the third-party module directly — they get a small, stable shape
 * ({@link DeviceContact}) and a three-state permission result. Contact discovery reads this,
 * normalizes each number to E.164 ({@link toE164}), and blind-matches it against the VelChat
 * directory — the raw address book NEVER leaves the device in plaintext.
 *
 * Graceful degradation: the JS package can be installed before the native module is linked
 * into the running binary (i.e. before the next `pnpm android`). We DON'T import the native
 * module at load time — {@link readDeviceContacts} calls it lazily and surfaces a typed
 * "unavailable" so the UI can ask the user to update, instead of crashing the screen.
 *
 * PRIVACY: never log a name, number, or thumbnail — only counts.
 */
import { Platform, PermissionsAndroid } from 'react-native';

/** A minimal, UI-facing contact: only what the picker + discovery need. */
export interface DeviceContact {
  /** Stable address-book id (dedup / list key). */
  recordId: string;
  /** Best display name (display → given+family → company → first number). */
  name: string;
  /** Raw numbers as saved in the address book (normalized to E.164 by the caller). */
  phones: string[];
  /** Local file path of the contact photo, when present. */
  thumbnailPath?: string;
}

/** Outcome of asking for contacts access. `unavailable` = native module not in this build. */
export type ContactsAccess = 'granted' | 'denied' | 'blocked' | 'unavailable';

/** Lazily require the native module so an un-linked build fails at CALL time, not import. */
function loadContactsModule(): typeof import('react-native-contacts') | null {
  try {
    return require('react-native-contacts');
  } catch {
    return null;
  }
}

/**
 * Ask for contacts permission (contextually — never on launch). Android uses the runtime
 * prompt (`READ_CONTACTS`); `NEVER_ASK_AGAIN` maps to `blocked` so the UI can deep-link to
 * Settings. iOS defers to the library's `requestPermission` (backed by the Info.plist string).
 */
export async function ensureContactsPermission(): Promise<ContactsAccess> {
  if (Platform.OS === 'android') {
    try {
      const res = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      );
      if (res === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
      if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
      return 'denied';
    } catch {
      return 'unavailable';
    }
  }
  const mod = loadContactsModule();
  if (!mod) return 'unavailable';
  try {
    const res = await mod.requestPermission();
    return res === 'authorized' || res === 'limited' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/**
 * Silently check whether contacts access is already granted — no prompt. Lets the picker
 * show an "Allow access" explainer FIRST (and only prompt on the button) instead of firing
 * the OS dialog on mount. Can't distinguish `blocked` (that needs a request); returns
 * `denied` for any not-granted state.
 */
export async function checkContactsPermission(): Promise<ContactsAccess> {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
      );
      return granted ? 'granted' : 'denied';
    } catch {
      return 'unavailable';
    }
  }
  const mod = loadContactsModule();
  if (!mod) return 'unavailable';
  try {
    const res = await mod.checkPermission();
    return res === 'authorized' || res === 'limited' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** Prefer a real display name; fall back through the name parts, then company, then number. */
function pickName(c: import('react-native-contacts').Contact): string {
  if (c.displayName && c.displayName.trim()) return c.displayName.trim();
  const full = [c.givenName, c.middleName, c.familyName]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(' ')
    .trim();
  if (full) return full;
  if (c.company && c.company.trim()) return c.company.trim();
  return c.phoneNumbers[0]?.number ?? '';
}

/**
 * Read the whole address book as {@link DeviceContact}s (numbers only — no emails/addresses),
 * dropping entries with no phone number. Throws if the native module isn't linked into this
 * build (caught by the caller → `unavailable`). Requires permission to have been granted.
 */
export async function readDeviceContacts(): Promise<DeviceContact[]> {
  const mod = loadContactsModule();
  if (!mod) throw new Error('contacts-native-unavailable');
  const all = await mod.getAll();
  const out: DeviceContact[] = [];
  for (const c of all) {
    const phones = c.phoneNumbers
      .map(p => p.number)
      .filter((n): n is string => Boolean(n && n.trim()));
    if (phones.length === 0) continue;
    const dc: DeviceContact = {
      recordId: c.recordID,
      name: pickName(c),
      phones,
    };
    if (c.hasThumbnail && c.thumbnailPath) dc.thumbnailPath = c.thumbnailPath;
    out.push(dc);
  }
  return out;
}
