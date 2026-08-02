/**
 * `sanitizeLikeQuery` — the LIKE-wildcard neutraliser used by the local search queries.
 * WatermelonDB's `Q.like` emits `LIKE ?` with NO `ESCAPE` clause on SQLite, so the only safe
 * move is to fold both wildcards (`%`, `_`) to the single-char wildcard `_`; everything else
 * (letters, digits, spaces, punctuation, Unicode) must pass through untouched so real queries
 * still match. This is a pure function → unit-testable without a DB (the SQLite adapter is
 * mocked under Jest, so a live query can't run here).
 */
import { sanitizeLikeQuery } from '../search';

describe('sanitizeLikeQuery (§M0 local search — LIKE wildcard safety)', () => {
  test('a user-typed % (match-everything) is bounded to a single-char wildcard', () => {
    expect(sanitizeLikeQuery('50%')).toBe('50_');
    expect(sanitizeLikeQuery('%%%')).toBe('___');
  });

  test('a literal underscore stays a single-char wildcard (cannot be made literal)', () => {
    expect(sanitizeLikeQuery('a_b')).toBe('a_b');
    expect(sanitizeLikeQuery('__')).toBe('__');
  });

  test('both wildcards together are neutralised', () => {
    expect(sanitizeLikeQuery('%_mix_%')).toBe('__mix__');
  });

  test('ordinary text — letters, digits, spaces, punctuation — is untouched', () => {
    expect(sanitizeLikeQuery('Rahul Sharma')).toBe('Rahul Sharma');
    expect(sanitizeLikeQuery('hello, world! 42')).toBe('hello, world! 42');
  });

  test('Unicode (accents, Hindi, Arabic, emoji) survives for real matching', () => {
    expect(sanitizeLikeQuery('Jöhn')).toBe('Jöhn');
    expect(sanitizeLikeQuery('नमस्ते')).toBe('नमस्ते');
    expect(sanitizeLikeQuery('مرحبا')).toBe('مرحبا');
    expect(sanitizeLikeQuery('gg 🎉')).toBe('gg 🎉');
  });

  test('empty string maps to empty string', () => {
    expect(sanitizeLikeQuery('')).toBe('');
  });
});
