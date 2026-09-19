/**
 * A conversation switch on a LIVE chat screen must start clean (VC-064).
 *
 * The notification deep link is `velchat://chat/:conversationId` → a NAVIGATE to `Chat`. When the
 * screen already on top IS `Chat`, the stack router matches the current route by name, keeps its
 * key and swaps only `route.params` (StackRouter, 'NAVIGATE'), so nothing is remounted. The hooks
 * were never the problem — they all re-run on the id. The screen's own `useState`/`useRef` were:
 * the composer went on holding the previous chat's words while `send` was already bound to the
 * new peer, so one tap put a private message in front of the wrong person. VC-053 fixed the
 * header on this same entry point, which is what proves the path is real and exercised.
 *
 * These tests drive exactly that: one element, new params. The last one is the counterweight —
 * a re-render that is NOT a conversation switch must leave a half-typed message alone.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { ThemeProvider } from '../../../../theme';
import { i18n } from '../../../../i18n';

const mockSendText = jest.fn();

let mockParams: { conversationId: string; name?: string } = {
  conversationId: 'conv-a',
  name: 'Ada',
};

// Lazy `mock`-prefixed wrappers: `jest.mock` is hoisted above everything above, so a factory that
// closed over these directly would capture `undefined` — and babel only lets a factory reach out
// to a name that announces itself as a mock.
function mockCurrentRoute(): { params: typeof mockParams } {
  return { params: mockParams };
}
function mockHeaderStub(props: {
  conversationId: string;
  name: string | undefined;
}): React.JSX.Element {
  return <Text>{`${props.conversationId}/${props.name ?? ''}`}</Text>;
}

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: () => undefined }),
  useRoute: () => mockCurrentRoute(),
}));
// The thread's data, identity and presence are hooks with their own suites; what is under test
// here is the screen's own state, so they are stood still and the header is a stub that simply
// reports the params it was handed.
jest.mock('../chat/ChatHeader', () => ({
  ChatHeader: (props: { conversationId: string; name: string | undefined }) =>
    mockHeaderStub(props),
}));
jest.mock('../../hooks/useMessages', () => ({
  useMessages: () => ({
    messages: [],
    meId: 'me-1',
    loadOlder: () => undefined,
  }),
  useSendMessage: (id: string) => (text: string) => mockSendText(id, text),
  useRetrySend: () => () => undefined,
}));
jest.mock('../../hooks/useTyping', () => ({
  useTyping: () => ({
    notifyTyping: () => undefined,
    stopTyping: () => undefined,
  }),
}));
jest.mock('../../hooks/useConversationIdentity', () => ({
  useConversationIdentity: () => ({
    peerId: undefined,
    peerAvatarUrl: undefined,
    name: undefined,
    wallpaper: 'plain',
  }),
}));
jest.mock('../../api/setChatWallpaper', () => ({
  setChatWallpaper: () => Promise.resolve(),
}));

import { ChatScreen } from '../ChatScreen';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const PLACEHOLDER = i18n.t('chat.messagePlaceholder');
const JUMP = i18n.t('chat.jumpToLatest');

function tree(): React.JSX.Element {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialMode="light">
        <ChatScreen />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** What the deep link does to a mounted screen: same element, different params. */
function tapNotificationFor(conversationId: string, name: string): void {
  mockParams = { conversationId, name };
  screen.rerender(tree());
}

function composer(): ReturnType<typeof screen.getByPlaceholderText> {
  return screen.getByPlaceholderText(PLACEHOLDER);
}

/** The reader is well up in A's history — far enough that the jump-to-latest FAB is showing. */
function scrollUpIntoHistory(): void {
  fireEvent.scroll(screen.UNSAFE_getByType(FlashList), {
    nativeEvent: {
      contentOffset: { x: 0, y: 400 },
      contentSize: { width: 390, height: 4000 },
      layoutMeasurement: { width: 390, height: 700 },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { conversationId: 'conv-a', name: 'Ada' };
});

describe('opening another chat from a notification', () => {
  it('does not carry the draft into the new conversation', () => {
    render(tree());
    fireEvent.changeText(composer(), 'meet me at six');

    tapNotificationFor('conv-b', 'Grace');

    // A draft belongs to the chat it was written in.
    expect(composer().props.value).toBe('');
  });

  it('cannot send the previous chat’s words to the new peer', () => {
    render(tree());
    fireEvent.changeText(composer(), 'meet me at six');

    tapNotificationFor('conv-b', 'Grace');
    // The thumb is already over the button; before the fix it was a SEND arrow bound to B.
    const primary =
      screen.queryByRole('button', { name: i18n.t('chat.send') }) ??
      screen.getByRole('button', { name: i18n.t('chat.voice') });
    fireEvent.press(primary);

    expect(mockSendText).not.toHaveBeenCalled();
  });

  it('lands the new conversation at the bottom, not where the old one was left', () => {
    render(tree());
    scrollUpIntoHistory();
    expect(screen.getByRole('button', { name: JUMP })).toBeOnTheScreen();

    tapNotificationFor('conv-b', 'Grace');

    // The FAB is the visible half of the scroll state; the offset it is driven from is the same
    // ref that decides whether a new message is followed, so a stale one silently disables
    // auto-follow in a chat the user has never scrolled.
    expect(screen.queryByRole('button', { name: JUMP })).toBeNull();
  });

  it('still hands the header the conversation it was sent to', () => {
    render(tree());

    tapNotificationFor('conv-b', 'Grace');

    expect(screen.getByText('conv-b/Grace')).toBeOnTheScreen();
  });
});

describe('a re-render that is not a conversation switch', () => {
  it('leaves a half-typed message alone', () => {
    render(tree());
    fireEvent.changeText(composer(), 'half a sent');

    // A fresh params OBJECT for the SAME conversation — what `setParams` and an ordinary parent
    // re-render both produce. Resetting on that would wipe the draft while the user types.
    mockParams = { conversationId: 'conv-a', name: 'Ada' };
    screen.rerender(tree());

    expect(composer().props.value).toBe('half a sent');
  });
});
