/**
 * Top-level error boundary (§L2, §L16). Sits above the theme provider, so its
 * fallback is self-contained (uses RN useColorScheme, not the app theme) and
 * renders even if theming/i18n themselves fail. Errors are logged via the
 * redacted logger — never a raw console.
 */
import React from 'react';
import { View, Text, Pressable, useColorScheme } from 'react-native';
import { log } from '../core';

function Fallback({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  const bg = dark ? '#0A0A0B' : '#FFFFFF';
  const fg = dark ? '#F5F5F7' : '#0B0B0C';
  const sub = dark ? '#9A9AA1' : '#8A8A8E';
  const btnBg = dark ? '#FFFFFF' : '#0B0B0C';
  const btnFg = dark ? '#0B0B0C' : '#FFFFFF';
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Text
        style={{
          color: fg,
          fontSize: 22,
          fontWeight: '700',
          marginBottom: 8,
          textAlign: 'center',
        }}
      >
        Something went wrong
      </Text>
      <Text
        style={{
          color: sub,
          fontSize: 15,
          textAlign: 'center',
          marginBottom: 24,
          lineHeight: 22,
        }}
      >
        The app hit an unexpected error. You can try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={{
          backgroundColor: btnBg,
          borderRadius: 999,
          height: 52,
          paddingHorizontal: 32,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: btnFg, fontSize: 16, fontWeight: '600' }}>
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    log.error('render error boundary caught', {
      errorMessage: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? '',
    });
  }

  private reset = (): void => this.setState({ error: null });

  override render(): React.ReactNode {
    if (this.state.error) {
      return <Fallback onRetry={this.reset} />;
    }
    return this.props.children;
  }
}
