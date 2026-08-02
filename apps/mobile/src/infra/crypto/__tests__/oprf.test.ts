/**
 * OPRF client crypto — correctness gate (§G2).
 *
 * The load-bearing test proves the client's blind→evaluate→unblind pipeline produces
 * the EXACT token the backend registers as `directToken`. If this drifts, discovery
 * silently returns nothing.
 *
 * Two independent anchors:
 *   1. Round-trip: unblind(evaluate(blind(x))) === an in-test `directToken(x)` composed
 *      from the exported primitives (blind/unblind are mathematically directToken).
 *   2. Known-answer (KAT): those tokens equal hard-coded vectors computed with the REAL
 *      backend algorithm (node:crypto) over the same 512-bit fixture. This pins the
 *      whole scheme — domain prefix, MGF1, mod-n reduction, left-pad, sha256-hex — to
 *      the running backend, not just to itself.
 *
 * The RSA key is a TEST-ONLY 512-bit fixture (n, e, d) generated once with
 * `node:crypto.generateKeyPairSync('rsa',{modulusLength:512})` and captured as base64url
 * (JWK encoding == the `/discovery/oprf/key` wire form). 512-bit is insecure — fine for a
 * deterministic math check, never for production.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  base64UrlToBigInt,
  bigIntToBase64Url,
  bigIntToBytes,
  bytesToBigInt,
  blind,
  hashToBigInt,
  modInverse,
  modPow,
  parseOprfPublicKey,
  unblind,
  type OprfPublicKey,
} from '../oprf';

// ── TEST-ONLY 512-bit RSA fixture (base64url, = wire encoding) ────────────────
const FIXTURE = {
  n: 'yi-6_7uwk4_49fXyMatuWdopNXqmMGqba_pS4bn14kspKbr5aRbajh3tQsSg5BV_zpCBKUSH2ERAjhXChsV4lQ',
  e: 'AQAB',
  d: 'wF6ninh26f96_fKzLIUSqpUCzmpSwxA7roHu5-w6QcJWctFKVDMKNHDiRc4rCPWxL57GIyb1ewF91GQlyeg5BQ',
  version: 1,
} as const;

// Backend-computed `directToken` values (node:crypto over the SAME fixture) — the
// ground truth the server stores/matches. Regenerate ONLY from the backend algorithm.
const PHONE_A = '+14155550100';
const TOKEN_A =
  'c7ae6da4f6a68a4312ee74dcc84fb103e07209b0f4747013048407fcbbf35025';
const KAT: ReadonlyArray<readonly [string, string]> = [
  [PHONE_A, TOKEN_A],
  [
    '+919876543210',
    '8fe86c35ab79af8f535f1991611b4cc634594da064c61c68edae3301af644334',
  ],
  [
    'alice@example.com',
    '94b13ed30e2d8da2d2e8f7cea365a2373b0508bf783c96392aa75795c3d5e37c',
  ],
];

// hashToBigInt("+14155550100") mod n, computed by the backend algorithm (hex).
const KAT_HASH_HEX =
  '877e99cdee91599de2f8b4de25730239c9a7d529a4a88e1c2b9cfe9e2650a849de6d5c809aebc6a5f6e700919afc6ae3928b77bf0f41119fa105f47bba412b2e';

const pub: OprfPublicKey = parseOprfPublicKey(FIXTURE);
const D = base64UrlToBigInt(FIXTURE.d);

/** Server step: apply the secret exponent (what /evaluate does). */
function serverEvaluate(blinded: bigint): bigint {
  return modPow(blinded, D, pub.n);
}

/**
 * Independent recomputation of the backend's `directToken` from the exported primitives —
 * NO blinding round-trip. Proves blind/unblind composes to exactly this.
 */
function directToken(input: string): string {
  const m = hashToBigInt(input, pub.n, pub.nByteLength);
  const evaluated = modPow(m, D, pub.n);
  return bytesToHex(sha256(bigIntToBytes(evaluated % pub.n, pub.nByteLength)));
}

