import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>next-env-audit fixture</h1>
      <p>Each route exercises one scenario the auditor must classify correctly.</p>
      <ul>
        <li>
          <Link href="/static-secret">/static-secret</Link> — static route reading a server-only env
          var (the bug)
        </li>
        <li>
          <Link href="/static-public">/static-public</Link> — client component reading NEXT_PUBLIC_*
          vars
        </li>
        <li>
          <Link href="/dynamic-secret">/dynamic-secret</Link> — dynamic route reading a server-only
          env var (fine)
        </li>
        <li>
          <Link href="/static-allowlisted">/static-allowlisted</Link> — static route with an
          allowlisted build-time var
        </li>
      </ul>
    </main>
  );
}
