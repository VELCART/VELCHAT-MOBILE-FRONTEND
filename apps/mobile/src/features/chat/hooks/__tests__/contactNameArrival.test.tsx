/**
 * VC-044 — a name saved in the phone while VelChat is running has to reach a screen that is
 * ALREADY up.
 *
 * The precedence half is done (VC-047): a saved contact name wins over the registered one and is
 * resolved at READ time, in the chat list and in the chat header. What that alone cannot do is
 * make a name APPEAR. The name lives in the phone's address book, so the conversation row these
 * screens observe does not change when the user saves a contact — and never will. Both halves of
 * the residual are pinned here:
 *
 *  - ARRIVAL: the discovery snapshot notifies its readers, and a mounted list/header re-titles
 *    itself from the row it is already holding. Without it the name only showed up the next time
 *    something unrelated happened to re-emit that row, which is the reporter's "send a message
 *    and exit the chat, then the name appears".
 *  - DISCOVERY: the sweep that learns the name has to be ASKED for, at a moment that maps to the
 *    user's actual act — opening a chat on someone we cannot name, and coming back from the app
 *    where contacts are saved. The cost gates live in `requestContactsRefresh`; what is asserted
 *    here is that these two screens ask, and ask once.
 *
 * PRIVACY: fixtures use obviously-fake names/ids; never log a real name or number.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import type { Conversation } from '../../../../infra';
import type { VelchatContact } from '../../../contacts';

// Lazy wrappers throughout: `jest.mock` is hoisted above these declarations, so a factory that
// captured them directly would close over `undefined`.
const mockContacts: { current: VelchatContact[] | null } = { current: [] };
const mockListeners = new Set<() => void>();
const mockRequestRefresh = jest.fn();
const mockAppState: { current: ((s: string) => void) | null } = {
  current: null,
};
const mockList: { emit: ((rows: unknown[]) => void) | null } = { emit: null };
const mockOne: { emit: ((rows: unknown[]) => void) | null } = { emit: null };
const mockUnsubscribe = jest.fn();
const mockAppStateDisposed = jest.fn();

jest.mock('../../../../infra', () => ({
  observeConversations: () => ({
    subscribe: (fn: (rows: unknown[]) => void) => {
      mockList.emit = fn;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
  observeConversation: () => ({
    subscribe: (fn: (rows: unknown[]) => void) => {
      mockOne.emit = fn;
      return { unsubscribe: mockUnsubscribe };
    },
  }),
  subscribeAppState: (cb: (s: string) => void) => {
    mockAppState.current = cb;
    return () => {
      mockAppState.current = null;
      mockAppStateDisposed();
    };
  },
}));

// The snapshot is faked (it is MMKV + the native address book underneath); the NAME RULE is the
// real one, because "which name wins" is the contract these screens are meant to render.
jest.mock('../../../contacts', () => ({
  discoveredContacts: () => mockContacts.current,
  peerDisplayName: (
    jest.requireActual('../../../contacts/model/peerDisplayName') as {
      peerDisplayName: unknown;
    }
  ).peerDisplayName,
  subscribeDiscoveredContacts: (listener: () => void) => {
    mockListeners.add(listener);
    return () => {
      mockListeners.delete(listener);
    };
  },
  requestContactsRefresh: (...a: unknown[]) =>
    mockRequestRefresh(...a) as unknown,
}));

jest.mock('../../api/refreshPeerIdentity', () => ({
  refreshPeerIdentity: () => Promise.resolve(),
}));

import { useConversations } from '../useConversations';
import { useConversationIdentity } from '../useConversationIdentity';

const NUMBER = '+919899999999';
const PEER = 'acct_9';

function row(over: Record<string, unknown> = {}): Conversation {
  return {
    id: 'c1',
    type: 'dm',
    // What the server knows them as when they have set no display name: their own number.
    name: NUMBER,
    lastMessagePreview: 'hi',
    lastMessageAt: Date.now(),
    unreadCount: 0,
    isPinned: false,
    peerId: PEER,
    ...over,
  } as unknown as Conversation;
}

const saved = (accountId: string, name: string): VelchatContact => ({
  key: `k_${accountId}`,
  accountId,
  name,
  phoneE164: NUMBER,
});

function ListHarness(): React.JSX.Element {
  const { rows } = useConversations();
  return <Text>{rows.map(r => r.name ?? '-').join('|')}</Text>;
}

function HeaderHarness(): React.JSX.Element {
  const { name } = useConversationIdentity('c1');
  return <Text>{name ?? '-'}</Text>;
}

/** The discovery sweep landed: the snapshot now knows this peer, and says so. */
function nameArrives(contacts: VelchatContact[]): void {
  mockContacts.current = contacts;
  act(() => {
    for (const listener of [...mockListeners]) listener();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContacts.current = [];
  mockListeners.clear();
  mockAppState.current = null;
  mockList.emit = null;
  mockOne.emit = null;
});

describe('the chat list', () => {
  it('re-titles a row when the saved name arrives, with no new DB emission', () => {
    const view = render(<ListHarness />);
    act(() => mockList.emit?.([row()]));
    expect(view.getByText(NUMBER)).toBeTruthy();

    nameArrives([saved(PEER, 'Tusha')]);

    // Nothing re-emitted the row — the only thing that changed is the address book.
    expect(view.getByText('Tusha')).toBeTruthy();
  });

  it('asks for a sweep when the user comes back from another app', () => {
    render(<ListHarness />);
    act(() => mockList.emit?.([row(), row({ id: 'c2', peerId: 'acct_7' })]));

    act(() => mockAppState.current?.('active'));

    expect(mockRequestRefresh).toHaveBeenCalledWith(
      [PEER, 'acct_7'],
      'app-returned',
    );
  });

  it('does not ask on the way OUT — backgrounding is not a return', () => {
    render(<ListHarness />);
    act(() => mockList.emit?.([row()]));

    act(() => mockAppState.current?.('background'));

    expect(mockRequestRefresh).not.toHaveBeenCalled();
  });

  it('releases both subscriptions on unmount', () => {
    const view = render(<ListHarness />);
    act(() => mockList.emit?.([row()]));
    expect(mockListeners.size).toBe(1);

    view.unmount();

    // §M20.3: the DB query, the contacts listener and the AppState listener are all owned here.
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockListeners.size).toBe(0);
    expect(mockAppStateDisposed).toHaveBeenCalled();
  });
});

