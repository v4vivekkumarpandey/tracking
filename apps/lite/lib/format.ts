export const CURRENCY = (process.env.CURRENCY ?? 'USD').toUpperCase();
const TZ = process.env.DISPLAY_TIMEZONE ?? 'UTC';

const cur = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-US');

export const money = (v: string | number | null | undefined) => cur.format(Number(v ?? 0));
export const count = (v: string | number | null | undefined) => num.format(Number(v ?? 0));
export const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(2)}%` : '–');

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return '';
  return new Date(v).toLocaleString('en-US', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

/** YYYY-MM-DD in UTC, matching how reports group by day. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const trackingBase = () => (process.env.TRACKING_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
