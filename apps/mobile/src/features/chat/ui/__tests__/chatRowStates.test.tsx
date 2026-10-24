/**
 * What a chat-list row SHOWS about its own state (§F2).
 *
 * Three facts the row already had and did not draw: unread, pinned and muted. Each is
 * asserted here rather than on a device, because each is a property of the render and a
 * screenshot cannot tell a bold name from a regular one reliably.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../../theme';
import { ConversationRow } from '../ChatsList';

jest.mock('../../hooks/useConversationPeer', () => ({
  useConversationPeer: () => undefined,
}));
jest.mock('../../../user', () => ({ useContactAvatar: () => undefined }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

type RowProps = React.ComponentProps<typeof ConversationRow>;

const BASE: RowProps = {
  id: 'c1',
  name: 'Ada Lovelace',
  preview: 'see you at 6',
  time: '09:30',
  unreadCount: 0,
  pinned: false,
  muted: false,
  isDm: true,
  peerAvatarUrl: undefined,
  onOpen: () => undefined,
};

function show(over: Partial<RowProps> = {}): void {
  render(
    <ThemeProvider initialMode="light">
      <ConversationRow {...BASE} {...over} />
    </ThemeProvider>,
  );
}

/** The rendered style of a text node, flattened — RN gives arrays. */
function styleOf(node: {
  props: { style?: unknown };
}): Record<string, unknown> {
  const s = node.props.style;
  const parts = Array.isArray(s) ? s : [s];
  return Object.assign({}, ...parts.filter(Boolean)) as Record<string, unknown>;
}

describe('an unread row is marked by weight, not only by the badge', () => {
  it('draws the name heavier and the preview darker when unread', () => {
    show({ unreadCount: 3 });
    const unreadName = styleOf(screen.getByText('Ada Lovelace'));
    const unreadPreview = styleOf(screen.getByText('see you at 6'));
    screen.unmount();

    show({ unreadCount: 0 });
    const readName = styleOf(screen.getByText('Ada Lovelace'));
    const readPreview = styleOf(screen.getByText('see you at 6'));

    // Same family, one weight up — so marking a row never reflows the list.
    expect(unreadName.fontFamily).not.toBe(readName.fontFamily);
    expect(unreadName.fontSize).toBe(readName.fontSize);
    expect(unreadPreview.color).not.toBe(readPreview.color);
  });

  it('shows the count, and caps it rather than widening the row forever', () => {
    show({ unreadCount: 7 });
    expect(screen.getByText('7')).toBeTruthy();
    screen.unmount();

    show({ unreadCount: 1240 });
    expect(screen.getByText('99+')).toBeTruthy();
  });

  it('shows no badge at all at zero', () => {
    show({ unreadCount: 0 });
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('pinned and muted', () => {
  it('renders nothing extra for an ordinary row', () => {
    show();
    // Only the row itself is a button; no marks are drawn.
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('draws a mark when pinned, and another when muted', () => {
    const { UNSAFE_root: plain } = render(
      <ThemeProvider initialMode="light">
        <ConversationRow {...BASE} />
      </ThemeProvider>,
    );
    const plainSvgs = plain.findAllByType('RNSVGSvgView' as never).length;

    const { UNSAFE_root: marked } = render(
      <ThemeProvider initialMode="light">
        <ConversationRow {...BASE} pinned muted />
      </ThemeProvider>,
    );
    const markedSvgs = marked.findAllByType('RNSVGSvgView' as never).length;

    expect(markedSvgs).toBe(plainSvgs + 2);
  });

  it('keeps a muted conversation countable but quiet', () => {
    // The badge is the pill the count sits in: walk up from the number until a background
    // appears, rather than assuming how many views deep it is.
    const badgeFill = (muted: boolean): unknown => {
      const { unmount } = render(
        <ThemeProvider initialMode="light">
          <ConversationRow {...BASE} unreadCount={4} muted={muted} />
        </ThemeProvider>,
      );
      let node = screen.getByText('4').parent;
      let fill: unknown;
      while (node && fill === undefined) {
        fill = styleOf(node as never).backgroundColor;
        node = node.parent;
      }
      unmount();
      return fill;
    };

    const quiet = badgeFill(true);
    const loud = badgeFill(false);

    // Still a badge with the number in it — just not the one that shouts.
    expect(quiet).toBeDefined();
    expect(loud).toBeDefined();
    expect(quiet).not.toBe(loud);
  });
});
