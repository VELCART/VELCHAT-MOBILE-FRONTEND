/**
 * The composer's unbuilt controls must not pass for working ones (VC-059).
 *
 * Emoji, attach, camera and the mic are `noop` stubs, but they shipped indistinguishable from the
 * one control that IS wired: full opacity, `accessibilityRole="button"` with a real label, and a
 * press that dipped them to 0.6. A sighted user reads that as "I tapped it and the app is
 * broken"; TalkBack announces four buttons and gives no hint that three of them do nothing.
 *
 * What is pinned here is the TRUTHFULNESS of the controls, not their look. The product owner's
 * constraint is that the icons, sizes and positions do not move — whether an unbuilt control is
 * eventually hidden or visibly disabled is their call — so these tests also hold the box each
 * control occupies, to catch a well-meant "just dim them" as the visual change it would be.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../../../theme';
import { i18n } from '../../../../../i18n';
import { Composer } from '../Composer';

// A provider is required for `useSafeAreaInsets`; the values are the parent's business, not the
// composer's, so any stable set does.
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const onSend = jest.fn();
const onChangeText = jest.fn();

function renderComposer(value: string): void {
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider initialMode="light">
        <Composer
          value={value}
          onChangeText={onChangeText}
          onSend={onSend}
          keyboardUp={false}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const label = (key: string): string => i18n.t(key);

beforeEach(() => jest.clearAllMocks());

describe('the controls that are not built yet', () => {
  it.each(['chat.emoji', 'chat.attach', 'chat.camera'])(
    'announces %s as a disabled button rather than a working one',
    key => {
      renderComposer('');
      expect(screen.getByRole('button', { name: label(key) })).toBeDisabled();
    },
  );

  it('announces the mic as disabled while the field is empty', () => {
    renderComposer('');
    expect(
      screen.getByRole('button', { name: label('chat.voice') }),
    ).toBeDisabled();
  });

  it('answers a tap with nothing at all — no send, no text change', () => {
    renderComposer('');
    for (const key of [
      'chat.emoji',
      'chat.attach',
      'chat.camera',
      'chat.voice',
    ]) {
      fireEvent.press(screen.getByRole('button', { name: label(key) }));
    }
    expect(onSend).not.toHaveBeenCalled();
    expect(onChangeText).not.toHaveBeenCalled();
  });

  it('keeps exactly the box it had — telling the truth is not a redesign', () => {
    renderComposer('');
    for (const key of ['chat.emoji', 'chat.attach', 'chat.camera']) {
      const box = StyleSheet.flatten(
        screen.getByRole('button', { name: label(key) }).props.style,
      );
      expect(box).toMatchObject({ width: 34, height: 38 });
      // Not dimmed: a disabled control the user can still read is the product owner's call,
      // and they have not made it.
      expect(box.opacity ?? 1).toBe(1);
    }
  });
});

describe('the one control that is wired', () => {
  it('stays enabled and still sends', () => {
    renderComposer('see you at six');
    const send = screen.getByRole('button', { name: label('chat.send') });
    expect(send).not.toBeDisabled();
    fireEvent.press(send);
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
