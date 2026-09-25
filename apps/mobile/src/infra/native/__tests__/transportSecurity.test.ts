/**
 * What the Android network security config actually promises, and what it quietly does not
 * (VC-018).
 *
 * Certificate pinning is the one security control where the failure mode runs BOTH ways and only
 * one of them is recoverable. Ship no pin and a rogue system CA reads every token, OTP and phone
 * number on the wire. Ship the WRONG pin and every install that has it is permanently unable to
 * reach the backend — no server change can rescue it, because the client refuses the connection
 * before a single byte of ours is sent. So the config is checked by a test rather than by
 * eyeballing XML.
 *
 * The invariants below are the ones that are true whether or not pins have been supplied yet:
 *
 * - every host any flavor can talk to has a `<domain-config>` — a host that is missing from the
 *   config is silently UNPINNED even after pins land, which is the quiet hole;
 * - none of them carries a `<pin-set>` yet, because an empty one is a FATAL Android lint error
 *   in a release build and identical to an absent one at runtime, rather than
 *   absent and forgotten;
 * - a pinned domain never has exactly ONE pin (a single pin plus a certificate rotation is
 *   exactly how an app bricks itself) and never has pins without an `expiration` (the
 *   platform's fail-open valve, which is the last thing standing between a stale pin and a dead
 *   install);
 * - no backend host is reachable over cleartext.
 *
 * The test reads the REAL `.env.*` files and the REAL XML, because a mirror of either in
 * TypeScript would be a second source of truth that drifts — and the drift would be invisible
 * until a rotation day.
 */

// `@types/node` is not a dependency of this workspace (pnpm keeps apps/mobile's node_modules to
// its declared deps, and tsconfig pins `types: ["jest"]`). Adding it just to read two files in a
// test would be a dependency change for a §M1 locked stack. Both symbols exist at runtime under
// the React Native Jest preset's node environment; declaring the two members used here is the
// whole of the bridge, and it stays test-only.
declare function require(id: string): {
  readFileSync(path: string, encoding: 'utf8'): string;
};
declare const __dirname: string;

import {
  endpointHost,
  transportSecurityGap,
  type DomainPinPolicy,
} from '../transportSecurity';

const { readFileSync } = require('fs');

/** apps/mobile, from `src/infra/native/__tests__`. */
const MOBILE_ROOT = `${__dirname}/../../../..`;
const NETWORK_SECURITY_CONFIG = `${MOBILE_ROOT}/android/app/src/main/res/xml/network_security_config.xml`;

/**
 * Every origin a shipped binary can be built to talk to. Read from the flavor env files rather
 * than from `appEnv`, because `appEnv` only ever resolves ONE flavor and the config has to cover
 * all three — a prod APK with a dev-only config is precisely the accident §M1's build-flavor
 * guard already had to be written for.
 */
function endpointsFromEnvFiles(): string[] {
  return ['.env.dev', '.env.stage', '.env.prod'].flatMap(file => {
    const contents = readFileSync(`${MOBILE_ROOT}/${file}`, 'utf8');
    return [...contents.matchAll(/^(?:API_BASE_URL|WS_URL)=(.+)$/gm)].map(m =>
      (m[1] ?? '').trim(),
    );
  });
}

/**
 * Pull the policy out of the shipped XML. A hand-rolled parse rather than a real XML parser for
 * the same reason as the `require` bridge above — and it is honest here, because the assertions
 * only care about four things and a config whose shape defeats these patterns is a config no
 * reviewer could read either.
 */
function policiesFromNetworkSecurityConfig(): DomainPinPolicy[] {
  const xml = readFileSync(NETWORK_SECURITY_CONFIG, 'utf8').replace(
    // Commented-out example blocks are documentation, not policy — the platform ignores them
    // and so must this.
    /<!--[\s\S]*?-->/g,
    '',
  );
  const blocks = xml.match(/<domain-config[\s\S]*?<\/domain-config>/g) ?? [];
  return blocks.flatMap(block => {
    const pinSet =
      /<pin-set([^>]*)>([\s\S]*?)<\/pin-set>|<pin-set([^>]*)\/>/.exec(block);
    const pinSetAttrs = pinSet?.[1] ?? pinSet?.[3] ?? '';
    const pinCount = pinSet
      ? ((pinSet[2] ?? '').match(/<pin\b/g)?.length ?? 0)
      : undefined;
    const expires = /expiration="([^"]+)"/.exec(pinSetAttrs)?.[1];
    const cleartext = /cleartextTrafficPermitted="true"/.test(
      /<domain-config([^>]*)>/.exec(block)?.[1] ?? '',
    );
    return [...block.matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map(m => ({
      domain: (m[1] ?? '').trim().toLowerCase(),
      pinCount,
      expires,
      cleartextPermitted: cleartext,
    }));
  });
}

