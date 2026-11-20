# Hosted pilot setup and credential handoff

Use only intended free-tier accounts. Do not paste credentials in chat. The source repository is `AtharvTSD/stocksense-vac` (public, explicitly selected by the user). The source has a `VAC project` frontend directory and a `backend` directory.

## Supabase

1. Create/select the intended free StockSense project. Complete sign-in, any account terms, and database-password entry personally. Preserve the database password in your password manager/local environment, never a tracked file.
2. Apply both ordered files in `supabase/migrations` to a reviewed schema. They create stock data, prices/cache, news/analysis, forecasts, workflow/source status, provider budgets, private watchlists and a restricted runtime role. Both are already applied to the hosted pilot; do not reapply them manually.
3. Use the provider-returned IPv4 session pooler URI with `sslmode=require`. Privately provision a password for `stocksense_backend` and use this restricted login in `DATABASE_URL`. It belongs only to the reader/ingestion roles and has no Auth/watchlist privileges, superuser, role creation or RLS bypass. Backend transactions use `SET LOCAL ROLE`; `/ready` rejects an administrative base login. Keep administrative credentials local and never put passwords in migrations.
4. Project settings/API: public project URL → `SUPABASE_URL` and public anon/publishable key → `SUPABASE_ANON_KEY` in the backend; the same intentionally public values go in the frontend's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Authentication/Users: create two faculty test accounts with locally chosen passwords and confirmed emails. Do not publish test passwords in the repository or demo notes. Use separate sessions for ownership testing. The app offers password sign-in, not unrestricted signup. Set the Auth site URL to the final Vercel URL and allow intended local redirect URLs if needed.

## Render

Create a **Free** Python Web Service from the GitHub repository or its `render.yaml` Blueprint. Root directory: `backend`. Build: `pip install -r requirements.txt`. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --no-access-log --log-config logging.json`. Health path: `/health`. The `/ready` endpoint must additionally pass after configuration and migration.

In Render → service → Environment, add these **secret** values from ignored local `backend/.env`:

| Render field | Value source |
| --- | --- |
| `GROQ_API_KEY` | Existing local Groq key |
| `ALPHA_VANTAGE_API_KEY` | Existing local Alpha Vantage key |
| `DATABASE_URL` | Supabase pooler URI |
| `INGESTION_TOKEN` | Generated local backend token (32+ characters) |
| `SUPABASE_URL` | Intended public Supabase project URL |
| `SUPABASE_ANON_KEY` | Intended public Supabase anon/publishable key |
| `FRONTEND_ORIGIN` | Exact Vercel production origin; comma-separated local origins only for development |
| `PUBLIC_BACKEND_URL` | Exact assigned `https://...onrender.com` origin; used by the assistant's real MCP client and host validation |

Do not reveal environment fields in screenshots. The generated local ingestion token is already in the ignored backend environment and is never printed. Render free services sleep; the browser waits up to 50 seconds, explains unavailable/cold states, and provides a retry. No keep-alive or paid upgrade is configured. The embedding model downloads lazily and is recomputable; durable business data stays in Supabase.

## Vercel

Import `AtharvTSD/stocksense-vac`, select the free Hobby plan, set **Root Directory** to `VAC project`, and use the Next.js preset. The directory's `vercel.json` defines build/install commands and Singapore region. Configure production environment fields:

| Vercel field | Value |
| --- | --- |
| `BACKEND_URL` | Assigned Render origin (server-side proxy only) |
| `NEXT_PUBLIC_SUPABASE_URL` | Intended public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Intended public Supabase anon/publishable key |

Provider keys, database URI and ingestion token do **not** belong in Vercel. Redeploy after public environment values change. Update Render's exact allowed frontend origin after receiving the Vercel URL.

## GitHub Actions / real n8n

In the repository → Settings → Secrets and variables → Actions:

| Kind | Name | Value source |
| --- | --- | --- |
| Repository variable | `BACKEND_URL` | Assigned Render origin |
| Repository secret | `INGESTION_TOKEN` | Same ignored local token used on Render |
| Repository secret | `GROQ_API_KEY` | Existing Groq key |

Alpha credentials stay on Render; the workflow invokes the backend's price/forecast jobs. No Supabase write credential is available to the runner. The imported workflow contains expressions referencing environment names, never credential values.

`StockSense n8n ingestion` must be on the repository's default branch. Its weekday UTC schedules are 12:23 (India) and 22:23 (US). Use **Run workflow** with market `all` for a faculty demo. The runner imports the JSON and executes it with **n8n Community 2.48.7**, validates the pinned version and durable success record, and fails the job when execution or its final recorded status fails. Source fetches and quota reservation have bounded retries; Groq requests do not auto-retry. Status/counts/errors are stored in Supabase through the scoped interface. Run the same batch again to check inserted=0 / duplicates>0. A manual success is distinct from an observed scheduled event; record both separately.

The `Pilot checks` workflow also executes real n8n against **isolated fixtures** on Linux to verify import, execution, credential injection, replay and failure propagation without live credentials. This is not proof of live Supabase ingestion. Local Windows n8n installation was blocked by its native dependency's missing C++ toolchain; do not install OS build tools solely for this demo. Use a prepared Docker/Linux environment or the standard GitHub runner.

For local n8n demonstrations, install that exact CE version in a supported environment, export the five required configuration variables (`BACKEND_URL`, `INGESTION_TOKEN`, `GROQ_API_KEY`, `RUN_ID`, `INGEST_MARKET`) from local secret storage, then run `python automation/run_n8n.py`. Alternatively import `automation/stocksense.workflow.json` in the local editor with those variables configured. The workflow is intentionally inactive in n8n because GitHub is its scheduler. Never export credentials.

## Required hosted acceptance checks

Check public Vercel pages for all four companies, completed sessions/currencies, source dates/first-seen times, explicit empty/error states, forecast active mode and common holdouts. Exercise Ask AI with an evidence question and a latest-close question; verify real citations and the visible MCP disclosure. Inspect desktop/mobile in both themes, keyboard focus and reduced motion. Verify Render `/health`, `/ready`, and an actual `/mcp/` protocol call. Use two real Supabase test accounts to prove watchlist isolation. Trigger the real manual n8n run, confirm Supabase writes/status, replay it, then verify schedules enabled on default branch and later record an actually observed scheduled event.
