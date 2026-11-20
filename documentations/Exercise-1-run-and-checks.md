# StockSense — run and review

The application is in `VAC project/`; all authored project documents are in `documentations/`.

## Run locally

Use Node.js 22.20 or newer to support both the application and DOM test tools. The validation run used Node.js 22.20.0. From the VAC workspace in PowerShell:

```powershell
Set-Location -LiteralPath '.\VAC project'
npm.cmd ci
npm.cmd run dev
```

Open the Local URL printed by Next.js, normally `http://localhost:3000`. Stop the terminal server with Ctrl+C. No environment variables or API keys are needed. All stock values are fictional. Session state resets when refreshed.

To run validation from `VAC project/`:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

To serve a completed production build, use `npm.cmd start` and open its printed Local URL.

## Interaction review

1. Select each stock and check overview, chart, context and sample values change together.
2. Add a stock to the watchlist, remove it, undo the removal, and select a saved stock.
3. Enter a positive INR threshold and create a visible inactive demo rule; remove the rule.
4. Use each of the three starter prompts. Observe loading and text streaming. Stop and confirm the response is marked incomplete.
5. Use each Prototype control to demonstrate Empty, Loading, Streaming, Error and Success. Loading automatically advances after about 1.2 seconds. Controls reset the selected ticker’s conversation and retain any unsent draft.
6. With a draft in the composer, show Error and click Retry. Confirm both the failed question and draft survive.
7. Use Edit question, edit its text and Send. Confirm a second Send is disabled during generation.
8. Use Copy, Regenerate and both feedback controls. Copy requires clipboard access in the browser; a failure message provides a manual-copy alternative.
9. Switch stocks during generation. Confirm generation stops and the original conversation remains attached to its ticker when selected again.
10. Review keyboard focus, narrow mobile layout, long messages, chart data disclosure and status announcements in a real browser.

## Verification record

Recorded on 11 November 2026:

| Check actually run | Result |
| --- | --- |
| `npm.cmd run lint` | Passed with no warnings after final corrections. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd test` | Passed: one end-to-end DOM interaction scenario covering selection, watchlist add/remove/undo, inactive alert create/remove, prompt submission, loading, streaming, Stop, stable stopped output, edit, preserved draft, Error/Retry, natural completion, Copy acknowledgement, feedback, Regenerate, ticker isolation, all five prototype controls, duplicate-send prevention and unmount cleanup. |
| `npm.cmd run build` | Passed: Next.js production build, TypeScript validation and static page generation. |
| Production HTTP smoke check | Started `npm.cmd start -- --hostname 127.0.0.1 --port 3100`; the root page returned HTTP 200 and contained the StockSense title, sample-data label and assistant panel. The temporary server was stopped afterward. |
| Browser verification | Unavailable: the browser automation runtime failed to start with `windows sandbox failed: helper_unknown_error: setup refresh had errors`. No screenshot, mobile visual, keyboard or screen-reader verification is claimed. DOM tests are not a browser layout test. |
| Dependency audit | `npm.cmd audit --json` reported 8 moderate findings in the development lint dependency chain (typescript-eslint / minimatch). No forced major-version changes were applied. Review tooling updates before future deployment work. |

The initial check exposed invalid test-query option types and a PostCSS lint warning; both were corrected before the final passing checks. The clipboard test uses a local stub; actual browser clipboard access still needs review. Only Exercise 1 is implemented.

### Follow-up browser spot check — 11 November 2026

Computer access recovered and the production site was opened in Chrome. Verified the rendered desktop layout, selecting TCS through the watchlist, removing TCS and restoring it with Undo, selecting INFY through the stock dropdown, synchronized overview/chart/chat context, submitting a starter prompt to a completed simulated response, and the Error → Retry → Success flow. No full automated test suite was rerun. There are no separate navigation tabs in this single-screen exercise. Mobile layout and exhaustive browser coverage remain unverified. The temporary local server was stopped after review.
