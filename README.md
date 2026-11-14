# Decision Board

Decision Board is a hosted, multi-user investment-tracking app that can also be
self-hosted. It helps a person decide what to do with the month's contribution
and with the portfolio: AI proposals are scenarios backed by tested
calculations, and an approved proposal becomes an operation plan that the
person executes at their broker. The next import of B3 files checks what
actually happened.

It covers investments only. It is not a broker, trading system, or financial
advisor, and it never sends orders.

The product plan, execution units (P0–P9), and analysis requirements (R1–R12)
live in [docs/product-plan.md](docs/product-plan.md) and
[docs/analysis-requirements.md](docs/analysis-requirements.md). Module
boundaries are in [docs/architecture.md](docs/architecture.md).

## Principles

- Every number in an analysis comes from versioned, tested code in
  `packages/core`. The AI selects analyses and explains their results; it never
  produces the numbers.
- Every value carries its nature (informed, observed, or estimated), its
  source, and its date. Missing data is reported as missing or partial, never
  as zero.
- Every analysis result keeps its method and version, inputs, assumptions,
  sources, and what was not verified, so it can be reproduced.
- Positions come from files the person downloads from the B3 Investor Area;
  the monthly contribution cash is declared in the app. Manual entry is always
  available, and external providers are optional adapters.

## Current State

| Area | State |
| --- | --- |
| Analytic engine (`packages/core`) | R1 fixed-income simulation, R2 mark-to-market and duration, R3 correlation test, R7 concentration and allocation versus target, R8 goal projection versus realized, R11 AI safeguards, and R12 preferences as versioned strategy, tested with synthetic data. |
| API, web, reports, jobs | Still the previous vision's monthly contribution workspace, documented below. Execution unit P1 replaces it with B3 imports, the versioned strategy, and analyses stored from the engine. |
| AI proposals, CLI, B3 import | Not started; see the product plan. |

## Analytic Engine

`@decision-board/core` is pure TypeScript: no React, NestJS, Prisma, HTTP
providers, environment variables, or real clock. Callers pass explicit
inputs: the reference date, the business calendar when a method counts business
days, and a `Datum` with nature, source, and date for each piece of data with
provenance. Each analysis returns an `AnalysisResult` whose status is `complete`,
`partial`, or `inconclusive`, with method id and version, inputs, assumptions,
sources, natures, findings, and what was not verified.

| Module | Requirements |
| --- | --- |
| `calendar`, `provenance`, `series`, `units`, `analysis` | Shared contracts: business calendar with explicit coverage, sums and weights with coverage, monthly series alignment, decimal fractions, and the result envelope. |
| `fixed-income/` | R1 net value per candidate and rate scenario (252 business days, regressive IOF and income tax, custody), break-even rates, and the fixed-rate turning point; R2 mark-to-market, duration, and repricing. See its [README](packages/core/src/fixed-income/README.md). |
| `risk/` | R3 correlation, volatility, and risk contribution before and after a variable-income contribution, with rolling correlation and worst months. |
| `allocation/`, `contribution-allocation` | R7 concentration and allocation versus target bands and limits; R8 goal projection versus realized; whole-lot contribution scenarios. |
| `decisions/` | R11 AI safeguards (a claim counts as verified only when it cites a usable analysis of the method that supports it; otherwise it is flagged as an unverified opinion) and R12 preferences as a versioned strategy with a decision log. |

Each method ships the synthetic acceptance cases of its requirement sheet with
documented tolerances. The previous vision's portfolio functions
(`calculatePortfolioSummary`, `calculateAllocation`, and related helpers) remain
in `portfolio.ts` for the current API.

## Out Of Scope

- Spending, bank accounts, and credit cards.
- Brokerage order execution or brokerage order APIs.
- Automated login to B3, brokers, banks, or other financial accounts, and
  scraping of authenticated financial portals.
- Tax/legal conclusions, guaranteed returns, or prescriptive buy/sell advice.
- Mandatory paid market-data providers.

## Local Setup

```bash
corepack prepare pnpm@11.0.6 --activate
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Before starting the API, set `BETTER_AUTH_SECRET` in `.env` to a locally generated
value.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm coverage
pnpm build
```

API changes should also run the real smoke path documented in
[docs/testing.md](docs/testing.md):

```bash
pnpm smoke:api
```

