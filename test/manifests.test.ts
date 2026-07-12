import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AuditError } from '../src/errors.js';
import { discoverRoutes } from '../src/manifests.js';
import {
  appPathRoutesManifest,
  makeProject,
  prerenderManifest,
  syntheticProject,
} from './helpers.js';

describe('discoverRoutes', () => {
  it('throws a friendly error when there is no build output', () => {
    const dir = makeProject({ '.next/keep': '' });
    expect(() => discoverRoutes(join(dir, '.next'))).toThrow(AuditError);
    expect(() => discoverRoutes(join(dir, '.next'))).toThrow(/next build/);
  });

  it('classifies app-router routes as prerendered vs dynamic', () => {
    const dir = syntheticProject({
      staticRoutes: { '/static-page': 'code' },
      dynamicRoutes: { '/dynamic-page': 'code' },
    });
    const { routes } = discoverRoutes(join(dir, '.next'));
    const byRoute = Object.fromEntries(routes.map((route) => [route.route, route]));
    expect(byRoute['/static-page']?.prerendered).toBe(true);
    expect(byRoute['/static-page']?.revalidate).toBe(false);
    expect(byRoute['/dynamic-page']?.prerendered).toBe(false);
    expect(byRoute['/static-page']?.serverFiles.length).toBeGreaterThan(0);
  });

  it('reports ISR revalidate seconds', () => {
    const dir = syntheticProject({
      isrRoutes: { '/isr-page': { source: 'code', revalidate: 60 } },
    });
    const { routes } = discoverRoutes(join(dir, '.next'));
    expect(routes[0]?.revalidate).toBe(60);
  });

  it('maps prerendered param paths back to their source route', () => {
    const dir = makeProject({
      '.next/prerender-manifest.json': prerenderManifest({
        '/blog/first': { srcRoute: '/blog/[slug]' },
        '/blog/second': { srcRoute: '/blog/[slug]' },
      }),
      '.next/app-path-routes-manifest.json': appPathRoutesManifest({
        '/blog/[slug]/page': '/blog/[slug]',
      }),
      '.next/server/app/blog/[slug]/page.js': 'process.env.CMS_TOKEN',
    });
    const { routes } = discoverRoutes(join(dir, '.next'));
    expect(routes).toHaveLength(1);
    expect(routes[0]?.prerendered).toBe(true);
    expect(routes[0]?.prerenderedPaths.sort()).toEqual(['/blog/first', '/blog/second']);
  });

  it('follows chunk references from thin route entries (Turbopack layout)', () => {
    const dir = makeProject({
      '.next/prerender-manifest.json': prerenderManifest({ '/page-a': {} }),
      '.next/app-path-routes-manifest.json': appPathRoutesManifest({ '/page-a/page': '/page-a' }),
      '.next/server/app/page-a/page.js': [
        'var R=require("../../chunks/ssr/[turbopack]_runtime.js")("server/app/page-a/page.js")',
        'R.c("server/chunks/ssr/user-code.js")',
        'R.c("server/chunks/ssr/missing-chunk.js")',
      ].join('\n'),
      '.next/server/chunks/ssr/[turbopack]_runtime.js': 'runtime',
      '.next/server/chunks/ssr/user-code.js': 'process.env.CMS_TOKEN',
    });
    const { routes, diagnostics } = discoverRoutes(join(dir, '.next'));
    const files = routes[0]?.serverFiles ?? [];
    expect(files.some((file) => file.endsWith('user-code.js'))).toBe(true);
    expect(files.some((file) => file.endsWith('page.js'))).toBe(true);
    expect(files.some((file) => file.endsWith('missing-chunk.js'))).toBe(false);
    expect(diagnostics).toEqual([]);
  });

  it('skips Next.js-internal app routes', () => {
    const dir = makeProject({
      '.next/prerender-manifest.json': prerenderManifest({ '/_not-found': {} }),
      '.next/app-path-routes-manifest.json': appPathRoutesManifest({
        '/_not-found/page': '/_not-found',
      }),
    });
    const { routes } = discoverRoutes(join(dir, '.next'));
    expect(routes).toEqual([]);
  });

  it('classifies pages-router routes via exported HTML', () => {
    const dir = makeProject({
      '.next/prerender-manifest.json': prerenderManifest({}),
      '.next/server/pages-manifest.json': JSON.stringify({
        '/_app': 'pages/_app.js',
        '/auto-static': 'pages/auto-static.js',
        '/server-rendered': 'pages/server-rendered.js',
        '/api/hello': 'pages/api/hello.js',
      }),
      '.next/server/pages/auto-static.js': 'process.env.CMS_TOKEN',
      '.next/server/pages/auto-static.html': '<html></html>',
      '.next/server/pages/server-rendered.js': 'process.env.CMS_TOKEN',
    });
    const { routes } = discoverRoutes(join(dir, '.next'));
    const byRoute = Object.fromEntries(routes.map((route) => [route.route, route]));
    expect(Object.keys(byRoute).sort()).toEqual(['/auto-static', '/server-rendered']);
    expect(byRoute['/auto-static']?.prerendered).toBe(true);
    expect(byRoute['/server-rendered']?.prerendered).toBe(false);
  });
});
