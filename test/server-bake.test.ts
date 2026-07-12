import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit.js';
import type { ServerBakeFinding } from '../src/types.js';
import { syntheticProject } from './helpers.js';

function serverFindings(result: ReturnType<typeof runAudit>): ServerBakeFinding[] {
  return result.findings.filter(
    (finding): finding is ServerBakeFinding => finding.check === 'server-bake',
  );
}

describe('server-bake check', () => {
  it('flags a static route reading a server-only var as error when the var is unset', () => {
    const dir = syntheticProject({
      staticRoutes: { '/cms': 'const t = process.env.CMS_TOKEN;' },
    });
    const result = runAudit({ dir, env: {} });
    const findings = serverFindings(result);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      route: '/cms',
      var: 'CMS_TOKEN',
      severity: 'error',
      presentAtAudit: false,
    });
  });

  it('downgrades to warning when the var is set at audit time', () => {
    const dir = syntheticProject({
      staticRoutes: { '/cms': 'const t = process.env.CMS_TOKEN;' },
    });
    const result = runAudit({ dir, env: { CMS_TOKEN: 'secret' } });
    expect(serverFindings(result)[0]?.severity).toBe('warning');
  });

  it('treats an empty value as unset', () => {
    const dir = syntheticProject({
      staticRoutes: { '/cms': 'const t = process.env.CMS_TOKEN;' },
    });
    const result = runAudit({ dir, env: { CMS_TOKEN: '' } });
    expect(serverFindings(result)[0]?.severity).toBe('error');
  });

  it('reads the build env from .env files too', () => {
    const dir = syntheticProject({
      staticRoutes: { '/cms': 'const t = process.env.CMS_TOKEN;' },
      extraFiles: { '.env': 'CMS_TOKEN=from-file' },
    });
    const result = runAudit({ dir, env: {} });
    expect(serverFindings(result)[0]?.severity).toBe('warning');
  });

  it('does not flag dynamic routes', () => {
    const dir = syntheticProject({
      dynamicRoutes: { '/live': 'const t = process.env.CMS_TOKEN;' },
    });
    expect(serverFindings(runAudit({ dir, env: {} }))).toEqual([]);
  });

  it('softens severity for ISR routes', () => {
    const dir = syntheticProject({
      isrRoutes: { '/isr': { source: 'process.env.CMS_TOKEN', revalidate: 60 } },
    });
    expect(serverFindings(runAudit({ dir, env: {} }))[0]).toMatchObject({
      severity: 'warning',
      revalidate: 60,
    });
    expect(serverFindings(runAudit({ dir, env: { CMS_TOKEN: 'x' } }))[0]?.severity).toBe('info');
  });

  it('ignores framework vars and NEXT_PUBLIC vars in server code', () => {
    const dir = syntheticProject({
      staticRoutes: {
        '/noise':
          'process.env.NODE_ENV; process.env.NEXT_RUNTIME; process.env.NEXT_PUBLIC_X; process.env.VERCEL_URL;',
      },
    });
    expect(serverFindings(runAudit({ dir, env: {} }))).toEqual([]);
  });

  it('honors the ignore list from config', () => {
    const dir = syntheticProject({
      staticRoutes: { '/cms': 'process.env.SENTRY_RELEASE; process.env.CMS_TOKEN;' },
      extraFiles: {
        'next-env-audit.config.json': JSON.stringify({ ignore: ['SENTRY_*'] }),
      },
    });
    const findings = serverFindings(runAudit({ dir, env: {} }));
    expect(findings.map((finding) => finding.var)).toEqual(['CMS_TOKEN']);
  });

  it('moves allowlisted findings out of the failing set, keeping the reason', () => {
    const dir = syntheticProject({
      staticRoutes: { '/stamped': 'process.env.BUILD_INFO;' },
      extraFiles: {
        'next-env-audit.config.json': JSON.stringify({
          allow: [{ route: '/stamped', var: 'BUILD_INFO', reason: 'intentional stamp' }],
        }),
      },
    });
    const result = runAudit({ dir, env: { BUILD_INFO: 'abc' } });
    expect(result.findings).toEqual([]);
    expect(result.allowlisted).toHaveLength(1);
    expect(result.allowlisted[0]?.allowReason).toBe('intentional stamp');
  });

  it('supports wildcard allow rules without a route', () => {
    const dir = syntheticProject({
      staticRoutes: { '/a': 'process.env.BUILD_A;', '/b': 'process.env.BUILD_B;' },
      extraFiles: {
        'next-env-audit.config.json': JSON.stringify({ allow: [{ var: 'BUILD_*' }] }),
      },
    });
    const result = runAudit({ dir, env: {} });
    expect(result.findings).toEqual([]);
    expect(result.allowlisted).toHaveLength(2);
  });
});
