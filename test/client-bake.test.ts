import { describe, expect, it } from 'vitest';
import { runAudit } from '../src/audit.js';
import type { ClientBakeFinding } from '../src/types.js';
import { syntheticProject } from './helpers.js';

function clientFindings(result: ReturnType<typeof runAudit>): ClientBakeFinding[] {
  return result.findings.filter(
    (finding): finding is ClientBakeFinding => finding.check === 'client-bake',
  );
}

describe('client-bake check', () => {
  it('flags surviving references to unset NEXT_PUBLIC vars as not inlined', () => {
    const dir = syntheticProject({
      clientChunks: { 'app.js': 'render(process.env.NEXT_PUBLIC_MISSING_FLAG)' },
    });
    const findings = clientFindings(runAudit({ dir, env: {} }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: 'not-inlined',
      severity: 'warning',
      var: 'NEXT_PUBLIC_MISSING_FLAG',
      presentAtAudit: false,
      chunkCount: 1,
    });
  });

  it('detects Turbopack polyfill rewrites of surviving references', () => {
    const dir = syntheticProject({
      clientChunks: { 'app.js': 'children:d.default.env.NEXT_PUBLIC_MISSING_FLAG' },
    });
    expect(clientFindings(runAudit({ dir, env: {} }))[0]?.kind).toBe('not-inlined');
  });

  it('locates inlined values of set NEXT_PUBLIC vars', () => {
    const dir = syntheticProject({
      clientChunks: {
        'a.js': 'fetch("https://api.example.com/v1")',
        'b.js': 'const base="https://api.example.com/v1";',
      },
    });
    const findings = clientFindings(
      runAudit({ dir, env: { NEXT_PUBLIC_API_URL: 'https://api.example.com/v1' } }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      kind: 'inlined',
      severity: 'info',
      var: 'NEXT_PUBLIC_API_URL',
      valuePreview: 'https://api.example.com/v1',
      chunkCount: 2,
    });
  });

  it('reports set-but-unused vars as not found', () => {
    const dir = syntheticProject({ clientChunks: { 'a.js': 'nothing here' } });
    const findings = clientFindings(
      runAudit({ dir, env: { NEXT_PUBLIC_UNUSED: 'some-long-value' } }),
    );
    expect(findings[0]?.kind).toBe('not-found');
  });

  it('marks too-short values as unverified instead of guessing', () => {
    const dir = syntheticProject({ clientChunks: { 'a.js': 'x="1"' } });
    const findings = clientFindings(runAudit({ dir, env: { NEXT_PUBLIC_FLAG: '1' } }));
    expect(findings[0]?.kind).toBe('unverified');
  });

  it('does not double-report a var that is both set and surviving as a reference', () => {
    const dir = syntheticProject({
      clientChunks: { 'a.js': 'p.env["NEXT_PUBLIC_DYNAMIC"]' },
    });
    const findings = clientFindings(runAudit({ dir, env: { NEXT_PUBLIC_DYNAMIC: 'value-here' } }));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'not-inlined', presentAtAudit: true });
  });

  it('applies allow rules without a route to client findings', () => {
    const dir = syntheticProject({
      clientChunks: { 'a.js': 'render(process.env.NEXT_PUBLIC_OPTIONAL)' },
      extraFiles: {
        'next-env-audit.config.json': JSON.stringify({
          allow: [{ var: 'NEXT_PUBLIC_OPTIONAL', reason: 'optional at runtime' }],
        }),
      },
    });
    const result = runAudit({ dir, env: {} });
    expect(clientFindings(result)).toEqual([]);
    expect(result.allowlisted).toHaveLength(1);
  });

  it('notes when there are no client chunks instead of failing', () => {
    const dir = syntheticProject({ staticRoutes: { '/a': 'code' } });
    const result = runAudit({ dir, env: {} });
    expect(result.diagnostics.some((line) => line.includes('client-bake check skipped'))).toBe(
      true,
    );
  });
});
