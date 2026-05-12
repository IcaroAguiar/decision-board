# Security Policy

## Supported Versions

The project is in early MVP development. Security fixes target the current default branch until the first stable release is published.

## Reporting A Vulnerability

Please do not open public issues for suspected vulnerabilities.

Report privately to the project maintainer with:

- affected version or commit;
- reproduction steps;
- impact summary;
- whether any sensitive data may be exposed.

Do not include secrets, real portfolio data, credentials, cookies, tokens, CPF, or production database contents in the report.

## Security Boundaries

Decision Board must never:

- store broker credentials;
- automate login to B3, brokers, banks, or authenticated financial portals;
- scrape authenticated financial accounts;
- expose user-owned resources without session-derived `userId` scoping;
- log auth payloads, tokens, cookies, session IDs, reset tokens, or sensitive personal data.
