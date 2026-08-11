# Production hardening notes

Operational notes for hosting Decision Board with reduced risk. Complements
[SECURITY.md](../SECURITY.md).

## HTTPS

In production, expose the API and web UI only over HTTPS.

- Set `BETTER_AUTH_URL` and `WEB_ORIGIN` to `https://…` public origins. The auth
  env helpers reject HTTP public origins when `NODE_ENV=production`.
- Terminate TLS at a reverse proxy (or platform TLS) in front of the Nest API.
- Keep cookies Secure (Better Auth enables secure cookies in production).
- Do not put the API on an open CORS origin; restrict to `WEB_ORIGIN`.

## Postgres backups

Self-hosting requires a backup routine before schema upgrades or production
cuts:

1. Prefer logical dumps (`pg_dump`) of the Decision Board database on a schedule
   that matches your recovery point objective.
2. Store dumps encrypted and off-host; test restore into an empty Postgres 17
   instance periodically.
3. Apply Prisma migrations only after a fresh backup; keep the migration history
   in git so restores can re-run `pnpm db:deploy`.
4. Document who can access backup storage; backups contain user e-mails and
   portfolio data and must be treated as sensitive.

Docker Compose in this repo is for local development. Production should use a
managed Postgres (or equivalent) with automated backups enabled.

## Already enforced in the API

- Auth route rate limiting (Better Auth + DB-backed limiter).
- External market-data provider refresh rate limiting.
- CORS from trusted origins (`WEB_ORIGIN` / `BETTER_AUTH_URL`).
- Helmet security headers on the Nest HTTP server.
- Auth log redaction (no tokens/cookies/passwords in logs).
