---
'@velchat/mobile': minor
---

MBOOT-0 + MP0 foundation and onboarding.

- Foundation: pnpm + Turborepo monorepo, RN 0.86 (New Arch/Hermes), strict TS, `eslint-plugin-boundaries` layer rules, no-AsyncStorage / no-console gates.
- Design system: Poppins type scale, tokens, theme (light/dark + MMKV persistence), primitives, `FadeInUp` motion.
- App shell: navigation (Welcome → Notifications → AppTabs), i18n (en + ar), observability (pino + PII redaction), feature-flags/kill-switch, bootstrap sequence.
- Onboarding: Welcome (orbit hero) and Notifications (phone-mock hero) screens with staggered animations and floating pop-out pill CTAs.
- Repo: husky + commitlint (Conventional Commits) + Changesets + Prettier + CI/release workflows.
