const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');

export const money = (v: string | number | null | undefined) => inr.format(Number(v ?? 0));
export const count = (v: string | number | null | undefined) => num.format(Number(v ?? 0));
export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(2)}%` : '–');

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return '';
  return new Date(v).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

/** YYYY-MM-DD in UTC, matching how reports group by day. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const trackingBase = () => (process.env.TRACKING_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '');
