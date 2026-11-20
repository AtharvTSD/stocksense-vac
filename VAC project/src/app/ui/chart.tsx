'use client';
import { useId, useState } from 'react';
import { formatMoney, type PricePoint } from '@/lib/pilot';
export default function Chart({ prices, currency, compact = false }: { prices: PricePoint[]; currency: string; compact?: boolean }) {
  const id = useId().replaceAll(':', '');
  const [hover, setHover] = useState<number | null>(null);
  if (!prices.length) return <div className={compact ? 'spark-empty' : 'chart-empty'}>{compact ? 'History pending' : <><span className="chart-empty-icon">∿</span><strong>Your price history will appear here.</strong><p>A successful refresh is required. No sample prices are shown.</p></>}</div>;
  const rows = compact ? prices.slice(-25) : prices.slice(-60);
  const values = rows.map(p => p.close);
  const low = Math.min(...values), high = Math.max(...values);
  const width = 780, height = compact ? 110 : 270;
  const padding = compact ? 5 : 20;
  const point = (p: PricePoint, i: number) => [padding + i * (width - padding * 2) / Math.max(1, rows.length - 1), height - padding - ((p.close - low) / (high - low || 1)) * (height - padding * 2)];
  const line = rows.map((p, i) => point(p, i).join(',')).join(' ');
  const item = rows[hover ?? rows.length - 1];
  return <div className={compact ? 'spark-wrap' : 'price-chart'}>
    {!compact && <div className="chart-readout"><span>{item.date}</span><strong>{formatMoney(item.close, currency)}</strong><span>Raw completed close</span></div>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Completed session closes from ${rows[0].date} to ${rows.at(-1)!.date}`} onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".22"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      {!compact && [0, 1, 2, 3].map(i => <line key={i} x1="20" x2="760" y1={20 + i * 76} y2={20 + i * 76} className="chart-grid"/>)}
      <polygon points={`${padding},${height} ${line} ${width-padding},${height}`} fill={`url(#${id})`}/>
      <polyline className="chart-line" points={line} fill="none" stroke="currentColor" strokeWidth={compact ? 6 : 3} strokeLinecap="round" strokeLinejoin="round"/>
      {!compact && rows.map((p, i) => <rect key={p.date} x={point(p, i)[0] - 7} y="0" width="14" height={height} fill="transparent" onMouseEnter={() => setHover(i)}/>)}
      {!compact && hover !== null && <circle cx={point(rows[hover], hover)[0]} cy={point(rows[hover], hover)[1]} r="5" fill="currentColor"/>}
    </svg>
    {!compact && <><div className="chart-axis"><span>{rows[0].date}</span><span>{currency} · {rows.length} sessions</span><span>{rows.at(-1)!.date}</span></div><details className="chart-values"><summary>Accessible chart data</summary><div className="table-scroll"><table><thead><tr><th>Completed session</th><th>Close ({currency})</th></tr></thead><tbody>{rows.map(p => <tr key={p.date}><td>{p.date}</td><td>{formatMoney(p.close, currency)}</td></tr>)}</tbody></table></div></details></>}
  </div>;
}
