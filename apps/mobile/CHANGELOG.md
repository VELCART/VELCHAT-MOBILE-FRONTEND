# @velchat/mobile

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
