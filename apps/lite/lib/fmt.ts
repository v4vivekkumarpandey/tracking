// Formatting that works on both server and client (no process.env here).
import type { Metric } from './dashboard';

export const METRIC_LABEL: Record<Metric, string> = {
  clicks: 'Clicks',
  conversions: 'Conversions',
  cvr: 'CVR',
  revenue: 'Revenue',
  payout: 'Payout',
  margin: 'Margin',
};

const MONEY: Metric[] = ['revenue', 'payout', 'margin'];

export function fmtMetric(metric: Metric, v: number, currency: string, compact = false): string {
  if (metric === 'cvr') return `${v.toFixed(2)}%`;
  if (MONEY.includes(metric)) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: compact && Math.abs(v) >= 1000 ? 'compact' : 'standard',
      maximumFractionDigits: compact && Math.abs(v) >= 1000 ? 1 : 2,
    }).format(v);
  }
  return new Intl.NumberFormat('en-US', {
    notation: compact && Math.abs(v) >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(v);
}
