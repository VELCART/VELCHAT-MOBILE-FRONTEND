# VelChat — Mobile Frontend

> Private, end-to-end-encrypted chat for the people (and teams) who matter most.
> WhatsApp-parity + Slack/Teams-parity client for the VelChat backend — **React Native, iOS + Android**.

VelChat is **offline-first, worst-device-first, and measured**. Every screen renders from local
state; the network mutates a local store and the UI observes it. Perf, memory, and battery are
budgeted against a **3 GB RAM Android 10** reference device — flagships just run cooler.

---

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | React Native **0.86** (bare, New Architecture / Fabric / Hermes), TypeScript strict |
| Monorepo | **pnpm** workspaces + **Turborepo** (`node-linker=hoisted`) |
| Navigation | React Navigation — native-stack + swipeable material-top-tabs (native pager) |
| State | Zustand (in-memory) · WatermelonDB (local source of truth, MP2+) |
| Storage | Encrypted **MMKV** (no AsyncStorage — lint-enforced) |
| Networking | **Axios** client — envelope unwrap, single-flight 401 refresh, backoff, offline gating |
| Crypto | Ed25519 device identity (`@noble`), SPKI/DER pubkey, challenge signing |
| i18n | i18next (en · hi · ar/RTL), runtime switch + persisted |
| Icons / vectors | `react-native-svg` (hand-authored icon set) |
| Logging | pino (redaction pipeline) + a dev-only readable network trace in Metro |

New dependencies require an ADR under [`docs/adr/`](docs/adr) (locked stack, §M1).

---

## Getting started

**Prerequisites:** Node ≥ 22, pnpm ≥ 11, JDK 17, Android SDK 34–36 + NDK 27, a device/emulator.
_iOS is authored but built on macOS/CI only — never reported verified from this Windows setup._

```bash
pnpm install                 # from the repo root

# Dev flavor (localhost:8080 via adb reverse) — the default day-to-day build
pnpm android                 # build + install + launch (com.velchat.dev)
pnpm start                   # Metro, if not already running

# Other flavors (installed side-by-side — distinct app ids)
pnpm android:stage           # com.velchat.stage
pnpm android:prod            # com.velchat
```

> **Editing a `.env.<flavor>` file requires a full rebuild** — `react-native-config` bakes env
> values into the native binary at build time; a JS reload won't pick them up.

---

## Environments (build flavors)

Public, non-secret build config lives in `apps/mobile/.env.<flavor>`; the Android product flavor
selects the file (`build.gradle` → `envConfigFiles`).

| Flavor | App id | API base | Command |
| --- | --- | --- | --- |
| `dev` | `com.velchat.dev` | `http://localhost:8080` (adb reverse) | `pnpm android` |
| `stage` | `com.velchat.stage` | staging ingress (placeholder) | `pnpm android:stage` |
| `prod` | `com.velchat` | production ingress (placeholder) | `pnpm android:prod` |

---

## Project structure

```
apps/mobile/src/
  app/            # root: providers, boot, error boundary, splash
  navigation/     # RootNavigator, AppTabs (4 tabs), HomeHeader, TabBar, Settings
  features/       # feature slices — auth, user (ui/ model/ api/ hooks/); public via index.ts
  design-system/  # tokens, primitives, icons, BottomSheet, OtpInput (no business logic)
  infra/          # axios client, MMKV, crypto, native wrappers (permissions/network/battery)
  core/           # config/env, logger, feature flags, connectivity store
  theme/  i18n/  ui/
```

**Layer rule (§M3/§M4, ESLint-enforced):** `UI → Feature → Domain → Infra`, never the reverse.
Cross-cutting state (e.g. connectivity/offline) lives in `core` so both `infra` and UI can read it.

---

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm android` / `android:stage` / `android:prod` | Build + run a flavor |
| `pnpm start` | Metro bundler |
| `pnpm test` | Jest (Turbo) |
| `pnpm lint` · `pnpm typecheck` | ESLint · `tsc --noEmit` (Turbo) |
| `pnpm format` / `format:check` | Prettier |
| `pnpm changeset` | Record a release note for your change (see below) |

---

## Conventions

- **Commits:** Conventional Commits, enforced by commitlint (`feat(scope): lowercase subject`).
- **Hooks:** Husky runs lint + format on commit; commit messages are validated.
- **Quality gates:** `typecheck` + `lint` must be green before merge; TDD for feature/bugfix logic.
- **No `console.log`** in product paths (pino only) and **no plaintext PII/E2EE content** in logs/DB.

---

## Releases (Changesets → tag on `main`)

Versioning + tagging is automated with **Changesets** ([`.github/workflows/release.yml`](.github/workflows/release.yml)).
It's a **two-step** flow — add a changeset with your PR, then a bot handles the version + tag:

1. **With your feature branch**, record what changed:
   ```bash
   pnpm changeset          # pick the package + bump (patch/minor/major), write a one-line note
   ```
   Commit the generated `.changeset/*.md` file alongside your code.
2. **Merge your PR to `main`.** The Release workflow opens/refreshes a **“Version Packages”** PR
   that bumps versions + writes `CHANGELOG.md`.
3. **Merge the “Version Packages” PR.** The workflow cuts the **git tag** + GitHub Release
   (private app — no npm publish).

> If your org disables PR creation by `GITHUB_TOKEN`, set `RELEASE_GITHUB_TOKEN` (or
> `GH_RELEASE_TOKEN` / `GH_PAT`) to a bot PAT/GitHub App token with `contents` + `pull_requests`
> write access so the release workflow can open/update the version PR.

> If a merge to `main` produced no release, it's almost always because **no changeset was added** —
> Changesets only versions/tags when there are pending `.changeset/*.md` entries.

---

## Source-of-truth docs

- [`CLAUDE.md`](CLAUDE.md) — project guide + non-negotiables.
- [`VelChat-Mobile-Frontend-v1.md`](VelChat-Mobile-Frontend-v1.md) — HLD/LLD/flows/budgets.
- [`docs/backend-integration-reference.md`](docs/backend-integration-reference.md) — the real backend API contract.
- [`docs/design-direction.md`](docs/design-direction.md) — visual direction (light + dark).
- [`docs/adr/`](docs/adr) — architecture decision records (new dependencies land here).

---

_Private © VelChat. All rights reserved._
