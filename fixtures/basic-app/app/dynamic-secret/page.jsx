// Reads the same server-only env var as /static-secret, but opts into
// dynamic rendering — the value is read at request time, so this is fine
// and must NOT be flagged.
export const dynamic = 'force-dynamic';

export default function DynamicSecretPage() {
  const token = process.env.CMS_TOKEN;
  return (
    <main>
      <h1>Dynamic route reading a server-only env var</h1>
      <p>
        {token
          ? `CMS token is set (${token.length} chars)`
          : 'CMS token missing (read at request time)'}
      </p>
    </main>
  );
}
