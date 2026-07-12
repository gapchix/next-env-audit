// Param route statically generated via generateStaticParams — the most
// common real-world static shape. Reads a server-only var that IS set at
// build time: the value is frozen into every generated page (warning, not
// error), and findings must be attributed to the /posts/[slug] pattern.
export function generateStaticParams() {
  return [{ slug: 'first-post' }, { slug: 'second-post' }];
}

export default async function PostPage({ params }) {
  const { slug } = await params;
  const source = process.env.POSTS_SOURCE_URL;
  return (
    <main>
      <h1>Post: {slug}</h1>
      <p>{source ? `Loaded from ${source}` : 'No posts source configured'}</p>
    </main>
  );
}
