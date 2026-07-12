import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuditError } from './errors.js';
import { CHECK_IDS, type AllowRule, type AuditConfig, type CheckId } from './types.js';

const CONFIG_FILES = ['next-env-audit.config.json', '.nextenvauditrc.json'];
const PACKAGE_JSON_KEY = 'nextEnvAudit';

export const DEFAULT_CONFIG: AuditConfig = { allow: [], ignore: [], failOn: [] };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Exact match, with `*` in the pattern matching any run of characters. */
export function matchesPattern(pattern: string, value: string): boolean {
  if (!pattern.includes('*')) return pattern === value;
  const re = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return re.test(value);
}

export function findAllowRule(
  config: AuditConfig,
  envVar: string,
  route?: string,
): AllowRule | undefined {
  return config.allow.find((rule) => {
    if (!matchesPattern(rule.var, envVar)) return false;
    if (rule.route === undefined) return true;
    return route !== undefined && matchesPattern(rule.route, route);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCheckId(value: unknown): value is CheckId {
  return typeof value === 'string' && (CHECK_IDS as readonly string[]).includes(value);
}

function invalid(source: string, detail: string): never {
  throw new AuditError(`Invalid configuration in ${source}: ${detail}`);
}

function validateConfig(raw: unknown, source: string): AuditConfig {
  if (!isRecord(raw)) invalid(source, 'expected a JSON object');
  const config: AuditConfig = { ...DEFAULT_CONFIG, allow: [], ignore: [], failOn: [] };
  const obj = raw;

  for (const key of Object.keys(obj)) {
    if (!['allow', 'ignore', 'failOn'].includes(key)) {
      invalid(source, `unknown key "${key}" (expected "allow", "ignore" or "failOn")`);
    }
  }

  if (obj.allow !== undefined) {
    if (!Array.isArray(obj.allow)) invalid(source, '"allow" must be an array');
    for (const entry of obj.allow as unknown[]) {
      if (!isRecord(entry)) invalid(source, '"allow" entries must be objects');
      const rule = entry;
      if (typeof rule.var !== 'string' || rule.var.length === 0) {
        invalid(source, '"allow" entries need a non-empty string "var"');
      }
      if (rule.route !== undefined && typeof rule.route !== 'string') {
        invalid(source, '"allow" entry "route" must be a string');
      }
      if (rule.reason !== undefined && typeof rule.reason !== 'string') {
        invalid(source, '"allow" entry "reason" must be a string');
      }
      const allowRule: AllowRule = { var: rule.var };
      if (typeof rule.route === 'string') allowRule.route = rule.route;
      if (typeof rule.reason === 'string') allowRule.reason = rule.reason;
      config.allow.push(allowRule);
    }
  }

  if (obj.ignore !== undefined) {
    if (
      !Array.isArray(obj.ignore) ||
      (obj.ignore as unknown[]).some((v) => typeof v !== 'string')
    ) {
      invalid(source, '"ignore" must be an array of strings');
    }
    config.ignore = obj.ignore as string[];
  }

  if (obj.failOn !== undefined) {
    if (!Array.isArray(obj.failOn) || !(obj.failOn as unknown[]).every(isCheckId)) {
      invalid(source, `"failOn" must be an array of check ids (${CHECK_IDS.join(', ')})`);
    }
    config.failOn = obj.failOn as CheckId[];
  }

  return config;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    throw new AuditError(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Loads the audit configuration for a project directory. Sources, in order:
 * an explicit `--config` path, `next-env-audit.config.json`,
 * `.nextenvauditrc.json`, or a `nextEnvAudit` key in package.json.
 */
export function loadConfig(projectDir: string, explicitPath?: string): AuditConfig {
  if (explicitPath !== undefined) {
    if (!existsSync(explicitPath)) throw new AuditError(`Config file not found: ${explicitPath}`);
    return validateConfig(readJson(explicitPath), explicitPath);
  }
  for (const file of CONFIG_FILES) {
    const path = join(projectDir, file);
    if (existsSync(path)) return validateConfig(readJson(path), path);
  }
  const packageJsonPath = join(projectDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    const pkg = readJson(packageJsonPath);
    if (isRecord(pkg) && pkg[PACKAGE_JSON_KEY] !== undefined) {
      return validateConfig(
        pkg[PACKAGE_JSON_KEY],
        `${packageJsonPath} ("${PACKAGE_JSON_KEY}" key)`,
      );
    }
  }
  return { ...DEFAULT_CONFIG, allow: [], ignore: [], failOn: [] };
}
