export const companies = [
  { id: 'reliance', name: 'Reliance Industries', symbol: 'RELIANCE.BSE', market: 'India', exchange: 'BSE', currency: 'INR', monogram: 'R', sector: 'Energy · Telecom · Retail' },
  { id: 'tcs', name: 'Tata Consultancy Services', symbol: 'TCS.BSE', market: 'India', exchange: 'BSE', currency: 'INR', monogram: 'T', sector: 'Technology services' },
  { id: 'apple', name: 'Apple', symbol: 'AAPL', market: 'US', exchange: 'NASDAQ', currency: 'USD', monogram: 'A', sector: 'Consumer technology' },
  { id: 'microsoft', name: 'Microsoft', symbol: 'MSFT', market: 'US', exchange: 'NASDAQ', currency: 'USD', monogram: 'M', sector: 'Cloud · Enterprise software' },
] as const;
export type StockID = typeof companies[number]['id'];
export type PricePoint = { date: string; close: number };
export type NewsItem = { id: string; title: string; canonical_url: string; publisher: string; published_at: string; publication_precision: 'date' | 'timestamp'; first_seen_at: string; source_kind: string; sentiment: 'positive' | 'negative' | 'neutral' };
export type Forecast = { state: string; mode?: string; estimated_close?: number; expected_change_pct?: number; direction?: string; target_session?: string; cutoff?: string; eligible_news?: number; method?: string; limitations?: string; evaluation?: { sessions: string[]; price_only_mae: number; baseline_mae: number; news_informed_mae: number | null; news_covered_sessions: number; coverage_gap: string | null } };
export type Snapshot = { id: StockID; prices: PricePoint[]; fetched_at: string | null; state: string; issue: string | null; news?: NewsItem[]; forecast?: { payload: Forecast; generated_at?: string } };
export type RefreshStatus = { last_success: string | null; runs: { external_id: string; status: string; started_at: string; finished_at: string | null; counts: Record<string, number>; failures: string[] }[]; sources: { feed_id: string; status: string; item_count: number; checked_at: string }[] };
export type Answer = { state: string; answer: string; citations: string[]; sources: NewsItem[]; retrieval?: string; tool?: { tool: string; transport: string; called_at: string } | null };
export const formatMoney = (amount: number | undefined, currency: string) => amount === undefined ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
export const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : 'No successful refresh yet';
