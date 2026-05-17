# Post-Phase 4 Testability Status

Status date: 2026-05-17

This document is public-repository safe. It records the pre-UI testability
gate for Decision Board without real portfolio data, real e-mail addresses,
tokens, cookies, session IDs, raw auth payloads, or production credentials.

## Current Decision

UI work remains blocked after Phase 4. The project is continuing through a
post-Phase 4 hardening track focused on:

- stronger coverage;
- real API smoke checks;
- quality-gate ratchets;
- independent review for material code changes;
- public-safe documentation;
- no fixed common API or frontend ports in tests.

The current validated baseline is commit `53566f7`, merged through GitHub PR
[#24](https://github.com/IcaroAguiar/decision-board/pull/24).

## Latest Evidence Snapshot

| Evidence | Latest known result | Public-safe note |
| --- | ---: | --- |
| `pnpm coverage` | 75/75 tests, 93.03% lines, 74.33% branches, 97.57% functions | Uses synthetic env values and local Postgres. |
| `pnpm test` | Workspace passed; API 48/48 | API tests run against local Postgres where required. |
| `pnpm smoke:api` | Passed on ephemeral port `49313` | The exact port is runtime-assigned and not a contract. |
| GitHub `quality-gate` | Passed for PR #24 in 2m15s | Runs migrations, tests, coverage ratchet, smoke, and build. |
| GitGuardian | Passed for PR #24 | Remote secret scanning stayed green. |
| Local `gitleaks detect --redact` | No leaks found | Reports counts/status only, not secret values. |
| Independent review | Finding resolved for PR #24 | Reviewer required proof that rate limit blocks before provider call. |

## Completed Post-Phase 4 Cuts

| Cut | GitHub PR | Result |
| --- | ---: | --- |
| PR-017A | #14 | Added real authenticated API smoke. |
| PR-017B | #15 | Added API smoke to the remote quality gate. |
| PR-017C | #16 | Added mandatory coverage baseline and ratchet. |
| PR-017D | #17 | Improved `JobsService` coverage and recorded complexity baseline. |
| PR-017E | #18 | Covered client IP normalization. |
| PR-017F | #19 | Covered `AssetRepository` isolation with real Postgres. |
| PR-017G | #20 | Covered additional `JobsService` worker/default paths. |
| PR-017H | #21 | Covered `ContributionPlanRepository`. |
| PR-017I | #22 | Covered `ContributionCycleRepository`. |
| PR-017J | #23 | Covered auth/env helpers. |
| PR-017K | #24 | Covered `MarketDataService` provider, fallback, and rate-limit branches. |

## Coverage Movement

The coverage track is not a substitute for behavioral proof, but it is now a
useful ratchet before UI work. Recent productive modules crossed the local
thresholds that motivated the post-Phase 4 pivot:

| Surface | Latest focused result |
| --- | ---: |
| `jobs.service.js` | 86.91% lines, 80.00% branches |
| `client-ip.js` | 100.00% lines, 100.00% branches |
| `asset.repository.js` | 97.66% lines, 70.00% branches |
| `contribution-plan.repository.js` | 86.91% lines, 75.00% branches |
| `contribution-cycle.repository.js` | 89.19% lines, 77.14% branches |
| `env.js` | 88.89% lines, 87.50% branches |
| `market-data.service.js` | 93.10% lines, 72.41% branches |

## Required Gate Before UI

Before starting the dashboard UI, keep this minimum evidence current:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
pnpm smoke:api
```

For commands that need Postgres or auth configuration, use synthetic local
values and placeholders as documented in [testing.md](testing.md). Do not put
real local secrets, production credentials, cookies, session IDs, or real
portfolio data in docs, fixtures, logs, PR descriptions, screenshots, or
reports.

## Port Policy

Tests and smoke checks should use ephemeral loopback ports, such as
`app.listen(0, "127.0.0.1")` or the existing smoke harness. Do not introduce
fixed common ports for API or frontend tests, including `3000`, `3001`, or
`5173`, unless the command is explicitly a user-started development server.

## Residual Risks

- A known `prisma:error` log still appears in an old `asset.repository` test
  that intentionally exercises a missing foreign-key path. The test passes and
  this is currently treated as controlled log noise.
- Browser/UI evidence is intentionally absent because UI remains blocked.
- Coverage uses compiled JavaScript output from Node's test runner, not
  TypeScript source maps.
- Optional external market-data providers remain non-mandatory. Core workflows
  must continue to work through manual market data.

## Next Safe Work

Continue only with small, reviewable cuts until the UI unblock decision is
explicit. Good candidates are:

- close remaining branch gaps in productive services when the behavior matters;
- add report-engine tests before implementing report persistence/API surfaces;
- document public-safe status and verification evidence after each merge;
- treat complexity findings as leads, not as automatic refactor work.
