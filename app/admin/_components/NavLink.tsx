'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ICONS: Record<string, string> = {
  dashboard: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  offers: 'M4 7h16v13H4z M9 7V4h6v3',
  advertisers: 'M4 21V8l8-5 8 5v13 M9 21v-6h6v6',
  publishers: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0z M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  reports: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  conversions: 'M4 12l5 5L20 6',
};

export function NavLink({ href, icon, children }: { href: string; icon: keyof typeof ICONS; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === '/admin' ? path === '/admin' : path.startsWith(href);
  return (
    <Link href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[icon]} />
      </svg>
      {children}
    </Link>
  );
}
