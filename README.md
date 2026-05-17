# Decision Board

Decision Board is an open source, self-hostable portfolio dashboard for monthly contribution planning, strategy-based allocation review, and structured report generation.

It is not a broker, trading system, financial advisor, or automated recommendation engine. The application organizes user-owned data, applies explicit strategy rules, emits review alerts, and generates Markdown/JSON snapshots for human or external AI analysis.

## MVP Scope

- Multi-user authentication with Better Auth.
- Manual portfolio, asset, position, cash account, and contribution planning workflows.
- Deterministic strategy evaluation.
- Manual market-data provider as the baseline, with optional provider adapters.
- Markdown and JSON reports generated from the same snapshot source.
- PostgreSQL-backed self-hosting with Docker Compose.

## Out Of Scope

- Brokerage order execution.
- B3, broker, bank, or authenticated financial portal scraping.
- Automated third-party financial account login.
- Tax/legal conclusions.
- Guaranteed returns or prescriptive financial advice.
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
pnpm build
```

When Prisma schema changes, also run:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:status
```

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

## Security And Financial Boundaries

- Do not store broker credentials.
- Do not log tokens, cookies, session IDs, reset tokens, CPF, or raw auth payloads.
- User-owned resources must always be scoped by authenticated `userId`.
- Manual market data must remain available even when optional providers fail.
- Reports must not include secrets or unnecessary personal identifiers.
