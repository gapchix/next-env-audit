# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-12

Initial release.

### Added

- **Server-bake check**: statically prerendered routes (App Router; Pages
  Router best-effort) whose compiled server code reads non-public
  `process.env` vars — with severity escalation when the var is unset in the
  audit environment, and softened severities for ISR routes.
- **Client-bake check**: `NEXT_PUBLIC_*` values inlined into client chunks,
  plus references that survived the build and are `undefined` in the browser.
- Per-route attribution on both webpack and Turbopack build output, including
  Turbopack's thin route entries and process-polyfill rewrites.
- Report-only CLI with `--json`, `--fail-on`, and `--config`; programmatic API
  (`runAudit`, `shouldFail`, `renderReport`).
- Configuration via `next-env-audit.config.json`, `.nextenvauditrc.json`, or a
  `nextEnvAudit` package.json key: `allow` (with reasons), `ignore`, `failOn`,
  all with `*` wildcard support.
- Fixture Next.js app reproducing the original incident, wired into an
  integration test suite that runs against `next@latest` and `next@canary`.

[Unreleased]: https://github.com/gapchix/next-env-audit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gapchix/next-env-audit/releases/tag/v0.1.0
