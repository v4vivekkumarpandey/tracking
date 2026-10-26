import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdvertiser } from '@/lib/auth';
import { getInvoice } from '@/lib/invoices';
import { getSettings } from '@/lib/settings';
import { InvoiceView } from '../../../_components/InvoiceView';

export default async function AdvertiserInvoice({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdvertiser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  // Scoped to this advertiser, and only sent/paid (never drafts).
  const [data, s] = await Promise.all([getInvoice(id, me.advertiserId), getSettings()]);
  if (!data) notFound();
  return (
    <>
      <div className="crumb no-print"><Link href="/advertiser/invoices">Invoices</Link></div>
      <InvoiceView inv={data.inv} lines={data.lines} s={s} />
    </>
  );
}
