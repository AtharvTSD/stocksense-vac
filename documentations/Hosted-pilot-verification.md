# Hosted pilot verification

Observed 21 November 2026, Asia/Kolkata. Real hosted evidence and isolated fixtures are distinguished below.

## Public deployment

- Website: https://stocksense-vac.vercel.app
- Health: https://stocksense-api-pwhq.onrender.com/health
- Readiness: https://stocksense-api-pwhq.onrender.com/ready ? HTTP 200; restricted runtime storage verified.
- Public source: https://github.com/AtharvTSD/stocksense-vac, default branch `main`; implementation branch `feature/hosted-pilot`.
- Original implementation preserved at `dd1dbfe`, published branch `checkpoint/pre-hosted-pilot`. Course documents and environments preserved. No PRD/SRD was present.
- Vercel Hobby, Render Free and Supabase Free were used. No paid upgrade enabled.

## Real ingestion and replay

[Manual live run 44802859547](https://github.com/AtharvTSD/stocksense-vac/actions/runs/44802859547) imported and executed n8n Community 2.48.7, called real Groq, wrote 31 normalized headlines into Supabase, and refreshed all four real price histories and forecasts. Counts: received 31, normalized 31, inserted 31, duplicates 0.

[Live replay 44803746080](https://github.com/AtharvTSD/stocksense-vac/actions/runs/44803746080) succeeded: received 31, normalized 31, inserted 0, duplicates 31. Price caching avoided further Alpha calls. Fixtures never enter these runs or UI market data.

The 13-node workflow uses the official Docker image pinned to version 2.48.7. Requests are paced, writes serialized, retries bounded, and quota counters durable. The first live attempt exposed simultaneous cold embedding loads; a lock and sequential writes fixed this, with a concurrency regression test. Its interrupted record was reconciled as failed. Raw provider errors remain withheld.

The workflow is **active on default branch main**. UTC schedules: `23 12 * * 1-5` India, `23 22 * * 1-5` US. The laptop is not required. **No actual schedule-triggered event has yet been observed**; verified successes above were manually dispatched.

| Company | Verified Alpha symbol | Exchange / currency | Stored sessions | Latest session |
| --- | --- | --- | --- | --- |
| Reliance Industries | RELIANCE.BSE | BSE / INR | 100 | 2026-11-19 |
| TCS | TCS.BSE | BSE / INR | 98 | 2026-11-19 |
| Apple | AAPL | NASDAQ / USD | 100 | 2026-11-19 |
| Microsoft | MSFT | NASDAQ / USD | 100 | 2026-11-19 |

All four succeeded with the existing Alpha key and compact daily endpoint. Indian feeds lag the latest completed session and are explicitly stale. US November 20 was still open during verification. Closes are raw/unadjusted; incomplete exchange sessions are removed.

Hosted source fetches succeeded: BBC Business RSS 40 records; Apple Newsroom 20; Microsoft News 7; TCS Newsroom 12; Reliance press releases 15. Canonical URL, publisher, publication precision and first-seen time are preserved. Four official announcements per company were relevant. The 15 selected BBC world-news/company pairs were classified irrelevant and excluded from the public relevant feed. Official announcements are separately labelled; publisher coverage is not invented. Economic Times was excluded after checking restrictive aggregation terms. No old news API/key failure was configured, so no unsupported plan-restriction diagnosis is claimed.

## Forecasts and evidence tools

All four generated numerical estimates, percentage changes and direction. Active mode is price-only: first-seen news times fall after the price cutoff. The same ten chronological holdouts include price-only and last-close baseline MAE; news-model MAE is withheld for zero aligned coverage. Controlled fixtures prove positive/negative sensitivity and exclusion of future publication/first-seen times, without claiming trading accuracy. Indian November 20 targets are labelled historical.

Real hosted RAG answered TCS/Rio Marathon and Apple TV/Formula 1 questions using stock-filtered full-text + MiniLM vector retrieval in Supabase, real Groq and validated record citations. Links matched the corresponding official announcements. Generic summaries initially returned insufficient evidence; semantic retrieval now includes the selected company, and a hosted general summary returned two validated TCS citations. Unsupported questions retain an insufficient-evidence state.

Real hosted assistant latest-close requests for TCS and Apple used MCP initialize/tools-call against Render, returning timestamped stored closes and tool disclosure. The sole typed `get_stock_snapshot` tool exposes public stock data; writes, Auth and watchlists are outside MCP. Final hosted initialize/list/call verified the read-only annotation and Microsoft snapshot.

## Auth, UI and checks

Two real faculty accounts completed Supabase password login. A saved Reliance and B saved Microsoft; each saw only its own rows. B inserting A's owner ID returned 403. B deleting A's row returned no rows; A's record persisted. Runtime login has no superuser/create-role/RLS-bypass/watchlist privileges. Both migrations are applied to the hosted project.

The user signed into the public browser site; private Reliance watchlist and login survived reload. Both test passwords were rotated after an unexpected wrong-window capture and updated only in ignored local files. No password is published here.

Desktop and 390px mobile layouts were inspected in both themes. Live browser data showed INR, stale session and historical forecast labels, and the private watchlist. Public smoke checks passed four stock pages, market tabs, styles, unknown-stock 404, internal-proxy 404 and absence of configured server secrets in public responses/artifacts.

Local frontend lint, TypeScript, DOM tests and production build passed. Ten backend pytest cases and Ruff passed. PGlite/pgvector SQL checks cover stock-filtered hybrid retrieval, owner isolation, budgets and duplicate replay. [Real n8n fixture run 44801676176](https://github.com/AtharvTSD/stocksense-vac/actions/runs/44801676176) passed import, execution, credential injection, replay and failed-job propagation with isolated fake HTTP/storage. [Full Linux CI 44804408958](https://github.com/AtharvTSD/stocksense-vac/actions/runs/44804408958) passed frontend lint/types/tests/build, backend, SQL and actual n8n fixture checks. A subsequent cache-boundary regression test also passed locally: pre-close snapshots expire when a newly completed session becomes available, without repeatedly refetching a provider response already obtained after that cutoff. Some upstream deprecation warnings remain.

## Limits and separate coursework

Free Render can sleep and lose recomputable model cache; durable data stays in Supabase. Cold starts have visible loading/error/retry states. Forecasts have no confidence or accuracy promise. The maintained XBOM calendar ends in 2026 and fails closed beyond coverage. Collect more timestamp-aligned news before fitting or claiming combined-model performance.

Voice-interface and sales-agent proof remain separate course deliverables. See `Faculty-demo.md` for the short demo script.
