# Report Schema

**Status:** placeholder for MVP schema version `1.0`.

Reports are a core product output. Markdown and JSON reports must be generated from the same portfolio snapshot source.

## Minimum JSON Shape

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "string",
  "strategy": {},
  "contribution": {},
  "cash": {},
  "portfolio": {},
  "positions": [],
  "allocation": {},
  "alerts": [],
  "reviewPolicy": {},
  "userNotes": []
}
```

## Rules

- JSON reports must include `schemaVersion`.
- Breaking JSON report changes require a schema version bump.
- Reports must not include secrets, credentials, cookies, tokens, CPF, or raw auth payloads.
- Reports should avoid personal identifiers unless the schema explicitly requires them.
- Reports must include strategy, contribution, cash, positions, allocation, alerts, and review cadence.

## Markdown Report

`@decision-board/reports` exposes `generateMarkdownReport(report)`, a
deterministic Markdown renderer for the MVP envelope. It includes portfolio,
strategy, contribution, cash, positions, allocation, alerts, review policy, and
user notes sections.

The renderer omits known sensitive field names such as tokens, cookies, session
IDs, e-mails, CPF, raw auth payloads, and user IDs from nested records before
formatting the report.
