import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lowest → highest precedence, mirroring what `next build` loads for
 * production builds. The real process environment always wins over files.
 */
const ENV_FILES = ['.env', '.env.production', '.env.local', '.env.production.local'];

const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = LINE.exec(line);
    if (!match) continue;
    const name = match[1] as string;
    let value = (match[2] as string).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    out[name] = value;
  }
  return out;
}

/**
 * Reconstructs the environment a production `next build` would have seen in
 * this working directory: .env files in Next's precedence order, overridden
 * by the actual process environment.
 *
 * Caveat: this is the *audit-time* environment. It only equals the build-time
 * one when the audit runs right after the build in the same shell/CI step —
 * which is exactly how the tool is meant to be used.
 */
export function loadBuildEnv(
  projectDir: string,
  processEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = {};
  for (const file of ENV_FILES) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    Object.assign(merged, parseEnvFile(readFileSync(path, 'utf8')));
  }
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}