When Prisma schema changes, also run:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:status
```

## Current API

The sections below document the API, jobs, and reports that exist today. They
belong to the previous vision's monthly contribution workspace and stay
accurate until P1 replaces them.

## API Authentication

The API uses Better Auth mounted under `/auth/*` with local e-mail/password for the MVP.
The first auth cut supports `/auth/sign-up/email`, `/auth/sign-in/email`,
`/auth/get-session`, and `/auth/sign-out`.

Application code should use the session helper output shape:

```json
{ "userId": "uuid", "email": "user@example.com" }
```

`GET /me` returns that shape for an authenticated session cookie and returns `401` without
a valid session.

Auth rate limiting and auth request protocol use the normalized Express proxy
context. Keep `TRUST_PROXY_HOPS=0` when the API is directly exposed, and set it
to the number of trusted reverse-proxy hops only when that proxy sanitizes
forwarded IP/protocol headers.

## API Portfolios

Portfolio endpoints require the Better Auth session cookie. They derive ownership from
the authenticated session and never accept `userId` in the request body or query.

```txt
POST   /portfolios
GET    /portfolios
GET    /portfolios/:portfolioId
PATCH  /portfolios/:portfolioId
DELETE /portfolios/:portfolioId
```

`POST /portfolios` accepts:

```json
{ "name": "Long term income", "baseCurrency": "BRL" }
```

`baseCurrency` is optional and defaults to `BRL`. `DELETE /portfolios/:portfolioId`
only deletes empty portfolios; portfolios with positions or cash accounts return `409`.

## API Assets

Asset endpoints require the Better Auth session cookie. Assets are global
canonical ticker/exchange/currency identities. User-provided name, type, risk
category, segment, and notes are stored as authenticated user overrides and
never accept `userId` in the request body or query.

```txt
POST  /assets
GET   /assets
GET   /assets/:assetId
PATCH /assets/:assetId/override
```

`POST /assets` accepts:

```json
{
  "ticker": "CYCR11",
  "name": "Cyrela Credit",
  "assetType": "FII",
  "riskCategory": "PAPER",
  "segment": "recebiveis",
  "currency": "BRL",
  "exchange": "B3"
}
```

`assetType` accepts `FII`, `STOCK`, `ETF`, `CASH`, or `OTHER`.
`riskCategory` accepts `BRICK`, `PAPER`, `HYBRID`, `CASH`, or `OTHER`.
Inputs are normalized to uppercase. Creating an asset ensures the canonical
ticker/exchange/currency identity exists with neutral global metadata, then
stores the submitted metadata as the authenticated user's override. Search supports
`GET /assets?ticker=CYCR` with optional `limit` from `1` to `100`, and returns
effective metadata with any user-specific override applied.

`PATCH /assets/:assetId/override` accepts `customName`, `customAssetType`,
`customSegment`, `customRiskCategory`, and `notes`. These fields affect only the
authenticated user's effective asset metadata.

## API Positions

Position endpoints require the Better Auth session cookie. They derive ownership
from the authenticated session and never accept `userId` in the request body or
query.

```txt
POST  /portfolios/:portfolioId/positions
GET   /portfolios/:portfolioId/positions
PATCH /positions/:positionId
```

`POST /portfolios/:portfolioId/positions` accepts:

```json
{
  "assetId": "uuid",
  "quantity": "10.5",
  "averagePrice": "90",
  "manualCurrentPrice": "100.25",
  "notes": "entrada manual"
}
```

`quantity` must be greater than zero. Decimal fields accept at most 12 whole
digits and 8 decimal places, matching the persisted `Decimal(20,8)` columns.
`averagePrice` and `manualCurrentPrice` are optional and must be non-negative
when provided. Until external price snapshots exist, `currentPrice` is
`manualCurrentPrice` and `totalValue` is `quantity * manualCurrentPrice`; both
are `null` when no manual current price is available.

## API Cash Accounts

Cash account endpoints require the Better Auth session cookie. They derive
ownership from the authenticated session and never accept `userId` in the
request body or query.

```txt
POST  /portfolios/:portfolioId/cash-accounts
GET   /portfolios/:portfolioId/cash-accounts
PATCH /cash-accounts/:cashAccountId
```

`POST /portfolios/:portfolioId/cash-accounts` accepts:

```json
{
  "name": "Reserva diaria",
  "type": "CDB",
  "balance": "1000.50",
  "liquidity": "D+0",
  "benchmark": "CDI",
  "benchmarkPercent": "100",
  "notes": "caixa operacional"
}
```

`balance` must be non-negative and accepts at most 12 whole digits and 8 decimal
places, matching the persisted `Decimal(20,8)` column. `benchmarkPercent` is
optional, non-negative, and accepts at most 6 whole digits and 4 decimal places,
matching `Decimal(10,4)`. Cash accounts are listed separately from positions and
count toward the `cash` allocation bucket in portfolio summary calculations.

## Strategy Engine

`@decision-board/strategies` exposes the five MVP strategies and
`evaluateStrategy(portfolio, strategy)`. The engine is deterministic and returns
review alerts such as strategy mismatches, exposure limits, cash minimums,
manual-review requirements, risk-checklist requirements, and report cadence. It
uses typed alert code/severity contracts from `@decision-board/types` and does
not generate automatic buy/sell instructions.

## Contribution Plans

Authenticated users can create recurring monthly contribution plans per
portfolio through the API. Plans store a positive planned amount, day of month,
start/end dates, active state, default strategy, and optional default cash
account. List responses include only active plans and expose the next expected
cycle date; automatic cycle creation remains out of scope.

## Contribution Cycles

Authenticated users can manually open monthly contribution cycles from an
existing plan, list cycles by portfolio, and confirm a contributed amount that
differs from the planned amount. Cycles track a bounded status, selected
strategy, optional notes, and remain scoped to the session user.

## Reports

`@decision-board/reports` can render deterministic Markdown and JSON reports
from the versioned MVP report envelope. Report output includes portfolio,
strategy, contribution, cash, positions, allocation, alerts, review policy, and
user notes, while omitting known sensitive field names from nested records.

The API exposes authenticated, non-persisted report exports for a portfolio:

```txt
POST /portfolios/:portfolioId/reports
GET /portfolios/:portfolioId/reports
GET /portfolios/:portfolioId/reports/current.json
GET /portfolios/:portfolioId/reports/current.md
GET /portfolios/:portfolioId/reports/:reportId.json
GET /portfolios/:portfolioId/reports/:reportId.md
```

These endpoints derive ownership from the Better Auth session cookie and return
`404` when the portfolio does not belong to the authenticated user. Report
exports avoid `userId`, account e-mail, cookies, session tokens, raw auth
payloads, and unnecessary internal resource IDs.

`current.*` routes generate the latest snapshot without persistence. `POST`
stores the current snapshot in the report history, `GET` lists saved report
metadata, and report-id routes return the saved JSON or Markdown content.

## Jobs

Set `JOBS_ENABLED=true` on exactly one API process to run pg-boss workers using
the existing `DATABASE_URL`. Jobs use Postgres only; Redis and external market
providers are not required.

The first jobs create monthly contribution cycles from active monthly plans and
mark confirmed cycles as report-due when the selected strategy cadence has
elapsed. Both jobs are idempotent: cycle creation is unique per plan/month, and
report-due markers are written once per cycle.

## Market Data

Manual market data is the baseline provider and does not require external API
tokens. Authenticated users can save their own manual price snapshots for a
global asset without changing another user's history.

```txt
POST /assets/:assetId/price-snapshots
POST /assets/:assetId/price-snapshots/refresh
GET  /assets/:assetId/price-snapshots
```

`POST /assets/:assetId/price-snapshots` accepts:

```json
{
  "price": "100.25",
  "currency": "BRL",
  "capturedAt": "2026-05-17T12:00:00.000Z"
}
```

`currency` is optional and defaults to the asset currency; when provided, it must
match that asset currency. `capturedAt` is optional and defaults to the current
server time. Responses never include `userId` or raw provider payloads.

`POST /assets/:assetId/price-snapshots/refresh` uses the optional configured
market-data provider. Set `MARKET_DATA_PROVIDER=brapi` to enable brapi refreshes;
`BRAPI_TOKEN` is optional only for brapi test tickers and should be configured
for production usage. `BRAPI_TIMEOUT_MS` defaults to 5000. Provider failures
return a clear API error and do not remove or overwrite existing manual
snapshots. Refreshes are rate-limited per user and asset, and provider payloads
are allowlisted before persistence.

## Security And Financial Boundaries

- Do not store broker credentials.
- Do not log tokens, cookies, session IDs, reset tokens, CPF, or raw auth payloads.
- User-owned resources must always be scoped by authenticated `userId`.
- Manual market data must remain available even when optional providers fail.
- Reports must not include secrets or unnecessary personal identifiers.
- B3 imports keep only normalized rows: the original file and personal
  identifiers (account, CPF, name) are discarded.
- The user's AI provider key is stored encrypted and stays out of logs and
  model context.
- Tests and fixtures use synthetic data only.
