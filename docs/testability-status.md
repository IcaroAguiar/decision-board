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

The latest validated implementation baseline is commit `240411f`, merged
through GitHub PR
[#39](https://github.com/IcaroAguiar/decision-board/pull/39). Earlier
docs-only status refreshes do not unblock UI. PR-019B is the current local
authenticated report export cut and remains inside the pre-UI track until merged
and explicitly released.

## Latest Evidence Snapshot

| Evidence | Latest known result | Public-safe note |
| --- | ---: | --- |
| `pnpm coverage` | 109/109 tests, 94.96% lines, 78.09% branches, 98.24% functions | Local PR-019B evidence with synthetic env values and local Postgres. |
| `pnpm test` | Workspace passed; API 76/76 | API tests run against local Postgres where required. |
| `pnpm smoke:api` | Passed on ephemeral port `59600` | The exact port is runtime-assigned and not a contract; smoke now includes `report-json-export`. |
| GitHub `quality-gate` | Passed for PR #39 in 2m15s | Runs migrations, tests, coverage ratchet, smoke, and build. |
| GitGuardian | Passed for PR #39 | Remote secret scanning stayed green. |
| Local `gitleaks detect --redact` | No leaks found | Reports counts/status only, not secret values. |
| Local ratchet | Passed for PR-019B | Attestation updated after reviewer interpreted deterministic signals. |
| Independent review | Approved for PR-019B | Reviewer found no blocking findings; OpenAPI formal contract remains residual. |

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
| PR-017L | #25 | Published public-safe post-Phase 4 testability status. |
| PR-017M | #26 | Added focused `ContributionPlansService` coverage. |
| PR-017N | #27 | Added focused `cash-account.dto` validation coverage. |
| PR-017O | #28 | Added focused `position.dto` validation coverage. |
| PR-017P | #29 | Added focused `auth-http` pseudo-header regression coverage. |
| PR-017Q | #30 | Added focused `auth.logger` redaction coverage and a small payload-index cleanup. |
| PR-017R | #31 | Docs-only correction for post-PR #30 public status. |
| PR-017S | #32 | Docs-only correction for post-PR #31 public status. |
| PR-017T | #33 | Added focused `ContributionPlanRepository` update coverage. |
| PR-017V | #35 | Added focused `JobsService` worker registration coverage. |
| PR-017W | #36 | Added focused `CashAccountRepository` user-isolation coverage. |
| PR-017X | #37 | Added focused `PositionRepository` and `PositionsService` coverage. |
| PR-018 | #38 | Added deterministic Markdown report generation from the MVP report envelope. |
| PR-019A | #39 | Added deterministic sanitized JSON report generation and schema guards. |
| PR-019B | local branch | Adds authenticated JSON/Markdown report export endpoints with user isolation; PR pending. |

## Coverage Movement

The coverage track is not a substitute for behavioral proof, but it is now a
useful ratchet before UI work. Recent productive modules crossed the local
thresholds that motivated the post-Phase 4 pivot:

| Surface | Latest focused result |
| --- | ---: |
| `jobs.service.js` | 92.67% lines, 80.85% branches |
| `client-ip.js` | 100.00% lines, 100.00% branches |
| `asset.repository.js` | 97.66% lines, 70.00% branches |
| `cash-account.repository.js` | 92.98% lines, 64.71% branches |
| `contribution-plan.repository.js` | 86.91% lines, 78.72% branches |
| `contribution-cycle.repository.js` | 89.19% lines, 77.14% branches |
| `env.js` | 88.89% lines, 87.50% branches |
| `market-data.service.js` | 93.10% lines, 72.41% branches |
| `contribution-plans.service.js` | 93.18% lines, 83.93% branches |
| `cash-account.dto.js` | 100.00% lines, 100.00% branches |
| `position.dto.js` | 98.29% lines, 98.04% branches |
| `positions.service.js` | 98.46% lines, 76.67% branches |
| `reports/index.js` | 99.02% lines, 98.59% branches |
| `reports.service.js` | 99.54% lines, 55.77% branches |
| `reports.controller.js` | 98.25% lines, 73.68% branches |
| `auth-http.js` | 90.58% lines, 79.69% branches |
| `auth.logger.js` | 96.25% lines, 94.12% branches |

## Complexity Optimizer Triage

`complexity-optimizer` was rerun during the PR-019B local cut. The first-pass
scanner still reports many loop/query-in-loop leads in HTTP tests; these are
treated as test-harness leads, not product hot paths. The productive leads
manually checked in the recent passes were:

| Surface | Current read |
| --- | --- |
| `auth-http.ts` | Header copying and token redaction are linear over request/response size; pseudo-header filtering stays request-local and acceptable for the auth adapter path. |
| `auth.logger.ts` | URL payload redaction had a small constant-factor cleanup opportunity around fallback payload-index detection; PR-017Q covers that behavior with focused synthetic placeholder tests. |
| `contribution-cycles.service.ts` | Response mapping is expected O(n) list serialization. |
| `asset.dto.ts` | Enum map creation is startup/static validation work, not a request-scale nested scan. |
| `jobs.service.ts` | Worker registration is constant-size over two known queues; PR-017V tests the queue names and conservative worker options without changing runtime behavior. |

No broad production optimization is bundled into PR-019B. The productive
auth/report surfaces are sensitive enough that future performance refactors
should stay separate, behavior-preserving, and backed by focused tests.

## Public-Repo Fixture Safety

PR-017Q intentionally uses synthetic placeholder strings to test whether auth
log redaction removes token-like, e-mail-like, and callback-like payloads.
PR-017W uses synthetic users, portfolios, and cash-account labels to exercise
repository ownership. PR-017X uses synthetic users, portfolios, assets, and
positions to exercise repository ownership and service mapping. These fixtures
are not real credentials, cookies, session IDs, raw auth payloads, real
portfolio data, or real user data. PR-018 uses synthetic report values to test
Markdown formatting and sensitive-field omission. PR-019A extends the same
synthetic report fixtures to JSON generation, schema guards, and sensitive-field
omission. PR-019B uses synthetic users, assets, cash accounts, contribution data,
and report exports to prove auth, isolation, Markdown/JSON export, and omission
of `userId`, account e-mail, session, and token-like terms. Local
`gitleaks detect --redact` and independent review must stay green before each PR
is opened.

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
