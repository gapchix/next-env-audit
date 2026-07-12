export const metadata = {
  title: 'next-env-audit fixture',
  description: 'Tiny Next.js app exercising every check in next-env-audit.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
