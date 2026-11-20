'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { companies, formatMoney, formatTime, type Answer, type RefreshStatus, type Snapshot, type StockID } from '@/lib/pilot';
import Chart from './chart';

async function readAPI<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch('/api/pilot/' + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'service-unavailable');
  return data;
}

export default function Dashboard({ initialStock }: { initialStock: StockID }) {
  const company = companies.find(s => s.id === initialStock)!;
  const market = company.market;
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [list, setList] = useState<Snapshot[]>([]);
  const [detail, setDetail] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [loginOpen, setLoginOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [askError, setAskError] = useState('');
  const [asking, setAsking] = useState(false);
  const authDialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [all, selected, refresh] = await Promise.all([
        readAPI<{ stocks: Snapshot[] }>('stocks', signal),
        readAPI<Snapshot>('stocks/' + initialStock, signal),
        readAPI<RefreshStatus>('status', signal),
      ]);
      setList(all.stocks); setDetail(selected); setStatus(refresh); setError('');
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : 'service-unavailable');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [initialStock]);

  useEffect(() => {
    const controller = new AbortController();
    // All state writes in load follow asynchronous I/O; none run synchronously in this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_, value) => setSession(value));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    let current = true;
    void supabase.from('watchlists').select('stock_id').eq('owner_id', session.user.id).then(({ data, error }) => {
      if (current) { setSaved(error ? [] : (data || []).map(r => r.stock_id)); if (error) setNotice('Watchlist could not load. Try signing in again.'); }
    });
    return () => { current = false; };
  }, [session]);
  useEffect(() => { if (loginOpen) authDialog.current?.showModal(); else authDialog.current?.close(); }, [loginOpen]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) { setAuthError('Supabase sign-in is not configured for this build yet. Guest browsing is available.'); return; }
    setAuthBusy(true); setAuthError('');
    const fields = new FormData(event.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({ email: String(fields.get('email')), password: String(fields.get('password')) });
    setAuthBusy(false);
    if (error) setAuthError('Sign-in failed. Check your test account details and try again.');
    else { setLoginOpen(false); setNotice('Signed in. Your saved companies are private to your account.'); }
  }

  async function watch() {
    if (!session) { setLoginOpen(true); return; }
    if (!supabase || watchBusy) return;
    setWatchBusy(true);
    const exists = saved.includes(initialStock);
    const { error } = exists ? await supabase.from('watchlists').delete().eq('owner_id', session.user.id).eq('stock_id', initialStock) : await supabase.from('watchlists').insert({ owner_id: session.user.id, stock_id: initialStock });
    if (error) setNotice('The watchlist update did not save. Please retry.');
    else { setSaved(current => exists ? current.filter(id => id !== initialStock) : [...current, initialStock]); setNotice(exists ? 'Removed from your watchlist.' : 'Saved to your private watchlist.'); }
    setWatchBusy(false);
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (asking || question.trim().length < 3) return;
    setAsking(true); setAskError('');
    const controller = new AbortController(); request.current = controller;
    try { setAnswer(await readAPI<Answer>('stocks/' + initialStock + '/ask', controller.signal, { question: question.trim() })); }
    catch (e) { if (!controller.signal.aborted) setAskError(e instanceof Error ? e.message : 'assistant-unavailable'); }
    finally { setAsking(false); }
  }

  const prices = detail?.id === initialStock ? detail.prices : [];
  const latest = prices.at(-1), previous = prices.at(-2);
  const change = latest && previous ? (latest.close / previous.close - 1) * 100 : null;
  const forecast = detail?.forecast?.payload;
  const news = detail?.news || [];
  const counts = { positive: news.filter(n => n.sentiment === 'positive').length, neutral: news.filter(n => n.sentiment === 'neutral').length, negative: news.filter(n => n.sentiment === 'negative').length };
  const empty = !loading && !prices.length;

  return <div className="ss-app" data-theme={theme}>
    <a href="#research" className="skip-link">Skip to stock research</a>
    <header className="ss-header"><Link href="/" className="ss-logo" aria-label="StockSense home"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="m7 21 6-7 5 3 7-9M20 8h5v5" stroke="#10231c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>Stock<span>Sense</span><small>LAB</small></Link><nav aria-label="Primary"><a className="active" href="#research">Markets</a><a href="#news">Intelligence</a><a href="#assistant">Ask AI</a></nav><div className="header-actions"><span className="educational-label">BMSCE · VAC</span><button className="icon-button" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀' : '☾'}</button><button className="login-button" onClick={() => session ? void supabase?.auth.signOut().then(() => { setSaved([]); setNotice('Signed out.'); }) : setLoginOpen(true)}>{session ? 'Sign out' : 'Test login'}</button></div></header>

    <main className="ss-main">
      <section className="ss-hero"><div className="hero-copy"><div className="eyebrow"><span className="hero-rule"/> MARKET RESEARCH, WITH CONTEXT</div><h1>See the price.<br/><span>Understand the story.</span></h1><p>Follow four companies across two markets. Connect completed sessions, world news, and transparent AI research in one focused workspace.</p><div className="hero-tags"><span>End-of-day data</span><span>Cited intelligence</span><span>Experimental forecasts</span></div></div><aside className="hero-note"><span className="orbit-mark" aria-hidden="true">◈</span><p className="eyebrow">BUILT TO SHOW ITS WORK</p><h2>A signal is only as good<br/>as its source.</h2><p>Every close has a session. Every headline has a link. Every forecast tells you what it used.</p><span className="research-label">Educational pilot · No trading or financial advice</span></aside></section>

      <section className="refresh-strip" aria-label="Data refresh status"><div><span className={`status-light ${status?.last_success ? 'good' : ''}`}/><strong>{loading ? 'Connecting to research services' : error ? 'Research service needs attention' : status?.last_success ? 'Refresh history available' : 'Awaiting first successful refresh'}</strong><span>{loading ? 'Free-tier cold starts can take about a minute.' : formatTime(status?.last_success)}</span></div><button onClick={() => { setLoading(true); void load(); }} disabled={loading} aria-label="Check latest saved data and refresh status"><span className={loading ? 'spin' : ''}>↻</span> {loading ? 'Checking' : 'Check status'}</button></section>
      {error && <div className="service-state" role="alert"><div><strong>{error.includes('not-configured') ? 'This service is not configured yet.' : error.includes('database') ? 'Stored data is temporarily unavailable.' : 'The backend may be waking up or unavailable.'}</strong><p>{error.includes('not-configured') ? 'Deployment settings are needed before live data can load.' : 'Your request could not complete. Wait a moment, then retry. Saved data is never replaced with sample prices.'} <code>{error}</code></p></div><button onClick={() => { setLoading(true); void load(); }}>Retry connection</button></div>}

      <section id="research" className="market-section"><div className="section-heading"><div><p className="eyebrow">YOUR MARKET LENS</p><h2>Four companies. A wider perspective.</h2></div><nav className="market-tabs" aria-label="Choose market"><Link href="/?market=India" aria-current={market === 'India' ? 'page' : undefined}><span>IN</span> India</Link><Link href="/?market=US" aria-current={market === 'US' ? 'page' : undefined}><span>US</span> United States</Link></nav></div>
      <div className="stock-grid">{companies.filter(s => s.market === market).map((s, index) => { const data = list.find(d => d.id === s.id); const last = data?.prices.at(-1); const prev = data?.prices.at(-2); const delta = last && prev ? (last.close / prev.close - 1) * 100 : null; return <Link prefetch={false} className={`stock-card ${s.id === initialStock ? 'selected' : ''}`} href={`/stocks/${s.id}`} key={s.id} style={{ animationDelay: `${index * 70}ms` }} aria-current={s.id === initialStock ? 'page' : undefined}><div className="stock-card-top"><span className={`monogram ${s.id}`}>{s.monogram}</span><div><h3>{s.name}</h3><p>{s.exchange} · {s.symbol}</p></div><span className="selection-marker" aria-hidden="true">{s.id === initialStock ? '●' : '○'}</span></div><div className="stock-card-values"><strong>{formatMoney(last?.close, s.currency)}</strong><span className={delta !== null && delta < 0 ? 'negative' : 'positive'}>{delta === null ? s.currency : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`}</span></div><Chart prices={data?.prices || []} currency={s.currency} compact/><div className="stock-card-bottom"><span>{last ? `Session ${last.date}` : 'No close stored yet'}</span><span>{data?.state === 'stale' ? 'Stale' : last ? 'EOD · Saved' : 'Pending'}</span></div></Link>; })}</div></section>

      <div className="research-grid"><section className="panel price-panel"><div className="panel-heading"><div className="company-heading"><span className={`monogram ${company.id}`}>{company.monogram}</span><div><p className="eyebrow">{company.exchange} · {company.currency}</p><h2>{company.name}</h2><p>{company.sector}</p></div></div><button className={`watch-button ${saved.includes(initialStock) && session ? 'is-saved' : ''}`} onClick={() => void watch()} disabled={watchBusy} aria-label={session && saved.includes(initialStock) ? 'Remove company from watchlist' : 'Save company to watchlist'}>{session && saved.includes(initialStock) ? '★ Saved' : '☆ Watch'}</button></div><div className="close-overview"><div><span className="field-label">Latest available completed close</span><strong>{formatMoney(latest?.close, company.currency)}</strong></div><span className={change !== null && change < 0 ? 'change-pill negative' : 'change-pill positive'}>{change === null ? 'Awaiting data' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}% vs prior session`}</span></div><div className="data-meta"><span>{latest ? `Session ${latest.date}` : 'Session unavailable'}</span><span>Alpha Vantage · Unadjusted</span><span className={detail?.state === 'stale' ? 'stale-label' : ''}>{detail?.state === 'stale' ? 'Older saved result' : prices.length ? 'Saved provider data' : 'No provider result'}</span></div>{loading && !prices.length ? <div className="chart-skeleton" role="status"><span/>Loading saved price history…</div> : <Chart prices={prices} currency={company.currency}/>}<div className="panel-footnote">Retrieved {detail?.fetched_at ? formatTime(detail.fetched_at) : '—'}. {detail?.issue || (empty ? 'No successful refresh has stored this company yet.' : 'Completed sessions only; not an intraday quote.')}</div></section>

      <aside className="panel forecast-panel"><div className="panel-heading"><div><p className="eyebrow">A LOOK AHEAD</p><h2>Next-session estimate</h2></div><span className="experimental-tag">Experimental</span></div>{forecast?.state === 'experimental' ? <><div className="forecast-price">{formatMoney(forecast.estimated_close, company.currency)}</div><div className="forecast-direction"><span className={forecast.direction === 'Down' ? 'negative' : 'positive'}>{forecast.direction} · {(forecast.expected_change_pct || 0) >= 0 ? '+' : ''}{forecast.expected_change_pct?.toFixed(2)}%</span><span>Target {forecast.target_session}</span></div><div className="model-mode"><span className="field-label">ACTIVE MODEL</span><strong>{forecast.mode === 'news-informed' ? 'Price + news sentiment' : 'Price only'}</strong><p>{forecast.eligible_news} eligible headlines at cutoff</p></div><details><summary>Method & evaluation</summary><p>{forecast.method}</p><p>Cutoff: {formatTime(forecast.cutoff)}</p><p>Same {forecast.evaluation?.sessions.length} chronological sessions. Price-only MAE: {formatMoney(forecast.evaluation?.price_only_mae, company.currency)}. Last-close baseline: {formatMoney(forecast.evaluation?.baseline_mae, company.currency)}.</p><p>News-informed MAE: {forecast.evaluation?.news_informed_mae == null ? 'Not reported — sparse historical news.' : formatMoney(forecast.evaluation.news_informed_mae, company.currency)}</p><p>{forecast.evaluation?.coverage_gap}</p><p>{forecast.limitations}</p></details></> : <div className="forecast-empty"><div className="forecast-graphic" aria-hidden="true">∿</div><h3>Research before prediction.</h3><p>{forecast?.state === 'insufficient-history' ? 'At least 60 usable sessions are needed for this model.' : 'The estimate appears after a successful price and forecast refresh.'}</p><span className="model-label">Price-only fallback · No invented estimates</span></div>}<div className="forecast-disclaimer">A numerical experiment, not a promise. News published or first seen after the cutoff is excluded.</div></aside></div>

      <div className="intelligence-grid"><section className="panel news-panel" id="news"><div className="panel-heading"><div><p className="eyebrow">BEHIND THE MOVEMENT</p><h2>News, with company context.</h2></div><span className="count-label">{news.length} sources</span></div><div className="sentiment-summary"><div><span className="field-label">STORED RELEVANT HEADLINES</span><p>Classified by Groq · Links to original sources</p></div><div className="sentiment-counts"><span className="positive">{counts.positive} Positive</span><span>{counts.neutral} Neutral</span><span className="negative">{counts.negative} Negative</span></div></div>{news.length ? <div className="news-list">{news.map(n => <article key={n.id} className="news-row"><div className="news-row-meta"><span>{n.publisher}</span><span className={`sentiment-badge ${n.sentiment}`}>{n.sentiment}</span></div><h3><a href={n.canonical_url} target="_blank" rel="noreferrer">{n.title}<span className="external-label" aria-hidden="true"> ↗</span></a></h3><div className="source-meta"><span>{n.source_kind === 'official-announcement' ? 'Company announcement' : 'Publisher report'}</span><time dateTime={n.published_at}>{n.publication_precision === 'date' ? new Date(n.published_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' · date only' : formatTime(n.published_at)}</time></div><small>First seen {formatTime(n.first_seen_at)}</small></article>)}</div> : <div className="news-empty"><span aria-hidden="true">▤</span><h3>No relevant stored headlines yet.</h3><p>Empty feeds stay empty. Company announcements are labelled separately from publisher reporting. Fixtures never enter the live feed.</p></div>}<details className="source-status"><summary>Source health & refresh history</summary>{status?.sources.length ? status.sources.map(s => <p key={s.feed_id}><strong>{s.feed_id}</strong> · {s.status} · {s.item_count} items · {formatTime(s.checked_at)}</p>) : <p>No source checks recorded yet.</p>}{status?.runs.map(r => <p key={r.external_id}>{r.status} · {formatTime(r.started_at)} · {r.failures.join(', ') || 'No recorded failures'}</p>)}</details></section>

      <section className="panel ask-panel" id="assistant"><div className="panel-heading"><div><p className="eyebrow">ASK BETTER QUESTIONS</p><h2>Your research companion.</h2></div><span className="ai-emblem" aria-hidden="true">✳</span></div><p className="ask-intro">Grounded in stored sources for <strong>{company.name}</strong>. Source links come with the answer.</p><div className="ask-prompts"><button onClick={() => setQuestion('What is the latest stored close?')}>What is the latest stored close?</button><button onClick={() => setQuestion('What does the stored news say about this company?')}>What does the news tell us?</button></div>{answer && <div className="answer-box" aria-live="polite"><span className="field-label">{answer.state === 'insufficient-evidence' ? 'INSUFFICIENT EVIDENCE' : 'RESEARCH ANSWER'}</span><p>{answer.answer}</p>{answer.sources?.length > 0 && <ul>{answer.sources.map((s, i) => <li key={s.id}><a href={s.canonical_url} target="_blank" rel="noreferrer">[{i + 1}] {s.title}</a></li>)}</ul>}{answer.retrieval && <small>{answer.retrieval}</small>}{answer.tool && <div className="tool-disclosure"><strong>MCP tool used</strong><code>{answer.tool.tool}</code><span>{answer.tool.transport} · {formatTime(answer.tool.called_at)}</span></div>}</div>}{askError && <p className="inline-error" role="alert">The answer could not load: {askError}. Your question is preserved; retry below.</p>}{asking && <div className="ask-loading" role="status"><span className="pulse-dot"/>Retrieving evidence and checking tools… Free-tier startup may take a moment.</div>}<form className="ask-form" onSubmit={ask}><label htmlFor="research-question">Ask about {company.name}</label><textarea id="research-question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask a question about this company…" maxLength={600} rows={3} required minLength={3}/><div><span>Read-only research · Sources are untrusted evidence</span><button type="submit" disabled={asking || question.trim().length < 3}>{asking ? 'Working…' : 'Ask AI'}</button>{asking && <button type="button" onClick={() => { request.current?.abort(); setAsking(false); }}>Stop</button>}</div></form><div className="ask-disclosure">Latest-price questions call the read-only MCP snapshot tool. News questions use stock-filtered text and vector retrieval. An answer is withheld when evidence is insufficient.</div></section></div>

      <section className="watchlist-strip"><div><p className="eyebrow">YOUR SHORTLIST</p><h2>{session ? 'Your private watchlist' : 'A little focus goes a long way.'}</h2><p>{session ? 'Only your signed-in account can read or change these saved companies.' : 'Browse freely. Use the Supabase test login to save the companies you want to revisit.'}</p></div>{session ? <div className="saved-links">{saved.length ? saved.map(id => <Link key={id} href={`/stocks/${id}`}>{companies.find(c => c.id === id)?.name}</Link>) : <span>No saved companies yet.</span>}</div> : <button onClick={() => setLoginOpen(true)}>Sign in to save</button>}</section>
      <div className="notice" role="status" aria-live="polite">{notice}</div>
    </main><footer className="ss-footer"><span><strong>StockSense Lab</strong> · BMSCE VAC educational pilot</span><span>Alpha Vantage · Groq · Supabase · n8n · MCP</span><span>Research with context. Never certainty.</span></footer>
    <dialog ref={authDialog} className="auth-dialog" onCancel={() => setLoginOpen(false)} onClose={() => setLoginOpen(false)} aria-labelledby="login-title"><button className="dialog-close" aria-label="Close sign-in" onClick={() => setLoginOpen(false)}>×</button><p className="eyebrow">YOUR RESEARCH SPACE</p><h2 id="login-title">Welcome to StockSense.</h2><p>Use the faculty test account to save a private watchlist. All market browsing is available to guests.</p><form onSubmit={login}><label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" autoComplete="username" required/><label htmlFor="login-password">Password</label><input id="login-password" name="password" type="password" autoComplete="current-password" required/>{authError && <p role="alert" className="inline-error">{authError}</p>}<button type="submit" disabled={authBusy}>{authBusy ? 'Signing in…' : 'Sign in'}</button></form><small>Authentication is handled by Supabase. Provider keys are never used in this browser.</small></dialog>
  </div>;
}
