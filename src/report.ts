import pc from 'picocolors';
import type { AuditResult, CheckId, Finding, Severity } from './types.js';

export interface ReportOptions {
  version: string;
  /** Checks the CLI will fail on — rendered in the summary. */
  failOn?: readonly CheckId[];
}

const SYMBOLS: Record<Severity, string> = { error: '✖', warning: '⚠', info: 'ℹ' };
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

function paint(severity: Severity, text: string): string {
  if (severity === 'error') return pc.red(text);
  if (severity === 'warning') return pc.yellow(text);
  return pc.cyan(text);
}

function headline(finding: Finding): string {
  if (finding.check === 'server-bake') {
    const isr =
      typeof finding.revalidate === 'number' ? ` (ISR, revalidate ${finding.revalidate}s)` : '';
    const state = finding.presentAtAudit
      ? 'value frozen at build time'
      : 'not set in the audit environment';
    return `${pc.bold(finding.route)} reads ${pc.bold(finding.var)} — ${state}${isr}`;
  }
  switch (finding.kind) {
    case 'not-inlined': {
      const chunks = finding.chunkCount ?? 0;
      return `${pc.bold(finding.var)} referenced in ${chunks} client chunk${chunks === 1 ? '' : 's'} but never inlined`;
    }
    case 'inlined': {
      const chunks = finding.chunkCount ?? 0;
      return `${pc.bold(finding.var)} = ${JSON.stringify(finding.valuePreview ?? '')} — inlined into ${chunks} chunk${chunks === 1 ? '' : 's'}`;
    }
    case 'not-found':
      return `${pc.bold(finding.var)} — set in the build env, value not found in any client chunk`;
    case 'unverified':
      return `${pc.bold(finding.var)} — set in the build env, value too short to verify`;
  }
}

function detail(finding: Finding): string[] {
  if (finding.check === 'server-bake') {
    const isr = typeof finding.revalidate === 'number';
    if (isr) {
      return finding.presentAtAudit
        ? [
            'Revalidation re-reads the variable at runtime, so this self-heals — flagged for awareness.',
          ]
        : [
            'The build-time render is served until the first revalidation; after that the',
            'runtime value takes over.',
          ];
    }
    if (finding.presentAtAudit) {
      return [
        'Whatever value the variable had at build time is baked into the prerendered page.',
        'Rotating or changing it does not update this route without a rebuild.',
      ];
    }
    return [
      'If it was also unset when `next build` ran, this route was prerendered with missing',
      'data — while the build stayed green.',
      `fix: \`export const dynamic = 'force-dynamic'\`, set ${finding.var} at build time,`,
      'or allowlist it in next-env-audit.config.json if the bake is intentional.',
    ];
  }
  switch (finding.kind) {
    case 'not-inlined':
      return finding.presentAtAudit
        ? [
            'The variable is set in the audit environment, so either it was missing when',
            '`next build` ran, or it is accessed dynamically (bracket notation / computed',
            'key), which Next.js never inlines. It is undefined in the browser.',
          ]
        : [
            'Not set at build time, so nothing was inlined — the reference is undefined in',
            'the browser.',
          ];
    case 'inlined':
      return [
        'Frozen into this build artifact: promoting the same build to another environment',
        'carries this value along.',
      ];
    default:
      return [];
  }
}

function countBy(findings: Finding[], severity: Severity): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

/** Renders the human-readable report. Colors follow picocolors auto-detection. */
export function renderReport(result: AuditResult, options: ReportOptions): string {
  const lines: string[] = [];
  const prerendered = result.routes.filter((route) => route.prerendered).length;
  lines.push(pc.bold(`next-env-audit v${options.version}`));
  lines.push(
    pc.dim(
      `audited ${result.nextDir} — ${result.routes.length} routes, ${prerendered} prerendered`,
    ),
  );

  const sections: { title: string; check: CheckId }[] = [
    { title: 'server bake · env vars read by statically prerendered routes', check: 'server-bake' },
    { title: 'client bake · NEXT_PUBLIC_* values in browser bundles', check: 'client-bake' },
  ];
  for (const section of sections) {
    const findings = result.findings
      .filter((finding) => finding.check === section.check)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    if (findings.length === 0) continue;
    lines.push('');
    lines.push(pc.bold(section.title));
    for (const finding of findings) {
      lines.push('');
      lines.push(`  ${paint(finding.severity, SYMBOLS[finding.severity])}  ${headline(finding)}`);
      for (const line of detail(finding)) lines.push(pc.dim(`     ${line}`));
    }
  }

  if (result.allowlisted.length > 0) {
    lines.push('');
    lines.push(pc.bold('allowlisted'));
    for (const finding of result.allowlisted) {
      const where = finding.check === 'server-bake' ? `${finding.route} · ` : '';
      const reason = finding.allowReason ?? 'allowlisted in config';
      lines.push(`  ${pc.green('✓')}  ${where}${pc.bold(finding.var)} — ${reason}`);
    }
  }

  for (const diagnostic of result.diagnostics) {
    lines.push('');
    lines.push(pc.dim(`  note: ${diagnostic}`));
  }

  lines.push('');
  if (result.findings.length === 0) {
    lines.push(
      pc.green(
        `✓ no bake issues found · ${result.routes.length} routes audited (${prerendered} prerendered)`,
      ),
    );
  } else {
    const parts = [
      `${countBy(result.findings, 'error')} error${countBy(result.findings, 'error') === 1 ? '' : 's'}`,
      `${countBy(result.findings, 'warning')} warning${countBy(result.findings, 'warning') === 1 ? '' : 's'}`,
      `${countBy(result.findings, 'info')} info`,
    ];
    if (result.allowlisted.length > 0) parts.push(`${result.allowlisted.length} allowlisted`);
    lines.push(parts.join(' · '));
    const failOn = options.failOn ?? [];
    const failing = result.findings.filter(
      (finding) =>
        failOn.includes(finding.check) &&
        (finding.severity === 'error' || finding.severity === 'warning'),
    );
    if (failing.length > 0) {
      lines.push(
        pc.red(`✖ failing on: ${[...new Set(failing.map((f) => f.check))].join(', ')} (exit 1)`),
      );
    } else if (failOn.length === 0) {
      lines.push(pc.dim('report-only mode — pass --fail-on server-bake,client-bake to gate CI'));
    }
  }
  lines.push('');
  return lines.join('\n');
}
