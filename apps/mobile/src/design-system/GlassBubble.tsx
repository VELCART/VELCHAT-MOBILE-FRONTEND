/**
 * GlassBubble — a translucent glossy "water droplet / bubble" disc (§M16). A radial
 * white sheen fading to near-transparent, a bright specular highlight up-left, and a
 * light rim — so a button placed over a dark scrim reads as premium frosted glass.
 * SVG lives in the design-system (ADR-0001); callers overlay their content on top.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Defs,
  RadialGradient,
  Stop,
  Circle,
  Ellipse,
} from 'react-native-svg';

export function GlassBubble({
  size = 64,
}: {
  size?: number;
}): React.JSX.Element {
  // Unique gradient ids per instance so two bubbles never share a <Defs> id.
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const fillId = `gbFill${uid}`;
  const specId = `gbSpec${uid}`;
  const r = size / 2 - 0.75;
  return (
    <Svg
      width={size}
      height={size}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id={fillId} cx="36%" cy="26%" r="80%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.34} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.08} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.02} />
        </RadialGradient>
        <RadialGradient id={specId} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={`url(#${fillId})`}
        stroke="rgba(255,255,255,0.45)"
        strokeWidth={1.1}
      />
      <Ellipse
        cx={size * 0.34}
        cy={size * 0.27}
        rx={size * 0.17}
        ry={size * 0.1}
        fill={`url(#${specId})`}
      />
    </Svg>
  );
}
