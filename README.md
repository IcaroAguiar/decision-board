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
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm dev
```

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

## Security And Financial Boundaries

- Do not store broker credentials.
- Do not log tokens, cookies, session IDs, reset tokens, CPF, or raw auth payloads.
- User-owned resources must always be scoped by authenticated `userId`.
- Manual market data must remain available even when optional providers fail.
- Reports must not include secrets or unnecessary personal identifiers.
