import { type NextRequest } from 'next/server';
import { requireAdmin, requireAdvertiser, requirePublisher } from '@/lib/auth';
import { csvResponse, toCsv, type Column } from '@/lib/csv';
import { ALL, type Scope } from '@/lib/dashboard';
import { q } from '@/lib/db';
import { RAW_GROUPS, parseRange, runReport, type Group, type ReportRow } from '@/lib/reports';
import { sourceLabel } from '@/lib/sourceLabels';
import { IMPORT_COLUMNS, exportCells, type OfferRow } from '@/lib/offerImport';

export const dynamic = 'force-dynamic';

// GET /export/{admin|publisher|advertiser}/{reports|conversions|payments}?from&to&group&status
// The scope always comes from the session; each panel exports only the
// columns it can already see on screen.

type Panel = 'admin' | 'publisher' | 'advertiser';
const MAX_ROWS = 100_000;
const money = (v: unknown) => Number(v ?? 0).toFixed(2);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString().replace('T', ' ').slice(0, 19) : '');

async function scopeFor(panel: Panel): Promise<Scope> {
  if (panel === 'admin') { await requireAdmin(); return ALL; }
  if (panel === 'publisher') return { kind: 'publisher', id: (await requirePublisher()).publisherId };
  return { kind: 'advertiser', id: (await requireAdvertiser()).advertiserId };
}

