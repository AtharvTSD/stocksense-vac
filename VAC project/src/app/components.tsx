import Link from 'next/link';
import type { Price } from '@/lib/market';
export function Header() {
  return <header className="pilot-header"><Link href="/" className="pilot-brand">StockSense<span>BMSCE · VAC PILOT</span></Link><nav><Link href="/">Dashboard</Link><Link href="/wireframe">Original wireframe</Link></nav></header>;
}
export function Chart({ rows }: { rows: Price[] }) {
  const recent = rows.slice(-30);
  const min = Math.min(...recent.map(p => p.close)), max = Math.max(...recent.map(p => p.close));
  const points = recent.map((p, i) => `${10 + i * 580 / Math.max(1, recent.length - 1)},${150 - (p.close - min) / (max - min || 1) * 130}`).join(' ');
  return <div><svg viewBox="0 0 600 170" role="img" aria-label={`Recent closes from ${recent[0].date} to ${recent.at(-1)!.date}; values available below`} className="pilot-chart"><path d="M10 150H590" stroke="#d2dedb"/><polyline points={points} fill="none" stroke="#087f70" strokeWidth="3"/></svg><div className="pilot-between"><small>{recent[0].date}</small><small>{recent.at(-1)!.date}</small></div><details><summary>View chart values</summary><table><thead><tr><th>Session</th><th>Close</th></tr></thead><tbody>{recent.map(p => <tr key={p.date}><td>{p.date}</td><td>{p.close.toFixed(2)}</td></tr>)}</tbody></table></details></div>;
}
export const money = (value: number, currency: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
