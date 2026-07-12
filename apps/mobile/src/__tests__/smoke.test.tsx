/**
 * Test-infra smoke: proves jest + @react-native/jest-preset + @testing-library/react-native
 * render a component and that RTL's Jest matchers are registered. (MBOOT-0.7)
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

test('RTL renders a react-native component', () => {
  render(<Text>VelChat</Text>);
  expect(screen.getByText('VelChat')).toBeOnTheScreen();
});
