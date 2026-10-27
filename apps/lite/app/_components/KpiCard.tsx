// Stat tile: label, month-to-date value, delta vs the same days last month,
// a daily sparkline, and Today / Yesterday / MTD / Last month rows.

type Props = {
  title: string;
  value: string;
  delta: number | null;
  /** Daily values for this month so far, with their labels for tooltips. */
  spark: { label: string; value: number; text: string }[];
  rows: [string, string][];
};

export function KpiCard({ title, value, delta, spark, rows }: Props) {
  return (
    <section className="kpi">
      <header className="kpi-head">{title}</header>
      <div className="kpi-body">
        <div className="kpi-period">
          <span>Month to date</span>
          <Delta value={delta} />
        </div>
        <div className="kpi-value">{value}</div>
        <Sparkline points={spark} title={`${title}, daily this month`} />
      </div>
      <table className="kpi-rows">
        <tbody>
          {rows.map(([label, v]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return <span className="delta muted" title="No data for the same days last month">–</span>;
  }
  const up = value >= 0;
  return (
    <span className={`delta ${up ? 'up' : 'down'}`} title="Compared with the same days last month">
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <path d={up ? 'M5 1 L9 8 H1 Z' : 'M5 9 L9 2 H1 Z'} fill="currentColor" />
      </svg>
      {Math.abs(value) >= 1000 ? '>999' : Math.abs(value).toFixed(0)}%
      <span className="sr-only">{up ? ' up' : ' down'} vs same days last month</span>
    </span>
  );
}

const W = 100;
const H = 36;

function Sparkline({ points, title }: { points: Props['spark']; title: string }) {
  const n = points.length;
  const max = Math.max(...points.map((p) => p.value), 0);
  const min = Math.min(...points.map((p) => p.value), 0);
  const range = max - min || 1;
  const x = (i: number) => (n <= 1 ? (i === 0 ? 0 : W) : (i / (n - 1)) * W);
  const y = (v: number) => H - 2 - ((v - min) / range) * (H - 4);

  // A single day still draws a flat line across the tile.
  const pts = n === 1 ? [points[0], points[0]] : points;
  const xs = (i: number) => (n === 1 ? i * W : x(i));
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const slot = W / Math.max(n, 1);

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
      <path d={area} className="spark-area" />
      <path d={line} className="spark-line" vectorEffect="non-scaling-stroke" />
      {points.map((p, i) => (
        <rect key={p.label} x={i * slot} y={0} width={slot} height={H} className="spark-hit">
          <title>{`${p.label}: ${p.text}`}</title>
        </rect>
      ))}
    </svg>
  );
}
