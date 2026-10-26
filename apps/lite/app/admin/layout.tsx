import { requireAdmin } from '@/lib/auth';
import { logout } from './actions';
import { NavLink } from './_components/NavLink';

const BRAND = process.env.BRAND_NAME ?? 'Tracking';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">
          <span className="brand-name">{BRAND}</span>
          <span className="brand-sub">Affiliate platform</span>
        </div>
        <NavLink href="/admin" icon="dashboard">Dashboard</NavLink>

        <div className="nav-section">Manage</div>
        <NavLink href="/admin/offers" icon="offers">Offers</NavLink>
        <NavLink href="/admin/advertisers" icon="advertisers">Advertisers</NavLink>
        <NavLink href="/admin/publishers" icon="publishers">Publishers</NavLink>

        <div className="nav-section">Analyze</div>
        <NavLink href="/admin/reports" icon="reports">Reporting</NavLink>
        <NavLink href="/admin/conversions" icon="conversions">Conversions</NavLink>

        <form action={logout} className="nav-foot">
          <p className="muted">{email}</p>
          <button className="secondary small" type="submit">Sign out</button>
        </form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
