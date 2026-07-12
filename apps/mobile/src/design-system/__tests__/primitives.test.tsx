/**
 * Design-system primitives + theme (§M16). Verifies rendering, theming, and
 * that the PillButton is an accessible, pressable control.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme';
import { Text, PillButton } from '../index';

function withTheme(node: React.ReactNode): React.JSX.Element {
  return <ThemeProvider initialMode="light">{node}</ThemeProvider>;
}

test('Text renders its content', () => {
  render(withTheme(<Text variant="display">Welcome</Text>));
  expect(screen.getByText('Welcome')).toBeOnTheScreen();
});

test('PillButton renders a label and fires onPress', () => {
  const onPress = jest.fn();
  render(withTheme(<PillButton label="Get started" onPress={onPress} />));
  const button = screen.getByRole('button', { name: 'Get started' });
  fireEvent.press(button);
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('PillButton disabled does not fire onPress', () => {
  const onPress = jest.fn();
  render(withTheme(<PillButton label="Disabled" onPress={onPress} disabled />));
  fireEvent.press(screen.getByRole('button', { name: 'Disabled' }));
  expect(onPress).not.toHaveBeenCalled();
});
