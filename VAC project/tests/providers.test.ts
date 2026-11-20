import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { forecast, newsAtCutoff, samplePrices, stocks } from '../src/lib/market';
import { parsePrices, parseClassifications } from '../src/lib/provider-core';

test('strict response validation, no current session, chronological model and news cutoff', () => {
  const daily = { 'Meta Data': { '2. Symbol': 'AAPL' }, 'Time Series (Daily)': { '2026-11-19': { '4. close': '100' }, '2026-11-20': { '4. close': '999' } } };
  assert.deepEqual(parsePrices(daily, 'AAPL', '2026-11-20'), [{ date: '2026-11-19', close: 100 }]);
  assert.throws(() => parsePrices(daily, 'MSFT', '2026-11-20'), /missing-symbol/);
  assert.throws(() => parsePrices({ Information: 'secret raw provider error' }, 'AAPL', '2026-11-20'), /^Error: quota$/);
  assert.throws(() => parsePrices({ 'Error Message': 'invalid symbol' }, 'AAPL', '2026-11-20'), /missing-symbol/);
  assert.throws(() => parsePrices({}, 'AAPL', '2026-11-20'), /missing-symbol/);
  assert.throws(() => parseClassifications({ items: [{ id: 'a', relevant: 'yes', sentiment: 'positive' }] }, ['a']), /invalid-response/);
  assert.throws(() => parseClassifications({ items: [{ id: 'a', relevant: true, sentiment: 'positive' }, { id: 'a', relevant: true, sentiment: 'neutral' }] }, ['a', 'b']), /invalid-response/);
  assert.deepEqual(parseClassifications({ items: [{ id: 'a', relevant: false, sentiment: 'neutral' }] }, ['a']), [{ id: 'a', relevant: false, sentiment: 'neutral' }]);
  assert.equal(forecast(samplePrices(stocks[0]).slice(0, 20)), null);
  const rows = samplePrices(stocks[0]);
  const result = forecast(rows)!;
  assert.equal(result.heldOut, 10);
  assert.equal(result.cutoffSession, rows.at(-1)!.date);
  assert.ok(Number.isFinite(result.close) && result.close > 0);
  const base = { id: 'n', title: 'test', url: 'https://example.com', source: 'test', relevant: true, sentiment: 'neutral' as const };
  assert.equal(newsAtCutoff({ cutoff: '2026-11-20T10:00:00Z', observations: [
    { ...base, sample: true, publishedAt: '2026-11-19T10:00:00Z' },
    { ...base, sample: false, publishedAt: '2026-11-21T10:00:00Z' },
    { ...base, sample: false, publishedAt: '2026-11-19T10:00:00Z' },
  ] }).length, 1);
});

test('server integration: missing keys, quota, saved fallback, cache hit and validated Groq', async () => {
  const cwd = process.cwd();
  const temp = await mkdtemp(path.join(tmpdir(), 'stocksense-test-'));
  const originalFetch = globalThis.fetch;
  const oldAlpha = process.env.ALPHA_VANTAGE_API_KEY, oldGroq = process.env.GROQ_API_KEY;
  process.chdir(temp);
  try {
    const { getPrices, getSentiment } = await import('../src/lib/providers');
    delete process.env.ALPHA_VANTAGE_API_KEY;
    delete process.env.GROQ_API_KEY;
    assert.equal((await getPrices(stocks[0])).mode, 'sample');
    assert.equal((await getPrices(stocks[2])).issue, 'missing-key');
    assert.equal((await getSentiment(stocks[0])).value.length, 0);
    process.env.ALPHA_VANTAGE_API_KEY = 'test-only-not-real';
    process.env.GROQ_API_KEY = 'test-only-not-real';
    let calls = 0;
    globalThis.fetch = async () => { calls++; return Response.json({ Note: 'quota secret' }); };
    assert.equal((await getPrices(stocks[0])).issue, 'quota');
    assert.equal((await getPrices(stocks[2])).issue, 'quota');
    assert.equal(calls, 1, 'local minute throttle prevents second request');
    const cache = path.join(temp, '.cache', 'stocksense');
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, 'prices-reliance.json'), JSON.stringify({ savedAt: '2020-01-01T00:00:00Z', value: samplePrices(stocks[0]) }));
    const stale = await getPrices(stocks[0]);
    assert.equal(stale.mode, 'stale');
    assert.equal(stale.savedAt, '2020-01-01T00:00:00Z');
    await writeFile(path.join(cache, 'prices-apple.json'), JSON.stringify({ savedAt: new Date().toISOString(), value: samplePrices(stocks[2]) }));
    assert.equal((await getPrices(stocks[2])).mode, 'saved');
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: JSON.stringify({ items: ['company', 'world', 'unrelated'].map(id => ({ id, relevant: id !== 'unrelated', sentiment: 'neutral' })) }) } }] });
    const news = await getSentiment(stocks[2]);
    assert.equal(news.mode, 'live');
    assert.equal(news.value.length, 3);
    assert.ok(news.headlines.every(h => h.url && h.publishedAt && h.sample));
    assert.equal((await getSentiment(stocks[2])).mode, 'saved');
    await rm(path.join(cache, 'alpha-budget.json'));
    globalThis.fetch = async () => { throw new Error('https://provider.invalid/?apikey=must-never-leak'); };
    const failure = await getPrices(stocks[3]);
    assert.equal(failure.mode, 'sample');
    assert.equal(failure.issue, 'provider');
    assert.ok(!JSON.stringify(failure).includes('must-never-leak'));
    await rm(path.join(cache, 'groq-budget.json'));
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"items":[]}' } }] });
    assert.equal((await getSentiment(stocks[3])).issue, 'invalid-response');
  } finally {
    globalThis.fetch = originalFetch;
    if (oldAlpha === undefined) delete process.env.ALPHA_VANTAGE_API_KEY; else process.env.ALPHA_VANTAGE_API_KEY = oldAlpha;
    if (oldGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldGroq;
    process.chdir(cwd);
    await rm(temp, { recursive: true, force: true });
  }
});
