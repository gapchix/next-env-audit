import { describe, expect, it } from 'vitest';
import { loadBuildEnv, parseEnvFile } from '../src/env-files.js';
import { makeProject } from './helpers.js';

describe('parseEnvFile', () => {
  it('parses plain, quoted and exported assignments', () => {
    const parsed = parseEnvFile(
      [
        '# comment',
        '',
        'PLAIN=value',
        'export EXPORTED=yes',
        'DOUBLE="with \\"quotes\\" and\\nnewline"',
        "SINGLE='kept \\n literal'",
        'TRAILING=value # inline comment',
        'EMPTY=',
        'not a valid line',
      ].join('\n'),
    );
    expect(parsed).toEqual({
      PLAIN: 'value',
      EXPORTED: 'yes',
      DOUBLE: 'with "quotes" and\nnewline',
      SINGLE: 'kept \\n literal',
      TRAILING: 'value',
      EMPTY: '',
    });
  });

  it('handles CRLF input', () => {
    expect(parseEnvFile('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });
});

describe('loadBuildEnv', () => {
  it('merges env files in Next.js production precedence, process env last', () => {
    const dir = makeProject({
      '.env': 'FROM_ENV=base\nOVERRIDDEN=base\nSHADOWED=base',
      '.env.production': 'OVERRIDDEN=production',
      '.env.production.local': 'SHADOWED=production-local',
    });
    const env = loadBuildEnv(dir, { PROCESS_ONLY: 'proc', OVERRIDDEN: 'process' });
    expect(env.FROM_ENV).toBe('base');
    expect(env.OVERRIDDEN).toBe('process');
    expect(env.SHADOWED).toBe('production-local');
    expect(env.PROCESS_ONLY).toBe('proc');
  });

  it('works without any env files', () => {
    const dir = makeProject({});
    expect(loadBuildEnv(dir, { ONLY: 'x' })).toEqual({ ONLY: 'x' });
  });
});
