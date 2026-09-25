/**
 * What the platform's TLS policy promises for a given origin (VC-018, §A1/§D4).
 *
 * Pinning on Android is declared, not coded: `android/app/src/main/res/xml/
 * network_security_config.xml` is the whole mechanism, and the platform enforces it for every
 * TLS socket in the process — the JS `fetch`/axios path, the WebSocket, AND the raw
 * `HttpURLConnection` the push delivery-ack uses from Kotlin with no React context alive. That
 * reach is why it was chosen over an OkHttp `CertificatePinner`, which only ever sees the first
 * of those. See `docs/adr/0009-certificate-pinning.md`.
 *
 * Declared config has one weakness: it fails SILENTLY open. A host that is missing from the XML
 * is not an error, it is simply unpinned — indistinguishable, at runtime and in review, from a
 * host that is pinned correctly. The functions here exist so that gap can be asserted instead of
 * eyeballed; the test reads the real `.env.*` files and the real XML and holds them to the
 * invariants below.
 *
 * Nothing here talks to the network or to a native module. It is a description of a policy, and
 * the reason it lives in `infra/native` is that the policy it describes is a platform artifact,
 * not application state.
 */

/** One `<domain-config>` entry, as the shipped XML declares it. */
export interface DomainPinPolicy {
  /** The exact host, lower-cased. */
  readonly domain: string;
  /**
   * How many `<pin>` elements the domain's `<pin-set>` holds — or `undefined` when there is no
   * `<pin-set>` at all. The distinction is load-bearing: an empty pin-set is a slot somebody
   * deliberately left open, while a missing one is a host nobody wired.
   */
  readonly pinCount: number | undefined;
  /** The pin-set's `expiration`, after which the platform stops enforcing pins (fail-open). */
  readonly expires: string | undefined;
  /** Whether this domain may be reached over plain http. */
  readonly cleartextPermitted: boolean;
}

/** Everything the shipped config does NOT promise for a set of origins. */
export interface TransportSecurityGap {
  /** Hosts with no `<domain-config>` — plain TLS, whatever the rest of the file says. */
  readonly unconfigured: readonly string[];
  /** Configured, but with no `<pin-set>` element to put a pin in. */
  readonly withoutPinSet: readonly string[];
  /** A `<pin-set>` that is present and empty: the mechanism is wired and idle. */
  readonly idle: readonly string[];
  /** Exactly one pin — one certificate rotation away from an install that cannot be fixed. */
  readonly withoutBackupPin: readonly string[];
  /** Pinned with no expiry, i.e. with the platform's fail-open valve disabled. */
  readonly withoutExpiry: readonly string[];
  /** Backend hosts the config would allow over plain http. */
  readonly cleartext: readonly string[];
}

/**
 * The bare host of an endpoint URL, lower-cased, or `undefined` when the input is not a URL.
 *
 * Hand-rolled rather than `new URL()` because Hermes' URL is a partial polyfill whose behaviour
 * differs from Node's, and this runs in both. It is also deliberately strict: a scheme is
 * REQUIRED. Accepting a bare `velchat.duckdns.org` would let a typo'd env value resolve to a
 * plausible-looking host, which would then be pinned while the real origin sailed past
 * unpinned — the exact failure this module exists to catch.
 */
export function endpointHost(url: string): string | undefined {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  const authority = match?.[1];
  if (authority === undefined) return undefined;
  // Strip any `user:pass@` and the `:port`; an IPv6 literal keeps its brackets.
  const host = authority.slice(authority.lastIndexOf('@') + 1);
  const bare = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : (host.split(':')[0] ?? '');
  return bare === '' ? undefined : bare.toLowerCase();
}

/**
 * Hold a set of origins against a set of domain policies.
 *
 * Matching is EXACT, and `includeSubdomains` is deliberately not honoured. The platform does
 * honour it, so a suffix match here would be "more correct" — and it would also mean a host
 * looks covered because of a parent entry whose `includeSubdomains` somebody later removes.
 * Requiring the literal host in the config costs one line each and removes the guess.
 */
export function transportSecurityGap(
  endpoints: readonly string[],
  policies: readonly DomainPinPolicy[],
): TransportSecurityGap {
  const unconfigured: string[] = [];
  const withoutPinSet: string[] = [];
  const idle: string[] = [];
  const withoutBackupPin: string[] = [];
  const withoutExpiry: string[] = [];
  const cleartext: string[] = [];

  const seen = new Set<string>();
  for (const endpoint of endpoints) {
    const host = endpointHost(endpoint);
    // An endpoint that is not a URL cannot be pinned and is not this function's problem to
    // report — the env guard in `core/config` owns that.
    if (host === undefined || seen.has(host)) continue;
    seen.add(host);

    const policy = policies.find(p => p.domain === host);
    if (policy === undefined) {
      unconfigured.push(host);
      continue;
    }
    if (policy.cleartextPermitted) cleartext.push(host);
    if (policy.pinCount === undefined) {
      withoutPinSet.push(host);
      continue;
    }
    if (policy.pinCount === 0) {
      // Nothing is being enforced, so neither the backup-pin nor the expiry rule can bite.
      idle.push(host);
      continue;
    }
    if (policy.pinCount === 1) withoutBackupPin.push(host);
    if (policy.expires === undefined) withoutExpiry.push(host);
  }

  return {
    unconfigured,
    withoutPinSet,
    idle,
    withoutBackupPin,
    withoutExpiry,
    cleartext,
  };
}
