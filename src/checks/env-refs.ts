export interface EnvRef {
  name: string;
  via: 'dot' | 'bracket' | 'destructure';
}

const IDENT = '[A-Za-z_$][A-Za-z0-9_$]*';

// Server chunks keep `process.env.X` literally (env is read at runtime there),
// so the server-side scanner anchors on the full expression.
const DOT_RE = new RegExp(`\\bprocess\\.env\\.(${IDENT})`, 'g');
const BRACKET_RE = new RegExp(`\\bprocess\\.env\\[\\s*["'\`](${IDENT})["'\`]\\s*\\]`, 'g');
const DESTRUCTURE_RE = /\{([^{}]{1,400})\}\s*=\s*process\.env\b/g;
const DESTRUCTURE_NAME_RE = new RegExp(`^(${IDENT})\\s*(?:[:=][\\s\\S]*)?$`);

// Client bundles differ per bundler: webpack leaves `process.env.NEXT_PUBLIC_X`
// textually when the var was missing at build time, while Turbopack rewrites
// the access through a process polyfill (e.g. `d.default.env.NEXT_PUBLIC_X`).
// Anchoring on `.env.NEXT_PUBLIC_*` catches both without false-positiving on
// plain string occurrences of the var name.
const CLIENT_DOT_RE = /\.env\.(NEXT_PUBLIC_[A-Za-z0-9_]*)/g;
const CLIENT_BRACKET_RE = /\benv\[\s*["'`](NEXT_PUBLIC_[A-Za-z0-9_]*)["'`]\s*\]/g;

/** Finds env var names referenced in compiled *server* code. */
export function findServerEnvRefs(source: string): EnvRef[] {
  const refs = new Map<string, EnvRef>();
  const add = (name: string | undefined, via: EnvRef['via']) => {
    if (name !== undefined && !refs.has(name)) refs.set(name, { name, via });
  };
  for (const match of source.matchAll(DOT_RE)) add(match[1], 'dot');
  for (const match of source.matchAll(BRACKET_RE)) add(match[1], 'bracket');
  for (const match of source.matchAll(DESTRUCTURE_RE)) {
    for (const part of (match[1] ?? '').split(',')) {
      const trimmed = part.trim();
      if (trimmed === '' || trimmed.startsWith('...')) continue;
      const nameMatch = DESTRUCTURE_NAME_RE.exec(trimmed);
      add(nameMatch?.[1], 'destructure');
    }
  }
  return [...refs.values()];
}

/** Finds `NEXT_PUBLIC_*` references that survived into compiled *client* code. */
export function findClientPublicEnvRefs(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(CLIENT_DOT_RE)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  for (const match of source.matchAll(CLIENT_BRACKET_RE)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names];
}

const FRAMEWORK_EXACT = new Set(['NODE_ENV', 'TZ', 'PORT', 'HOSTNAME']);
const FRAMEWORK_PREFIXES = ['NEXT_', '__NEXT', '_NEXT', 'NODE_', 'VERCEL', 'TURBOPACK', 'npm_'];

/**
 * Env vars owned by Next.js, Node or the platform — never worth reporting.
 * `NEXT_PUBLIC_*` is covered by the `NEXT_` prefix on the server side because
 * public vars are the client-bake check's domain.
 */
export function isFrameworkEnv(name: string): boolean {
  if (FRAMEWORK_EXACT.has(name)) return true;
  return FRAMEWORK_PREFIXES.some((prefix) => name.startsWith(prefix));
}
