export type CheckId = 'server-bake' | 'client-bake';

export const CHECK_IDS: readonly CheckId[] = ['server-bake', 'client-bake'];

export type Severity = 'error' | 'warning' | 'info';

export interface AllowRule {
  /** Env var name the rule matches. Supports `*` wildcards. */
  var: string;
  /**
   * Route pattern the rule applies to. Supports `*` wildcards.
   * Omit to match every route, including client-bake findings (which have no route).
   */
  route?: string;
  /** Why this bake is intentional — echoed in the report. */
  reason?: string;
}

export interface AuditConfig {
  /** Findings matching these rules are reported as allowlisted instead of as problems. */
  allow: AllowRule[];
  /** Extra env var names (supports `*`) ignored entirely, on top of the built-in framework list. */
  ignore: string[];
  /** Checks that make the CLI exit non-zero. The `--fail-on` flag overrides this. */
  failOn: CheckId[];
}

export interface RouteInfo {
  /** Route pattern, e.g. `/blog/[slug]`. */
  route: string;
  router: 'app' | 'pages';
  /** True when the route was statically prerendered at build time. */
  prerendered: boolean;
  /** `false` = fully static, number = ISR revalidate seconds, `null` = unknown. */
  revalidate: number | false | null;
  /** Concrete paths prerendered at build time (differs from `route` for param routes). */
  prerenderedPaths: string[];
  /** Compiled server chunk files located for this route. */
  serverFiles: string[];
}

export interface ServerBakeFinding {
  check: 'server-bake';
  severity: Severity;
  route: string;
  var: string;
  /** Whether the var resolves to a non-empty value in the audit-time environment. */
  presentAtAudit: boolean;
  revalidate: number | false | null;
  message: string;
  allowReason?: string;
}

export type ClientBakeKind = 'inlined' | 'not-inlined' | 'not-found' | 'unverified';

export interface ClientBakeFinding {
  check: 'client-bake';
  severity: Severity;
  kind: ClientBakeKind;
  var: string;
  presentAtAudit: boolean;
  /** Truncated inlined value, when one was located. */
  valuePreview?: string;
  /** Number of client chunks the var (or its value) was found in. */
  chunkCount?: number;
  message: string;
  allowReason?: string;
}

export type Finding = ServerBakeFinding | ClientBakeFinding;

export interface AuditResult {
  projectDir: string;
  nextDir: string;
  config: AuditConfig;
  routes: RouteInfo[];
  findings: Finding[];
  allowlisted: Finding[];
  /** Non-finding notes about the audit itself (e.g. chunks that could not be located). */
  diagnostics: string[];
}
