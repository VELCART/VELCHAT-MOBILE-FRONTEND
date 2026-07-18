/**
 * Navigation param lists (§M17). Typed routes for the whole app.
 */
export type RootStackParamList = {
  Welcome: undefined;
  EnterPhone: undefined;
  ReverseOtp: undefined;
  Notifications: undefined;
  AppTabs: undefined;
};

export type AppTabsParamList = {
  Chats: undefined;
  Calls: undefined;
  Settings: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
