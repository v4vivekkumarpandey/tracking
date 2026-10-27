// Publisher profile fields, validated the same way for the publisher's own
// Settings page and the admin's edit form.

export type Profile = {
  name: string; company: string | null; email: string | null; website: string | null; country: string | null;
  tax_id: string | null; phone: string | null; messenger: string | null; address: string | null; traffic_sources: string | null;
};

export function profileFrom(fd: FormData): Profile | { error: string } {
  const s = (k: string, max: number) => String(fd.get(k) ?? '').trim().slice(0, max);
  const name = s('name', 200);
  if (!name) return { error: 'Name is required.' };
  const email = s('email', 200).toLowerCase();
  if (email && !/^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(email)) return { error: 'Contact email doesn\'t look right.' };
  const website = s('website', 255);
  if (website && !/^https?:\/\/\S+\.\S+/.test(website)) return { error: 'Website must start with http:// or https://' };
  const country = s('country', 2).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) return { error: 'Country must be a 2-letter code, e.g. IN or US.' };
  const phone = s('phone', 40);
  if (phone && !/^\+?[0-9 ()-]{6,40}$/.test(phone)) return { error: 'Phone: digits, spaces and + only (e.g. +91 98765 43210).' };
  return {
    name, company: s('company', 200) || null, email: email || null, website: website || null, country: country || null,
    tax_id: s('tax_id', 64) || null, phone: phone || null, messenger: s('messenger', 100) || null,
    address: s('address', 1000) || null, traffic_sources: s('traffic_sources', 2000) || null,
  };
}
