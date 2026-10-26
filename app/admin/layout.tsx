import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { logout } from './actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Tracking Admin</div>
        <Link href="/admin">Overview</Link>
        <Link href="/admin/reports">Reports</Link>
        <Link href="/admin/conversions">Conversions</Link>
        <Link href="/admin/offers">Offers</Link>
        <Link href="/admin/advertisers">Advertisers</Link>
        <Link href="/admin/publishers">Publishers</Link>
        <form action={logout}>
          <p className="muted" style={{ padding: '0 10px', margin: '12px 0 6px' }}>{email}</p>
          <button className="secondary small" type="submit">Sign out</button>
        </form>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
