/**
 * design-system/ — tokens, primitives, atoms, molecules. NO business logic (§M16).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export * from './tokens';
export {
  Text,
  Screen,
  PillButton,
  Row,
  Column,
  Card,
  Divider,
} from './primitives';
export { FadeInUp } from './FadeInUp';
export { AppStatusBar } from './AppStatusBar';
export { BottomSheet } from './BottomSheet';
export { OtpInput } from './OtpInput';
export {
  ChatIcon,
  CallIcon,
  SettingsIcon,
  UpdatesIcon,
  CommunitiesIcon,
  UserIcon,
  CameraIcon,
  MoonIcon,
  GlobeIcon,
  ShieldIcon,
  BellIcon,
  InfoIcon,
  LogOutIcon,
  ChevronRightIcon,
  StorageIcon,
  SearchIcon,
  PlaneIcon,
  WifiIcon,
  WifiOffIcon,
  MoreIcon,
} from './icons';
export type { IconProps } from './icons';
