import { logout } from './actions';
import { NavLink, type IconName } from './NavLink';

export type NavSection = {
  title?: string;
  links: { href: string; icon: IconName; label: string; exact?: boolean; badge?: number }[];
};

/** Sidebar + content frame shared by the admin, advertiser and publisher panels. */
export function Shell({ panel, user, sections, children }: {
  panel: string; user: string; sections: NavSection[]; children: React.ReactNode;
}) {
  const brand = process.env.BRAND_NAME ?? 'Tracking';
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">
          <span className="brand-name">{brand}</span>
          <span className="brand-sub">{panel}</span>
        </div>
        {sections.map((s, i) => (
          <div key={i} className="nav-group">
            {s.title && <div className="nav-section">{s.title}</div>}
            {s.links.map((l) => (
              <NavLink key={l.href} href={l.href} icon={l.icon} exact={l.exact} badge={l.badge}>{l.label}</NavLink>
            ))}
          </div>
        ))}
        <form action={logout} className="nav-foot">
          <p className="muted">{user}</p>
          <button className="secondary small" type="submit">Sign out</button>
          {/* DB-IP Lite is CC BY 4.0: attribution required. */}
          <p className="credit"><a href="https://db-ip.com" target="_blank" rel="noopener noreferrer">IP geolocation by DB-IP</a></p>
        </form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
