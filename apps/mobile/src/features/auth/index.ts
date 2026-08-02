/**
 * features/auth — feature slice. Shape: ui/ model/ api/ hooks/ db/. Only this index is public.
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { WelcomeScreen } from './ui/WelcomeScreen';
export { NotificationsScreen } from './ui/NotificationsScreen';
export { SignInScreen } from './ui/SignInScreen';
export { EnterPhoneScreen } from './ui/EnterPhoneScreen';
export { ReverseOtpScreen } from './ui/ReverseOtpScreen';
export { useAuthStore } from './model/authStore';
export {
  useAuthBootstrap,
  useAccountInfo,
  useSessionWatch,
} from './hooks/useAuth';
