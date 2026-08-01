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

/** Clock — timestamps (last login). */
export function ClockIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke(color, strokeWidth)} />
      <Path d="M12 7v5l3 2" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Calendar — dates (member since). */
export function CalendarIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M4 9h16M8 3v4M16 3v4" {...stroke(color, strokeWidth)} />
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

/** Scan frame — QR / code scanner. */
export function ScanIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7V5a1 1 0 0 1 1-1h2" {...stroke(color, strokeWidth)} />
      <Path d="M17 4h2a1 1 0 0 1 1 1v2" {...stroke(color, strokeWidth)} />
      <Path d="M20 17v2a1 1 0 0 1-1 1h-2" {...stroke(color, strokeWidth)} />
      <Path d="M7 20H5a1 1 0 0 1-1-1v-2" {...stroke(color, strokeWidth)} />
      <Path d="M4 12h16" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Pencil — edit. */
export function EditIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 20h9" {...stroke(color, strokeWidth)} />
      <Path
        d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Magnifier — search. */
export function SearchIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={7} {...stroke(color, strokeWidth)} />
      <Path d="M21 21l-4.35-4.35" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Paper plane — flight / offline toggle. */
export function PlaneIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Download tray with a down arrow — Updates. */
export function DownloadIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M7 10l5 5 5-5" {...stroke(color, strokeWidth)} />
      <Path d="M12 15V3" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Envelope — mail. */
export function MailIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M22 6l-10 7L2 6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Video camera — meetings / calls. */
export function VideoIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M23 7l-7 5 7 5V7z" {...stroke(color, strokeWidth)} />
      <Path
        d="M3 5h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"
        {...stroke(color, strokeWidth)}
      />
    </Svg>
  );
}

/** Wi-Fi — connected / online. */
export function WifiIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M1.42 9a16 16 0 0 1 21.16 0" {...stroke(color, strokeWidth)} />
      <Path d="M5 12.55a11 11 0 0 1 14.08 0" {...stroke(color, strokeWidth)} />
      <Path d="M8.53 16.11a6 6 0 0 1 6.95 0" {...stroke(color, strokeWidth)} />
      <Path d="M12 20h.01" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Wi-Fi with a slash — offline / flight mode. */
export function WifiOffIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M1.42 9a16 16 0 0 1 21.16 0" {...stroke(color, strokeWidth)} />
      <Path d="M5 12.55a11 11 0 0 1 14.08 0" {...stroke(color, strokeWidth)} />
      <Path d="M8.53 16.11a6 6 0 0 1 6.95 0" {...stroke(color, strokeWidth)} />
      <Path d="M12 20h.01" {...stroke(color, strokeWidth)} />
      <Path d="M3 3l18 18" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}

/** Three vertical dots — overflow menu. */
export function MoreIcon({
  size = 24,
  color = '#000',
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={5} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={19} r={1.6} fill={color} />
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

/** Trash — remove / delete. */
export function TrashIcon({
  size = 24,
  color = '#000',
  strokeWidth = 2,
}: IconProps): React.JSX.Element {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 6h18" {...stroke(color, strokeWidth)} />
      <Path
        d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
        {...stroke(color, strokeWidth)}
      />
      <Path d="M10 11v6M14 11v6" {...stroke(color, strokeWidth)} />
    </Svg>
  );
}
