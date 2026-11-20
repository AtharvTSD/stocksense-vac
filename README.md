# StockSense Lab · BMSCE VAC

Educational research pilot for Reliance Industries, TCS, Apple, and Microsoft. Next.js/TypeScript runs on Vercel; FastAPI, numerical forecasting and a read-only MCP server run on Render; Supabase stores durable data, accounts and private watchlists. A pinned n8n Community workflow is imported and executed on GitHub-hosted runners. No paid plan is required or enabled by the source configuration.

The previous implementation is recoverable on `checkpoint/pre-hosted-pilot` at `dd1dbfe`. Course documents are preserved. The rebuild is on `feature/hosted-pilot`. No PRD or SRD was present in the inspected workspace; historical Exercise 1 notes describe the checkpoint, not the rebuilt app.

## Local setup

Public pilot: https://stocksense-vac.vercel.app · Backend health: https://stocksense-api-pwhq.onrender.com/health. Observed results and limitations are in `documentations/Hosted-pilot-verification.md`. Faculty credentials stay in the ignored local `.tools/faculty-login.txt`.

Use Node 22.20+ and Python 3.12. Provider keys belong in the ignored `backend/.env`. Copy only empty example files when no local environment exists. Never commit real values.

```powershell
# Frontend
cd "VAC project"
npm.cmd ci
npm.cmd run dev
```

```powershell
# Backend, in another terminal from the repository root
py -3.12 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8000 --no-access-log --log-config logging.json
```

An existing `.venv` is already prepared in this workspace. A workspace-local Python runtime was used because the machine had no installed Python. `DATABASE_URL` must point at the intended migrated Supabase project. Without a database the UI shows an explicit unavailable state; it does not fall back to fictional prices. Development and production use separate Next output directories so verification builds do not overwrite a live development preview.

## Components and checks

| Path | Purpose | Check |
| --- | --- | --- |
| `VAC project/` | Responsive dashboard, themes, chart data table, Ask AI, Supabase login/watchlist, allowlisted backend proxy | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` |
| `backend/` | Health/readiness, price cache, exchange calendars, forecasting, RAG, MCP, scoped ingestion | `ruff check app tests`, `pytest -q` from backend |
| `supabase/migrations/` | Durable tables, pgvector/full-text retrieval, provider budgets, owner-only watchlists | `npm ci && npm test` from `supabase/tests` |
| `automation/` | Importable 13-node n8n workflow, checked CLI runner, local fixture execution test | `node automation/build-workflow.mjs`; `python automation/test_workflow.py` after installing n8n 2.48.7 |
| `.github/workflows/` | CI plus manual/scheduled ingestion | Verify on GitHub; presence of cron YAML alone is not proof of execution |

See [deployment instructions](documentations/Hosted-pilot-setup.md), [verification and blockers](documentations/Hosted-pilot-verification.md), and the [faculty demo](documentations/Faculty-demo.md).

## Data and model boundaries

- Alpha Vantage `TIME_SERIES_DAILY`, compact free history, exact allowlisted BSE/NASDAQ symbols. Guests never trigger price API calls. Durable per-provider budgets and a 20-hour successful-price cache conserve quota. Saved data keeps its fetch time and session; provider failures stay explicit. Local successes for all four symbols were recorded in the earlier pilot verification.
- Only configured sources are fetched. BBC Business supplies world/business headlines; Apple, Microsoft, TCS and Reliance announcements are separately labelled official fallback sources. Only headline metadata and source links are stored, not full articles. Economic Times RSS was rejected because its terms prohibit public hosting/aggregation. The old project had no failed live-news API implementation to diagnose; no unsupported plan-restriction claim is made.
- News retains canonical URL, publisher, publication time and first-seen time. Date-only announcements are marked as such and conservatively timestamped at that date's end. Database uniqueness makes replay idempotent. Groq classifies per-company relevance and sentiment; it never supplies prices. Fixtures exist only in test files.
- A 20-return numerical mean model estimates the next exchange session. The news-informed path adds a disclosed fixed sensitivity of 0.2% × mean eligible sentiment; this coefficient is not learned accuracy. News must be relevant, real, published and first seen by cutoff. Both paths and the last-close baseline share the same chronological holdout. Sparse news prevents reporting news-model accuracy; a controlled fixture test proves the sensitivity works. Raw closes can contain corporate-action jumps. The maintained XBOM holiday calendar currently ends in 2026 and fails closed beyond its coverage.
- Ask AI retrieves stock-filtered text and MiniLM vectors from Supabase, then validates Groq's citation IDs against retrieved records. Insufficient evidence and invalid citations are explicit states. Latest stored-price questions perform a real MCP initialize/tool call. The only MCP tool is typed, read-only `get_stock_snapshot`; it exposes no accounts or watchlists.

## Security and costs

`GROQ_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `DATABASE_URL` and `INGESTION_TOKEN` are server/runner secrets. Only the Supabase project URL and intentionally public anon/publishable key use `NEXT_PUBLIC_`. Ingestion token scope excludes watchlists/Auth; SQL transactions drop into explicit reader/ingestion roles. Watchlists additionally enforce `auth.uid()` ownership in PostgreSQL RLS. Alpha request URLs and provider errors are never returned or printed. Runner output is captured and reduced to sanitized status; no credential export is used.

The ingestion workflow reserves at most 8 Alpha calls and 20 total classifier/assistant reservations per UTC day, with spacing and no guest price refresh. Direct workflow Groq requests do not retry automatically. A manual run uses the same budgets. Other use of the same keys must fit the provider's account-wide allowance. GitHub schedules run at 12:23 and 22:23 UTC on weekdays and must be on the default branch. They use standard runners and bounded timeouts; never enable paid overage to make a demo pass.
