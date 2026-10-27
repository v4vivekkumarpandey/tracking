import type { Profile } from '@/lib/profile';

/** Publisher profile inputs, shared by the publisher's Settings and the admin edit form. */
export function ProfileFields({ p }: { p: Profile }) {
  return (
    <>
      <div className="grid2">
        <label>Name<input name="name" defaultValue={p.name} required maxLength={200} /></label>
        <label>Company<input name="company" defaultValue={p.company ?? ''} maxLength={200} /></label>
        <label>Contact email<input name="email" type="email" defaultValue={p.email ?? ''} maxLength={200} /></label>
        <label>Phone<input name="phone" type="tel" defaultValue={p.phone ?? ''} maxLength={40} placeholder="+91 98765 43210" /></label>
        <label>Telegram / Skype / WhatsApp<input name="messenger" defaultValue={p.messenger ?? ''} maxLength={100} placeholder="Telegram @yourname" /></label>
        <label>Website<input name="website" type="url" defaultValue={p.website ?? ''} placeholder="https://" /></label>
        <label>Country (2 letters)<input name="country" defaultValue={p.country ?? ''} maxLength={2} placeholder="IN" /></label>
        <label>Tax / VAT / GST ID<input name="tax_id" defaultValue={p.tax_id ?? ''} maxLength={64} /></label>
      </div>
      <label>Address<textarea name="address" rows={2} defaultValue={p.address ?? ''} maxLength={1000} /></label>
      <label>Traffic sources (how you promote offers)<textarea name="traffic_sources" rows={2} defaultValue={p.traffic_sources ?? ''} maxLength={2000} placeholder="Google Ads, SEO blog, email list…" /></label>
    </>
  );
}
