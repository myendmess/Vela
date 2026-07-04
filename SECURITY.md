# Security Policy

## Supported Versions

Only the `main` branch is supported — it is what the scheduled pipelines run
and what GitHub Pages serves.

## Reporting a Vulnerability

Please report vulnerabilities privately — **do not open a public issue** for
security problems.

- Email: **boujnanemohamed23@gmail.com** (subject: `[SECURITY] Market-Scan`)
- Or use GitHub's [private vulnerability reporting](https://github.com/myendmess/Market-Scan/security/advisories/new)
  if enabled on the repository.

This is a solo-maintained project: expect an acknowledgment within a few days
and a best-effort fix. Please include steps to reproduce and the potential
impact.

## Scope notes

- **No secrets live in this repository.** All API keys and OAuth tokens are
  GitHub Actions secrets. If you find a leaked credential anywhere in the code,
  the git history, a report, the dashboard, or a published video, that is the
  highest-priority report you can make.
- The pipelines only *read* from public market-data APIs and *write* to this
  repository and its own YouTube channel. There is no server, database, or
  user data anywhere in the system.
- Third-party services involved: Finnhub, Alpha Vantage, NASDAQ public charts
  API, Shotstack, YouTube Data API. Vulnerabilities in those platforms should
  be reported to them directly.
