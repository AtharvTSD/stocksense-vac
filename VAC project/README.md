# StockSense · BMSCE VAC pilot

Next.js / TypeScript research dashboard for exactly Reliance Industries, TCS, Apple and Microsoft. The existing Exercise 1 app is preserved at `/wireframe` with its original fixtures and test; the pilot is `/` with India and US navigation and `/stocks/{reliance,tcs,apple,microsoft}` details.

## Run

Use Node 22.20+ in this directory:

```powershell
npm.cmd ci
# If .env.local does not exist, copy .env.example to .env.local.
# Enter GROQ_API_KEY and ALPHA_VANTAGE_API_KEY locally, never in chat.
npm.cmd run dev
```

Open http://localhost:3000. Restart the server after changing keys. `.env.local`, other environment files, and `.cache/` are Git-ignored; only the empty `.env.example` is allowed. No public environment variables are used. Provider modules have a `server-only` guard. Keys and provider response bodies are never logged or returned to browsers. All links to synthetic articles are placeholders, not real reporting.

## Data and limits

Prices use [Alpha Vantage TIME_SERIES_DAILY](https://www.alphavantage.co/documentation/), `outputsize=compact` (up to 100 raw daily candles, free tier). Full history and daily adjusted endpoints are deliberately unused. [Standard free allowance](https://www.alphavantage.co/support/api-key/) is 25 requests/day. The pilot uses a more conservative local limit of four price requests per UTC day and one per minute, counted before requests including failed calls. Groq has an independent four-batch/day and one/minute limit with 1,000 output tokens per batch. Each stock's successful result is stored atomically for 24 hours under `.cache/stocksense`. Limits share a filesystem lock across local workers; lock contention fails closed. Do not delete budget files to retry, run multiple copies, or share the same keys with other workloads if you need this local budget to cover all usage. Actual account limits and usage elsewhere still apply.

On a cold cache only one company per provider can load each minute. Refresh after cooldown to load the next one. No background polling or automatic retries. Provider quota, unavailable symbols, malformed payloads, timeout, missing credentials and network failures produce sanitized codes. Stale successes retain retrieval timestamps; otherwise prices are explicitly fictional samples, and sentiment stays unavailable. Cache age and session date are both visible. Current exchange-local date candles are excluded conservatively even after market close, so the UI says latest completed close *in available history*. This protects against incomplete candles but can lag a completed session. EOD data is not a realtime quote.

No approved feed was configured in the workspace. Three synthetic headlines per company retain fixed synthetic publication times, source labels, and example.com placeholder URLs. They are sent to real [Groq structured outputs](https://console.groq.com/docs/structured-outputs) using `openai/gpt-oss-20b`. Local validation requires exact known IDs, one result per input, boolean relevance and positive/neutral/negative sentiment. Article strings are untrusted data; they cannot configure URLs, tools or model instructions. Only configured fixtures are used, with no arbitrary feed URL fetching.

## Experimental model

With at least 60 valid sessions, estimate the next session close using the mean of the previous 20 session returns. Up/Down compares with the last close; Flat is within ±0.1%. Last 10 sessions use strictly chronological walk-forward predictions compared against the same-session last-close baseline by MAE. No training uses the target session. Sample history produces a labelled model demonstration. No calibrated uncertainty interval is claimed. Raw prices can jump due to splits/dividends; exchange holidays are not resolved, so the target is next exchange session without an invented calendar date.

`NewsFeature` / `newsAtCutoff` in `src/lib/market.ts` reserves timestamped features. It excludes synthetic, irrelevant and post-cutoff news. News does not enter today's forecast. A combined model remains gated on sufficient historical real news aligned at each exchange's close, with model and price-only baseline compared on identical held-out sessions.

## Checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run verify:providers -- reliance --news
# Optional, after a build: npm.cmd start -- --hostname 127.0.0.1 --port 3100
# In another terminal: node --env-file=.env.local scripts/smoke.mjs
```

Provider verification consumes the same persisted budget and uses no key arguments. Tests mock provider responses in an isolated temporary directory and never use real credentials. Windows restricted sandbox testing may require a normal local terminal because tsx calls Windows user-info APIs.

## Pilot backlog

- Supabase test login and saved watchlists (the original wireframe watchlist is only an in-memory demo).
- One local n8n ingestion workflow with idempotency and source timestamps.
- Approved, timestamped news ingestion and aligned historical model comparison.
- Cited RAG with trusted sources and explicit retrieval provenance.
- One read-only MCP stock snapshot tool backed by normalized cached data.
- Exchange holiday calendars, adjusted price support when free coverage is available, and browser/mobile accessibility review.

No deployment, push, paid service, trading, or notifications are part of this slice. See `../documentations/Pilot-verification.md` for the actual verification record.
