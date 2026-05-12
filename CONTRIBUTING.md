# Contributing

## Development Flow

1. Read `AGENTS.md`, `docs/architecture.md`, `docs/execution-plan.md`, and `README.md`.
2. Keep each change small, scoped, reviewable, and reversible.
3. Use pnpm workspaces and the root scripts.
4. Update docs when behavior, schema, setup, security assumptions, or public contracts change.

## Pull Request Template

Every PR must include:

```md
## Objective

## Scope delivered

## Out of scope

## Tests run

## Security considerations

## Data/schema changes

## Known limitations
```

## Quality Checklist

Before requesting review, run:

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

## Financial Product Rules

Use language such as scenario, simulation, alert, priority, review required, and strategy mismatch. Do not frame app output as personalized financial advice or automatic buy/sell recommendations.
