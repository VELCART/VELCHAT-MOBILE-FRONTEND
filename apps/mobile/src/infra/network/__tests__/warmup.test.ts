/**
 * Which origins a launch-time wake-up request is worth sending to (VC-008).
 *
 * `warmBackend()` exists for ONE deployment shape: Render's free tier puts a service to sleep
 * after ~15 min idle, and the first request that wakes it waits 30-50s — measured 36s for the
 * edge gateway and 43s for realtime. That is longer than a user will hold a login screen and
 * close enough to the 60s axios timeout to lose the request outright. Firing a cheap `/health`
 * at launch moves that wait off the user's first tap.
 *
 * It did not work, and the reason is a topology question the client had never settled. Both
 * answers were written down and they disagreed: `docs/backend-integration-reference.md` §3/§8
 * says production is "per-service on Render, NOT single-origin", while `.env.prod` says one
 * Azure origin. `D:\Velchat\docs\RUNBOOK.md` §0b — cited by BOTH env files and already quoted in
 * `src/core/config/env.ts` — settles it: production is topology `mono`, every feature group in
 * ONE always-running process behind `velchat.duckdns.org`. The integration reference predates
 * that and flags the prod origin as unconfirmed; it has since been configured. So the per-service
 * Render fan-out the bug asked for describes the DEV deployment only, and a production build has
 * nothing to wake at all.
 *
 * Two invariants come out of that, and they are what this file pins:
 *
 *  1. A wake request is only ever worth sending to a host that actually SLEEPS. Production is one
 *     live process (its only outage is the VM's 19:30 IST auto-shutdown, which no HTTPS GET can
 *     undo) and a local backend is a process the developer started. Both must cost zero requests
 *     — this runs on the launch path of a 3 GB Android 10 device (§R4/§R5/§R6), and a request
 *     that cannot help is pure cold-start and battery spend.
 *
 *  2. The warm-up may only ever contact an origin `appEnv` ALREADY names. The five per-service
 *     dev hosts are genuinely known — RUNBOOK §0b lists them and VC-007's session got 200 from
 *     each — but that same paragraph says the `-2aje` suffix is Render-generated and "never
 *     hardcoded anywhere — do not copy it into config", and
 *     `android/app/src/main/res/xml/network_security_config.xml` carries exactly one
 *     `<domain-config>` per `.env.*` origin, an invariant
 *     `infra/native/__tests__/transportSecurity.test.ts` asserts against the real files. A host
 *     reached from JS that the XML does not name is silently UNPINNED the moment pins land. So
 *     the fan-out is no longer blocked on a missing hostname; it is refused because shipping one
 *     would trade a cold start for a hole in the transport-security control.
 *
 * The decision is pure and lives here because that is the whole of it: the fetch it feeds is
 * fire-and-forget by design and asserts nothing, so this is the only place the behaviour can be
 * held to anything.
 */
import { warmTargets } from '../warmup';
import { endpointHost } from '../../native/transportSecurity';

/** `.env.prod` — topology `mono`; REST and WS deliberately share the one Azure origin. */
const PROD = {
  apiBaseUrl: 'https://velchat.duckdns.org',
  wsUrl: 'wss://velchat.duckdns.org/ws',
};

/** `.env.dev` — topology `axis6` on Render; WS bypasses the edge gateway on purpose. */
const DEV = {
  apiBaseUrl: 'https://velchat-edge-gateway-2aje.onrender.com',
  wsUrl: 'wss://velchat-realtime-service-2aje.onrender.com/ws',
};

/** The local backend, reached over `adb reverse` or the emulator's host alias. */
const LOCAL = {
  apiBaseUrl: 'http://10.0.2.2:8080',
  wsUrl: 'ws://10.0.2.2:8080/ws',
};

