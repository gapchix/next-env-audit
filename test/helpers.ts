import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach } from 'vitest';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Writes a file tree into a fresh temp directory and returns its path. */
export function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'next-env-audit-'));
  created.push(dir);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = join(dir, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
  return dir;
}

export function prerenderManifest(
  routes: Record<string, { revalidate?: number | false; srcRoute?: string | null }>,
): string {
  return JSON.stringify({
    version: 4,
    routes: Object.fromEntries(
      Object.entries(routes).map(([path, meta]) => [
        path,
        {
          initialRevalidateSeconds: meta.revalidate ?? false,
          srcRoute: meta.srcRoute === undefined ? path : meta.srcRoute,
          dataRoute: `${path}.rsc`,
        },
      ]),
    ),
    dynamicRoutes: {},
    notFoundRoutes: [],
    preview: { previewModeId: 'x', previewModeSigningKey: 'x', previewModeEncryptionKey: 'x' },
  });
}

export function appPathRoutesManifest(entries: Record<string, string>): string {
  return JSON.stringify(entries);
}

/**
 * A minimal synthetic webpack-style project: route entry chunks under
 * .next/server/app containing the compiled code directly.
 */
export function syntheticProject(options: {
  staticRoutes?: Record<string, string>;
  dynamicRoutes?: Record<string, string>;
  isrRoutes?: Record<string, { source: string; revalidate: number }>;
  clientChunks?: Record<string, string>;
  extraFiles?: Record<string, string>;
}): string {
  const staticRoutes = options.staticRoutes ?? {};
  const dynamicRoutes = options.dynamicRoutes ?? {};
  const isrRoutes = options.isrRoutes ?? {};
  const files: Record<string, string> = { ...(options.extraFiles ?? {}) };

  const appPaths: Record<string, string> = {};
  const prerendered: Record<string, { revalidate?: number | false }> = {};
  for (const [route, source] of Object.entries(staticRoutes)) {
    appPaths[`${route === '/' ? '' : route}/page`] = route;
    prerendered[route] = { revalidate: false };
    files[join('.next', 'server', 'app', route === '/' ? '' : route, 'page.js')] = source;
  }
  for (const [route, { source, revalidate }] of Object.entries(isrRoutes)) {
    appPaths[`${route}/page`] = route;
    prerendered[route] = { revalidate };
    files[join('.next', 'server', 'app', route, 'page.js')] = source;
  }
  for (const [route, source] of Object.entries(dynamicRoutes)) {
    appPaths[`${route}/page`] = route;
    files[join('.next', 'server', 'app', route, 'page.js')] = source;
  }

  files[join('.next', 'prerender-manifest.json')] = prerenderManifest(prerendered);
  files[join('.next', 'app-path-routes-manifest.json')] = appPathRoutesManifest(appPaths);
  for (const [name, source] of Object.entries(options.clientChunks ?? {})) {
    files[join('.next', 'static', 'chunks', name)] = source;
  }
  return makeProject(files);
}
