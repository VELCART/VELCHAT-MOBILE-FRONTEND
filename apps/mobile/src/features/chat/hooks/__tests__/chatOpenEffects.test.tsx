/**
 * Opening a chat is a ONE-TIME act; growing the window is not (VC-068).
 *
 * `useMessages` did two jobs in one effect keyed on `[conversationId, meId, limit]`, but only the
 * `observeMessages` subscription depends on `limit`. So every `loadOlder` page tore the whole
 * effect down and re-ran it: a receipts GET, a read-receipt frame and a tray-clear per page of
 * scrollback — and, worse, the pair `setActiveConversationForPush(null)` → `…(conversationId)`.
 * That bridge call is ASYNC, so for one native round trip the native side believes NO chat is on
 * screen, and a push landing in that window posts a heads-up notification for the chat the user
 * is reading — the exact failure the active-conversation mechanism exists to prevent.
 *
 * These tests pin the split: the query re-subscribes on `limit`, the open-the-chat actions do
 * not, and a real conversation change still runs all of them (and unmount still withdraws both
 * active ids — the §M7 disposal these tests must not let a refactor drop).
 */
import React from 'react';
import { AppState, Text } from 'react-native';
import { render, act } from '@testing-library/react-native';

const mockSetActiveConversation = jest.fn();
const mockMarkConversationRead = jest.fn((_id: string) => Promise.resolve());
const mockReconcilePeerReceipts = jest.fn((_id: string) => Promise.resolve());
const mockClearConversationNotification = jest.fn();
const mockSetActiveConversationForPush = jest.fn();
const mockObserveMessages = jest.fn();
const mockUnsubscribe = jest.fn();

/** More history on disk than the first window shows, so `loadOlder` grows `limit` locally. */
const HELD_LOCALLY = 500;

// Lazy wrappers: `jest.mock` is hoisted above the consts above, so a factory that referenced
// them directly would capture `undefined` and the assertions would pass for the wrong reason.
jest.mock('../../../../infra', () => ({
  MESSAGE_PAGE: 50,
  getAccountId: () => 'me-1',
  countMessages: () => Promise.resolve(HELD_LOCALLY),
  observeMessages: (...a: unknown[]) => {
    mockObserveMessages(...a);
    return { subscribe: () => ({ unsubscribe: mockUnsubscribe }) };
  },
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
    loadOlderMessages: () => Promise.resolve(false),
  },
}));

import { useMessages } from '../useMessages';

let loadOlder: () => void = () => undefined;

function Harness({ id }: { id: string }): React.JSX.Element {
  const m = useMessages(id);
  loadOlder = m.loadOlder;
  return <Text>{m.messages.length}</Text>;
}

/** One page of scrollback, settled — `loadOlder` reads the local count before it grows. */
async function pageBack(): Promise<void> {
  await act(async () => {
    loadOlder();
  });
}

describe('paging through history is not re-opening the chat', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as never);
  });

  it('re-subscribes the query on a wider window and releases the old one', async () => {
    render(<Harness id="conv-1" />);
    expect(mockObserveMessages).toHaveBeenCalledWith('conv-1', 50);

    await pageBack();

    expect(mockObserveMessages).toHaveBeenLastCalledWith('conv-1', 100);
    // The widened query replaces the old one — two live subscriptions on one list would emit
    // twice per write for the rest of the session (§M20.3).
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not re-run the open-the-chat side effects for every page', async () => {
    render(<Harness id="conv-1" />);

    await pageBack();
    await pageBack();

    // Three windows, one opening: the receipts repair and the read frame are network, and the
    // user has neither left the chat nor re-entered it.
    expect(mockMarkConversationRead).toHaveBeenCalledTimes(1);
    expect(mockReconcilePeerReceipts).toHaveBeenCalledTimes(1);
    expect(mockClearConversationNotification).toHaveBeenCalledTimes(1);
  });

  it('never tells the push layer that no chat is on screen while one is', async () => {
    render(<Harness id="conv-1" />);
    expect(mockSetActiveConversationForPush).toHaveBeenCalledWith('conv-1');

    await pageBack();

    // The async bridge round trip this used to open is the whole bug: a push arriving inside it
    // is treated as arriving for a chat nobody is looking at, and gets a heads-up notification.
    expect(mockSetActiveConversationForPush).not.toHaveBeenCalledWith(null);
    expect(mockSetActiveConversation).not.toHaveBeenCalledWith(null);
  });

  it('still re-opens for a different conversation, and lets go on unmount', () => {
    const view = render(<Harness id="conv-1" />);

    view.rerender(<Harness id="conv-2" />);
    expect(mockSetActiveConversation).toHaveBeenLastCalledWith('conv-2');
    expect(mockSetActiveConversationForPush).toHaveBeenLastCalledWith('conv-2');
    expect(mockMarkConversationRead).toHaveBeenCalledWith('conv-2');
    expect(mockReconcilePeerReceipts).toHaveBeenCalledWith('conv-2');
    expect(mockClearConversationNotification).toHaveBeenCalledWith('conv-2');

    view.unmount();
    expect(mockSetActiveConversation).toHaveBeenLastCalledWith(null);
    expect(mockSetActiveConversationForPush).toHaveBeenLastCalledWith(null);
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
