import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit.js';
import type { ClientBakeFinding, ServerBakeFinding } from '../src/types.js';

// Runs against a real `next build` of the fixture app. Skipped when the
// fixture has not been built — run `npm run fixture:install && npm run
// fixture:build` (CI does this in the integration job).
const fixtureDir = resolve(import.meta.dirname, '..', 'fixtures', 'basic-app');
const fixtureBuilt = existsSync(join(fixtureDir, '.next', 'prerender-manifest.json'));

describe.skipIf(!fixtureBuilt)('integration: real next build', () => {
  // CMS_TOKEN must stay unset for severity assertions; guard against leaks
  // from the host shell.
  const env = { ...process.env };
  delete env.CMS_TOKEN;

  const result = fixtureBuilt ? runAudit({ dir: fixtureDir, env }) : undefined;

  it('classifies the fixture routes correctly', () => {
    const byRoute = Object.fromEntries(result!.routes.map((route) => [route.route, route]));
    expect(byRoute['/static-secret']?.prerendered).toBe(true);
    expect(byRoute['/static-public']?.prerendered).toBe(true);
    expect(byRoute['/static-allowlisted']?.prerendered).toBe(true);
    expect(byRoute['/dynamic-secret']?.prerendered).toBe(false);
  });

  it('catches the original incident: static route + unset server env var', () => {
    const finding = result!.findings.find(
      (f): f is ServerBakeFinding =>
        f.check === 'server-bake' && f.route === '/static-secret' && f.var === 'CMS_TOKEN',
    );
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.presentAtAudit).toBe(false);
  });

  it('does not flag the dynamic route reading the same var', () => {
    expect(
      result!.findings.some((f) => f.check === 'server-bake' && f.route === '/dynamic-secret'),
    ).toBe(false);
  });

  it('respects the allowlist for the intentional build-time stamp', () => {
    expect(result!.findings.some((f) => f.check === 'server-bake' && f.var === 'BUILD_INFO')).toBe(
      false,
    );
    const allowlisted = result!.allowlisted.find((f) => f.var === 'BUILD_INFO');
    expect(allowlisted?.allowReason).toBe('intentional build-time stamp');
  });

  it('detects the inlined NEXT_PUBLIC value in client chunks', () => {
    const finding = result!.findings.find(
      (f): f is ClientBakeFinding => f.check === 'client-bake' && f.var === 'NEXT_PUBLIC_API_URL',
    );
    expect(finding?.kind).toBe('inlined');
    expect(finding?.valuePreview).toBe('https://api.fixture.example');
    expect(finding?.chunkCount ?? 0).toBeGreaterThan(0);
  });

  it('detects the missing NEXT_PUBLIC reference that survived the build', () => {
    const finding = result!.findings.find(
      (f): f is ClientBakeFinding =>
        f.check === 'client-bake' && f.var === 'NEXT_PUBLIC_MISSING_FLAG',
    );
    expect(finding?.kind).toBe('not-inlined');
    expect(finding?.severity).toBe('warning');
    expect(finding?.presentAtAudit).toBe(false);
  });

  it('produces no false positives beyond the designed findings', () => {
    const unexpected = result!.findings.filter(
      (f) =>
        !(f.check === 'server-bake' && f.var === 'CMS_TOKEN' && f.route === '/static-secret') &&
        !(f.check === 'client-bake' && f.var === 'NEXT_PUBLIC_API_URL') &&
        !(f.check === 'client-bake' && f.var === 'NEXT_PUBLIC_MISSING_FLAG'),
    );
    expect(unexpected).toEqual([]);
  });
});

const cliBuilt = existsSync(resolve(import.meta.dirname, '..', 'dist', 'cli.js'));

describe.skipIf(!fixtureBuilt || !cliBuilt)('integration: CLI', () => {
  const cli = resolve(import.meta.dirname, '..', 'dist', 'cli.js');
  const env = { ...process.env };
  delete env.CMS_TOKEN;

  it('exits 0 in report-only mode and prints the report', () => {
    const stdout = execFileSync(process.execPath, [cli, fixtureDir], { env, encoding: 'utf8' });
    expect(stdout).toContain('/static-secret');
    expect(stdout).toContain('CMS_TOKEN');
  });

  it('exits 1 with --fail-on server-bake and emits valid --json', () => {
    let failed = false;
    try {
      execFileSync(process.execPath, [cli, fixtureDir, '--fail-on', 'server-bake', '--json'], {
        env,
        encoding: 'utf8',
      });
    } catch (error) {
      failed = true;
      const spawnError = error as { status: number | null; stdout: string };
      expect(spawnError.status).toBe(1);
      const parsed = JSON.parse(spawnError.stdout) as { failed: boolean; findings: unknown[] };
      expect(parsed.failed).toBe(true);
      expect(parsed.findings.length).toBeGreaterThan(0);
    }
    expect(failed).toBe(true);
  });
});
