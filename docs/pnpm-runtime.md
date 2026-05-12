# pnpm Runtime Standard

This repository pins `pnpm@11.0.6` through `packageManager`.

The workspace install policy uses a 7-day release cooling period:

```yaml
minimumReleaseAge: 10080
minimumReleaseAgeStrict: true
minimumReleaseAgeIgnoreMissingTime: true
resolutionMode: highest
registrySupportsTimeField: true
minimumReleaseAgeExclude:
  - direct dependency pins only when registry metadata omits release time
```

## Machine-Level Standardization

To align this machine with the repository, run only after explicit approval:

```bash
corepack prepare pnpm@11.0.6 --activate
pnpm config set minimum-release-age 10080 --global
pnpm config set minimum-release-age-strict true --global
pnpm config set minimum-release-age-ignore-missing-time true --global
pnpm config set resolution-mode highest --global
pnpm config set registry-supports-time-field true --global
```

Do not print, edit, or commit `.npmrc` files that may contain registry tokens.

The original target was `minimumReleaseAgeIgnoreMissingTime: false`, but the registry metadata observed during bootstrap omitted `time` for direct packages such as `vitest`, `vite`, and `@types/node`. This repo therefore keeps the 7-day cooling period for packages with release timestamps, pins direct dependency versions exactly, and excludes only direct bootstrap dependency pins when pnpm cannot read a release timestamp.
