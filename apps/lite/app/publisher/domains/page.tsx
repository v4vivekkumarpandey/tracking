import { requirePublisher } from '@/lib/auth';
import { cfConfigured } from '@/lib/cloudflare';
import { MAX_DOMAINS, cnameTarget, domainsFor } from '@/lib/domains';
import { DomainsManager } from '../../_components/DomainsManager';
import { addDomainAction, checkDomainAction, removeDomainAction } from '../actions';

export default async function PublisherDomains() {
  const me = await requirePublisher();
  const domains = await domainsFor({ type: 'publisher', id: me.publisherId });
  return (
    <>
      <div className="crumb">Offers</div>
      <h1>Tracking domains</h1>
      <DomainsManager
        domains={domains}
        add={addDomainAction}
        check={checkDomainAction}
        remove={removeDomainAction}
        target={cnameTarget()}
        enabled={cfConfigured()}
        max={MAX_DOMAINS}
        usage={<>Use your own domain in tracking links, e.g. <code>https://track.yoursite.com/c/…</code>. Once a domain is active, choose it in the link builder on any offer.</>}
      />
    </>
  );
}
