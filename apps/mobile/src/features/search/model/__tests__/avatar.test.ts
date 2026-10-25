/**
 * The leading avatar. Its job is to make one conversation look like ONE object across the
 * inbox and search, which means the colour has to be a pure function of the name and the
 * initial has to refuse to draw placeholder punctuation as a letter.
 */
import { avatarColor, avatarInitial } from '../avatar';

describe('avatarColor', () => {
  test('is stable for a given name', () => {
    expect(avatarColor('Tusha')).toBe(avatarColor('Tusha'));
  });

  test('different names generally get different colours', () => {
    expect(avatarColor('Tusha')).not.toBe(avatarColor('Rahul'));
  });

  test('an empty name still returns a usable colour', () => {
    expect(avatarColor('')).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

describe('avatarInitial', () => {
  test('takes the first letter, upper-cased', () => {
    expect(avatarInitial('tushar mehta')).toBe('T');
  });

  test('works for non-Latin scripts', () => {
    expect(avatarInitial('नमस्ते')).toBe('न');
    expect(avatarInitial('مرحبا')).toBe('م');
  });

  test('refuses to draw the em-dash placeholder as if it were a name', () => {
    // An unnamed conversation is titled '—'; drawing that in a coloured circle reads as a
    // contact actually called "—".
    expect(avatarInitial('—')).toBe('');
    expect(avatarInitial('   ')).toBe('');
    expect(avatarInitial('')).toBe('');
  });

  test('a digit is a fine initial — a chat can be named "42"', () => {
    expect(avatarInitial('42 Group')).toBe('4');
  });
});
