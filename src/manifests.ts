import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { AuditError } from './errors.js';
import type { RouteInfo } from './types.js';

interface PrerenderEntry {
  initialRevalidateSeconds?: number | false;
  srcRoute?: string | null;
}

interface PrerenderManifest {
  routes?: Record<string, PrerenderEntry>;
  dynamicRoutes?: Record<string, unknown>;
}

const SKIP_APP_ROUTES = new Set(['/_not-found', '/_global-error']);
const SKIP_PAGES_ROUTES = new Set(['/_app', '/_document', '/_error', '/404', '/500']);

function readJson<T>(path: string): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    throw new AuditError(
      `Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readJsonIfExists<T>(path: string): T | undefined {
  return existsSync(path) ? readJson<T>(path) : undefined;
}

// Both webpack and Turbopack emit thin route entries that pull user code in
// from shared chunk files (Turbopack: `R.c("server/chunks/ssr/…")`, webpack:
// `require("../chunks/123.js")`). Following those string references one level
// deep is what makes per-route attribution work.
const CHUNK_REF_RE = /["']([^"'\n]*chunks[^"'\n]*\.js)["']/g;

function resolveServerFiles(nextDir: string, entryPath: string): string[] {
  if (!existsSync(entryPath)) return [];
  const files = [entryPath];
  const source = readFileSync(entryPath, 'utf8');
  const seen = new Set<string>(files);
  for (const match of source.matchAll(CHUNK_REF_RE)) {
    const ref = match[1] as string;
    const candidate = ref.startsWith('server/')
      ? join(nextDir, ref)
      : resolve(dirname(entryPath), ref);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    // Never follow references outside the build directory.
    if (!candidate.startsWith(nextDir + sep)) continue;
    if (existsSync(candidate)) files.push(candidate);
  }
  return files;
}

function prerenderMatches(
  prerenderRoutes: Record<string, PrerenderEntry>,
  route: string,
): [string, PrerenderEntry][] {
  return Object.entries(prerenderRoutes).filter(
    ([path, meta]) => path === route || meta.srcRoute === route,
  );
}

function revalidateOf(matches: [string, PrerenderEntry][]): number | false | null {
  const seconds = matches
    .map(([, meta]) => meta.initialRevalidateSeconds)
    .filter((value): value is number => typeof value === 'number');
  if (seconds.length > 0) return Math.min(...seconds);
  if (matches.some(([, meta]) => meta.initialRevalidateSeconds === false)) return false;
  return null;
}

/**
 * Classifies every route in a `.next` build directory as prerendered or
 * dynamic and locates the compiled server code belonging to it.
 */
export function discoverRoutes(nextDir: string): { routes: RouteInfo[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const prerenderPath = join(nextDir, 'prerender-manifest.json');
  if (!existsSync(prerenderPath)) {
    throw new AuditError(
      `No prerender-manifest.json in ${nextDir} — run \`next build\` first ` +
        '(next-env-audit analyzes build output, it does not build).',
    );
  }
  const prerenderRoutes = readJson<PrerenderManifest>(prerenderPath).routes ?? {};
  const routes: RouteInfo[] = [];

  // App router: app-path-routes-manifest maps entry keys ("/blog/[slug]/page")
  // to route patterns ("/blog/[slug]"). Route handlers ("/sitemap.xml/route")
  // are included on purpose — static handlers bake env vars the same way.
  const appPaths =
    readJsonIfExists<Record<string, string>>(join(nextDir, 'app-path-routes-manifest.json')) ?? {};
  const appPathsServer =
    readJsonIfExists<Record<string, string>>(join(nextDir, 'server', 'app-paths-manifest.json')) ??
    {};
  for (const [entryKey, route] of Object.entries(appPaths)) {
    if (SKIP_APP_ROUTES.has(route)) continue;
    const matches = prerenderMatches(prerenderRoutes, route);
    const prerendered = matches.length > 0;
    const serverRelative =
      appPathsServer[entryKey] ?? join('app', `${entryKey.replace(/^\//, '')}.js`);
    const entryPath = join(nextDir, 'server', serverRelative);
    const serverFiles = resolveServerFiles(nextDir, entryPath);
    if (prerendered && serverFiles.length === 0) {
      diagnostics.push(
        `Could not locate compiled server code for ${route} (expected ${entryPath}) — ` +
          'server-bake check skipped for that route.',
      );
    }
    routes.push({
      route,
      router: 'app',
      prerendered,
      revalidate: prerendered ? revalidateOf(matches) : null,
      prerenderedPaths: matches.map(([path]) => path),
      serverFiles,
    });
  }

  // Pages router: a page is prerendered when it was exported to HTML at build
  // time (automatic static optimization) or appears in the prerender manifest
  // (getStaticProps).
  const pagesManifest =
    readJsonIfExists<Record<string, string>>(join(nextDir, 'server', 'pages-manifest.json')) ?? {};
  for (const [route, file] of Object.entries(pagesManifest)) {
    if (SKIP_PAGES_ROUTES.has(route) || route === '/api' || route.startsWith('/api/')) continue;
    const matches = prerenderMatches(prerenderRoutes, route);
    const jsFile = file.endsWith('.html') ? file.replace(/\.html$/, '.js') : file;
    const htmlFile = jsFile.replace(/\.js$/, '.html');
    const prerendered =
      file.endsWith('.html') || existsSync(join(nextDir, 'server', htmlFile)) || matches.length > 0;
    const entryPath = join(nextDir, 'server', jsFile);
    routes.push({
      route,
      router: 'pages',
      prerendered,
      revalidate: prerendered ? revalidateOf(matches) : null,
      prerenderedPaths: matches.map(([path]) => path),
      serverFiles: resolveServerFiles(nextDir, entryPath),
    });
  }

  routes.sort((a, b) => a.route.localeCompare(b.route));
  return { routes, diagnostics };
}