describe('OPRF public key parsing', () => {
  it('derives nByteLength from the decoded modulus (512-bit ⇒ 64 bytes)', () => {
    expect(pub.nByteLength).toBe(64);
    expect(pub.e).toBe(65537n);
    // nByteLength == ceil(bitLength(n)/8) — the backend's definition.
    expect(pub.nByteLength).toBe(Math.ceil(pub.n.toString(2).length / 8));
  });
});

describe('OPRF blind→evaluate→unblind round-trip (THE correctness gate)', () => {
  for (const [input, expectedToken] of KAT) {
    it(`token(${input}) === directToken === backend KAT`, () => {
      // Capture ONE blind so blinded + r are the matched pair.
      const b = blind(input, pub);
      const evaluated = serverEvaluate(b.blinded);
      const token = unblind(evaluated, b.r, pub);

      // (1) client pipeline == independent directToken
      expect(token).toBe(directToken(input));
      // (2) both == the backend's node:crypto ground truth
      expect(token).toBe(expectedToken);
      // token shape: 64-char lowercase hex
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });
  }

  it('is randomized in `blinded` but deterministic in the token', () => {
    const b1 = blind(PHONE_A, pub);
    const b2 = blind(PHONE_A, pub);
    // Different blinding factors ⇒ different wire points…
    expect(b1.blinded).not.toBe(b2.blinded);
    expect(b1.r).not.toBe(b2.r);
    // …but the unblinded token is identical (that's the whole point).
    const t1 = unblind(serverEvaluate(b1.blinded), b1.r, pub);
    const t2 = unblind(serverEvaluate(b2.blinded), b2.r, pub);
    expect(t1).toBe(t2);
    expect(t1).toBe(TOKEN_A);
  });
});

describe('hashToBigInt', () => {
  it('is deterministic and matches the backend KAT (mod n)', () => {
    const h = hashToBigInt('+14155550100', pub.n, pub.nByteLength);
    expect(h).toBe(hashToBigInt('+14155550100', pub.n, pub.nByteLength));
    expect(h.toString(16)).toBe(KAT_HASH_HEX);
  });
  it('reduces below n and differs per input', () => {
    const a = hashToBigInt('+14155550100', pub.n, pub.nByteLength);
    const b = hashToBigInt('+14155550101', pub.n, pub.nByteLength);
    expect(a).toBeLessThan(pub.n);
    expect(b).toBeLessThan(pub.n);
    expect(a).not.toBe(b);
  });
});

describe('bigIntToBytes / bytesToBigInt', () => {
  it('left-pads to exactly byteLength (big-endian)', () => {
    expect([...bigIntToBytes(1n, 4)]).toEqual([0, 0, 0, 1]);
    expect(bigIntToBytes(0x0102n, 4)).toHaveLength(4);
    expect([...bigIntToBytes(0x0102n, 4)]).toEqual([0, 0, 1, 2]);
  });
  it('round-trips through bytesToBigInt', () => {
    const v = 0xdeadbeefcafen;
    expect(bytesToBigInt(bigIntToBytes(v, 32))).toBe(v);
  });
  it('throws if the value does not fit', () => {
    expect(() => bigIntToBytes(0x10000n, 2)).toThrow(/does not fit/);
  });
});

describe('modInverse', () => {
  it('produces a true modular inverse', () => {
    const m = pub.n;
    const a = 1234567890123456789n;
    expect((a * modInverse(a, m)) % m).toBe(1n);
  });
  it('throws when not coprime', () => {
    expect(() => modInverse(2n, 4n)).toThrow(/not invertible/);
  });
});

describe('base64url helpers', () => {
  it('round-trips a BigInt with no padding or url-unsafe chars', () => {
    const v = base64UrlToBigInt(FIXTURE.n);
    expect(v).toBe(pub.n);
    const encoded = bigIntToBase64Url(v);
    expect(base64UrlToBigInt(encoded)).toBe(v);
    expect(encoded).not.toMatch(/[+/=]/);
  });
});
