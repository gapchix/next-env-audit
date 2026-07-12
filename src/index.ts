export { runAudit, shouldFail, type AuditOptions } from './audit.js';
export { runClientBakeCheck, type ClientBakeResult } from './checks/client-bake.js';
export {
  findClientPublicEnvRefs,
  findServerEnvRefs,
  isFrameworkEnv,
  type EnvRef,
} from './checks/env-refs.js';
export { runServerBakeCheck, type ServerBakeResult } from './checks/server-bake.js';
export { DEFAULT_CONFIG, findAllowRule, loadConfig, matchesPattern } from './config.js';
export { loadBuildEnv, parseEnvFile } from './env-files.js';
export { AuditError } from './errors.js';
export { discoverRoutes } from './manifests.js';
export { renderReport, type ReportOptions } from './report.js';
export {
  CHECK_IDS,
  type AllowRule,
  type AuditConfig,
  type AuditResult,
  type CheckId,
  type ClientBakeFinding,
  type ClientBakeKind,
  type Finding,
  type RouteInfo,
  type ServerBakeFinding,
  type Severity,
} from './types.js';
