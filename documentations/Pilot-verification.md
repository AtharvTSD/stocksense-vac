# StockSense pilot verification

Recorded 20 November 2026 (Asia/Kolkata). Existing Next.js app, design note, run notes, fixtures, wireframe and classroom work were inspected/preserved. No AGENTS.md, PRD, SRD or Canvas source was found in the workspace. There was no Git repository; a local repository was initialized with ignore rules, without commits or a remote push. The original app is available at `/wireframe` and its original interaction test now imports that route.

## Real API results

Using locally entered credentials, four successful server requests to Alpha Vantage `TIME_SERIES_DAILY`, `outputsize=compact` returned 100 sessions each. Metadata was checked against the exact requested symbol before saving data. All latest available completed sessions were **2026-11-19**. No full-history, adjusted, premium, intraday or paid endpoint was called. These successful responses establish coverage for the configured account at test time; account subscription status is not independently queryable through this endpoint. Compact daily history is documented as free by Alpha Vantage.

| Company | Exact verified symbol | Currency | Retrieved UTC |
| --- | --- | --- | --- |
| Reliance Industries | RELIANCE.BSE | INR | 2026-11-20 17:09:58 |
| Apple | AAPL | USD | 2026-11-20 17:11:24 |
| TCS | TCS.BSE | INR | 2026-11-20 17:12:34 |
| Microsoft | MSFT | USD | 2026-11-20 17:13:53 |

Groq `openai/gpt-oss-20b` returned a schema-valid, locally validated classification batch for Apple's three **synthetic** headlines: company demand positive/relevant; global shipping and energy disruption negative/relevant; garden opening neutral/not relevant. The saved classification timestamp is 2026-11-20 17:10:55 UTC. Production route checks also exercised real Groq on configured synthetic headlines where the independent request budget permitted. No live news feed or real article interpretation was verified. Samples retain their placeholder URLs and fixed synthetic publication time; model-generated metadata never replaces them.

The price and Groq successes are saved in ignored `.cache/stocksense`. Requests made within the one-minute cooldown returned the local quota fallback without making another provider call. Initial credential setup briefly returned missing-key while the file was being saved; rerunning after both keys were present verified Groq successfully. Keys were never printed. `.env.local` and cache paths were checked with Git's ignore command; `.env.example` is not ignored.

## Automated checks

- ESLint and strict TypeScript checks pass.
- The preserved Exercise 1 DOM interaction test passes.
- Provider tests use isolated fixtures for missing keys, quota messages, malformed data, wrong symbols, current-session filtering, stale saved data, cache hits, sanitized network errors, invalid Groq output, and structured sentiment validation.
- Model checks verify insufficient-history handling, chronological held-out evaluation metadata, and filtering of synthetic and post-cutoff news. No predictive accuracy or production readiness is claimed.
- The Next.js production build succeeds. Real-data fetching occurs at runtime, not during build.
- Production HTTP checks cover both dashboard markets, four stock details, the preserved wireframe and unknown-stock handling. Responses and `.next/static` are checked for exact local credential values without printing those values.

The first production smoke check exposed Next.js streaming an unknown-stock not-found view with HTTP 200. Stock routes were restricted to the four generated IDs and the premature loading/streaming boundary was removed, followed by another build and smoke check. The final run returned HTTP 200 for both market dashboards, all four stock pages and the original wireframe; the unknown stock returned HTTP 404. All response and browser-artifact credential checks passed. A test assertion encoding issue introduced while changing its import path was repaired; the original wireframe remains intact. The temporary production server was stopped after checks.

No visual browser, mobile, keyboard, screen-reader, real provider-outage, provider-side 429, or real missing-symbol outage is claimed. Quota/provider-error cases use deterministic fixtures; actual local cooldowns were also observed. EOD current-day candles are conservatively excluded. Forecasts use raw prices and cannot account for splits/dividends or exchange holiday dates yet. The combined news model is deliberately pending aligned real historical data.

Run instructions and the requested Supabase, local n8n, cited RAG and read-only MCP backlog are in `../VAC project/README.md`. No deployment or push was performed.
