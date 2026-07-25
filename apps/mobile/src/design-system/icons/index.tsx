/**
 * Icon system (§M16, ADR-0001) — crisp, scalable vector icons on react-native-svg.
 * Stroke-outline style, resolution-independent, identical on iOS + Android. Each icon
 * takes { size, color, strokeWidth } so callers (tab bar, rows, headers) drive weight
 * and colour from theme tokens. Add new icons here, never import the library directly.
 */
import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function stroke(color: string, strokeWidth: number) {
  return {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
}

/** Speech bubble — Chats. */
export function ChatIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Phone handset — Calls. */
export function CallIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Concentric status ring — Updates. */
export function UpdatesIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke(color, strokeWidth)} />
      <Circle cx={12} cy={12} r={3.25} fill={color} />
    </Svg>
  );
}

/** Two people — Communities. */
export function CommunitiesIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
        {...stroke(color, strokeWidth)}
      />
      <Circle cx={9} cy={7} r={4} {...stroke(color, strokeWidth)} />
      <Path d="M23 21v-2a4 4 0 0 0-3-3.87" {...stroke(color, strokeWidth)} />
      <Path d="M16 3.13a4 4 0 0 1 0 7.75" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Single person — avatar placeholder / profile. */
export function UserIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M20 21v-1a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5v1"
        {...stroke(color, strokeWidth)}
      />
      <Circle cx={12} cy={8} r={4.5} {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Gear — Settings. */
export function SettingsIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
        {...stroke(color, strokeWidth)}
      />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}
