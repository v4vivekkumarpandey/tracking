import { requirePublisher } from '@/lib/auth';
import { trackingBase } from '@/lib/format';
import { LinkTest } from '../../_components/LinkTest';
import { linkTestPublisher } from '../actions';

export default async function PublisherLinkTest() {
  await requirePublisher();
  return (
    <>
      <h1>Link test</h1>
      <p className="muted">Paste one of your tracking links to see every redirect up to the offer page and how long each hop takes.</p>
      <LinkTest action={linkTestPublisher} panel="publisher" example={`${trackingBase()}/c/AbC123?source_id=test&sub1=test`} />
    </>
  );
}
