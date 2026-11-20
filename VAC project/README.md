# StockSense frontend

Next.js/TypeScript frontend for the hosted StockSense pilot. Run `npm ci`, then `npm run dev`; open http://localhost:3000. A configured FastAPI backend and migrated Supabase database are required for real data. Empty/unavailable states never substitute fictional market prices.

Only `BACKEND_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are used here. Provider/database/ingestion credentials belong on the backend/runner. Existing local environment files are preserved and ignored. The previous pilot is recoverable at `checkpoint/pre-hosted-pilot` (`dd1dbfe`).

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Development uses `.next-dev`; production builds use `.next`.

See the [root README](../README.md) and [deployment instructions](../documentations/Hosted-pilot-setup.md) for backend, Supabase, n8n, MCP, credentials and verification.
