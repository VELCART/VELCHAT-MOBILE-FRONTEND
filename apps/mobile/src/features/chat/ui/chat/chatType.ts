/**
 * The thread's typeface (§F2, §M16).
 *
 * The app sets Poppins everywhere through the `Text` primitive, and that is right for the
 * chrome. A message thread is the one place it is wrong: Poppins is a geometric display face
 * with a tall x-height and wide counters, and at 16sp over many short lines it reads as a poster
 * rather than as conversation. WhatsApp uses the PLATFORM face — Roboto on Android, SF Pro on
 * iOS — which is what the owner asked for, and it is also the face the keyboard, the share sheet
 * and every autocorrect popover above the composer are already drawn in.
 *
 * `undefined` on iOS is deliberate: naming a family there opts out of the system's dynamic
 * optical sizing. Android needs the family named, because RN's default there is whatever the
 * `Text` primitive last set.
 */
import { Platform } from 'react-native';

export const CHAT_FONT: string | undefined = Platform.select({
  android: 'sans-serif',
  default: undefined,
});

/** The medium weight of the same face — quote authors, the composer's reply title. */
export const CHAT_FONT_MEDIUM: string | undefined = Platform.select({
  android: 'sans-serif-medium',
  default: undefined,
});

/** Body metrics, WhatsApp's own. */
export const CHAT_BODY_SIZE = 16;
export const CHAT_BODY_LINE = 21;
/** Timestamp + ticks. */
export const CHAT_META_SIZE = 11;
export const CHAT_META_LINE = 15;
