/**
 * "The conversation on screen" must mean VISIBLE, not merely "last opened".
 *
 * The SyncEngine reads every message that lands in `activeConversationId` on arrival (§F2 — the
 * badge must not climb on a chat the user is looking at, and the sender should get a blue tick
 * without the reader touching anything). `useMessages` sets that id when the chat mounts and
 * used to clear it only when the chat UNMOUNTS.
 *
 * Backgrounding does not unmount. So an app left sitting on a chat — screen locked, or the user
 * in another app — went on marking every arriving message READ, and the sender saw a blue tick
 * for a message nobody had looked at. The push layer beside it already had this right: it
 * withdraws its active id on 'background' and re-asserts it on 'active'. These tests hold the
 * engine, the notification tray and the read report to that same rule.
 */
import React from 'react';
import { AppState, Text } from 'react-native';
import { render, act } from '@testing-library/react-native';

const mockSetActiveConversation = jest.fn();
const mockMarkConversationRead = jest.fn((_id: string) => Promise.resolve());
const mockReconcilePeerReceipts = jest.fn((_id: string) => Promise.resolve());
const mockClearConversationNotification = jest.fn();
const mockSetActiveConversationForPush = jest.fn();

// Lazy wrappers: `jest.mock` is hoisted above the consts above, so a factory that referenced
// them directly would capture `undefined` and the assertions would pass for the wrong reason.
jest.mock('../../../../infra', () => ({
  MESSAGE_PAGE: 50,
  getAccountId: () => 'me-1',
  countMessages: () => Promise.resolve(0),
  observeMessages: () => ({
    subscribe: () => ({ unsubscribe: () => undefined }),
  }),
  clearConversationNotification: (...a: unknown[]) =>
    mockClearConversationNotification(...a) as unknown,
  setActiveConversationForPush: (...a: unknown[]) =>
    mockSetActiveConversationForPush(...a) as unknown,
}));
jest.mock('../../../../domain/sync', () => ({
  syncEngine: {
    setActiveConversation: (...a: unknown[]) =>
      mockSetActiveConversation(...a) as unknown,
    markConversationRead: (id: string) => mockMarkConversationRead(id),
    reconcilePeerReceipts: (id: string) => mockReconcilePeerReceipts(id),
    loadOlderFromServer: () => Promise.resolve(0),
  },
}));

import { useMessages } from '../useMessages';

function Harness({ id }: { id: string }): React.JSX.Element {
  const { messages } = useMessages(id);
  return <Text>{messages.length}</Text>;
}

/** Drive the AppState listener the hook registered, the way the OS would. */
function emitAppState(state: 'active' | 'background'): void {
  const calls = (AppState.addEventListener as unknown as jest.Mock).mock.calls;
  for (const [event, handler] of calls) {
    if (event === 'change') (handler as (s: string) => void)(state);
  }
}

describe('the chat only counts as on screen while it is visible', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  it('withdraws the engine’s active conversation when the app leaves the foreground', () => {
    render(<Harness id="conv-1" />);
    expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-1');

    mockSetActiveConversation.mockClear();
    act(() => emitAppState('background'));

    // Without this the engine keeps reading messages into a chat nobody is looking at.
    expect(mockSetActiveConversation).toHaveBeenCalledWith(null);
  });

  it('re-asserts it, re-reports the read and clears the tray when the app comes back', () => {
    render(<Harness id="conv-1" />);
    act(() => emitAppState('background'));

    mockSetActiveConversation.mockClear();
    mockMarkConversationRead.mockClear();
    mockClearConversationNotification.mockClear();
    act(() => emitAppState('active'));

    expect(mockSetActiveConversation).toHaveBeenCalledWith('conv-1');
    // Messages that landed while we were away are read now that the chat is on screen again.
    expect(mockMarkConversationRead).toHaveBeenCalledWith('conv-1');
    // And the tray entry for the chat the user is looking at is stale — including the stored
    // MessagingStyle lines behind it, which is what made an old message reappear in the next
    // notification. A notification TAP resumes an already-mounted screen, so the mount effect
    // never runs and this is the only place that clearing can happen.
    expect(mockClearConversationNotification).toHaveBeenCalledWith('conv-1');
  });

  it('keeps the push layer and the engine in step', () => {
    render(<Harness id="conv-1" />);
    mockSetActiveConversationForPush.mockClear();
    mockSetActiveConversation.mockClear();

    act(() => emitAppState('background'));
    expect(mockSetActiveConversationForPush).toHaveBeenLastCalledWith(null);
    expect(mockSetActiveConversation).toHaveBeenLastCalledWith(null);

    act(() => emitAppState('active'));
    expect(mockSetActiveConversationForPush).toHaveBeenLastCalledWith('conv-1');
    expect(mockSetActiveConversation).toHaveBeenLastCalledWith('conv-1');
  });
});
