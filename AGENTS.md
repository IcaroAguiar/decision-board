# AGENTS.md

Guidance for automated agents working in this repository.

Canonical human setup, scripts, and API contracts live in `README.md`,
`CONTRIBUTING.md`, and `docs/testing.md`. Prefer those sources over copying
commands here.

## Cursor Cloud specific instructions

### Services

| Service | How to run | Notes |
| --- | --- | --- |
| PostgreSQL 17 | `docker compose up -d` | Host port **55432** (not 5432). Wait for healthy before Prisma/API. |
| API | `pnpm dev` (or filter `@decision-board/api`) | NestJS on **3001**. Requires `.env` with `BETTER_AUTH_SECRET` (≥32 chars). |
| Web | included in `pnpm dev` | Vite on **5173** (`host: 127.0.0.1`). No Vite proxy to the API. |

Jobs (`JOBS_ENABLED`) and brapi market data are optional; default manual market data needs no token. Redis is not used.

### Env and DB

- Copy `.env.example` → `.env` and generate `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) before starting the API.
- After Postgres is up: `pnpm db:generate` then `pnpm db:migrate` (see README). Prefer `pnpm db:deploy` when you only need to apply existing migrations non-interactively.
- `pnpm db:migrate` can prompt for a migration name if the schema drifted; do not run it unattended in that state.

### Lint / test / build

Root scripts in `package.json` / README: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm smoke:api`. API integration tests and smoke need Postgres + auth env vars (see `docs/testing.md`); they bind Nest to an ephemeral loopback port, not 3001.

### Web UI (prova de fluxo)

A app em `apps/web` é um **harness temporário** de prova de fluxo (não UX de
produto). Ver [docs/proof-harness.md](docs/proof-harness.md).

API calls usam `credentials: "include"` contra `WEB_ORIGIN`. Abra a UI em
`http://localhost:5173` (preferir `localhost` sobre `127.0.0.1` para o cookie
bater), defina a API como `http://localhost:3001`, faça sign-up/sign-in na
própria tela e selecione/crie um portfolio — sem colar UUID no caminho
principal.

### Docker in this environment

If `dockerd` is not already running, start it before `docker compose`. On Docker 29+, use `fuse-overlayfs` with `containerd-snapshotter` disabled and `iptables-legacy` (DinD constraints in Cloud Agent VMs).
