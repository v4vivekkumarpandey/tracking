import { money } from '@/lib/format';
import { osLabel } from '@/lib/offerInfo';
import { sourceLabel } from '@/lib/sourceLabels';

type T = {
  countries: string | null; devices: string | null; os_targets?: string | null; daily_cap: number | null; monthly_cap: number | null;
  daily_budget?: string | null; blocked_sources?: string | null;
};

/** One line of the offer's targeting and caps (shown to admin and publishers). */
export function TargetingSummary({ o, showBudget = true }: { o: T; showBudget?: boolean }) {
  const parts: string[] = [];
  if (o.countries) parts.push(`Countries: ${o.countries.split(',').join(', ')}`);
  if (o.devices) parts.push(`Devices: ${o.devices.split(',').join(', ')}`);
  if (o.os_targets) parts.push(`OS: ${o.os_targets.split(',').map(osLabel).join(', ')}`);
  if (o.daily_cap != null) parts.push(`Daily cap: ${o.daily_cap} conversions`);
  if (o.monthly_cap != null) parts.push(`Monthly cap: ${o.monthly_cap} conversions`);
  if (showBudget && o.daily_budget) parts.push(`Daily budget: ${money(o.daily_budget)}`);
  const blocked = o.blocked_sources ? o.blocked_sources.split(',').map(sourceLabel) : [];
  return (
    <>
      {parts.length === 0
        ? <div className="muted">Targeting: all countries, devices and operating systems, no caps.</div>
        : <div className="targeting">{parts.map((p) => <span key={p} className="badge">{p}</span>)}</div>}
      {blocked.length > 0 && (
        <div className="targeting">
          <span className="badge rejected">Not allowed: {blocked.join(', ')}</span>
          <span className="muted"> Conversions from these traffic sources are held for review.</span>
        </div>
      )}
    </>
  );
}