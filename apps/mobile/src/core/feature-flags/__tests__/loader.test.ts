/**
 * min_client_version gate (§L15) + default flags.
 */
import { compareVersion } from '../loader';
import { DEFAULT_FLAGS } from '../types';

test('compareVersion orders dotted versions', () => {
  expect(compareVersion('0.0.1', '0.0.1')).toBe(0);
  expect(compareVersion('0.0.1', '0.1.0')).toBe(-1);
  expect(compareVersion('1.2.0', '1.1.9')).toBe(1);
  expect(compareVersion('0.9.0', '0.10.0')).toBe(-1);
});

test('default flags are offline-safe (core features on)', () => {
  expect(DEFAULT_FLAGS.calls).toBe(true);
  expect(DEFAULT_FLAGS.status).toBe(true);
});
