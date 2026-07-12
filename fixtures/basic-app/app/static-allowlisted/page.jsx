// Static route reading a build-time env var on purpose. The allowlist entry
// in next-env-audit.config.json marks this as intentional, so it must be
// reported as allowlisted rather than as a finding.
export default function StaticAllowlistedPage() {
  return (
    <main>
      <h1>Static route with an allowlisted build-time var</h1>
      <p>Build stamp: {process.env.BUILD_INFO ?? 'unknown'}</p>
    </main>
  );
}
