import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { q } from '@/lib/db';
import { MIN_PASSWORD } from '@/lib/password';
import { createAdvertiser } from '../../actions';
import { ActionForm } from '../../../_components/ActionForm';
import { AdvertiserFields } from '../AdvertiserFields';
import { PasswordField } from '../PasswordField';

export default async function NewAdvertiser() {
  await requireAdmin();
  const managers = await q<{ m: string }>(
    `SELECT DISTINCT account_manager AS m FROM advertisers WHERE account_manager IS NOT NULL ORDER BY m`,
  );
  return (
    <>
      <div className="crumb"><Link href="/admin/advertisers">Manage advertisers</Link> ›</div>
      <h1>Add an advertiser</h1>
      <ActionForm action={createAdvertiser} submit="Create advertiser">
        <h2>Details</h2>
        <AdvertiserFields managers={managers.map((r) => r.m)} extra={<>
          <label><span>Status <span className="req">*</span></span>
            <select name="status" defaultValue="active">
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="paused">Paused</option>
            </select>
          </label>
          <PasswordField min={MIN_PASSWORD} />
        </>} />
        <p className="muted small">
          With a password, the advertiser can sign in right away using their email. Send the password to them privately.
          Without one, use <em>Create login</em> on their page later.
        </p>
      </ActionForm>
    </>
  );
}
