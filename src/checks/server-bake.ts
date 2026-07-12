import { readFileSync } from 'node:fs';
import { findAllowRule, matchesPattern } from '../config.js';
import type { AuditConfig, RouteInfo, ServerBakeFinding, Severity } from '../types.js';
import { findServerEnvRefs, isFrameworkEnv } from './env-refs.js';

export interface ServerBakeResult {
  findings: ServerBakeFinding[];
  allowlisted: ServerBakeFinding[];
}

function severityFor(presentAtAudit: boolean, revalidate: number | false | null): Severity {
  const isr = typeof revalidate === 'number';
  if (isr) return presentAtAudit ? 'info' : 'warning';
  return presentAtAudit ? 'warning' : 'error';
}

function messageFor(route: string, name: string, finding: ServerBakeFinding): string {
  const isr = typeof finding.revalidate === 'number';
  if (isr) {
    return finding.presentAtAudit
      ? `${route} is prerendered with ISR and reads ${name}; the build-time value is served until the first revalidation, then re-read at runtime.`
      : `${route} is prerendered with ISR and reads ${name}, which is not set in the audit environment; the build-time render is served until the first revalidation.`;
  }
  return finding.presentAtAudit
    ? `${route} is statically prerendered and reads ${name}; its build-time value is frozen into the page, so changing the variable does not update this route without a rebuild.`
    : `${route} is statically prerendered and reads ${name}, which is not set in the audit environment; if it was also unset when \`next build\` ran, the route was prerendered with missing data while the build stayed green.`;
}

/**
 * Check 1 — server bake: statically prerendered routes whose compiled server
 * code reads non-public env vars. Those reads happened once, at build time;
 * the result is frozen into the prerendered output.
 */
export function runServerBakeCheck(
  routes: RouteInfo[],
  env: Record<string, string | undefined>,
  config: AuditConfig,
): ServerBakeResult {
  const findings: ServerBakeFinding[] = [];
  const allowlisted: ServerBakeFinding[] = [];
  const refsByFile = new Map<string, string[]>();

  for (const route of routes) {
    if (!route.prerendered) continue;
    const names = new Set<string>();
    for (const file of route.serverFiles) {
      let fileNames = refsByFile.get(file);
      if (fileNames === undefined) {
        fileNames = findServerEnvRefs(readFileSync(file, 'utf8')).map((ref) => ref.name);
        refsByFile.set(file, fileNames);
      }
      for (const name of fileNames) names.add(name);
    }

    for (const name of [...names].sort()) {
      if (isFrameworkEnv(name)) continue;
      if (config.ignore.some((pattern) => matchesPattern(pattern, name))) continue;
      const value = env[name];
      const presentAtAudit = value !== undefined && value !== '';
      const finding: ServerBakeFinding = {
        check: 'server-bake',
        severity: severityFor(presentAtAudit, route.revalidate),
        route: route.route,
        var: name,
        presentAtAudit,
        revalidate: route.revalidate,
        message: '',
      };
      finding.message = messageFor(route.route, name, finding);
      const rule = findAllowRule(config, name, route.route);
      if (rule !== undefined) {
        if (rule.reason !== undefined) finding.allowReason = rule.reason;
        allowlisted.push(finding);
      } else {
        findings.push(finding);
      }
    }
  }

  return { findings, allowlisted };
}
