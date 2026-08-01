/**
 * Navigation param lists (§M17). Typed routes for the whole app.
 */
export type RootStackParamList = {
  Welcome: undefined;
  Notifications: undefined;
  SignIn: undefined;
  EnterPhone: undefined;
  ReverseOtp: undefined;
  AppTabs: undefined;
  Settings: undefined;
  Profile: undefined;
};

/** Bottom tabs (WhatsApp-parity): Chats · Updates · Communities · Calls.
 * Settings is NOT a tab — it opens from the home header. */
export type AppTabsParamList = {
  Chats: undefined;
  Updates: undefined;
  Communities: undefined;
  Calls: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
