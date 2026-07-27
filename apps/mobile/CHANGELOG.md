# @velchat/mobile

## 0.4.0

### Minor Changes

- b889c55: Home shell + product polish. A swipeable 4-tab home (Chats / Updates / Communities / Calls) on a
  native pager with a WhatsApp-style shared header (VelChat wordmark, profile, search, a flight-mode
  offline toggle, and an overflow menu). A first-run profile-setup bottom sheet (name + about), a
  premium Settings screen (theme picker light/dark/system + persisted, language, account rows,
  sign-out), a crisp `react-native-svg` icon system, runtime permissions (camera/mic/contacts/
  bluetooth), a flight/offline mode with an offline banner + network gating, and a dev-only readable
  network trace in Metro. Onboarding polished (Welcome → Notifications → SignIn → phone/OTP sheet).

## 0.3.0

### Minor Changes

- c0ed9d8: MP1 auth (start): EnterPhone + Reverse-OTP verify screens (themed), the AuthMachine
  (`signed_out|onboarding|verifying|provisioning|active|locked|recovering`) as a Zustand store,
  the auth API layer over the axios client, and an Ed25519 device identity key (@noble, SPKI/DER
  public key at register; challenge signing) with a CSPRNG polyfill. Welcome now routes to the phone
  flow.

## 0.2.0

### Minor Changes

- 3ab5c3e: Networking layer (§M7/§L3): Axios API client with request interceptor (Bearer + tenant + request-id + client-version), response envelope-unwrap, single-flight 401 refresh, backoff retry + 429 Retry-After, and a typed `AppError`. Feature-flags loader moved off `fetch` to Axios.

## 0.1.0

### Minor Changes

- 34ef884: MBOOT-0 + MP0 foundation and onboarding.

  - Foundation: pnpm + Turborepo monorepo, RN 0.86 (New Arch/Hermes), strict TS, `eslint-plugin-boundaries` layer rules, no-AsyncStorage / no-console gates.
  - Design system: Poppins type scale, tokens, theme (light/dark + MMKV persistence), primitives, `FadeInUp` motion.
  - App shell: navigation (Welcome → Notifications → AppTabs), i18n (en + ar), observability (pino + PII redaction), feature-flags/kill-switch, bootstrap sequence.
  - Onboarding: Welcome (orbit hero) and Notifications (phone-mock hero) screens with staggered animations and floating pop-out pill CTAs.
  - Repo: husky + commitlint (Conventional Commits) + Changesets + Prettier + CI/release workflows.
