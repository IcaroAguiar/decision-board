# Testing and Smoke Validation

Decision Board treats tests and smoke checks as public, reproducible evidence.
Do not put real portfolio data, real e-mail addresses, API tokens, cookies, or
credentials in fixtures, logs, screenshots, reports, or PR descriptions.

The current post-Phase 4 evidence snapshot is maintained in
[testability-status.md](testability-status.md).

## Test Levels

Use the lightest command while iterating, then run the broader gate before a PR
is considered ready.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
```

When API behavior depends on authentication, Postgres, jobs, or persisted user
data, run the command against a local Postgres instance with synthetic env vars:

```bash
DATABASE_URL="postgresql://decision_board:<local-password>@localhost:55432/decision_board?schema=public" \
BETTER_AUTH_URL="http://127.0.0.1:0" \
BETTER_AUTH_SECRET="test-secret-with-at-least-32-characters" \
WEB_ORIGIN="http://localhost:5173" \
pnpm test
```

The API integration tests start Nest on an ephemeral loopback port. Do not change
them to a fixed common port such as `3000`, `3001`, or `5173`.

## Coverage

Run coverage before UI work and before PRs that touch API, domain packages,
reports, strategies, providers, jobs, or quality-gate behavior:

```bash
DATABASE_URL="postgresql://decision_board:<local-password>@localhost:55432/decision_board?schema=public" \
BETTER_AUTH_URL="http://127.0.0.1:0" \
BETTER_AUTH_SECRET="test-secret-with-at-least-32-characters" \
WEB_ORIGIN="http://localhost:5173" \
pnpm coverage
```

The coverage command uses Node's native test coverage against compiled
JavaScript tests for `packages/*` and `apps/api`. It generates
`coverage/coverage-summary.json` for the quality ratchet and `coverage/lcov.info`
for detailed inspection. The current command intentionally excludes browser/UI
coverage because the pre-UI gate is backend/domain focused.

## API Smoke

Run the smoke when backend/API behavior changes or before starting UI work that
will depend on the current API contract.

```bash
DATABASE_URL="postgresql://decision_board:<local-password>@localhost:55432/decision_board?schema=public" \
BETTER_AUTH_URL="http://127.0.0.1:0" \
BETTER_AUTH_SECRET="test-secret-with-at-least-32-characters" \
WEB_ORIGIN="http://localhost:5173" \
pnpm smoke:api
```

The smoke starts the API on an ephemeral `127.0.0.1` port, signs up synthetic
users, creates a portfolio, asset, manual price snapshot, position, cash account,
contribution plan, and contribution cycle, confirms the cycle, exports the JSON
report endpoint, checks a cross-user access denial, and then cleans up the
synthetic users/assets it created.

The GitHub Actions quality gate runs this smoke after migrations and the test
suite. A PR that changes backend/API behavior should still run it locally before
opening the PR so failures are diagnosed with local logs and database access.

Expected output is a small JSON object:

```json
{
  "status": "pass",
  "journey": "api-authenticated-portfolio-smoke"
}
```

## Public Repo Safety

- Use only generated `example.test` e-mails and synthetic tickers in automated
  checks.
- Keep smoke output compact; do not print cookies, session tokens, auth payloads,
  raw provider responses, or database connection strings.
- If a smoke fails after creating data, rerun it after fixing the issue. The
  cleanup step deletes synthetic smoke users by e-mail prefix and the generated
  smoke asset ticker.
- Provider tokens remain optional. The API smoke uses the manual market-data
  provider path and does not call brapi or any external market-data API.
