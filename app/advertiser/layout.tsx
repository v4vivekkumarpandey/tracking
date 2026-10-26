import { requireAdvertiser } from '@/lib/auth';
import { q } from '@/lib/db';
import { Shell } from '../_components/Shell';

export default async function AdvertiserLayout({ children }: { children: React.ReactNode }) {
  const me = await requireAdvertiser();
  const [{ pending }] = await q<{ pending: number }>(
    `SELECT COUNT(*) AS pending FROM conversions c JOIN offers o ON o.id = c.offer_id
     WHERE o.advertiser_id = ? AND c.status = 'pending'`, [me.advertiserId],
  );
  return (
    <Shell
      panel="Advertiser panel"
      user={me.email}
      sections={[
        { links: [{ href: '/advertiser', icon: 'dashboard', label: 'Dashboard', exact: true }] },
        { title: 'Manage', links: [
          { href: '/advertiser/offers', icon: 'offers', label: 'Offers' },
          { href: '/advertiser/integration', icon: 'integration', label: 'Integration' },
        ] },
        { title: 'Analyze', links: [
          { href: '/advertiser/reports', icon: 'reports', label: 'Reporting' },
          { href: '/advertiser/conversions', icon: 'conversions', label: 'Conversions', badge: Number(pending) },
        ] },
        { title: 'Account', links: [{ href: '/advertiser/account', icon: 'account', label: 'Settings' }] },
      ]}
    >
      {children}
    </Shell>
  );
}
