# Contributing

Thanks for helping! This tool lives or dies by covering real-world Next.js build shapes, so bug reports with a repro — or even just a pasted `--json` output plus your Next.js version and bundler — are the most valuable contribution there is.

## Development setup

Requirements: Node.js ≥ 20, npm.

```bash
npm ci          # install
npm test        # unit tests (fast, run against synthetic .next trees)
npm run lint    # eslint + prettier
npm run typecheck
npm run build   # emits dist/
```

## Integration tests

Unit tests run against small hand-built `.next` trees. The integration suite runs against a **real** `next build` of the fixture app and is skipped until you build it:

```bash
npm run fixture:install   # installs next@latest into fixtures/basic-app
npm run fixture:build     # next build
npm test                  # now includes the integration + CLI tests
```

The fixture app ([fixtures/basic-app](./fixtures/basic-app)) has one route per scenario the auditor must classify: static + server-only var (the bug), static + `NEXT_PUBLIC_*`, dynamic + server-only var (fine), and static + allowlisted var. If you add a detection capability, add a route that exercises it.

CI runs the integration suite against both `next@latest` and `next@canary` (canary is allowed to fail — it's an early-warning signal, not a gate).

## Project layout

```
src/
  cli.ts               CLI entry (arg parsing, exit codes)
  audit.ts             orchestrates a run; public runAudit()/shouldFail()
  manifests.ts         .next manifest parsing, route classification,
                       server-chunk resolution (webpack + Turbopack)
  env-files.ts         .env* loading in Next's production precedence
  config.ts            allow/ignore/failOn config loading + validation
  checks/
    env-refs.ts        the scanning regexes (server + client variants)
    server-bake.ts     check 1: env reads in prerendered server code
    client-bake.ts     check 2: NEXT_PUBLIC_* in browser bundles
  report.ts            human-readable rendering
test/
  helpers.ts           synthetic .next tree builders
  *.test.ts            unit tests per module
  integration.test.ts  real-build assertions (skipped without the fixture)
```

## Guidelines

- TypeScript strict; keep `npm run lint && npm run typecheck && npm test` green.
- Zero runtime dependencies beyond `picocolors` — this is a deliberate constraint; propose anything new in an issue first.
- False positives are worse than false negatives: the default mode is report-only, and anything heuristic should degrade to `info`/`unverified` rather than guess.
- New findings/severities need both a unit test and, if the behavior depends on real build output, a fixture route.

## Releases

Maintainers: bump the version, update `CHANGELOG.md`, and `npm publish` — `prepublishOnly` runs the full gate.
