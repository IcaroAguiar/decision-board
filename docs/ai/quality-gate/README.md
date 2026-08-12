# Agentic Quality Gate Ratchet (deprecated)

**Deprecated.** This generated ratchet (file-size limits, deterministic review
packet, attestation fingerprint, baseline refresh) is no longer part of CI.

Do not run `check-ratchet.mjs` or refresh `agentic-review-attestation.json` for
new PRs. Review and merge gates are:

- GitHub Actions **CI** (`.github/workflows/quality-gate.yml`): lint, typecheck,
  migrations, tests, coverage, `smoke:api`, build, gitleaks
- Human / Pullfrog review on the pull request

The scripts and `vendor/` collector remain in the tree only as historical
reference. They may be deleted in a later cleanup. They must not be wired back
into required checks.

The previous generator was
`agentic-code-review/scripts/generate-quality-gate-ratchet.mjs`.
