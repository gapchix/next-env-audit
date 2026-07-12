import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { findAllowRule, matchesPattern } from '../config.js';
import type { AuditConfig, ClientBakeFinding } from '../types.js';
import { findClientPublicEnvRefs } from './env-refs.js';

export interface ClientBakeResult {
  findings: ClientBakeFinding[];
  allowlisted: ClientBakeFinding[];
  diagnostics: string[];
}

/** Values shorter than this match too much minified code to verify reliably. */
const MIN_VERIFIABLE_VALUE_LENGTH = 4;
const VALUE_PREVIEW_MAX = 48;

function preview(value: string): string {
  return value.length <= VALUE_PREVIEW_MAX ? value : `${value.slice(0, VALUE_PREVIEW_MAX - 1)}…`;
}

/**
 * Check 2 — client bake: what happened to `NEXT_PUBLIC_*` vars in the browser
 * bundles. Values present at build time are inlined (frozen into the build
 * artifact); references that survive the build textually were never inlined
 * and resolve to `undefined` in the browser.
 */
export function runClientBakeCheck(
  nextDir: string,
  env: Record<string, string | undefined>,
  config: AuditConfig,
): ClientBakeResult {
  const findings: ClientBakeFinding[] = [];
  const allowlisted: ClientBakeFinding[] = [];
  const diagnostics: string[] = [];

  const chunksDir = join(nextDir, 'static', 'chunks');
  if (!existsSync(chunksDir)) {
    diagnostics.push(`No client chunks found at ${chunksDir} — client-bake check skipped.`);
    return { findings, allowlisted, diagnostics };
  }

  const sources = readdirSync(chunksDir, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith('.js'))
    .map((file) => readFileSync(join(chunksDir, file), 'utf8'));

  const push = (finding: ClientBakeFinding) => {
    const rule = findAllowRule(config, finding.var);
    if (rule !== undefined) {
      if (rule.reason !== undefined) finding.allowReason = rule.reason;
      allowlisted.push(finding);
    } else {
      findings.push(finding);
    }
  };

  // References that survived the build were not replaced with a value:
  // the var was unset when `next build` ran, or it is accessed dynamically
  // (bracket notation / computed key), which Next.js never inlines.
  const survivingRefs = new Map<string, number>();
  for (const source of sources) {
    for (const name of findClientPublicEnvRefs(source)) {
      survivingRefs.set(name, (survivingRefs.get(name) ?? 0) + 1);
    }
  }
  for (const [name, chunkCount] of [...survivingRefs.entries()].sort()) {
    if (config.ignore.some((pattern) => matchesPattern(pattern, name))) continue;
    const presentAtAudit = env[name] !== undefined && env[name] !== '';
    push({
      check: 'client-bake',
      severity: 'warning',
      kind: 'not-inlined',
      var: name,
      presentAtAudit,
      chunkCount,
      message: presentAtAudit
        ? `${name} is referenced in client code but was never inlined — it is set in the audit environment, so this usually means it was unset when \`next build\` ran, or it is accessed dynamically; either way it is undefined in the browser.`
        : `${name} is referenced in client code but is not set — it was not inlined at build time and is undefined in the browser.`,
    });
  }

  // Vars present in the build environment: locate their inlined values.
  const publicVars = Object.entries(env)
    .filter(([name]) => name.startsWith('NEXT_PUBLIC_'))
    .sort(([a], [b]) => a.localeCompare(b));
  for (const [name, value] of publicVars) {
    if (survivingRefs.has(name)) continue;
    if (config.ignore.some((pattern) => matchesPattern(pattern, name))) continue;
    const base: Omit<ClientBakeFinding, 'kind' | 'severity' | 'message'> = {
      check: 'client-bake',
      var: name,
      presentAtAudit: value !== undefined && value !== '',
    };
    if (value === undefined || value === '' || value.length < MIN_VERIFIABLE_VALUE_LENGTH) {
      push({
        ...base,
        severity: 'info',
        kind: 'unverified',
        message: `${name} is set in the build environment but its value is too short to reliably locate in minified bundles.`,
      });
      continue;
    }
    const needles = [JSON.stringify(value), `'${value}'`];
    const chunkCount = sources.filter((source) =>
      needles.some((needle) => source.includes(needle)),
    ).length;
    if (chunkCount > 0) {
      push({
        ...base,
        severity: 'info',
        kind: 'inlined',
        valuePreview: preview(value),
        chunkCount,
        message: `${name} is inlined into ${chunkCount} client chunk${chunkCount === 1 ? '' : 's'}; the value is frozen into this build artifact, so promoting the same build across environments carries it along.`,
      });
    } else {
      push({
        ...base,
        severity: 'info',
        kind: 'not-found',
        message: `${name} is set in the build environment but its value was not found in any client chunk — unused in client code, or transformed before bundling.`,
      });
    }
  }

  return { findings, allowlisted, diagnostics };
}
