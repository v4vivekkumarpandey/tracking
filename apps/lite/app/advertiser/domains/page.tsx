import { requireAdvertiser } from '@/lib/auth';
import { cfConfigured } from '@/lib/cloudflare';
import { MAX_DOMAINS, cnameTarget, domainsFor } from '@/lib/domains';
import { DomainsManager } from '../../_components/DomainsManager';
import { addDomainAction, checkDomainAction, removeDomainAction } from '../actions';

export default async function AdvertiserDomains() {
  const me = await requireAdvertiser();
  const domains = await domainsFor({ type: 'advertiser', id: me.advertiserId });
  return (
    <>
      <div className="crumb">Manage</div>
      <h1>Tracking domains</h1>
      <DomainsManager
        domains={domains}
        add={addDomainAction}
        check={checkDomainAction}
        remove={removeDomainAction}
        target={cnameTarget()}
        enabled={cfConfigured()}
        max={MAX_DOMAINS}
        usage={<>Serve tracking from your own domain (first-party). Your conversion pixel and postback URLs, and publishers&apos; links to your offers, can then use e.g. <code>https://track.yourbrand.com</code>. First-party tracking is blocked less by browsers and ad blockers.</>}
      />
    </>
  );
}
