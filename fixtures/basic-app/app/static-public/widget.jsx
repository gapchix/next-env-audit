'use client';

// NEXT_PUBLIC_API_URL is set in .env → its value is inlined into this chunk.
// NEXT_PUBLIC_MISSING_FLAG is set nowhere → the reference survives the build
// textually and evaluates to undefined in the browser.
export function PublicEnvWidget() {
  return (
    <dl>
      <dt>NEXT_PUBLIC_API_URL</dt>
      <dd>{process.env.NEXT_PUBLIC_API_URL ?? 'undefined'}</dd>
      <dt>NEXT_PUBLIC_MISSING_FLAG</dt>
      <dd>{process.env.NEXT_PUBLIC_MISSING_FLAG ?? 'undefined'}</dd>
    </dl>
  );
}
