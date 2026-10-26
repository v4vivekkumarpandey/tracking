'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const ICONS = {
  dashboard: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  offers: 'M4 7h16v13H4z M9 7V4h6v3',
  advertisers: 'M4 21V8l8-5 8 5v13 M9 21v-6h6v6',
  publishers: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0z M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  reports: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  conversions: 'M4 12l5 5L20 6',
  requests: 'M4 4h16v16H4z M4 13h5l1.5 3h3l1.5-3h5',
  payments: 'M3 6h18v12H3z M3 10h18 M7 15h4',
  postbacks: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1 M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  integration: 'M8 6l-6 6 6 6 M16 6l6 6-6 6',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
} as const;

export type IconName = keyof typeof ICONS;

export function NavLink({ href, icon, exact, badge, children }: {
  href: string; icon: IconName; exact?: boolean; badge?: number; children: React.ReactNode;
}) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + '/');
  return (
    <Link href={href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONS[icon]} />
      </svg>
      <span className="nav-label">{children}</span>
      {!!badge && <span className="nav-badge" aria-label={`${badge} waiting`}>{badge}</span>}
    </Link>
  );
}
