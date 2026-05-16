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

## Security And Financial Boundaries

- Do not store broker credentials.
- Do not log tokens, cookies, session IDs, reset tokens, CPF, or raw auth payloads.
- User-owned resources must always be scoped by authenticated `userId`.
- Manual market data must remain available even when optional providers fail.
- Reports must not include secrets or unnecessary personal identifiers.
