# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) — the source of truth for
versioning, changelogs, and git tags.

- Add one for any releasable change: `pnpm changeset` → pick a bump (patch/minor/major) → write a
  one-line summary. Commit the generated `.changeset/*.md`.
- On merge to `main`, CI (`.github/workflows/release.yml`) runs `changeset version` (bumps versions,
  writes `CHANGELOG.md`), opens a "Version Packages" PR, and on its merge tags the release.
- Docs/chore-only changes don't need a changeset.

Packages are private (`privatePackages: { version, tag }`) — we version + tag but never npm-publish.
