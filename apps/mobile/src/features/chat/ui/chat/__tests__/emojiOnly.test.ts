/**
 * Big emoji (WhatsApp parity). A message that is nothing but a few emoji is drawn larger; a
 * message with any words in it is not, however many emoji sit beside them.
 */
import { emojiOnlyFontSize } from '../chatModel';

describe('emojiOnlyFontSize', () => {
  it('enlarges one, two and three emoji, by decreasing amounts', () => {
    const one = emojiOnlyFontSize('😀');
    const two = emojiOnlyFontSize('😀😀');
    const three = emojiOnlyFontSize('😀😀😀');
    expect(one).not.toBeNull();
    expect(two).not.toBeNull();
    expect(three).not.toBeNull();
    expect(one as number).toBeGreaterThan(two as number);
    expect(two as number).toBeGreaterThan(three as number);
  });

  it('leaves four or more alone — at that point it is a wall, not a reaction', () => {
    expect(emojiOnlyFontSize('😀😀😀😀')).toBeNull();
  });

  it('leaves anything with a word in it alone', () => {
    expect(emojiOnlyFontSize('ok 😀')).toBeNull();
    expect(emojiOnlyFontSize('😀 ok')).toBeNull();
    expect(emojiOnlyFontSize('hello')).toBeNull();
  });

  it('ignores surrounding whitespace rather than being defeated by it', () => {
    expect(emojiOnlyFontSize('  😀  ')).not.toBeNull();
  });

  it('is null for empty and whitespace-only text', () => {
    expect(emojiOnlyFontSize('')).toBeNull();
    expect(emojiOnlyFontSize('   ')).toBeNull();
  });

  it('counts a multi-code-point emoji as ONE', () => {
    // A skin-tone modifier and a ZWJ family are each a single emoji to a reader.
    expect(emojiOnlyFontSize('👍🏽')).toBe(emojiOnlyFontSize('😀'));
  });
});
