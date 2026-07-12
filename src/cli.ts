#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import pc from 'picocolors';
import { runAudit, shouldFail } from './audit.js';
import { AuditError } from './errors.js';
import { renderReport } from './report.js';
import { CHECK_IDS, type CheckId } from './types.js';

const HELP = `next-env-audit — postbuild auditor for env vars baked into Next.js output

Usage: next-env-audit [dir] [options]

  dir                  project directory containing .next (default: cwd);
                       may also point directly at a .next directory

Options:
  --json               machine-readable output
  --fail-on <checks>   comma-separated checks that gate the exit code:
                       ${CHECK_IDS.join(', ')}, or "all" — exits 1 when those
                       checks produce warnings or errors (overrides config)
  --config <path>      explicit config file path
  -h, --help           show this help
  -v, --version        show the version

Run it right after \`next build\`, in the same environment, so the audit sees
the env the build saw. Exit codes: 0 ok, 1 failing findings, 2 audit error.
`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

function parseFailOn(raw: string): CheckId[] {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  if (entries.includes('all')) return [...CHECK_IDS];
  for (const entry of entries) {
    if (!(CHECK_IDS as readonly string[]).includes(entry)) {
      throw new AuditError(
        `Unknown check "${entry}" in --fail-on (expected: ${CHECK_IDS.join(', ')}, or "all").`,
      );
    }
  }
  return entries as CheckId[];
}

function main(): void {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        json: { type: 'boolean', default: false },
        'fail-on': { type: 'string' },
        config: { type: 'string' },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
      allowPositionals: true,
    });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    process.exitCode = 2;
    return;
  }

  const { values, positionals } = parsed;
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (values.version) {
    process.stdout.write(`${version()}\n`);
    return;
  }

  try {
    const result = runAudit({
      ...(positionals[0] !== undefined ? { dir: positionals[0] } : {}),
      ...(typeof values.config === 'string' ? { configPath: values.config } : {}),
    });
    const failOn =
      typeof values['fail-on'] === 'string' ? parseFailOn(values['fail-on']) : result.config.failOn;
    const failed = shouldFail(result, failOn);
    if (values.json) {
      process.stdout.write(
        `${JSON.stringify({ version: version(), failOn, failed, ...result }, null, 2)}\n`,
      );
    } else {
      process.stdout.write(renderReport(result, { version: version(), failOn }));
    }
    process.exitCode = failed ? 1 : 0;
  } catch (error) {
    if (error instanceof AuditError) {
      process.stderr.write(`${pc.red('error:')} ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

main();
