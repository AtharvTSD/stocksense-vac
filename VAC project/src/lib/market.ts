export const stocks = [
  { id: 'reliance', name: 'Reliance Industries', symbol: 'RELIANCE.BSE', market: 'India', currency: 'INR', zone: 'Asia/Kolkata', coverage: 'Exact BSE symbol and compact daily history verified with the configured key on 20 November 2026. Current retrieval unavailable.' },
  { id: 'tcs', name: 'TCS', symbol: 'TCS.BSE', market: 'India', currency: 'INR', zone: 'Asia/Kolkata', coverage: 'Exact BSE symbol and compact daily history verified with the configured key on 20 November 2026. Current retrieval unavailable.' },
  { id: 'apple', name: 'Apple', symbol: 'AAPL', market: 'US', currency: 'USD', zone: 'America/New_York', coverage: 'Exact US symbol and compact daily history verified with the configured key on 20 November 2026. Current retrieval unavailable.' },
  { id: 'microsoft', name: 'Microsoft', symbol: 'MSFT', market: 'US', currency: 'USD', zone: 'America/New_York', coverage: 'Exact US symbol and compact daily history verified with the configured key on 20 November 2026. Current retrieval unavailable.' },
] as const;
export type Stock = typeof stocks[number];
export type Price = { date: string; close: number };
export type Headline = { id: string; title: string; url: string; publishedAt: string; source: string; sample: boolean };
export type Classification = { id: string; relevant: boolean; sentiment: 'positive' | 'neutral' | 'negative' };
export type NewsFeature = { cutoff: string; observations: (Headline & Classification)[] };
// Reserved for a combined model: only observations available by cutoff may enter features.
export function newsAtCutoff(feature: NewsFeature) {
  return feature.observations.filter(n => !n.sample && n.relevant && Date.parse(n.publishedAt) <= Date.parse(feature.cutoff));
}
export function samplePrices(stock: Stock): Price[] {
  const base = { reliance: 1200, tcs: 3000, apple: 200, microsoft: 400 }[stock.id];
  const rows: Price[] = [];
  for (let day = 1; rows.length < 65; day++) {
    const d = new Date(Date.UTC(2026, 5, day));
    if ([0, 6].includes(d.getUTCDay())) continue;
    rows.push({ date: d.toISOString().slice(0, 10), close: +(base * (1 + rows.length * .0007 + Math.sin(rows.length / 4) * .012)).toFixed(2) });
  }
  return rows;
}
export function sampleHeadlines(stock: Stock): Headline[] {
  return [
    { id: 'company', title: `Fictional test: ${stock.name} reports stronger demand for its services and products.` },
    { id: 'world', title: 'Fictional test: global energy costs rise as shipping routes face disruption.' },
    { id: 'unrelated', title: 'Fictional test: local community opens a new public garden.' },
  ].map(n => ({ ...n, url: `https://example.com/stocksense-samples/${stock.id}/${n.id}`, publishedAt: '2026-08-28T09:00:00Z', source: 'StockSense synthetic test fixture (not a published article)', sample: true }));
}
export function forecast(rows: Price[]) {
  if (rows.length < 60) return null;
  // Fixed 20-return mean model; last 10 sessions are evaluated chronologically.
  const estimate = (prefix: Price[]) => {
    const last = prefix.at(-1)!.close;
    const returns = prefix.slice(-21).slice(1).map((p, i) => p.close / prefix.slice(-21)[i].close - 1);
    return last * (1 + returns.reduce((a, b) => a + b, 0) / returns.length);
  };
  const latest = rows.at(-1)!;
  const close = estimate(rows);
  let error = 0, baseline = 0;
  for (let i = rows.length - 10; i < rows.length; i++) {
    error += Math.abs(estimate(rows.slice(0, i)) - rows[i].close);
    baseline += Math.abs(rows[i - 1].close - rows[i].close);
  }
  const change = close / latest.close - 1;
  return { close, direction: Math.abs(change) <= .001 ? 'Flat' : change > 0 ? 'Up' : 'Down', cutoffSession: latest.date, mae: error / 10, baselineMae: baseline / 10, heldOut: 10 };
}
