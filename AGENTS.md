# AGENTS.md

Operational rules for AI agents in this repo. Canonical human setup, scripts,
and API contracts live in `README.md`, `CONTRIBUTING.md`, and `docs/testing.md`;
prefer those sources over copying commands here.

## References by task

- `docs/product-plan.md` for the product vision and the execution units (P0–P9)
- `docs/analysis-requirements.md` when implementing or changing an analysis (R1–R12)
- `docs/plan/2026-11-10-fontes-de-dados.md` when touching data sources, B3 import, or market-data collection
- `docs/architecture.md` when changing module ownership or architecture
- `docs/testing.md` when selecting checks for a behavior change
- `docs/report-schema.md` when touching reports
- `docs/pnpm-runtime.md` when touching tooling or installs
- `docs/execution-plan.md` is the previous vision's plan, kept as history

## Product boundaries

- Decision Board is a hosted, multi-user investment-tracking app that can also be self-hosted. It covers investments only; spending, bank accounts, and credit cards are out of scope.
- It is not a broker, trading system, or financial advisor. AI proposals are scenarios backed by computed analyses; the person approves them, and an approved proposal becomes an operation plan the person executes outside the product.
- Use wording like `scenario`, `simulation`, `proposal`, `operation plan`, `alert`, `review required`, or `strategy mismatch`.
- Never add automatic order execution, brokerage order APIs, guaranteed return/tax claims, or prescriptive buy/sell language.
- Every number in an analysis comes from tested code in `packages/core`; the AI selects analyses and explains their results.
- Every value carries its nature (informed, observed, or estimated), its source, and its date. Missing data is reported as missing or partial, never as zero.
- Positions come from files the person downloads from the B3 Investor Area; the monthly contribution cash is declared in the app.
- Manual data entry must always remain available; external providers are optional adapters, never mandatory core dependencies.
- Tests and fixtures use synthetic data only. No real financial values enter the repository.

## Security non-negotiables

- Never store or log broker credentials, tokens, cookies, session IDs, passwords, CPF, reset tokens, or raw auth payloads.
- Never automate login to B3, brokers, banks, or other financial accounts.
- Never scrape authenticated financial portals.
- Never expose internal user IDs in exported reports unless the schema/docs explicitly require it.
- Any user-owned read/write must derive ownership from the authenticated session `userId`; never accept `userId` from body or query.
- Any endpoint returning user data must require authentication.
- Any upload endpoint must enforce size, type, and parsing safeguards. B3 imports keep only normalized rows: discard the original file and personal identifiers (account, CPF, name).
- Never silently overwrite manual prices with provider data unless the user explicitly refreshes or enabled that behavior.
- The user's AI provider key is stored encrypted and stays out of logs and model context.

## Auth rules

- Better Auth is the primary auth layer.
- Do not add Passport, custom JWT auth, or another auth stack without an approved architecture update.
- Use secure cookie practices appropriate for the environment.
- Production requires HTTPS.
- Auth and other sensitive endpoints must be rate-limited.

## Data provider rules

- Optional providers such as brapi must be configured through environment variables or user-owned config.
- If a provider or a public-data collection fails, preserve existing data and show a clear error or a stale-source marker.
- Respect each source's license and terms; never collect from pages that forbid automated collection.
- Provider tokens belong only in env/config, never in payloads, logs, fixtures, or exported reports.
- Keep provider interfaces isolated from report generation and core domain logic.

## Architecture and database

- `packages/core` stays pure domain logic only and must not depend on React, NestJS, Prisma, Better Auth, HTTP providers, environment variables, or the real clock; callers pass the reference date.
- `packages/reports` generates Markdown/JSON from the same stored result and must not fetch market data directly.
- `packages/market-data` owns provider interfaces and adapters.
- `apps/api` orchestrates persistence, auth, providers, and domain packages.
- Use Prisma migrations for schema changes.
- Do not edit production data manually in migrations unless absolutely required and documented.
- Do not use raw SQL unless justified in the PR and covered by tests.
- Repositories for user-owned data must receive `userId` explicitly.

## Reporting and schema

- JSON reports must include `schemaVersion`; breaking changes require a version bump.
- Reports must exclude secrets, credentials, and unnecessary personal identifiers.
- Keep report content aligned with `docs/report-schema.md`.

## Testing and verification

- Run the smallest checks that cover the changed behavior. Broaden only when shared dependencies, failures, or unresolved risks require more coverage. For documentation-only edits, verify the changed facts and references.
- Use the applicable sections of `docs/testing.md` for lint, typecheck, test, build, coverage, smoke, and Postgres-backed validation.
- Each analysis method ships the synthetic acceptance cases of its requirement sheet, with known answers and documented tolerances.
- If schema or auth changes, run the relevant migration and smoke checks described there.
- If report behavior changes, run the report fixtures/tests.
- Run user-isolation tests when changing how a module reads, writes, or authorizes access to user-owned data.

## Environment and setup

- Use pnpm; keep the repo aligned with `docs/pnpm-runtime.md`.
- Never commit real `.env` files.
- Update `.env.example` when adding required environment variables.

### Local services

| Service | How to run | Notes |
| --- | --- | --- |
| PostgreSQL 17 | `docker compose up -d` | Host port **55432** (not 5432). Wait for healthy before Prisma/API. |
| API | `pnpm dev` (or filter `@decision-board/api`) | NestJS on **3001**. Requires `.env` with `BETTER_AUTH_SECRET` (≥32 chars). |
| Web | included in `pnpm dev` | Vite on **5173** (`host: 127.0.0.1`). No Vite proxy to the API. |

Jobs (`JOBS_ENABLED`) and brapi market data are optional; default manual market data needs no token. Redis is not used.

- Copy `.env.example` → `.env` and generate `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) before starting the API.
- After Postgres is up: `pnpm db:generate` then `pnpm db:migrate` (see README). Prefer `pnpm db:deploy` when you only need to apply existing migrations non-interactively.
- `pnpm db:migrate` can prompt for a migration name if the schema drifted; do not run it unattended in that state.
- API integration tests and smoke need Postgres + auth env vars (see `docs/testing.md`); they bind Nest to an ephemeral loopback port, not 3001.

### Web UI auth caveat

The current web app (`apps/web`) is the previous vision's monthly contribution workspace and has **no login UI**. API calls use `credentials: "include"` against `WEB_ORIGIN`. For browser E2E, sign in first via `POST /auth/sign-in/email` (or sign-up) so the `better-auth.session_token` cookie is set for the API host, then open the UI on **`http://localhost:5173`** (prefer `localhost` over `127.0.0.1` so the cookie host matches). Set the API field to `http://localhost:3001` and paste a portfolio UUID owned by that session.

### Docker in cloud agent VMs

If `dockerd` is not already running, start it before `docker compose`. On Docker 29+, use `fuse-overlayfs` with `containerd-snapshotter` disabled and `iptables-legacy` (DinD constraints in Cloud Agent VMs).

## PR hygiene

- Keep changes small, reversible, and scoped to one intent.
- Do not bundle unrelated work.
- Update docs whenever behavior, schema, setup, or security assumptions change.
- If a behavior change is not documented, the task is incomplete.
- Use the product name Decision Board.

## When uncertain

- Make the smallest safe change.
- Ask for clarification if the risk or contract is unclear.
- Prefer documented trade-offs over silent weakening of security, privacy, or financial-safety boundaries.