describe('warmTargets', () => {
  it('sends nothing at all in production, where there is no sleeping service to wake', () => {
    // RUNBOOK §0b: `mono` — one process behind Caddy on the Azure VM, up whenever the VM is up.
    // The old code pinged it three times per launch on the theory that it was waking Render
    // services; it was waking nothing, and doing it on the cold-start path of the reference
    // device. This is the assertion that makes the shipped binary pay nothing for VC-008.
    expect(warmTargets(PROD)).toEqual([]);
  });

  it('sends nothing to a local backend, which is a process the developer already started', () => {
    expect(warmTargets(LOCAL)).toEqual([]);
    expect(
      warmTargets({
        apiBaseUrl: 'http://localhost:8080',
        wsUrl: 'ws://localhost:8080/ws',
      }),
    ).toEqual([]);
  });

  it('wakes both Render hosts the dev flavor is configured against', () => {
    // These two, and ONLY these two, are what the client can legitimately warm: they are the
    // origins `.env.dev` names, so they are also the origins the pinning config already covers.
    expect(warmTargets(DEV)).toEqual([
      'https://velchat-edge-gateway-2aje.onrender.com/health',
      'https://velchat-realtime-service-2aje.onrender.com/health',
    ]);
  });

  it('never reaches a host the build was not already configured to talk to', () => {
    // The structural rule, stated as an assertion rather than as a comment nobody re-reads:
    // whatever the inputs, every target resolves to one of the input hosts. An identity /
    // messaging / content / platform origin can only ever get in here by someone hardcoding it,
    // and this is what fails when they do.
    for (const env of [PROD, DEV, LOCAL]) {
      const allowed = [
        endpointHost(env.apiBaseUrl),
        endpointHost(env.wsUrl),
      ].filter((host): host is string => host !== undefined);
      for (const target of warmTargets(env)) {
        expect(allowed).toContain(endpointHost(target));
      }
    }
  });

  it('never pings the JWKS route, which only ever warmed the gateway twice', () => {
    // `/.well-known/jwks.json` is labelled "auth-service (login path)" in the code it came from,
    // and that label is what made the warm-up look like it covered login. It does not: the
    // gateway proxies `/.well-known` to identity (backend-integration-reference §2) and on the
    // dev deployment every proxied route returns 502 without the upstream ever being reached
    // (VC-007, measured). It is a second request to the host the line above it just woke,
    // wearing a name that makes a reviewer believe a mitigation exists.
    for (const env of [PROD, DEV, LOCAL]) {
      for (const target of warmTargets(env)) {
        expect(target).not.toContain('.well-known');
      }
    }
  });

  it('wakes a shared origin once, not once per URL that happens to use it', () => {
    expect(
      warmTargets({
        apiBaseUrl: 'https://velchat-edge-gateway-2aje.onrender.com/',
        wsUrl: 'wss://velchat-edge-gateway-2aje.onrender.com/ws',
      }),
    ).toEqual(['https://velchat-edge-gateway-2aje.onrender.com/health']);
  });

  it('keeps the port, because the origin is what gets woken, not the bare host', () => {
    expect(
      warmTargets({
        apiBaseUrl: 'https://velchat-edge-gateway-2aje.onrender.com:8443/api',
        wsUrl: 'wss://velchat-edge-gateway-2aje.onrender.com:8443/ws',
      }),
    ).toEqual(['https://velchat-edge-gateway-2aje.onrender.com:8443/health']);
  });

  it('drops an unusable origin instead of inventing a host out of it', () => {
    // The same rule `endpointHost` is built on: a value that is not a URL cannot be resolved into
    // a host, and guessing one puts a request on the wire aimed at whatever the guess resolves
    // to. VC-035 is the precedent — a build whose `Config` came back empty.
    expect(
      warmTargets({
        apiBaseUrl: 'velchat-edge-gateway-2aje.onrender.com',
        wsUrl: '',
      }),
    ).toEqual([]);
  });

  it('is not fooled by a hostname that merely contains the hibernating platform suffix', () => {
    // `onrender.com.example.test` is a host somebody else controls. The suffix match has to be
    // anchored at a label boundary or the predicate degrades into "wake anything with the right
    // substring in it" — which is how a warm-up starts sending launch traffic to a stranger.
    expect(
      warmTargets({
        apiBaseUrl: 'https://onrender.com.example.test',
        wsUrl: 'wss://onrender.com.example.test/ws',
      }),
    ).toEqual([]);
  });
});
