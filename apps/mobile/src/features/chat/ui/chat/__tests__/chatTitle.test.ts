/**
 * What the chat header calls the conversation (§F2).
 *
 * This exists because of a real bug found in live two-device testing (VC-053): opening a chat
 * from a NOTIFICATION showed the header title "Chats". The deep link is `chat/:conversationId`
 * and carries nothing else, so `route.params.name` is `undefined` and the header fell straight
 * through to the bottom-tab label — while the avatar and presence line beside it were correct,
 * because those are read from the conversation row.
 *
 * The row's name was available the whole time. The rule below is simply: prefer what the caller
 * passed, fall back to the row, and only then to a generic label.
 */
import { chatTitle, conversationRowIdentity } from '../chatModel';

describe('chatTitle', () => {
  it('prefers the name the navigation passed', () => {
    expect(chatTitle('Aayush Jain', 'stale row name', 'Chats')).toBe(
      'Aayush Jain',
    );
  });

  it('falls back to the conversation row when navigation passed none', () => {
    // This is the notification deep-link case — the one that shipped as "Chats".
    expect(chatTitle(undefined, 'Aayush Jain', 'Chats')).toBe('Aayush Jain');
  });

  it('uses the generic label only when nothing names the conversation', () => {
    expect(chatTitle(undefined, undefined, 'Chats')).toBe('Chats');
  });

  it('treats a blank name as no name, in either source', () => {
    // An empty string is what an unresolved row carries; `??` would have accepted it and
    // rendered an empty header with a blank avatar initial.
    expect(chatTitle('', 'Aayush Jain', 'Chats')).toBe('Aayush Jain');
    expect(chatTitle('   ', '', 'Chats')).toBe('Chats');
  });
});

/**
 * What the HEADER falls back to when nothing names the conversation.
 *
 * `chatTitle`'s own fallback is `''` — "nothing names this yet" — and the header then has to
 * turn that into something a user can read. It used to be the bottom-tab label, so an
 * unidentified chat's header said "Chats": a category in the slot where a person's name goes.
 * That was the best string available when VC-053 landed; the chat list needed the same answer
 * later and `chat.unknownContact` was added for it (VC-070), so both surfaces agree now.
 */
describe('the header title for a conversation nothing names', () => {
  const UNKNOWN = 'Unknown contact';

  it('uses the unknown-contact label, never a tab name', () => {
    const { title } = conversationRowIdentity(
      chatTitle(undefined, undefined, ''),
      UNKNOWN,
    );
    expect(title).toBe(UNKNOWN);
    expect(title).not.toBe('Chats');
  });

  it('leaves the avatar with no initial, so it draws the person glyph', () => {
    // An initial taken from the fallback would put "U" on the avatar of someone we cannot name.
    const { initial } = conversationRowIdentity(
      chatTitle(undefined, undefined, ''),
      UNKNOWN,
    );
    expect(initial).toBeUndefined();
  });

  it('still prefers a real name over the fallback, from either source', () => {
    expect(
      conversationRowIdentity(chatTitle('Aayush Jain', undefined, ''), UNKNOWN)
        .title,
    ).toBe('Aayush Jain');
    expect(
      conversationRowIdentity(chatTitle(undefined, 'Aayush Jain', ''), UNKNOWN)
        .title,
    ).toBe('Aayush Jain');
  });
});
