/**
 * Active-tab state (§M17). The custom TabBar knows which tab is focused (it holds the
 * pager state); the shared HomeHeader — rendered ABOVE the pager — reads this to swap
 * its title + action icons per tab. A tiny cross-cutting store (core) so both the
 * navigation TabBar and the header can share it without prop-drilling through the pager.
 */
import { create } from 'zustand';

/** The four home tabs (§M17). Typed so a mistyped comparison (`'Communites'`) is a
 * compile error instead of a silently-dead header branch. */
export type TabName = 'Chats' | 'Updates' | 'Communities' | 'Calls';

interface ActiveTabState {
  readonly name: TabName;
  setName: (name: TabName) => void;
}

export const useActiveTab = create<ActiveTabState>(set => ({
  name: 'Chats',
  setName: name => set({ name }),
}));
