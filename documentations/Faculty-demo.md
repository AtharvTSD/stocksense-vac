# Faculty demo script (about three minutes)

Open https://stocksense-vac.vercel.app. Backend health: https://stocksense-api-pwhq.onrender.com/health. Use the ignored local `.tools/faculty-login.txt` for the test accounts; keep it off shared screens.

1. **Dashboard (30 seconds):** open the public Vercel URL. Choose India, then US. Show Reliance/TCS and Apple/Microsoft, INR/USD, completed session date, source freshness and the last successful refresh. Point out an explicit stale or empty state if present. Switch light/dark theme.
2. **Forecast (30 seconds):** open a company. Show the next exchange session, estimate, percentage change and Up/Down/Flat. Read the active mode. Explain that numerical code produces prices; Groq only classifies news. Open method/evaluation and show the same held-out dates and last-close baseline. Sparse news means no invented news-model accuracy. The controlled test proves the disclosed sentiment sensitivity, not trading performance.
3. **Evidence and tools (45 seconds):** open an original news link, its publication/first-seen times and publisher/official-announcement label. Ask “What does the stored news say about this company?” and inspect validated source links. Ask “What is the latest stored close?” and point to the real `get_stock_snapshot` MCP protocol disclosure. An insufficient-evidence result is valid behavior.
4. **Persistence (30 seconds):** sign in to the faculty Supabase test account without exposing the password. Save a company, refresh and confirm it persists. In a second account/session, confirm the first account's watchlist is absent.
5. **Automation (45 seconds):** in GitHub Actions, run `StockSense n8n ingestion` manually. Show the actual imported/executed n8n workflow, resulting Supabase run record/counts and website freshness. Replay the batch and show duplicate prevention. Point to the default-branch schedules; call a run “scheduled” only if its actual event is `schedule`.

## Separate course deliverables

Voice-interface proof and sales-agent proof remain separate outstanding course deliverables; this stock research pilot does not claim to implement them. Preserve any supplied SRD and reconcile future course requirements without changing the verified evidence record.
