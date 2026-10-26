import type { Invoice } from '@/lib/invoices';
import { money } from '@/lib/format';
import type { Settings } from '@/lib/settings';
import { Logo } from './Logo';
import { PrintButton } from './PrintButton';

const d = (v: Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : '–');

/** Printable invoice (browser "Save as PDF" gives a clean one-page PDF). */
export function InvoiceView({ inv, lines, s }: {
  inv: Invoice; lines: { id: number; description: string; quantity: number; amount: string }[]; s: Settings;
}) {
  const brand = s.company_name || process.env.BRAND_NAME || 'Tracking';
  return (
    <article className="invoice">
      <div className="invoice-actions no-print"><PrintButton /></div>
      <header className="invoice-head">
        <div>
          <Logo />
          <div className="invoice-brand">{brand}</div>
          {s.company_address && <div className="wrap">{s.company_address}</div>}
          {s.company_tax_id && <div>Tax ID: {s.company_tax_id}</div>}
          {s.company_email && <div>{s.company_email}</div>}
        </div>
        <div className="invoice-meta">
          <h1>Invoice</h1>
          <div><strong>{inv.number}</strong> <span className={`badge ${inv.status === 'paid' ? 'approved' : inv.status === 'void' ? 'rejected' : 'pending'}`}>{inv.status}</span></div>
          <div>Issued: {d(inv.issued_at)}</div>
          <div>Due: {d(inv.due_at)}</div>
          <div>Period: {d(inv.period_from)} – {d(inv.period_to)}</div>
        </div>
      </header>
      <section className="invoice-to">
        <div className="muted">Bill to</div>
        <strong>{inv.company || inv.advertiser}</strong>
        {inv.company && <div>{inv.advertiser}</div>}
        {inv.email && <div>{inv.email}</div>}
        {inv.tax_id && <div>Tax ID: {inv.tax_id}</div>}
      </section>
      <table className="invoice-lines">
        <thead><tr><th>Description</th><th className="num">Conversions</th><th className="num">Amount</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}><td>{l.description}</td><td className="num">{l.quantity}</td><td className="num">{money(l.amount)}</td></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td colSpan={2} className="num">Subtotal</td><td className="num">{money(inv.subtotal)}</td></tr>
          {Number(inv.tax_percent) > 0 && <tr><td colSpan={2} className="num">Tax ({Number(inv.tax_percent)}%)</td><td className="num">{money(inv.tax_amount)}</td></tr>}
          <tr className="invoice-total"><td colSpan={2} className="num">Total due</td><td className="num">{money(inv.total)}</td></tr>
        </tfoot>
      </table>
      {s.invoice_payment_terms && <p className="wrap invoice-terms">{s.invoice_payment_terms}</p>}
      {inv.paid_at && <p className="ok-text">Paid on {d(inv.paid_at)}. Thank you.</p>}
    </article>
  );
}
