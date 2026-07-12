import { describe, expect, it } from 'vitest';
import { loadConfig, matchesPattern } from '../src/config.js';
import { AuditError } from '../src/errors.js';
import { makeProject } from './helpers.js';

describe('matchesPattern', () => {
  it('matches exactly without wildcards', () => {
    expect(matchesPattern('CMS_TOKEN', 'CMS_TOKEN')).toBe(true);
    expect(matchesPattern('CMS_TOKEN', 'CMS_TOKEN_2')).toBe(false);
  });

  it('supports * wildcards and escapes regex specials', () => {
    expect(matchesPattern('SENTRY_*', 'SENTRY_RELEASE')).toBe(true);
    expect(matchesPattern('*_URL', 'DATABASE_URL')).toBe(true);
    expect(matchesPattern('/blog/[slug]', '/blog/[slug]')).toBe(true);
    expect(matchesPattern('/blog/*', '/blog/[slug]')).toBe(true);
    expect(matchesPattern('A.B', 'AxB')).toBe(false);
  });
});

describe('loadConfig', () => {
  it('returns defaults when nothing is configured', () => {
    const dir = makeProject({});
    expect(loadConfig(dir)).toEqual({ allow: [], ignore: [], failOn: [] });
  });

  it('loads next-env-audit.config.json', () => {
    const dir = makeProject({
      'next-env-audit.config.json': JSON.stringify({
        allow: [{ var: 'BUILD_INFO', route: '/x', reason: 'stamp' }],
        ignore: ['DEBUG'],
        failOn: ['server-bake'],
      }),
    });
    expect(loadConfig(dir)).toEqual({
      allow: [{ var: 'BUILD_INFO', route: '/x', reason: 'stamp' }],
      ignore: ['DEBUG'],
      failOn: ['server-bake'],
    });
  });

  it('loads the nextEnvAudit key from package.json', () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ name: 'x', nextEnvAudit: { ignore: ['FOO'] } }),
    });
    expect(loadConfig(dir).ignore).toEqual(['FOO']);
  });

  it('prefers the dedicated config file over package.json', () => {
    const dir = makeProject({
      'next-env-audit.config.json': JSON.stringify({ ignore: ['FROM_FILE'] }),
      'package.json': JSON.stringify({ name: 'x', nextEnvAudit: { ignore: ['FROM_PKG'] } }),
    });
    expect(loadConfig(dir).ignore).toEqual(['FROM_FILE']);
  });

  it('rejects unknown keys with a helpful message', () => {
    const dir = makeProject({
      'next-env-audit.config.json': JSON.stringify({ allowlist: [] }),
    });
    expect(() => loadConfig(dir)).toThrow(AuditError);
    expect(() => loadConfig(dir)).toThrow(/unknown key "allowlist"/);
  });

  it('rejects allow entries without a var', () => {
    const dir = makeProject({
      'next-env-audit.config.json': JSON.stringify({ allow: [{ route: '/x' }] }),
    });
    expect(() => loadConfig(dir)).toThrow(/non-empty string "var"/);
  });

  it('rejects invalid failOn values', () => {
    const dir = makeProject({
      'next-env-audit.config.json': JSON.stringify({ failOn: ['everything'] }),
    });
    expect(() => loadConfig(dir)).toThrow(/failOn/);
  });

  it('throws when an explicit config path does not exist', () => {
    const dir = makeProject({});
    expect(() => loadConfig(dir, `${dir}/nope.json`)).toThrow(/not found/);
  });
});
