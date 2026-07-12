# basic-app fixture

Tiny Next.js app used by the integration tests. One route per scenario the
auditor must classify correctly:

| Route                 | Scenario                                                                                    | Expected result                               |
| --------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `/static-secret`      | static route reading `CMS_TOKEN` (unset)                                                    | server-bake **error** — the original incident |
| `/static-public`      | client component reading `NEXT_PUBLIC_API_URL` (set) and `NEXT_PUBLIC_MISSING_FLAG` (unset) | client-bake **inlined** + **not-inlined**     |
| `/dynamic-secret`     | `force-dynamic` route reading `CMS_TOKEN`                                                   | no finding                                    |
| `/static-allowlisted` | static route reading `BUILD_INFO`, allowlisted in config                                    | reported as allowlisted                       |

Build it from the repo root:

```bash
npm run fixture:install
npm run fixture:build
npm test   # integration tests now run
```

Written in `.jsx` (not TypeScript) on purpose: the fixture's only job is to
produce build output, and skipping the TS toolchain keeps `fixture:install`
fast in CI. `next` is pinned to `latest` — CI also swaps in `canary` as an
early-warning run.
