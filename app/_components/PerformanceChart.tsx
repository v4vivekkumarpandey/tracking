'use client';

import { useRef, useState } from 'react';
import type { Day, Metric } from '@/lib/dashboard';
import { METRIC_LABEL, fmtMetric } from '@/lib/fmt';

// Cumulative month-to-date for the chosen metric: this month as the accent
// line, last month as a de-emphasised gray line + wash for comparison.

type Props = {
  current: Day[];
  last: Day[];
  today: number;
  currency: string;
  currentLabel: string;
  lastLabel: string;
  /** Metrics offered in the dropdown (summable ones only); first is the default. */
  metrics?: Metric[];
  /** Per-panel names, e.g. publishers see payout as "Earnings". */
  labels?: Partial<Record<Metric, string>>;
};

const DEFAULT_METRICS: Metric[] = ['revenue', 'payout', 'margin', 'conversions', 'clicks'];
const W = 900;
const H = 280;
const PAD = { l: 60, r: 72, t: 16, b: 30 };

function cumulative(days: Day[], metric: Metric): number[] {
  let c = 0;
  return days.map((d) => {
    c += metric === 'margin' ? d.revenue - d.payout : (d[metric as keyof Day] as number);
    return c;
  });
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v < max + step - 1e-9; v += step) ticks.push(+v.toFixed(10));
  return ticks;
}

export function PerformanceChart({ current, last, today, currency, currentLabel, lastLabel, metrics = DEFAULT_METRICS, labels = {} }: Props) {
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const label = (m: Metric) => labels[m] ?? METRIC_LABEL[m];
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cur = cumulative(current, metric).slice(0, today + 1);
  const prev = cumulative(last, metric);
  const n = Math.max(current.length, last.length);
  const all = [...cur, ...prev, 0];
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const base = y(Math.max(yMin, 0));
  const prevArea = prev.length ? `${path(prev)} L${x(prev.length - 1)},${base} L${x(0)},${base} Z` : '';

  const fmt = (v: number, compact = false) => fmtMetric(metric, v, currency, compact);
  const curNow = cur[cur.length - 1] ?? 0;
  const prevSame = prev[Math.min(today, prev.length - 1)] ?? 0;
  const prevTotal = prev[prev.length - 1] ?? 0;

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((vx - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const h = hover;
  return (
    <section className="card perf">
      <header className="perf-head">
        <h2>Performance</h2>
        <label className="perf-metric">
          Metric
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {metrics.map((m) => <option key={m} value={m}>{label(m)}</option>)}
          </select>
        </label>
        <span className="muted">Current month vs last month, cumulative</span>
        <ul className="legend">
          <li><i className="key key-current" />{currentLabel}</li>
          <li><i className="key key-prior" />{lastLabel}</li>
        </ul>
      </header>

      <div className="perf-plot">
        <div className="perf-canvas">
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${label(metric)} month to date: ${fmt(curNow)}; same point last month ${fmt(prevSame)}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis' : 'grid'} />
              <text x={PAD.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{fmt(t, true)}</text>
            </g>
          ))}
          {Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === 0).map((i) => (
            <text key={i} x={x(i)} y={H - 8} className="tick" textAnchor="middle">{String(i + 1).padStart(2, '0')}</text>
          ))}

          <path d={prevArea} className="prior-area" />
          <path d={path(prev)} className="prior-line" />
          <path d={path(cur)} className="current-line" />
          {cur.length > 0 && (
            <>
              <circle cx={x(cur.length - 1)} cy={y(curNow)} r={4} className="current-dot" />
              <text x={x(cur.length - 1) + 10} y={y(curNow)} className="end-label" dominantBaseline="middle">{fmt(curNow, true)}</text>
            </>
          )}

          {h !== null && (
            <g pointerEvents="none">
              <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H - PAD.b} className="crosshair" />
              {prev[h] !== undefined && <circle cx={x(h)} cy={y(prev[h])} r={4} className="prior-dot" />}
              {cur[h] !== undefined && <circle cx={x(h)} cy={y(cur[h])} r={4} className="current-dot" />}
            </g>
          )}
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b}
            fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>

        {h !== null && (
          <div className="tooltip" style={{ left: `${(x(h) / W) * 100}%` }}>
            <div className="tooltip-title">Day {h + 1}</div>
            <div><i className="key key-current" />{currentLabel}: <strong>{cur[h] !== undefined ? fmt(cur[h]) : '–'}</strong></div>
            <div><i className="key key-prior" />{lastLabel}: <strong>{prev[h] !== undefined ? fmt(prev[h]) : '–'}</strong></div>
          </div>
        )}
        </div>
      </div>

      <footer className="perf-foot">
        {label(metric)} month to date <strong>{fmt(curNow)}</strong> vs <strong>{fmt(prevSame)}</strong> at the same point last month
        <span className="muted"> · last month total {fmt(prevTotal)}</span>
      </footer>

      <details className="perf-table">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Day</th><th className="num">{currentLabel}</th><th className="num">{lastLabel}</th></tr></thead>
            <tbody>
              {Array.from({ length: n }, (_, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="num">{cur[i] !== undefined ? fmt(cur[i]) : ''}</td>
                  <td className="num">{prev[i] !== undefined ? fmt(prev[i]) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
