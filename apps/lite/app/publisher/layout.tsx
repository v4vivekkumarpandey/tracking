import { requirePublisher } from '@/lib/auth';
import { Shell } from '../_components/Shell';

export default async function PublisherLayout({ children }: { children: React.ReactNode }) {
  const me = await requirePublisher();
  return (
    <Shell
      panel="Publisher panel"
      user={me.email}
      sections={[
        { links: [{ href: '/publisher', icon: 'dashboard', label: 'Dashboard', exact: true }] },
        { title: 'Offers', links: [
          { href: '/publisher/offers', icon: 'offers', label: 'Offers' },
          { href: '/publisher/smartlinks', icon: 'smartlink', label: 'Smart links' },
          { href: '/publisher/postbacks', icon: 'postbacks', label: 'Postbacks' },
          { href: '/publisher/domains', icon: 'domains', label: 'Domains' },
        ] },
        { title: 'Analyze', links: [
          { href: '/publisher/reports', icon: 'reports', label: 'Reporting' },
          { href: '/publisher/conversions', icon: 'conversions', label: 'Conversions' },
          { href: '/publisher/clicks', icon: 'clicks', label: 'Click log' },
          { href: '/publisher/linktest', icon: 'linktest', label: 'Link test' },
        ] },
        { title: 'Account', links: [
          { href: '/publisher/payments', icon: 'payments', label: 'Payments' },
          { href: '/publisher/referrals', icon: 'referrals', label: 'Referrals' },
          { href: '/publisher/account', icon: 'account', label: 'Settings' },
        ] },
      ]}
    >
      {children}
    </Shell>
  );
}
