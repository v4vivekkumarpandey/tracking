import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getInvoice } from '@/lib/invoices';
import { getSettings } from '@/lib/settings';
import { InvoiceView } from '../../../_components/InvoiceView';

export default async function AdminInvoice({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [data, s] = await Promise.all([getInvoice(id), getSettings()]);
  if (!data) notFound();
  return (
    <>
      <div className="crumb no-print"><Link href="/admin/invoices">Invoices</Link></div>
      <InvoiceView inv={data.inv} lines={data.lines} s={s} />
    </>
  );
}
