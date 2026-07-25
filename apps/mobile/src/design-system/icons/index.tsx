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

/** Segmented story-ring + center dot — Updates (status). */
export function UpdatesIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle
        cx={12}
        cy={12}
        r={9}
        {...stroke(color, strokeWidth)}
        strokeDasharray="3 3.6"
      />
      <Circle cx={12} cy={12} r={3.4} fill={color} />
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

/** Camera — add/change a photo. */
export function CameraIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5l1.7-2.5h7.6L17.5 6H21a2 2 0 0 1 2 2z"
        {...stroke(color, strokeWidth)}
      />
      <Circle cx={12} cy={13} r={4} {...stroke(color, strokeWidth)} />
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

/** Crescent — appearance / dark mode. */
export function MoonIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Globe — language. */
export function GlobeIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} {...stroke(color, strokeWidth)} />
      <Path d="M2 12h20" {...stroke(color, strokeWidth)} />
      <Path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Shield — privacy & security. */
export function ShieldIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Bell — notifications. */
export function BellIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9z"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Info — help & about. */
export function InfoIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} {...stroke(color, strokeWidth)} />
      <Path d="M12 16v-4" {...stroke(color, strokeWidth)} />
      <Path d="M12 8h.01" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Log out. */
export function LogOutIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M16 17l5-5-5-5" {...stroke(color, strokeWidth)} />
      <Path d="M21 12H9" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Hard drive — storage management. */
export function StorageIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 12H2" {...stroke(color, strokeWidth)} />
      <Path
        d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M6 16h.01M10 16h.01" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Chevron right — row affordance. */
export function ChevronRightIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 18l6-6-6-6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}
