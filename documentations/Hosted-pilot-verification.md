# Hosted rebuild verification

Status recorded for the current implementation, begun 20 November 2026 (Asia/Kolkata). This file distinguishes implemented code, local proof, and hosted proof. Update only after observing each result.

| Acceptance item | Current evidence |
| --- | --- |
| Recoverable checkpoint | `dd1dbfe`, branch `checkpoint/pre-hosted-pilot`; staged source scanned for configured keys before commit. |
| Intended source repository | Public `AtharvTSD/stocksense-vac` created and verified through browser and GitHub connector; public visibility explicitly selected by user. Source publication pending verification. |
| All four provider symbols | Earlier real Alpha Vantage responses verified `RELIANCE.BSE`, `TCS.BSE`, `AAPL`, `MSFT`, 100 compact sessions each. See historical `Pilot-verification.md`. New hosted adapter/storage not yet verified against hosted runtime. |
| Live sources | Local HTTP 200 from BBC Business RSS, Apple RSS, Microsoft RSS, TCS newsroom and Reliance press-release listing. Hosted fetch/write pending. Economic Times excluded after checking restrictive RSS terms. A proposed PIB endpoint redirected and was not configured. No failed live-news API/key was configured in the earlier source, so a specific old API failure cannot be attributed to plan restrictions. |
| Backend checks | Six pytest cases pass: exchange holidays/early closes, completed-candle filtering, controlled news sensitivity and look-ahead exclusion, source validation, citation rejection, scoped ingestion/auth/readiness, and real local MCP protocol/assistant path. Some third-party deprecation warnings remain. |
| Actual MCP call | Local real SDK client initialized a real HTTP MCP server, listed the single allowlisted tool, called it, checked typed output and invalid input, then exercised the assistant's latest-close path through the protocol. Stock storage was a fixture for this test. Render protocol proof pending. |
| PostgreSQL schema/RLS | Migration executed on isolated PGlite PostgreSQL with pgvector. Actual SQL tests passed stock-filtered hybrid retrieval, provider budgets, duplicate replay, denied cross-owner inserts/deletes, separate-owner watchlists and no ingestion-role watchlist access. Supabase Auth identity function was a test substitute; hosted two-account verification pending. |
| Frontend tests | New DOM test passes retry/error handling, theme switching, saved-data/source labels, news links, MCP disclosure and guest login dialog. Network responses were fixtures. Visual browser verification pending. |
| Production build | Passed after separating development/production output directories and explicitly excluding the stale generated development directory. Root dashboard, allowlisted proxy, and all four stock pages built successfully. |
| n8n workflow | Importable 12-node CE workflow, exact version 2.48.7, real CLI runner, bounded retries, durable run records, and default-branch UTC cron/manual configuration implemented. Local Windows installation failed because `isolated-vm` needs an unavailable C++ toolchain. Linux CI import/execute tests and real hosted manual ingestion remain unverified. |
| Hosted schedule | YAML implemented; enabled default-branch schedule and actual scheduled event both unverified. |
| Deployment URLs | Vercel public URL and Render health URL not yet assigned/verified. User selected browser sign-in handoffs for Vercel, Render and Supabase. No paid plan authorized. |

Fixtures remain in test paths and never enter live database ingestion or UI market data. Numerical forecasts use a disclosed sensitivity coefficient rather than claiming a trained/validated news predictor. Historical news coverage gaps are explicit and news first seen after cutoff is excluded. The XBOM package calendar is limited to 2026; unsupported future sessions fail closed.
