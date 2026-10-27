export type AdvertiserInfo = {
  name: string; email: string | null; company: string | null; website: string | null; tax_id: string | null;
  reference_id: string | null; account_manager: string | null; notes: string | null;
};

/** Fields shared by the add and edit advertiser forms. `extra` fills the grid slot after Account manager. */
export function AdvertiserFields({ a, managers, extra }: { a?: AdvertiserInfo; managers: string[]; extra: React.ReactNode }) {
  return (
    <>
      <div className="grid2 two">
        <label><span>Full name <span className="req">*</span></span>
          <input name="name" required maxLength={200} defaultValue={a?.name} placeholder="Name of the advertiser, website or brand" />
        </label>
        <label><span>Email <span className="req">*</span></span>
          <input name="email" type="email" required maxLength={200} defaultValue={a?.email ?? ''} placeholder="Unique advertiser email" />
        </label>
        <label><span>Account manager <span className="muted">(optional)</span></span>
          <input name="account_manager" maxLength={200} list="account-managers" defaultValue={a?.account_manager ?? ''} placeholder="Who looks after this advertiser" />
          <datalist id="account-managers">{managers.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        {extra}
        <label>Reference ID
          <input name="reference_id" maxLength={64} defaultValue={a?.reference_id ?? ''} placeholder="e.g. their ID in Everflow or your CRM" />
        </label>
        <label>Company
          <input name="company" maxLength={200} defaultValue={a?.company ?? ''} placeholder="Company name" />
        </label>
        <label>Website
          <input name="website" type="url" maxLength={255} defaultValue={a?.website ?? ''} placeholder="https://" />
        </label>
        <label>Tax / VAT ID
          <input name="tax_id" maxLength={64} defaultValue={a?.tax_id ?? ''} />
        </label>
      </div>
      <label><span>Notes <span className="muted">(optional)</span></span>
        <textarea name="notes" rows={3} maxLength={5000} defaultValue={a?.notes ?? ''} placeholder="Enter note" />
        <span className="hint">Only admins see this. It isn&apos;t shown to the advertiser or publishers.</span>
      </label>
    </>
  );
}
