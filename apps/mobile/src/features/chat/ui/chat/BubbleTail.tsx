/**
 * The little curved spike on the first bubble of a run (§F2) — WhatsApp's own tail geometry,
 * not an approximation of it.
 *
 * WhatsApp does not round the corner a tail grows from; it squares that corner and hangs an
 * 8x13 curved triangle off it, filled in the bubble's own colour so the two read as one shape.
 * That is why this takes `color` rather than a token: it has to be EXACTLY the bubble's fill,
 * including the wallpaper's tint override, or the seam shows.
 *
 * The caller places it in the gutter its own margin leaves — see MessageBubble. Getting that
 * offset wrong by one tail-width is what made it look like a triangle floating beside each
 * message instead of part of it.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

export const TAIL_WIDTH = 8;
export const TAIL_HEIGHT = 13;

/** Hangs off the top-RIGHT corner — my messages. */
const OUT_PATH =
  'M1.533 3.568 8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568Z';
/** Hangs off the top-LEFT corner — theirs. Mirror of the above. */
const IN_PATH = 'M6.467 3.568 0 12.193V1h5.188c1.77 0 2.338 1.156 1.279 2.568Z';

export function BubbleTail({
  mine,
  color,
}: {
  mine: boolean;
  color: string;
}): React.JSX.Element {
  return (
    <Svg
      width={TAIL_WIDTH}
      height={TAIL_HEIGHT}
      viewBox={`0 0 ${TAIL_WIDTH} ${TAIL_HEIGHT}`}
    >
      <Path d={mine ? OUT_PATH : IN_PATH} fill={color} />
    </Svg>
  );
}
