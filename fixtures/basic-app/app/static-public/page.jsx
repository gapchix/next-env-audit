import { PublicEnvWidget } from './widget';

export default function StaticPublicPage() {
  return (
    <main>
      <h1>Client component reading NEXT_PUBLIC_* vars</h1>
      <PublicEnvWidget />
    </main>
  );
}
