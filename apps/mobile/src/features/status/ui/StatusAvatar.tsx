/**
 * StatusAvatar component — compact, theme-aware contact avatar with status ring.
 * Supports:
 * - Unread status: vibrant theme accent ring.
 * - Viewed status: subtle hairline ring.
 * - Multi-segment ring for multiple status items (strokeDasharray).
 * - Compact '+' badge for Add Status.
 */
import React from 'react';
import { View, Image } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../../theme';
import { Text, UserIcon } from '../../../design-system';

const AVATAR_COLORS = [
  '#7C3AED',
  '#DB2777',
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0891B2',
  '#9333EA',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1)
    // eslint-disable-next-line no-bitwise
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? '#7C3AED';
}

export interface StatusAvatarProps {
  name: string;
  thumbnailPath?: string | undefined;
  statusCount?: number;
  isViewed?: boolean;
  isAdd?: boolean;
  size?: number;
}

export function StatusAvatar({
  name,
  thumbnailPath,
  statusCount = 1,
  isViewed = false,
  isAdd = false,
  size = 46,
}: StatusAvatarProps): React.JSX.Element {
  const t = useTheme();
  const initial = name.trim().charAt(0).toUpperCase();

  const strokeWidth = 2.2;
  const padding = 2.5;
  const totalSize = size + (padding + strokeWidth) * 2;
  const radius = (totalSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Segment dash calculation for multiple status updates
  const count = Math.max(1, statusCount);
  const gap = count > 1 ? 3.5 : 0;
  const segmentLength = (circumference - count * gap) / count;
  const strokeDasharray = `${segmentLength} ${gap}`;

  // Theme-aware ring color: brand accent / success for unread, hairline/tertiary for viewed
  const activeColor = t.scheme === 'dark' ? '#30D158' : '#25D366';
  const ringColor = isViewed ? t.colors.hairline : activeColor;
  const circleDashProps = count > 1 ? { strokeDasharray } : {};

  return (
    <View
      style={{
        width: totalSize,
        height: totalSize,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      {!isAdd ? (
        <Svg
          width={totalSize}
          height={totalSize}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <Circle
            cx={totalSize / 2}
            cy={totalSize / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            {...circleDashProps}
          />
        </Svg>
      ) : null}

      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: thumbnailPath
            ? t.colors.bgSubtle
            : avatarColor(name),
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {thumbnailPath ? (
          <Image
            source={{ uri: thumbnailPath }}
            style={{ width: size, height: size }}
            resizeMode="cover"
          />
        ) : initial ? (
          <Text
            variant="title"
            style={{ color: '#ffffff', fontSize: size * 0.42 }}
          >
            {initial}
          </Text>
        ) : (
          <UserIcon size={size * 0.5} color="#ffffff" strokeWidth={2} />
        )}
      </View>

      {isAdd ? (
        <View
          style={{
            position: 'absolute',
            bottom: 1,
            right: 1,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: activeColor,
            borderWidth: 2,
            borderColor: t.colors.bgBase,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            variant="label"
            style={{ color: '#ffffff', fontSize: 12, lineHeight: 14 }}
          >
            +
          </Text>
        </View>
      ) : null}
    </View>
  );
}
