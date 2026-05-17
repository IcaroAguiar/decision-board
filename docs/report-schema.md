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

## JSON Report

`@decision-board/reports` exposes:

```txt
REPORT_SCHEMA_VERSION
REPORT_JSON_SCHEMA
generateJsonReport(report)
validateJsonReport(value)
```

`generateJsonReport(report)` returns a deterministic, versioned copy of the MVP
envelope. Nested object keys are sorted, `Date` values are serialized as ISO
strings, non-finite numbers become `null`, and known sensitive field names are
omitted before the JSON payload is returned.

`validateJsonReport(value)` validates the minimum MVP envelope shape locally.
It is a lightweight guard for the package boundary; API endpoint validation can
add a full JSON Schema validator in a later cut.

## Markdown Report

`@decision-board/reports` exposes `generateMarkdownReport(report)`, a
deterministic Markdown renderer for the MVP envelope. It includes portfolio,
strategy, contribution, cash, positions, allocation, alerts, review policy, and
user notes sections.

The renderer reuses the same sanitization path as `generateJsonReport(report)`,
so known sensitive field names such as tokens, cookies, session IDs, e-mails,
CPF, raw auth payloads, and user IDs are omitted from nested records before
formatting the report.
