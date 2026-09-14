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
import { chatTitle } from '../chatModel';

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
