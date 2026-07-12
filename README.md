# next-env-audit

[![CI](https://github.com/gapchix/next-env-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/gapchix/next-env-audit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

**Postbuild auditor for Next.js: finds env var values silently baked into — or missing from — your statically prerendered routes and client bundles.**

Your build was green. Your prod pages are empty. Here's why.

## The war story

A production site fetched its content from a headless CMS. The CMS routes were fully static — server components with no dynamic APIs, so Next.js prerendered them at build time. The CMS token was configured as a **runtime** secret, so during `next build` it simply wasn't there.

Result: every CMS page prerendered **empty**. No error, no warning, no failed build. The pipeline was green, the deploy went out, and the pages served nothing until someone noticed. The fix was one line (`export const dynamic = 'force-dynamic'`) — but nothing in the toolchain could have pointed at it.

`next-env-audit` is that missing check. Run it right after `next build` and it tells you which prerendered routes read env vars that were frozen (or absent) at build time, and which `NEXT_PUBLIC_*` values got inlined into your client bundles.

## Quickstart

```bash
next build
npx next-env-audit
```

Output for a build with exactly this bug:

```
next-env-audit v0.1.0
audited /path/to/app/.next — 6 routes, 5 prerendered

server bake · env vars read by statically prerendered routes

  ✖  /static-secret reads CMS_TOKEN — not set in the audit environment
     If it was also unset when `next build` ran, this route was prerendered with missing
     data — while the build stayed green.
     fix: `export const dynamic = 'force-dynamic'`, set CMS_TOKEN at build time,
     or allowlist it in next-env-audit.config.json if the bake is intentional.

  ⚠  /posts/[slug] reads POSTS_SOURCE_URL — value frozen at build time
     Whatever value the variable had at build time is baked into the prerendered page.
     Rotating or changing it does not update this route without a rebuild.

client bake · NEXT_PUBLIC_* values in browser bundles

  ⚠  NEXT_PUBLIC_MISSING_FLAG referenced in 1 client chunk but never inlined
     Not set at build time, so nothing was inlined — the reference is undefined in
     the browser.

  ℹ  NEXT_PUBLIC_API_URL = "https://api.fixture.example" — inlined into 1 chunk
     Frozen into this build artifact: promoting the same build to another environment
     carries this value along.

allowlisted
  ✓  /static-allowlisted · BUILD_INFO — intentional build-time stamp

1 error · 2 warnings · 1 info · 1 allowlisted
report-only mode — pass --fail-on server-bake,client-bake to gate CI
```

That report is real — it's what the tool prints for [the fixture app](./fixtures/basic-app) in this repo, which reproduces the incident.

## What it checks

### 1. Server bake — the "green build, empty page" class

Statically prerendered routes (`○` in your build output) whose compiled server code reads non-public `process.env.*` vars. Those reads happened **once, at build time**; the result is frozen into the prerendered HTML/RSC payload.

- Var unset at audit time → **error**: the route was most likely prerendered with missing data.
- Var set at audit time → **warning**: the value is baked in; rotating it won't update the route without a rebuild.
- ISR routes are softened (warning/info): revalidation re-reads the env at runtime, so they self-heal.

### 2. Client bake — the "build once, deploy many" trap

What actually happened to your `NEXT_PUBLIC_*` vars in the browser bundles:

- **Inlined** values found in chunks — frozen into this artifact; promoting the same build across environments carries them along.
- **Referenced but never inlined** — the var was unset when `next build` ran (or accessed dynamically, which Next.js never inlines); it is `undefined` in the browser.

Works with both **webpack and Turbopack** build output — including Turbopack's process-polyfill rewrites that hide surviving references from a naive `process.env` grep.

## Usage

```
next-env-audit [dir] [options]

  dir                  project directory containing .next (default: cwd)

  --json               machine-readable output
  --fail-on <checks>   comma-separated: server-bake, client-bake, or all —
                       exit 1 when those checks produce warnings or errors
  --config <path>      explicit config file path
```

Default is **report-only** (exit 0). Opt into failing your pipeline:

```yaml
# ci.yml — run in the same job/environment as the build,
# so the audit sees the env the build saw
- run: npx next build
- run: npx next-env-audit --fail-on server-bake
```

Exit codes: `0` clean or report-only · `1` failing findings · `2` audit error (e.g. no `.next` directory).

### Programmatic API

```ts
import { runAudit, shouldFail } from 'next-env-audit';

const result = runAudit({ dir: './my-app' });
for (const finding of result.findings) console.log(finding.message);
if (shouldFail(result, ['server-bake'])) process.exit(1);
```

## Configuration

`next-env-audit.config.json` (or `.nextenvauditrc.json`, or a `nextEnvAudit` key in `package.json`):

```jsonc
{
  // Intentional bakes: reported as allowlisted, never fail the build.
  "allow": [
    {
      "route": "/static-allowlisted",
      "var": "BUILD_INFO",
      "reason": "intentional build-time stamp",
    },
    { "var": "SENTRY_RELEASE" }, // no route → matches everywhere, including client-bake findings
  ],
  // Ignore entirely (on top of the built-in framework list). Supports "*".
  "ignore": ["DEBUG", "CUSTOM_TELEMETRY_*"],
  // Default checks to fail on when --fail-on is not passed.
  "failOn": ["server-bake"],
}
```

`var` and `route` support `*` wildcards.

## How it works

Pure build-output analysis — no code integration, no Next.js plugin, nothing to add to your app:

1. Parses `.next/prerender-manifest.json` + route manifests to classify every route as prerendered or dynamic (App Router fully supported; Pages Router best-effort).
2. Maps each prerendered route to its compiled server code — following the chunk references that both webpack and Turbopack emit from their thin route entries, so findings are attributed **per route**.
3. Scans that code for `process.env.X` reads (dot, bracket, and destructuring forms), filtering out framework-internal vars.
4. Scans `.next/static/chunks/**` for surviving `NEXT_PUBLIC_*` references and for the inlined values of vars present in the build environment (`.env*` files in Next's production precedence + the process env).

Run it **right after `next build`, in the same environment**, so the audit-time env matches the build-time env — that's what makes the missing/present distinction meaningful.

## vs. adjacent tools

They prevent or work around; this **detects**. Use them together.

| Tool                                                                | What it does                                                 | What it can't tell you                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| [`@t3-oss/env-nextjs`](https://env.t3.gg)                           | Schema-validates that vars are defined and well-formed       | Whether a _static route_ froze a value at build time    |
| [`next-runtime-env`](https://github.com/expatfile/next-runtime-env) | Injects `NEXT_PUBLIC_*` at runtime (build once, deploy many) | What actually got baked into the build you already have |
| **`next-env-audit`**                                                | Audits the build output for baked/missing env values         | —                                                       |

## Limitations (v1)

- **Heuristic, not a compiler.** Aliased access (`const env = process.env; env.X`) and fully dynamic keys aren't caught. Defaults are report-only for exactly this reason.
- **Audit-time env ≈ build-time env** only when you run it right after the build in the same environment. The severity split (error vs warning) relies on that.
- Vars prefixed `NEXT_` (other than the `NEXT_PUBLIC_*` client check) are treated as framework-owned and ignored.
- Very short `NEXT_PUBLIC_*` values (`"1"`, `"on"`) can't be reliably located in minified bundles — reported as unverified instead of guessed.
- Shared server chunks are attributed to every route that references them; extremely aggressive chunk sharing may over-attribute.

## Roadmap

- Companion ESLint rule: flag `process.env` reads in server components that never opt out of static rendering.
- GitHub Action wrapper with PR annotations.
- Tracking Next.js `cacheComponents` / dynamicIO: if the framework ships native detection, this tool will point at it and retire gracefully.

## Contributing

Bug reports with a repro (or just a pasted `--json` output) are gold — the whole point of this tool is covering real-world build shapes. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
