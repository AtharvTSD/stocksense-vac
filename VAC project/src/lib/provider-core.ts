import type { Classification, Price } from './market';
export class ProviderError extends Error {
  constructor(public code: 'quota' | 'missing-symbol' | 'provider' | 'invalid-response' | 'missing-key' | 'cache-unavailable') { super(code); }
}
export function parsePrices(data: unknown, symbol: string, today: string): Price[] {
  if (!data || typeof data !== 'object') throw new ProviderError('invalid-response');
  const d = data as Record<string, unknown>;
  if (d.Note || d.Information) throw new ProviderError('quota');
  if (d['Error Message']) throw new ProviderError('missing-symbol');
  const meta = d['Meta Data'] as Record<string, unknown> | undefined;
  if (meta?.['2. Symbol'] !== symbol) throw new ProviderError('missing-symbol');
  const series = d['Time Series (Daily)'];
  if (!series || typeof series !== 'object') throw new ProviderError('invalid-response');
  const rows = Object.entries(series).map(([date, value]) => ({ date, close: Number((value as Record<string, unknown>)?.['4. close']) }));
  if (rows.some(p => !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !Number.isFinite(p.close) || p.close <= 0)) throw new ProviderError('invalid-response');
  // Conservative: exclude the current exchange-local date, including possibly incomplete candles.
  const completed = rows.filter(p => p.date < today).sort((a, b) => a.date.localeCompare(b.date));
  if (!completed.length) throw new ProviderError('invalid-response');
  return completed;
}
export function parseClassifications(data: unknown, ids: string[]): Classification[] {
  const entries = (data as { items?: unknown })?.items;
  if (!Array.isArray(entries) || entries.length !== ids.length) throw new ProviderError('invalid-response');
  const result: Classification[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Object.keys(entry).sort().join(',') !== 'id,relevant,sentiment' || !ids.includes(entry.id) || typeof entry.relevant !== 'boolean' || !['positive', 'neutral', 'negative'].includes(entry.sentiment) || result.some(r => r.id === entry.id)) throw new ProviderError('invalid-response');
    result.push(entry);
  }
  return result;
}
