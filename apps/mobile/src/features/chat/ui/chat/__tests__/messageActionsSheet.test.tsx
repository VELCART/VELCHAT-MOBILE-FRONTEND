/**
 * The hold-a-message sheet (§F2) — what a user is offered when they long-press a bubble.
 *
 * Three things are pinned here, and all three are the kind that ship broken and stay broken:
 *
 * 1. Copy is HIDDEN, not disabled, when the bubble has no text. A greyed-out "Copy" on a
 *    photo-only message is an invitation to tap something that can never work, and TalkBack
 *    reads it out either way.
 * 2. Delete is marked destructive and SAYS it is local. "Delete" on your own message reads as
 *    unsend; it is not one — there is no delete-for-everyone route yet — and a user who
 *    believes otherwise has leaked the message they thought they pulled back.
 * 3. Every row clears the 44dp minimum target (§M18). A list of 32dp rows on a 3 GB phone is
 *    the single most common a11y regression in a sheet like this.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../../../theme';
import { i18n } from '../../../../../i18n';
import { hitSlop, palette } from '../../../../../design-system';
import { MessageActionsSheet } from '../MessageActionsSheet';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const onClose = jest.fn();
const onReply = jest.fn();
const onCopy = jest.fn();
const onDelete = jest.fn();

function show(
  over: Partial<{ visible: boolean; mine: boolean; canCopy: boolean }> = {},
): void {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialMode="light">
        <MessageActionsSheet
          visible={over.visible ?? true}
          mine={over.mine ?? false}
          canCopy={over.canCopy ?? true}
          onClose={onClose}
          onReply={onReply}
          onCopy={onCopy}
          onDelete={onDelete}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const label = (key: string): string => i18n.t(key);

beforeEach(() => jest.clearAllMocks());

describe('what the sheet offers', () => {
  it('lists reply, copy and delete, in that order', () => {
    show();
    // The scrim is a button too — BottomSheet labels it so TalkBack does not announce a
    // screen-sized unnamed element before the sheet's own rows. It is the sheet's chrome,
    // not one of its actions, so it is filtered out rather than asserted on here.
    const names = screen
      .getAllByRole('button')
      .map(b => b.props.accessibilityLabel as string)
      .filter(n => n !== label('common.close'));

    expect(names).toEqual([
      label('chat.actions.reply'),
      label('chat.actions.copy'),
      label('chat.actions.delete'),
    ]);
  });

  it('hides Copy entirely when the message has nothing to copy', () => {
    show({ canCopy: false });

    expect(
      screen.queryByRole('button', { name: label('chat.actions.copy') }),
    ).toBeNull();
    // ...and the other two are untouched.
    expect(
      screen.getByRole('button', { name: label('chat.actions.reply') }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: label('chat.actions.delete') }),
    ).toBeTruthy();
  });

  it('draws nothing at all while hidden', () => {
    show({ visible: false });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('delete is destructive, and local', () => {
  it('paints the delete label in the danger colour', () => {
    show();
    const text = screen.getByText(label('chat.actions.delete'));

    expect(StyleSheet.flatten(text.props.style).color).toBe(
      palette.light.danger,
    );
  });

  it('says in words that it only removes the message from this device', () => {
    show({ mine: false });
    expect(screen.getByText(label('chat.actions.deleteHint'))).toBeTruthy();
  });

  it('warns on YOUR OWN message that the other person still sees it', () => {
    show({ mine: true });
    expect(screen.getByText(label('chat.actions.deleteHintMine'))).toBeTruthy();
  });
});

describe('accessibility', () => {
  it.each(['chat.actions.reply', 'chat.actions.copy', 'chat.actions.delete'])(
    '%s is a real button with a label',
    key => {
      show();
      expect(screen.getByRole('button', { name: label(key) })).toBeTruthy();
    },
  );

  it.each(['chat.actions.reply', 'chat.actions.copy', 'chat.actions.delete'])(
    '%s clears the 44dp minimum touch target',
    key => {
      show();
      const row = screen.getByRole('button', { name: label(key) });
      const style = StyleSheet.flatten(row.props.style) as {
        minHeight?: number;
      };

      expect(style.minHeight).toBeGreaterThanOrEqual(hitSlop.minTarget);
    },
  );
});

describe('pressing a row', () => {
  it('fires reply and dismisses', () => {
    show();
    fireEvent.press(
      screen.getByRole('button', { name: label('chat.actions.reply') }),
    );

    expect(onReply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires copy and dismisses', () => {
    show();
    fireEvent.press(
      screen.getByRole('button', { name: label('chat.actions.copy') }),
    );

    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires delete and dismisses', () => {
    show();
    fireEvent.press(
      screen.getByRole('button', { name: label('chat.actions.delete') }),
    );

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('never fires an action the user did not press', () => {
    show();
    fireEvent.press(
      screen.getByRole('button', { name: label('chat.actions.reply') }),
    );

    expect(onCopy).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
