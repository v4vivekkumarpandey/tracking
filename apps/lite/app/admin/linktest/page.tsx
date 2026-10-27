import { requireAdmin } from '@/lib/auth';
import { trackingBase } from '@/lib/format';
import { LinkTest } from '../../_components/LinkTest';
import { linkTestAdmin } from '../actions';

export default async function AdminLinkTest() {
  await requireAdmin();
  return (
    <>
      <h1>Link test</h1>
      <p className="muted">Paste any tracking link to see every redirect up to the offer page, how long each hop takes, and whether the click ID reaches the advertiser.</p>
      <LinkTest action={linkTestAdmin} panel="admin" example={`${trackingBase()}/c/AbC123?source_id=test&sub1=test`} />
    </>
  );
}
