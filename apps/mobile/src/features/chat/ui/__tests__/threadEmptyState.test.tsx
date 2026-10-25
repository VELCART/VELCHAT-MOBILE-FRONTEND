/**
 * A chat must never claim to be empty before it has looked.
 *
 * `useMessages` starts its window as `[]`, so an empty state rendered on the message count
 * alone says "no messages yet" for one emission on EVERY chat open — including a conversation
 * with years of history. That is what was reported from the device: open any chat and the
 * first thing on screen is a message saying there is nothing in it.
 *
 * The chat LIST already had this answer (`useConversations.loaded`); the thread did not. These
 * tests pin both halves: silent until the first emission, and honest after it.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../../theme';
import { i18n } from '../../../../i18n';
// Safe above the mocks: babel hoists every `jest.mock` call above the imports, so the screen
// is evaluated with the doubles already in place.
import { ChatScreen } from '../ChatScreen';

interface MessagesState {
  messages: unknown[];
  meId: string;
  loadOlder: () => void;
  atOldest: boolean;
  loaded: boolean;
}

let mockMessages: MessagesState = {
  messages: [],
  meId: 'me-1',
  loadOlder: () => undefined,
  atOldest: false,
  loaded: false,
};

function mockHeaderStub(): React.JSX.Element {
  return <Text>header</Text>;
}

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: () => undefined }),
  useRoute: () => ({ params: { conversationId: 'c1', name: 'Ada' } }),
}));
jest.mock('../chat/ChatHeader', () => ({ ChatHeader: () => mockHeaderStub() }));
jest.mock('../../hooks/useMessages', () => ({
  useMessages: () => mockMessages,
  useSendMessage: () => () => undefined,
  useRetrySend: () => () => undefined,
}));
jest.mock('../../hooks/useTyping', () => ({
  useTyping: () => ({
    notifyTyping: () => undefined,
    stopTyping: () => undefined,
  }),
}));
jest.mock('../../hooks/useConversationTyping', () => ({
  useConversationTyping: () => false,
}));
jest.mock('../../hooks/useQuoteSource', () => ({
  useQuoteSource: () => new Map(),
}));
jest.mock('../../hooks/useMessageActions', () => ({
  useMessageActions: () => ({
    target: null,
    visible: false,
    open: () => undefined,
    close: () => undefined,
    copy: () => undefined,
    remove: () => undefined,
  }),
}));
jest.mock('../../hooks/useConversationIdentity', () => ({
  useConversationIdentity: () => ({
    peerId: undefined,
    peerAvatarUrl: undefined,
    name: undefined,
    wallpaper: 'plain',
    resolved: true,
  }),
}));
jest.mock('../../api/setChatWallpaper', () => ({
  setChatWallpaper: () => Promise.resolve(),
}));

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function show(state: Partial<MessagesState>): void {
  mockMessages = {
    messages: [],
    meId: 'me-1',
    loadOlder: () => undefined,
    atOldest: false,
    loaded: false,
    ...state,
  };
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialMode="light">
        <ChatScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

/**
 * The list is a host stub under Jest (see `jest.setup.ts`), so it renders none of its props.
 * The contract is therefore asserted where it actually lives — on the prop itself: is the
 * screen OFFERING an empty state, or not? That is the decision the bug was in.
 */
function offersEmptyState(): boolean {
  const list = screen.UNSAFE_getByType(FlashList);
  return list.props.ListEmptyComponent != null;
}

describe('the thread does not claim to be empty before it has looked', () => {
  it('offers no empty state before the first database emission', () => {
    show({ loaded: false, messages: [] });
    expect(offersEmptyState()).toBe(false);
  });

  it('offers one once it HAS looked and there is genuinely nothing', () => {
    show({ loaded: true, messages: [] });
    expect(offersEmptyState()).toBe(true);
  });

  it('renders the real copy in that empty state, not a blank view', () => {
    show({ loaded: true, messages: [] });
    const node = screen.UNSAFE_getByType(FlashList).props
      .ListEmptyComponent as React.ReactElement;
    render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ThemeProvider initialMode="light">{node}</ThemeProvider>
      </SafeAreaProvider>,
    );
    expect(screen.getByText(i18n.t('chat.threadEmpty'))).toBeOnTheScreen();
  });
});
