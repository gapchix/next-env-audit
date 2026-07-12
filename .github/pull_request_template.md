<!-- Thanks for contributing! A few notes that speed up review: -->

## What

<!-- One or two sentences: what changes and why. -->

## Checklist

- [ ] `npm run lint && npm run typecheck && npm test` is green
- [ ] New detection behavior has a unit test (synthetic `.next` tree in `test/helpers.ts`)
- [ ] Behavior that depends on real build output also has a fixture route + integration assertion
- [ ] No new runtime dependencies (or the reasoning is in the PR description)
