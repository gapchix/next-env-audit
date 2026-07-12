import { describe, expect, it } from 'vitest';
import { runAudit, shouldFail } from '../src/audit.js';
import { renderReport } from '../src/report.js';
import { syntheticProject } from './helpers.js';

function auditFixture() {
  const dir = syntheticProject({
    staticRoutes: { '/cms': 'process.env.CMS_TOKEN;' },
    clientChunks: { 'app.js': 'render(process.env.NEXT_PUBLIC_MISSING)' },
    extraFiles: {
      'next-env-audit.config.json': JSON.stringify({
        allow: [{ var: 'BUILD_INFO', reason: 'stamp' }],
      }),
    },
  });
  return runAudit({ dir, env: {} });
}

describe('renderReport', () => {
  it('includes both sections, severities and the summary line', () => {
    const report = renderReport(auditFixture(), { version: '0.1.0' });
    expect(report).toContain('next-env-audit v0.1.0');
    expect(report).toContain('server bake');
    expect(report).toContain('client bake');
    expect(report).toContain('/cms');
    expect(report).toContain('CMS_TOKEN');
    expect(report).toContain('NEXT_PUBLIC_MISSING');
    expect(report).toContain('1 error · 1 warning · 0 info');
    expect(report).toContain('report-only mode');
  });

  it('announces the failing checks when --fail-on matches', () => {
    const report = renderReport(auditFixture(), { version: '0.1.0', failOn: ['server-bake'] });
    expect(report).toContain('failing on: server-bake');
  });

  it('celebrates a clean audit', () => {
    const dir = syntheticProject({ staticRoutes: { '/clean': 'no env reads here' } });
    const report = renderReport(runAudit({ dir, env: {} }), { version: '0.1.0' });
    expect(report).toContain('no bake issues found');
  });
});

describe('shouldFail', () => {
  it('fails only for checks that are opted in', () => {
    const result = auditFixture();
    expect(shouldFail(result, [])).toBe(false);
    expect(shouldFail(result, ['server-bake'])).toBe(true);
    expect(shouldFail(result, ['client-bake'])).toBe(true);
    expect(shouldFail(result, ['server-bake', 'client-bake'])).toBe(true);
  });

  it('does not fail on info findings', () => {
    const dir = syntheticProject({
      clientChunks: { 'a.js': 'x="https://api.example.com/v1"' },
    });
    const result = runAudit({ dir, env: { NEXT_PUBLIC_API_URL: 'https://api.example.com/v1' } });
    expect(result.findings.every((finding) => finding.severity === 'info')).toBe(true);
    expect(shouldFail(result, ['server-bake', 'client-bake'])).toBe(false);
  });

  it('does not fail on allowlisted findings', () => {
    const dir = syntheticProject({
      staticRoutes: { '/stamped': 'process.env.BUILD_INFO;' },
      extraFiles: {
        'next-env-audit.config.json': JSON.stringify({ allow: [{ var: 'BUILD_INFO' }] }),
      },
    });
    const result = runAudit({ dir, env: {} });
    expect(shouldFail(result, ['server-bake', 'client-bake'])).toBe(false);
  });
});
