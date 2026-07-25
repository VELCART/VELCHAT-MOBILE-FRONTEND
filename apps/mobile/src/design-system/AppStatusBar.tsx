/**
 * App-wide status bar (§M16/§M18). One theme-aware source of truth so the system
 * clock / network / battery icons stay legible on every screen, light OR dark:
 * dark icons on light themes, light icons on dark themes. Translucent + transparent
 * on Android so content can sit edge-to-edge (screens use SafeAreaView for the inset);
 * on iOS `barStyle` is what matters (the bar is always an overlay). Mount once at the
 * root; a screen may still mount its own <StatusBar> to override for a full-bleed hero.
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { useTheme } from '../theme';

export function AppStatusBar(): React.JSX.Element {
  const t = useTheme();
  return (
    <StatusBar
      barStyle={t.scheme === 'dark' ? 'light-content' : 'dark-content'}
      backgroundColor="transparent"
      translucent
    />
  );
}
