import { describe, expect, it } from 'vitest';
import {
  findClientPublicEnvRefs,
  findServerEnvRefs,
  isFrameworkEnv,
} from '../src/checks/env-refs.js';

describe('findServerEnvRefs', () => {
  it('finds dot access', () => {
    expect(findServerEnvRefs('const t = process.env.CMS_TOKEN;')).toEqual([
      { name: 'CMS_TOKEN', via: 'dot' },
    ]);
  });

  it('finds bracket access', () => {
    expect(findServerEnvRefs('process.env["API_KEY"]; process.env[\'OTHER\']')).toEqual([
      { name: 'API_KEY', via: 'bracket' },
      { name: 'OTHER', via: 'bracket' },
    ]);
  });

  it('finds destructuring, including minified renames and defaults', () => {
    const refs = findServerEnvRefs('let{CMS_TOKEN:e,DB_URL:t="x",...rest}=process.env;');
    expect(refs.map((ref) => ref.name).sort()).toEqual(['CMS_TOKEN', 'DB_URL']);
  });

  it('dedupes and ignores unrelated member access', () => {
    const refs = findServerEnvRefs('process.env.A; process.env.A; other.env.B; environment.A;');
    expect(refs).toEqual([{ name: 'A', via: 'dot' }]);
  });
});

describe('findClientPublicEnvRefs', () => {
  it('matches webpack-style surviving references', () => {
    expect(findClientPublicEnvRefs('x = process.env.NEXT_PUBLIC_MISSING')).toEqual([
      'NEXT_PUBLIC_MISSING',
    ]);
  });

  it('matches Turbopack polyfill rewrites like d.default.env.NEXT_PUBLIC_X', () => {
    expect(findClientPublicEnvRefs('children:d.default.env.NEXT_PUBLIC_MISSING_FLAG')).toEqual([
      'NEXT_PUBLIC_MISSING_FLAG',
    ]);
  });

  it('does not match the var name appearing as a plain string', () => {
    expect(findClientPublicEnvRefs('label:"NEXT_PUBLIC_API_URL"')).toEqual([]);
  });

  it('matches bracket access on an env object', () => {
    expect(findClientPublicEnvRefs('p.env["NEXT_PUBLIC_FLAG"]')).toEqual(['NEXT_PUBLIC_FLAG']);
  });
});

describe('isFrameworkEnv', () => {
  it.each([
    'NODE_ENV',
    'NEXT_RUNTIME',
    'NEXT_PUBLIC_X',
    '__NEXT_TEST',
    'VERCEL_URL',
    'PORT',
    // ecosystem diagnostics bundled via common libraries (found dogfooding
    // on a real app: the `debug` package's process.env.DEBUG read)
    'DEBUG',
    'CI',
    'NO_COLOR',
    'FORCE_COLOR',
  ])('ignores %s', (name) => {
    expect(isFrameworkEnv(name)).toBe(true);
  });

  it.each(['CMS_TOKEN', 'DATABASE_URL', 'MY_NEXT_THING'])('keeps %s', (name) => {
    expect(isFrameworkEnv(name)).toBe(false);
  });
});
