/**
 * navigation/ — stacks, tabs, linking, guards (§M17).
 *
 * Public API barrel. Import this layer only through its index (`eslint-plugin-boundaries`).
 * Dependency rule (§M3): UI → Feature → Domain → Infra. Never the reverse.
 */
export { RootNavigator } from './RootNavigator';
export type { RootStackParamList, AppTabsParamList } from './types';
