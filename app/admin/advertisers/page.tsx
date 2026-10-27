import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { count, dateTime, money } from '@/lib/format';

type Advertiser = {
  id: number; name: string; company: string | null; email: string | null; reference_id: string | null;
  account_manager: string | null; status: string; created_at: Date; login: string | null;
  offers: number; conversions: string; revenue: string;
};

const TABS = ['all', 'active', 'pending', 'paused'] as const;
type Tab = (typeof TABS)[number];

export default async function Advertisers(props: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await props.searchParams;
  const tab: Tab = TABS.find((t) => t === sp.status) ?? 'all';
  const search = (sp.q ?? '').trim().slice(0, 100);

  const [rows, counts] = await Promise.all([
    q<Advertiser>(
      `SELECT a.id, a.name, a.company, a.email, a.reference_id, a.account_manager, a.status, a.created_at,
              (SELECT u.email FROM users u WHERE u.advertiser_id = a.id LIMIT 1) AS login,
              (SELECT COUNT(*) FROM offers o WHERE o.advertiser_id = a.id AND o.status <> 'archived') AS offers,
              (SELECT COUNT(*) FROM conversions c JOIN offers o ON o.id = c.offer_id
                WHERE o.advertiser_id = a.id AND c.status <> 'rejected' AND c.created_at >= UTC_DATE() - INTERVAL 30 DAY) AS conversions,
              (SELECT COALESCE(SUM(c.revenue), 0) FROM conversions c JOIN offers o ON o.id = c.offer_id
                WHERE o.advertiser_id = a.id AND c.status <> 'rejected' AND c.created_at >= UTC_DATE() - INTERVAL 30 DAY) AS revenue
       FROM advertisers a
       WHERE (? = 'all' OR a.status = ?)
         AND (? = '' OR a.name LIKE CONCAT('%', ?, '%') OR a.company LIKE CONCAT('%', ?, '%') OR a.email LIKE CONCAT('%', ?, '%')
              OR a.reference_id = ? OR a.account_manager LIKE CONCAT('%', ?, '%') OR a.id = ?)
       ORDER BY a.status = 'pending' DESC, a.id DESC`,
      [tab, tab, search, search, search, search, search, search, Number(search) || 0],
    ),
    q<{ status: string; n: number }>(`SELECT status, COUNT(*) AS n FROM advertisers GROUP BY status`),
  ]);
  const n = (t: Tab) => (t === 'all' ? counts.reduce((s, c) => s + Number(c.n), 0) : Number(counts.find((c) => c.status === t)?.n ?? 0));
  const qs = (t: Tab) => `/admin/advertisers?status=${t}${search ? `&q=${encodeURIComponent(search)}` : ''}`;

  return (
    <>
      <div className="crumb">Manage</div>
      <div className="title-row">
        <h1>Advertisers</h1>
        <Link href="/admin/advertisers/new" className="button">+ Add advertiser</Link>
      </div>

      <form className="card row" role="search">
        <input type="hidden" name="status" value={tab} />
        <input name="q" defaultValue={search} placeholder="Search by name, company, email, reference ID, manager or ID"
          aria-label="Search advertisers" style={{ flex: 1, minWidth: 220 }} />
        <button type="submit">Search</button>
        {search && <Link href={`/admin/advertisers?status=${tab}`}>Clear</Link>}
      </form>

      <div className="tabs">
        {TABS.map((t) => (
          <Link key={t} href={qs(t)} className={t === tab ? 'active' : undefined}>
            {t} <span className="muted">({n(t)})</span>
          </Link>
        ))}
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Advertiser</th><th>Email</th><th>Account manager</th><th>Reference ID</th>
              <th className="num">Offers</th><th className="num">Conv. 30d</th><th className="num">Revenue 30d</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.id}</td>
                <td><Link href={`/admin/advertisers/${a.id}`}>{a.name}</Link>{a.company && <div className="muted">{a.company}</div>}</td>
                <td>{a.email ?? <span className="muted">–</span>}{!a.login && <div className="muted small">no login</div>}</td>
                <td>{a.account_manager ?? <span className="muted">–</span>}</td>
                <td className="mono">{a.reference_id ?? <span className="muted">–</span>}</td>
                <td className="num">{a.offers}</td>
                <td className="num">{count(a.conversions)}</td>
                <td className="num">{money(a.revenue)}</td>
                <td><span className={`badge ${a.status}`}>{a.status}</span></td>
                <td>{dateTime(a.created_at)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={10} className="muted">No advertisers found. <Link href="/admin/advertisers/new">Add one</Link>.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
