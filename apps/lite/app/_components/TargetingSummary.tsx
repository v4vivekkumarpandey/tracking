import { money } from '@/lib/format';

type T = { countries: string | null; devices: string | null; daily_cap: number | null; monthly_cap: number | null; daily_budget?: string | null };

/** One line of the offer's targeting and caps (shown to admin and publishers). */
export function TargetingSummary({ o, showBudget = true }: { o: T; showBudget?: boolean }) {
  const parts: string[] = [];
  if (o.countries) parts.push(`Countries: ${o.countries.split(',').join(', ')}`);
  if (o.devices) parts.push(`Devices: ${o.devices.split(',').join(', ')}`);
  if (o.daily_cap != null) parts.push(`Daily cap: ${o.daily_cap} conversions`);
  if (o.monthly_cap != null) parts.push(`Monthly cap: ${o.monthly_cap} conversions`);
  if (showBudget && o.daily_budget) parts.push(`Daily budget: ${money(o.daily_budget)}`);
  if (parts.length === 0) return <div className="muted">Targeting: all countries and devices, no caps.</div>;
  return <div className="targeting">{parts.map((p) => <span key={p} className="badge">{p}</span>)}</div>;
}
