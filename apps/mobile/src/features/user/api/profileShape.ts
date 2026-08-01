/**
 * Directory profile shape + read normaliser (§B3). Pure — no infra imports — so it is
 * trivially unit-testable and the single place the backend read shape is interpreted.
 *
 * The user-service returns profile READS as raw DB rows (snake_case: `display_name`,
 * `avatar_media_id`, …); the global response envelope does NOT camelCase them, while
 * WRITES take a camelCase DTO. Normalise reads to camelCase so name + avatar actually
 * resolve instead of silently being `undefined`.
 */

/** Directory profile (matches user-service UpdateProfileDto for writes). Email is NOT
 * here — it is a separately-verified identifier (auth-service), added via magic-link. */
export interface Profile {
  displayName?: string;
  about?: string;
  avatarMediaId?: string;
  presencePrivacy?: 'everyone' | 'contacts' | 'nobody';
  lastseenPrivacy?: 'everyone' | 'contacts' | 'nobody';
  readreceiptsEnabled?: boolean;
}

/** Map a raw profile row (either casing) to our camelCase `Profile`. Only defined,
 * non-null fields are set (respects `exactOptionalPropertyTypes`). */
export function normalizeProfile(raw: unknown): Profile {
  const d = (raw ?? {}) as Record<string, unknown>;
  const pick = <T>(snake: string, camel: string): T | undefined => {
    const v = d[snake] ?? d[camel];
    return v == null ? undefined : (v as T);
  };
  const out: Profile = {};
  const displayName = pick<string>('display_name', 'displayName');
  if (displayName !== undefined) out.displayName = displayName;
  const about = pick<string>('about', 'about');
  if (about !== undefined) out.about = about;
  const avatarMediaId = pick<string>('avatar_media_id', 'avatarMediaId');
  if (avatarMediaId !== undefined) out.avatarMediaId = avatarMediaId;
  const presencePrivacy = pick<Profile['presencePrivacy']>(
    'presence_privacy',
    'presencePrivacy',
  );
  if (presencePrivacy !== undefined) out.presencePrivacy = presencePrivacy;
  const lastseenPrivacy = pick<Profile['lastseenPrivacy']>(
    'lastseen_privacy',
    'lastseenPrivacy',
  );
  if (lastseenPrivacy !== undefined) out.lastseenPrivacy = lastseenPrivacy;
  const readreceiptsEnabled = pick<boolean>(
    'readreceipts_enabled',
    'readreceiptsEnabled',
  );
  if (readreceiptsEnabled !== undefined) {
    out.readreceiptsEnabled = readreceiptsEnabled;
  }
  return out;
}