describe('endpointHost', () => {
  it('reduces every shape the env files use to a bare host', () => {
    expect(endpointHost('https://velchat.duckdns.org')).toBe(
      'velchat.duckdns.org',
    );
    // A websocket URL carries a path, and the config keys on the host alone.
    expect(endpointHost('wss://velchat-realtime.onrender.com/ws')).toBe(
      'velchat-realtime.onrender.com',
    );
    // The local backend the dev loop uses arrives with a port.
    expect(endpointHost('http://10.0.2.2:8080')).toBe('10.0.2.2');
    // Hosts are case-insensitive; the config is not, so normalise before comparing.
    expect(endpointHost('HTTPS://VelChat.DuckDNS.org/api')).toBe(
      'velchat.duckdns.org',
    );
  });

  it('refuses to invent a host out of something that is not a URL', () => {
    // Guessing here would be worse than failing: a bad guess produces a domain-config for a host
    // that does not exist, and the REAL host then sails through unpinned.
    expect(endpointHost('')).toBeUndefined();
    expect(endpointHost('velchat.duckdns.org')).toBeUndefined();
    expect(endpointHost('https://')).toBeUndefined();
  });
});

describe('transportSecurityGap', () => {
  const policy = (over: Partial<DomainPinPolicy>): DomainPinPolicy => ({
    domain: 'api.example.com',
    pinCount: 0,
    expires: '2027-01-01',
    cleartextPermitted: false,
    ...over,
  });

  it('flags a host with no domain-config at all', () => {
    // The quiet hole: pins can be perfect for every other host and this one is still plain TLS.
    const gap = transportSecurityGap(['https://new.example.com'], [policy({})]);
    expect(gap.unconfigured).toEqual(['new.example.com']);
  });

  it('separates "no pin-set declared" from "pin-set declared and empty"', () => {
    // Absent means nobody wired the host; empty means someone deliberately left the slot open
    // until a real pin is available. Collapsing the two would hide the first behind the second.
    const absent = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ pinCount: undefined })],
    );
    expect(absent.withoutPinSet).toEqual(['api.example.com']);
    expect(absent.idle).toEqual([]);

    const empty = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ pinCount: 0 })],
    );
    expect(empty.withoutPinSet).toEqual([]);
    expect(empty.idle).toEqual(['api.example.com']);
  });

  it('flags a lone pin, because the rotation that follows it bricks the install', () => {
    const gap = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ pinCount: 1 })],
    );
    expect(gap.withoutBackupPin).toEqual(['api.example.com']);

    const backed = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ pinCount: 2 })],
    );
    expect(backed.withoutBackupPin).toEqual([]);
  });

  it('flags pins with no expiry, which is the only fail-open valve there is', () => {
    const gap = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ pinCount: 2, expires: undefined })],
    );
    expect(gap.withoutExpiry).toEqual(['api.example.com']);
    // An EMPTY pin-set with no expiry is not a finding — nothing is being enforced to expire.
    expect(
      transportSecurityGap(
        ['https://api.example.com'],
        [policy({ pinCount: 0, expires: undefined })],
      ).withoutExpiry,
    ).toEqual([]);
  });

  it('flags a backend host that is allowed to be reached over http', () => {
    const gap = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ cleartextPermitted: true })],
    );
    expect(gap.cleartext).toEqual(['api.example.com']);
  });

  it('matches hosts exactly rather than by suffix', () => {
    // `includeSubdomains` would make `example.com` appear to cover `api.example.com`, and a
    // subdomain that the platform does NOT in fact match would then look configured. Requiring
    // the exact host in the config costs one line per host and removes the guess.
    const gap = transportSecurityGap(
      ['https://api.example.com'],
      [policy({ domain: 'example.com' })],
    );
    expect(gap.unconfigured).toEqual(['api.example.com']);
  });
});

describe('the shipped Android network security config', () => {
  const endpoints = endpointsFromEnvFiles();
  const gap = transportSecurityGap(
    endpoints,
    policiesFromNetworkSecurityConfig(),
  );

  it('covers every origin any flavor can be built against', () => {
    expect(endpoints.length).toBeGreaterThan(0);
    expect(gap.unconfigured).toEqual([]);
  });

  it('declares no pin-set at all until there is a real pin to put in one', () => {
    // An EMPTY <pin-set> reads like a placeholder and enforces nothing — but Android lint treats
    // it as a FATAL error in a release build ("Missing <pin> element(s)"), so a config carrying
    // five of them could not be assembled at all. Absent and empty are identical at runtime;
    // only one of them ships. The slot is held open by the recipe in the XML header instead.
    expect([...gap.withoutPinSet].sort()).toEqual(
      [...new Set(endpoints.map(e => endpointHost(e)))].sort(),
    );
  });

  it('never ships a lone pin or a pin without an expiry', () => {
    expect(gap.withoutBackupPin).toEqual([]);
    expect(gap.withoutExpiry).toEqual([]);
  });

  it('never lets a backend host be reached over cleartext', () => {
    expect(gap.cleartext).toEqual([]);
  });

  it('ships NO pins yet — every backend host is still only TLS-validated', () => {
    // This is the deliberate state, not an oversight: the real SPKI hashes can only come from
    // the live certificates, and a guessed pin brands every install permanently unreachable.
    // See `docs/adr/0009-certificate-pinning.md` for the command that produces them.
    //
    // It is asserted rather than merely commented so that the day pins arrive, this line goes
    // red. Supplying a pin is the single most dangerous edit in this repo and it should not be
    // able to land on a green board without someone deliberately updating this expectation.
    // No host has a pin-set, so none of them is enforcing anything — which is the same
    // statement `withoutPinSet` makes above, from the other side.
    expect(gap.withoutBackupPin).toEqual([]);
    expect(gap.withoutExpiry).toEqual([]);
    expect(gap.withoutPinSet.length).toBe(
      new Set(endpoints.map(e => endpointHost(e))).size,
    );
  });
});