const ALLOWED_GROUPS: Record<Panel, Group[]> = {
  admin: ['day', 'offer', 'publisher', 'source_id', 'source', 'channel', 'landing'],
  publisher: ['day', 'offer', 'source_id', 'sub1', 'source', 'channel', 'landing'],
  advertiser: ['day', 'offer', 'source', 'channel', 'landing'],
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ panel: string; report: string }> }) {
  const { panel, report } = await params;
  if (!['admin', 'publisher', 'advertiser'].includes(panel)) return new Response('Not found', { status: 404 });
  const p = panel as Panel;
  const scope = await scopeFor(p);
  const sp = Object.fromEntries(req.nextUrl.searchParams);

  if (report === 'reports') {
    const group = (ALLOWED_GROUPS[p].includes(sp.group as Group) ? sp.group : 'day') as Group;
    const { from, to, toExcl } = parseRange(sp, p === 'publisher' || RAW_GROUPS.includes(group) ? 90 : 366);
    const { rows, total } = await runReport(scope, group, from, toExcl);
    const cols: Column<ReportRow>[] = [
      { header: group, value: (r) => r.label },
      { header: 'clicks', value: (r) => r.clicks },
      { header: 'conversions', value: (r) => r.conversions },
      { header: 'approved', value: (r) => r.approved },
      { header: 'pending', value: (r) => r.pending },
    ];
    if (p === 'admin') cols.push(
      { header: 'unique_clicks', value: (r) => r.uniques },
      { header: 'revenue', value: (r) => money(r.revenue) },
      { header: 'payout', value: (r) => money(r.payout) },
      { header: 'margin', value: (r) => money(r.revenue - r.payout) },
    );
    if (p === 'publisher') cols.push({ header: 'earnings', value: (r) => money(r.payout) });
    if (p === 'advertiser') cols.push({ header: 'cost', value: (r) => money(r.revenue) });
    return csvResponse(toCsv([...rows, total], cols), `report-${group}-${from}-to-${to}.csv`);
  }

  if (report === 'conversions') {
    const { from, to, toExcl } = parseRange({ from: sp.from ?? isoDaysAgo(30), to: sp.to }, 366);
    const status = ['pending', 'approved', 'rejected'].includes(sp.status ?? '') ? sp.status : null;
    const filter = scope.kind === 'publisher' ? ' AND c.publisher_id = ?' : scope.kind === 'advertiser' ? ' AND o.advertiser_id = ?' : '';
    const rows = await q<Record<string, unknown>>(
      `SELECT c.id, c.created_at, c.click_time, c.offer_id, o.name AS offer, c.publisher_id, p.name AS publisher,
              c.goal, c.txn_id, c.amount, c.revenue, c.payout, c.status, c.source, c.source_id, c.sub1, c.sub2, c.sub3, c.sub4, c.sub5, c.sub6, c.sub7, c.sub8, c.sub9, c.sub10, c.reject_reason, c.traffic_source
       FROM conversions c JOIN offers o ON o.id = c.offer_id JOIN publishers p ON p.id = c.publisher_id
       WHERE c.created_at >= ? AND c.created_at < ? AND (? IS NULL OR c.status = ?)${filter}
       ORDER BY c.id DESC LIMIT ${MAX_ROWS}`,
      [from, toExcl, status, status, ...(scope.kind === 'all' ? [] : [scope.id])],
    );
    type R = Record<string, unknown>;
    const s = (k: string) => (r: R) => (r[k] as string | number | null) ?? '';
    const cols: Column<R>[] = [
      { header: 'id', value: s('id') }, { header: 'created_at_utc', value: (r) => iso(r.created_at) },
      { header: 'offer_id', value: s('offer_id') }, { header: 'offer', value: s('offer') }, { header: 'goal', value: s('goal') },
    ];
    if (p === 'admin') cols.push(
      { header: 'publisher', value: s('publisher') }, { header: 'txn_id', value: s('txn_id') },
      { header: 'sale_amount', value: (r) => money(r.amount) }, { header: 'revenue', value: (r) => money(r.revenue) },
      { header: 'payout', value: (r) => money(r.payout) }, { header: 'source', value: s('source') }, { header: 'source_id', value: s('source_id') }, { header: 'sub1', value: s('sub1') },
    );
    if (p === 'publisher') cols.push(
      { header: 'source_id', value: s('source_id') },
      ...['sub1', 'sub2', 'sub3', 'sub4', 'sub5', 'sub6', 'sub7', 'sub8', 'sub9', 'sub10'].map((k) => ({ header: k, value: s(k) })),
      { header: 'payout', value: (r) => money(r.payout) },
    );
    if (p === 'advertiser') cols.push(
      { header: 'publisher', value: (r) => `Publisher #${r.publisher_id}` }, { header: 'txn_id', value: s('txn_id') },
      { header: 'sale_amount', value: (r) => money(r.amount) }, { header: 'cost', value: (r) => money(r.revenue) },
    );
    cols.push({ header: 'traffic_source', value: (r) => (r.traffic_source ? sourceLabel(String(r.traffic_source)) : '') });
    cols.push({ header: 'status', value: s('status') }, { header: 'reject_reason', value: s('reject_reason') });
    return csvResponse(toCsv(rows, cols), `conversions-${from}-to-${to}.csv`);
  }

  // Same columns as the import, so the file can be edited in Excel and uploaded again.
  if (report === 'offers' && p === 'admin') {
    const cols: Column<Record<string, string>>[] = IMPORT_COLUMNS.map((c) => ({ header: c.key, value: (r) => r[c.key] }));
    if (sp.template === '1') {
      const [adv] = await q<{ email: string | null; id: number }>(`SELECT email, id FROM advertisers ORDER BY id LIMIT 1`);
      const example = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.example]));
      example.advertiser = adv ? String(adv.email ?? adv.id) : 'advertiser@example.com';
      return csvResponse(toCsv([example], cols), 'offers-template.csv');
    }
    const rows = await q<OfferRow>(
      `SELECT o.*, a.email AS advertiser_email FROM offers o JOIN advertisers a ON a.id = o.advertiser_id
       WHERE o.status <> 'archived' OR ? = '1' ORDER BY o.id LIMIT ${MAX_ROWS}`, [sp.archived ?? ''],
    );
    return csvResponse(toCsv(rows.map(exportCells), cols), `offers-${isoDaysAgo(0)}.csv`);
  }

  if (report === 'payments' && p !== 'advertiser') {
    const rows = await q<Record<string, unknown>>(
      `SELECT pay.id, pay.paid_at, pay.publisher_id, pub.name, pay.amount, pay.method, pay.reference, pay.period_from, pay.period_to, pay.note
       FROM payments pay JOIN publishers pub ON pub.id = pay.publisher_id
       WHERE (? IS NULL OR pay.publisher_id = ?) ORDER BY pay.paid_at DESC LIMIT ${MAX_ROWS}`,
      [scope.kind === 'publisher' ? scope.id : null, scope.kind === 'publisher' ? scope.id : null],
    );
    const cols: Column<Record<string, unknown>>[] = [
      { header: 'paid_at_utc', value: (r) => iso(r.paid_at) },
      ...(p === 'admin' ? [{ header: 'publisher', value: (r: Record<string, unknown>) => r.name as string }] : []),
      { header: 'amount', value: (r) => money(r.amount) },
      { header: 'method', value: (r) => r.method as string },
      { header: 'reference', value: (r) => (r.reference as string) ?? '' },
      { header: 'period_from', value: (r) => (r.period_from ? iso(r.period_from).slice(0, 10) : '') },
      { header: 'period_to', value: (r) => (r.period_to ? iso(r.period_to).slice(0, 10) : '') },
    ];
    return csvResponse(toCsv(rows, cols), `payments.csv`);
  }

  return new Response('Not found', { status: 404 });
}

function isoDaysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}
