import type { Metadata } from 'next';
import './globals.css';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return { title: `${process.env.BRAND_NAME ?? 'Tracking'} · Affiliate platform`, robots: { index: false, follow: false } };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
