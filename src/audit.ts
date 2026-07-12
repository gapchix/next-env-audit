import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { runClientBakeCheck } from './checks/client-bake.js';
import { runServerBakeCheck } from './checks/server-bake.js';
import { loadConfig } from './config.js';
import { loadBuildEnv } from './env-files.js';
import { AuditError } from './errors.js';
import { discoverRoutes } from './manifests.js';
import type { AuditResult, CheckId } from './types.js';

export interface AuditOptions {
  /**
   * Project directory containing `.next` (default: cwd). May also point
   * directly at a `.next` directory.
   */
  dir?: string;
  /** Explicit config file path; otherwise discovered next to the project. */
  configPath?: string;
  /** Environment to audit against (default: `process.env`). */
  env?: NodeJS.ProcessEnv;
}

/**
 * Audits a completed `next build` for baked env vars. Pure build-output
 * analysis: no app code integration, no Next.js import.
 */
export function runAudit(options: AuditOptions = {}): AuditResult {
  const target = resolve(options.dir ?? '.');
  const isNextDir = basename(target) === '.next';
  const projectDir = isNextDir ? dirname(target) : target;
  const nextDir = isNextDir ? target : join(target, '.next');
  if (!existsSync(nextDir)) {
    throw new AuditError(
      `${nextDir} does not exist — run \`next build\` first, or point next-env-audit at the project directory.`,
    );
  }

  const config = loadConfig(projectDir, options.configPath);
  const env = loadBuildEnv(projectDir, options.env ?? process.env);
  const { routes, diagnostics } = discoverRoutes(nextDir);
  const server = runServerBakeCheck(routes, env, config);
  const client = runClientBakeCheck(nextDir, env, config);

  return {
    projectDir,
    nextDir,
    config,
    routes,
    findings: [...server.findings, ...client.findings],
    allowlisted: [...server.allowlisted, ...client.allowlisted],
    diagnostics: [...diagnostics, ...client.diagnostics],
  };
}

/** True when any finding of a failed-on check is a warning or error. */
export function shouldFail(result: AuditResult, failOn: readonly CheckId[]): boolean {
  return result.findings.some(
    (finding) =>
      failOn.includes(finding.check) &&
      (finding.severity === 'error' || finding.severity === 'warning'),
  );
}