describe('the chat header', () => {
  it('re-titles itself when the saved name arrives', () => {
    const view = render(<HeaderHarness />);
    act(() => mockOne.emit?.([row()]));
    expect(view.getByText(NUMBER)).toBeTruthy();

    nameArrives([saved(PEER, 'Tusha')]);

    expect(view.getByText('Tusha')).toBeTruthy();
  });

  it('asks for a sweep when it opens on a peer it cannot name', () => {
    render(<HeaderHarness />);
    act(() => mockOne.emit?.([row()]));

    expect(mockRequestRefresh).toHaveBeenCalledWith([PEER], 'chat-open');
  });

  it('asks once per open, not once per message that lands in the chat', () => {
    render(<HeaderHarness />);
    act(() => mockOne.emit?.([row()]));
    act(() => mockOne.emit?.([row({ lastMessagePreview: 'and another' })]));
    act(() => mockOne.emit?.([row({ lastMessagePreview: 'and another' })]));

    const opens = mockRequestRefresh.mock.calls.filter(
      c => c[1] === 'chat-open',
    );
    expect(opens).toHaveLength(1);
  });

  it('releases the contacts listener on unmount', () => {
    const view = render(<HeaderHarness />);
    act(() => mockOne.emit?.([row()]));
    expect(mockListeners.size).toBe(1);

    view.unmount();

    expect(mockListeners.size).toBe(0);
  });
});
