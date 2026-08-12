# Security Policy

## Supported Versions

The project is in early MVP development. Security fixes target the current default branch until the first stable release is published.

## Reporting A Vulnerability

Please do not open public issues for suspected vulnerabilities.

Report privately to the project maintainer with:

- affected version or commit;
- reproduction steps;
- impact summary;
- whether any sensitive data may be exposed.

Do not include secrets, real portfolio data, credentials, cookies, tokens, CPF, or production database contents in the report.

## Security Boundaries

Decision Board must never:

- store broker credentials;
- automate login to B3, brokers, banks, or authenticated financial portals;
- scrape authenticated financial accounts;
- expose user-owned resources without session-derived `userId` scoping;
- log auth payloads, tokens, cookies, session IDs, reset tokens, or sensitive personal data.

## Production baseline

See [docs/production-hardening.md](docs/production-hardening.md) for HTTPS and
Postgres backup expectations. The API enables Helmet security headers, CORS
restricted to trusted web origins, auth and provider refresh rate limits, and
auth log redaction.

Dependency and static-analysis hygiene for this public repository:

- Dependabot updates for npm and GitHub Actions (`.github/dependabot.yml`)
- CodeQL analysis for TypeScript (`.github/workflows/codeql.yml`)
- CI for lint, typecheck, tests, coverage, smoke, and build
  (`.github/workflows/quality-gate.yml`). The generated agentic ratchet under
  `docs/ai/quality-gate/` is deprecated and is not a merge gate.

OpenSSF Scorecard is not enabled yet (optional for this cut; revisit if the
project needs public scorecard badges or fork-safe scorecard tokens).
