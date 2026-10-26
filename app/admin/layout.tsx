import { requireAdmin } from '@/lib/auth';
import { pendingCounts } from '@/lib/queue';
import { Shell } from '../_components/Shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const email = await requireAdmin();
  const pending = await pendingCounts();
  return (
    <Shell
      panel="Admin panel"
      user={email}
      sections={[
        { links: [
          { href: '/admin', icon: 'dashboard', label: 'Dashboard', exact: true },
          { href: '/admin/requests', icon: 'requests', label: 'Approvals', badge: pending.total },
        ] },
        { title: 'Manage', links: [
          { href: '/admin/offers', icon: 'offers', label: 'Offers' },
          { href: '/admin/advertisers', icon: 'advertisers', label: 'Advertisers' },
          { href: '/admin/publishers', icon: 'publishers', label: 'Publishers' },
          { href: '/admin/domains', icon: 'domains', label: 'Domains' },
        ] },
        { title: 'Analyze', links: [
          { href: '/admin/reports', icon: 'reports', label: 'Reporting' },
          { href: '/admin/conversions', icon: 'conversions', label: 'Conversions' },
        ] },
        { title: 'Finance', links: [
          { href: '/admin/payments', icon: 'payments', label: 'Payments' },
        ] },
      ]}
    >
      {children}
    </Shell>
  );
}
