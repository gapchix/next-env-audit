// Statically prerendered (no dynamic APIs used) while reading a server-only
// env var. If CMS_TOKEN is not set at build time, this page prerenders
// "empty" with a green build — the exact incident class the auditor detects.
export default function StaticSecretPage() {
  const token = process.env.CMS_TOKEN;
  return (
    <main>
      <h1>Static route reading a server-only env var</h1>
      <p>
        {token
          ? `CMS token is set (${token.length} chars)`
          : 'CMS token missing — this page prerendered empty'}
      </p>
    </main>
  );
}
