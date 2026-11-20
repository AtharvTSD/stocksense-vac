import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, 'self', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });
Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'showModal', { value() { this.setAttribute('open', ''); } });
Object.defineProperty(dom.window.HTMLDialogElement.prototype, 'close', { value() { this.removeAttribute('open'); } });
const { render, screen, fireEvent, cleanup, waitFor } = await import('@testing-library/react');
const { default: Dashboard } = await import('../src/app/ui/dashboard');
test('pilot UI: honest unavailable state, retry, themes, source citations, MCP disclosure and guest login', async () => {
  let unavailable = true;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (unavailable) return Response.json({ error: 'backend-warming-or-unavailable' }, { status: 503 });
    const path = String(input);
    if (path.endsWith('/ask')) {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.question.includes('latest'));
      return Response.json({ state: 'tool-answer', answer: 'Fixture answer: the stored close is 123.45 USD.', citations: [], sources: [], tool: { tool: 'get_stock_snapshot', transport: 'MCP Streamable HTTP', called_at: '2026-11-20T12:00:00Z' } });
    }
    if (path.endsWith('status')) return Response.json({ last_success: '2026-11-20T11:00:00Z', runs: [], sources: [] });
    const row = { id: 'apple', state: 'stale', fetched_at: '2026-11-20T10:00:00Z', issue: 'latest-available-session-lags', prices: [{ date: '2026-11-18', close: 120 }, { date: '2026-11-19', close: 123.45 }], forecast: { payload: { state: 'insufficient-history' } }, news: [{ id: 'fixture-news', title: 'Fixture: Apple company announcement', canonical_url: 'https://example.com/fixture', publisher: 'Fixture publisher', published_at: '2026-11-19T09:00:00Z', first_seen_at: '2026-11-19T10:00:00Z', publication_precision: 'timestamp', source_kind: 'official-announcement', sentiment: 'neutral' }] };
    return Response.json(path.endsWith('stocks') ? { stocks: [row] } : row);
  };
  try {
    const { rerender } = render(<Dashboard key="apple" initialStock="apple" />);
    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.ok(screen.getByText('The backend may be waking up or unavailable.'));
    assert.ok(screen.getByText('No relevant stored headlines yet.'));
    assert.equal(document.querySelector('.ss-app')?.getAttribute('data-theme'), 'dark');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    assert.equal(document.querySelector('.ss-app')?.getAttribute('data-theme'), 'light');
    unavailable = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
    await waitFor(() => assert.ok(screen.getByText('Fixture: Apple company announcement')));
    assert.ok(screen.getByText('Older saved result'));
    assert.ok(screen.getByText('Company announcement'));
    const link = screen.getByRole('link', { name: /Fixture: Apple company announcement/ });
    assert.equal(link.getAttribute('href'), 'https://example.com/fixture');
    fireEvent.click(screen.getByRole('button', { name: 'What is the latest stored close?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    await waitFor(() => assert.ok(screen.getByText('MCP tool used')));
    assert.ok(screen.getByText('get_stock_snapshot'));
    fireEvent.click(screen.getByRole('button', { name: 'Save company to watchlist' }));
    await waitFor(() => assert.ok(screen.getByRole('dialog')));
    assert.ok(screen.getByRole('textbox', { name: 'Email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close sign-in' }));
    assert.equal(screen.queryByRole('dialog'), null);
    rerender(<Dashboard key="microsoft" initialStock="microsoft" />);
    await waitFor(() => assert.ok(screen.getByRole('alert')));
    assert.equal(document.querySelector('.ss-app')?.getAttribute('data-theme'), 'light');
    assert.equal(screen.queryByText('Fixture: Apple company announcement'), null);
    assert.equal(screen.queryByText('get_stock_snapshot'), null);
    assert.equal((screen.getByRole('textbox', { name: 'Ask about Microsoft' }) as HTMLTextAreaElement).value, '');
  } finally { cleanup(); globalThis.fetch = original; }
});

test('provider refresh polls its job, reloads prices and sends the selected AI region', async () => {
  const original = globalThis.fetch;
  let refreshed = false;
  let askedRegion = false;
  globalThis.fetch = async (input, init) => {
    const path = String(input);
    if (path.endsWith('/refresh')) {
      assert.deepEqual(JSON.parse(String(init?.body)), { market: 'US' });
      return Response.json({ job_id: 'web-US-' + 'a'.repeat(32), status: refreshed ? 'success' : 'running', cooldown: refreshed, message: 'Fixture provider check started.' });
    }
    if (path.includes('/refresh/')) { refreshed = true; return Response.json({ status: 'success', failures: [] }); }
    if (path.endsWith('/ask')) {
      askedRegion = JSON.parse(String(init?.body)).scope === 'market';
      return Response.json({ state: 'answered', answer: 'Fixture region explanation.', basis: 'General model knowledge; current facts require verified evidence', sources: [], citations: [] });
    }
    if (path.endsWith('status')) return Response.json({ last_success: null, runs: [], sources: [] });
    const row = { id: 'apple', state: 'saved', fetched_at: '2026-11-20T22:00:00Z', issue: null, prices: [{ date: '2026-11-20', close: refreshed ? 124 : 123 }], news: [] };
    return Response.json(path.endsWith('stocks') ? { stocks: [row] } : row);
  };
  try {
    render(<Dashboard key="apple-refresh" initialStock="apple" />);
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Refresh US prices from provider' }).hasAttribute('disabled'), false));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh US prices from provider' }));
    await waitFor(() => assert.ok(screen.getByText(/Provider check complete/)), { timeout: 5000 });
    assert.ok(refreshed);
    assert.ok(screen.getAllByText('$124.00').length);
    await waitFor(() => assert.equal(screen.getByRole('button', { name: 'Refresh US prices from provider' }).hasAttribute('disabled'), false));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh US prices from provider' }));
    await waitFor(() => assert.ok(screen.getByText(/No extra provider call was made/)));
    fireEvent.change(screen.getByRole('combobox', { name: 'Research scope' }), { target: { value: 'market' } });
    fireEvent.click(screen.getByRole('button', { name: 'Explain this market' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ask AI' }));
    await waitFor(() => assert.ok(screen.getByText('Fixture region explanation.')));
    assert.ok(askedRegion);
    assert.ok(screen.getByText('General model knowledge; current facts require verified evidence'));
  } finally { cleanup(); globalThis.fetch = original; }
});
