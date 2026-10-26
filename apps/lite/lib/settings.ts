import { exec, q } from './db';

// Admin-editable settings (key/value), with defaults.
export const DEFAULTS = {
  company_name: '',
  company_address: '',
  company_tax_id: '',
  company_email: '',
  invoice_payment_terms: 'Payment due within 15 days. Bank / PayPal details: ',
  invoice_due_days: '15',
  invoice_tax_percent: '0',
  referral_percent: '5',
  referral_months: '12',
  default_auto_approve_days: '',
} as const;

export type SettingKey = keyof typeof DEFAULTS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(): Promise<Settings> {
  const rows = await q<{ k: string; v: string | null }>(`SELECT k, v FROM settings`);
  const s: Settings = { ...DEFAULTS };
  for (const r of rows) if (r.k in DEFAULTS) s[r.k as SettingKey] = r.v ?? '';
  return s;
}

export async function saveSettings(values: Partial<Settings>): Promise<void> {
  for (const [k, v] of Object.entries(values)) {
    if (!(k in DEFAULTS)) continue;
    await exec(`INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = ?`, [k, v ?? '', v ?? '']);
  }
}

/** Referral terms as numbers, clamped to sane ranges. */
export function referralTerms(s: Settings) {
  const pct = Math.min(50, Math.max(0, Number(s.referral_percent) || 0));
  const months = Math.min(120, Math.max(1, Math.round(Number(s.referral_months) || 12)));
  return { pct, months };
}
