import { HOLD } from '@/lib/fraud';

/** Fraud score badge: shown from 40; "held" at HOLD (never auto-approved). */
export function RiskBadge({ score, reasons }: { score: number | null; reasons: string | null }) {
  const s = Number(score ?? 0);
  if (s < 40) return null;
  return (
    <div className={`risk ${s >= HOLD ? 'high' : 'medium'}`} title={reasons ?? ''}>
      <span className={`badge ${s >= HOLD ? 'rejected' : 'pending'}`}>{s >= HOLD ? `high risk ${s} · held` : `risk ${s}`}</span>
      {reasons && <div className="muted">{reasons}</div>}
    </div>
  );
}
