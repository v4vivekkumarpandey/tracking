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
  invoices: 'M6 2h9l5 5v15H6z M14 2v6h6 M9 13h8 M9 17h8',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  referrals: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M19 8v6 M22 11h-6',
  smartlink: 'M13 2L4 14h7l-1 8 9-12h-7z',
  domains:'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9 M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9',
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
