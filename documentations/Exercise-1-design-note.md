# StockSense — Exercise 1 design note

## Scope and user

Target user: a beginner who wants understandable information about Indian stocks.

Main job: select a stock, understand its available data through simple explanations, and save it to a watchlist.

This exercise is a local interactive wireframe. All prices are fictional fixtures in INR. The sample timestamp is a fixed label, not evidence that a market feed was queried. No Groq, market-data service, authentication, database, deployment, notifications, trading or prediction model is connected. Existing classroom files and the pitch presentation were preserved.

## Main screen sketch

```text
StockSense                                      Demo — sample data
Purpose / exercise label                        Stock selector
+----------------------+------------------------------------------+
| Compact watchlist    | Selected stock / exchange / INR           |
| Select saved stock   | Sample price / daily change / timestamp   |
| Remove / undo        | 12-session fixture chart + text values    |
|                      +------------------------------------------+
| Demo alert threshold | Assistant / explicit selected ticker      |
| Visible inactive rule| Capabilities / limitations / simulation   |
|                      | Messages or three starter prompts         |
| Session-only note    | Question / Send / Stop                    |
+----------------------+------------------------------------------+
                       Prototype controls for five states
Action acknowledgement / footer
```

On small screens, the main analysis and chat appear first, followed by the watchlist and alert example. The layout uses a neutral palette, text labels alongside positive/negative colors, visible focus rings, native keyboard-operable controls, a text alternative for chart values, and status announcements. Mobile rendering and screen-reader behavior still need manual verification.

## Exactly three starter prompts

1. “Summarize the available data for this stock in simple terms.”
2. “Explain this stock’s recent price trend using the displayed chart.”
3. “What risks and missing information should I check before researching further?”

## Five states

| State | Demonstration and behavior |
| --- | --- |
| Empty | Initial screen or Empty control: capabilities, limitations, and the three starter prompts. |
| Loading | Submission acknowledges the question immediately; “Reading the sample data…” appears for about 1.2 seconds before streaming. |
| Streaming | Fixture text arrives gradually. Stop cancels the timer and marks output incomplete. The Streaming control starts this phase directly. |
| Error | Error control creates a deterministic simulated failure. The submitted question remains visible, the unsent draft remains in the composer, and Retry runs the simulation again. |
| Success | Completed scripted explanation with functional Copy, Regenerate, Helpful and Unhelpful controls and acknowledgements. The Success control shows this immediately. |

Prototype controls reset only the selected ticker’s messages and retain the draft. They cancel active timers. Normal stock selection preserves conversations by ticker and stops an active response as incomplete. Generation prevents duplicate sends while allowing draft editing. Edit question copies a submitted question into the composer for editing and resubmission. Watchlist removal has an Undo action. All state resets on refresh; no browser storage is used.

## Critique against workshop principles

| Principle | Implemented behavior | Remaining limitation |
| --- | --- | --- |
| Set expectations | Prominent demo badge, fictional timestamp and chart labels, simulated response labels, explicit context, limitations and session-only persistence. | A future real-data mode must show source, freshness, unavailable fields and failures rather than inheriting fixture labels. |
| Show progress | Immediate submitted question, loading acknowledgement, progressive text and a streaming status. | Simulated timing says nothing about actual provider latency; real integration will need honest provider status. |
| Keep users in control | Stock selection, independent ticker histories, Stop, editable drafts, Edit question, Regenerate, feedback and watchlist Undo. | Switching tickers retains one shared draft; an explicit context-change announcement helps, but per-ticker drafts may reduce confusion in a later version. |
| Make errors recoverable | Deterministic Error control, readable failure, Retry, preserved question/draft, and copy failure fallback. | Real network failures, quotas, missing data and provider outages are not modeled individually yet. |

## Mocked features and future integration points

| Feature now | Future integration point (not implemented) |
| --- | --- |
| Four static NSE stocks and one shared fixture-derived overview/chart/watchlist | A separate market-data provider; normalize exchange, currency, timestamps and history. Groq does not supply prices. |
| Scripted responses chosen by question theme | Groq explanation layer receiving supplied data; retain simulation/source labeling appropriately, cancellation and error recovery. |
| React state for messages, watchlist, feedback and demo rules | Supabase authentication and persistence after requirements are defined. |
| Inactive threshold rules with visible deletion | A separately designed monitoring and notification service; no real monitoring occurs here. |
| Local Next.js application | Vercel deployment in a later exercise only. |

No investment recommendations, automated trading, XGBoost or prediction models belong to this exercise.

Implementation follows the official [Next.js installation guidance](https://nextjs.org/docs/app/getting-started/installation) and [Tailwind Next.js setup](https://tailwindcss.com/docs/installation/framework-guides/nextjs). Four concise Missing / Implementing / How / Outcome comments document the implementation boundaries and shared fixtures in source.
