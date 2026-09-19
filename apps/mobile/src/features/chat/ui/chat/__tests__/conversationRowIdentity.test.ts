/**
 * What a chat-LIST row calls a conversation, and the avatar initial that must agree with it
 * (VC-070).
 *
 * Found live on a real device: a row on the Chats tab read as a bare em-dash beside a generic
 * avatar, with a two-letter preview as the only clue to who it was. The row invented a
 * placeholder three separate times — `name ?? '—'` for the title, `?? 'Chat'` for the
 * accessibility label and `?? '?'` for the initial — so the three answers could not even agree,
 * and a screen-reader user was handed the untranslated word "Chat" instead of a real label.
 *
 * The rule below is one answer for all three: a real name (whitespace is not one) titles the row
 * and gives its avatar an initial; anything else takes the caller's localised label and NO
 * initial, so the avatar keeps drawing the person glyph.
 */
import { conversationRowIdentity } from '../chatModel';

const UNKNOWN = 'Unknown contact';

describe('conversationRowIdentity', () => {
  it('titles the row with the resolved name and initials it', () => {
    expect(conversationRowIdentity('Ada Lovelace', UNKNOWN)).toEqual({
      title: 'Ada Lovelace',
      initial: 'A',
    });
  });

  it('upper-cases the initial of a lower-case name', () => {
    expect(conversationRowIdentity('ada', UNKNOWN)).toEqual({
      title: 'ada',
      initial: 'A',
    });
  });

  it('uses the localised label when nothing names the conversation', () => {
    // The live case: the inbox sync never resolved the peer and they are not in the address book.
    expect(conversationRowIdentity(undefined, UNKNOWN)).toEqual({
      title: UNKNOWN,
      initial: undefined,
    });
  });

  it('treats a blank name as no name', () => {
    // An unresolved row can carry an empty string, which `??` accepted — an empty title slot and
    // an empty avatar, which is even less readable than the em-dash it replaced.
    expect(conversationRowIdentity('   ', UNKNOWN)).toEqual({
      title: UNKNOWN,
      initial: undefined,
    });
  });

  it('gives the fallback label no initial, so it cannot be mistaken for a person', () => {
    // A coloured "U" disc reads exactly like a real contact's avatar. No initial means the caller
    // draws its person glyph — which is what the old '?' sentinel already produced on screen.
    expect(
      conversationRowIdentity(undefined, 'Unnamed chat').initial,
    ).toBeUndefined();
  });

  it('keeps a name that merely starts with a question mark', () => {
    // The old code compared the initial against '?' to decide "unknown", so a name like this was
    // silently demoted to the generic avatar.
    expect(conversationRowIdentity('?? Mystery', UNKNOWN)).toEqual({
      title: '?? Mystery',
      initial: '?',
    });
  });
});
