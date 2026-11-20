'use client';

import { useEffect, useRef, useState } from 'react';
import { metrics, money, prompts, sampleAnswer, stocks, timestamp } from '@/lib/fixtures';

type State = 'empty' | 'loading' | 'streaming' | 'error' | 'success';
type Message = { id: number; ticker: string; question: string; answer: string; state: State; incomplete?: boolean; feedback?: string };
type Rule = { id: number; ticker: string; threshold: number };

export default function Home() {
  const [ticker, setTicker] = useState('RELIANCE');
  const [saved, setSaved] = useState(['RELIANCE', 'TCS']);
  const [removed, setRemoved] = useState<{ ticker: string; index: number } | null>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<State>('empty');
  const [notice, setNotice] = useState('');
  const [threshold, setThreshold] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const serial = useRef(0);
  const stock = stocks.find(s => s.ticker === ticker)!;
  const { price, change, percent } = metrics(stock);
  const busy = state === 'loading' || state === 'streaming';
  const conversation = messages.filter(m => m.ticker === ticker);

  // Implementing: Five deterministic states keep the workshop reproducible without external services.
  function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; active.current = false; }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); active.current = false; }, []);
  function patch(id: number, update: Partial<Message>) { setMessages(ms => ms.map(m => m.id === id ? { ...m, ...update } : m)); }
  function stop() {
    clearTimer();
    setMessages(ms => ms.map(m => m.state === 'loading' || m.state === 'streaming' ? { ...m, state: 'success', incomplete: true } : m));
    setState('success'); setNotice('Generation stopped. The response is incomplete.');
  }
  function chooseStock(value: string) {
    if (value === ticker) return;
    if (active.current) stop();
    setTicker(value); setState(messages.filter(m => m.ticker === value).at(-1)?.state ?? 'empty'); setThreshold('');
    setNotice(`Context changed to ${value}. Conversations are kept separately by ticker; your draft is retained.`);
  }
  // How: A single cancellable timer streams fixture text; messages retain their original ticker.
  function submit(question: string, mode: State = 'loading', previousId?: number) {
    if (active.current || !question.trim()) return;
    clearTimer();
    const id = previousId ?? ++serial.current;
    const answer = sampleAnswer(stock, question);
    const message: Message = { id, ticker, question: question.trim(), answer: '', state: mode };
    setMessages(ms => previousId ? ms.map(m => m.id === id ? message : m) : [...ms, message]);
    setState(mode); setNotice('');
    if (mode === 'error') return;
    if (mode === 'success') { patch(id, { answer, state: 'success' }); return; }
    active.current = true;
    let cursor = 0;
    function tick() {
      if (!active.current) return;
      cursor = Math.min(cursor + 14, answer.length);
      const done = cursor === answer.length;
      patch(id, { answer: answer.slice(0, cursor), state: done ? 'success' : 'streaming' });
      setState(done ? 'success' : 'streaming');
      if (done) { active.current = false; timer.current = null; }
      else timer.current = setTimeout(tick, 35);
    }
    timer.current = setTimeout(tick, mode === 'loading' ? 1200 : 50);
  }
  function demo(mode: State) {
    clearTimer();
    setMessages(ms => ms.filter(m => m.ticker !== ticker));
    setState('empty');
    if (mode === 'empty') { setNotice('Empty state shown. This ticker’s conversation was reset; your draft is retained.'); return; }
    submit(prompts[0], mode);
  }
  function toggleSaved() {
    if (saved.includes(ticker)) {
      setRemoved({ ticker, index: saved.indexOf(ticker) }); setSaved(saved.filter(t => t !== ticker)); setNotice(`${ticker} removed from watchlist.`);
    } else { setSaved([...saved, ticker]); setNotice(`${ticker} added to watchlist.`); }
  }
  function undo() {
    if (!removed) return;
    const item = removed;
    setSaved(list => { if (list.includes(item.ticker)) return list; const next = [...list]; next.splice(item.index, 0, item.ticker); return next; });
    setRemoved(null); setNotice(`${item.ticker} restored to watchlist.`);
  }
  async function copy(message: Message) {
    try { await navigator.clipboard.writeText(`Simulated response · ${message.ticker}${message.incomplete ? ' · Incomplete' : ''}\n${message.answer}`); setNotice('Simulated response copied.'); }
    catch { setNotice('Copy unavailable. Select the response text and copy it manually.'); }
  }
  // Outcome: Chart, overview, watchlist prices and scripted explanations share the same local fixtures.
  const min = Math.min(...stock.history), max = Math.max(...stock.history);
  const points = stock.history.map((v, i) => `${25 + i * 50},${115 - ((v - min) / (max - min || 1)) * 85}`).join(' ');

  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="brand-icon" aria-hidden="true">S↗</span><div><strong>StockSense</strong><span className="subtitle">AI Powered Stock Analysis and Monitoring</span></div></div><span className="badge">Demo — sample data</span></header>
    <main>
      <div className="intro"><div><p className="eyebrow">VAC PROJECT / EXERCISE 01</p><h1>Understand a stock.<br className="mobile-break"/> Start with a question.</h1><p>A little context for your next step in learning about the market.</p></div><label className="stock-select">Stock context<select value={ticker} onChange={e => chooseStock(e.target.value)}>{stocks.map(s => <option key={s.ticker} value={s.ticker}>{s.ticker} · {s.name}</option>)}</select></label></div>
      <div className="workspace">
        <aside className="sidebar">
          <section className="card"><div className="section-heading"><h2>Watchlist</h2><span className="count">{saved.length}</span></div><p className="muted small">This session only · resets on refresh</p><div className="watchlist">{saved.length === 0 && <p className="small muted">Your watchlist is empty. Save a stock from the overview.</p>}{saved.map(t => { const s = stocks.find(s => s.ticker === t)!; const m = metrics(s); return <button key={t} className={`watch-item ${t === ticker ? 'selected' : ''}`} onClick={() => chooseStock(t)} aria-pressed={t === ticker}><span><strong>{t}</strong><small>{s.name}</small></span><span><strong>{money(m.price)}</strong><small className={m.change >= 0 ? 'positive' : 'negative'}>{m.change >= 0 ? 'Up' : 'Down'} {Math.abs(m.percent).toFixed(2)}%</small></span></button>; })}</div>{removed && <button className="text-button" onClick={undo}>Undo removal of {removed.ticker}</button>}</section>
          <section className="card"><p className="eyebrow">LEARN BY TRYING</p><h2>Demo price alert</h2><p className="small muted">Create an example rule for {ticker}. Real monitoring and notifications are not connected.</p><form onSubmit={e => { e.preventDefault(); const value = Number(threshold); if (!Number.isFinite(value) || value <= 0) { setNotice('Enter a positive INR threshold.'); return; } setRules(rs => [...rs, { id: ++serial.current, ticker, threshold: value }]); setThreshold(''); setNotice('Demo rule created. No monitoring or notifications will run.'); }}><label className="small" htmlFor="threshold">Notify when sample price is above (INR)</label><div className="alert-input"><input id="threshold" type="number" min="0.01" step="0.01" required value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="e.g. 1500"/><button type="submit" aria-label="Create demo alert">＋</button></div></form><ul className="rules">{rules.map(r => <li key={r.id}><span>Demo: {r.ticker} above {money(r.threshold)}<small>Inactive example rule</small></span><button aria-label={`Remove demo alert for ${r.ticker}`} onClick={() => setRules(rs => rs.filter(item => item.id !== r.id))}>×</button></li>)}</ul></section>
          <p className="sidebar-note">Made for learning.<br/>No trading or investment recommendations.</p>
        </aside>
        <div className="main-column">
          <section className="card overview"><div className="section-heading"><div><p className="eyebrow">{stock.exchange} · {ticker} · {stock.currency}</p><h2>{stock.name}</h2></div><button onClick={toggleSaved} aria-pressed={saved.includes(ticker)}>{saved.includes(ticker) ? '✓ Saved · Remove' : '＋ Add to watchlist'}</button></div><div className="price-row"><strong className="price">{money(price)}</strong><span className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? 'Up' : 'Down'} {money(Math.abs(change))} ({Math.abs(percent).toFixed(2)}%) <span className="muted">vs previous sample session</span></span></div><figure><svg viewBox="0 0 600 145" role="img" aria-label={`${ticker} fictional price chart, 12 sessions, from ${money(stock.history[0])} to ${money(price)}`}><line x1="25" y1="30" x2="575" y2="30" className="gridline"/><line x1="25" y1="72" x2="575" y2="72" className="gridline"/><line x1="25" y1="115" x2="575" y2="115" className="gridline"/><polyline points={points} fill="none" stroke={change >= 0 ? '#377260' : '#a34242'} strokeWidth="2.5"/><text x="25" y="140">Session 1</text><text x="510" y="140">Session 12</text></svg><figcaption>12 fictional daily closes · Sample timestamp: {timestamp}</figcaption><details><summary>View chart data</summary><p className="small">{stock.history.map((v, i) => `Session ${i + 1}: ${money(v)}`).join(' · ')}</p></details></figure></section>
          <section className="card chat"><div className="chat-heading"><div><h2><span aria-hidden="true">✳ </span>Your analysis assistant</h2><p className="small muted">Ask, understand, explore.</p></div><span className="context">Context: {ticker}</span></div><div className="expectations">The future assistant will summarize supplied stock data and explain indicators. It cannot guarantee returns or know live prices without a connected data source. All responses here are simulated.</div>
            <div className="conversation" aria-label={`${ticker} conversation`}>
              {conversation.length === 0 ? <div className="empty"><span className="empty-icon" aria-hidden="true">✳</span><h3>Make sense of the numbers.</h3><p className="muted">Start with one of these questions, or write your own.</p><div className="prompts">{prompts.map((prompt, i) => <button key={prompt} disabled={busy} onClick={() => submit(prompt)}><span className="prompt-number">0{i + 1}</span><span>{prompt}</span><span aria-hidden="true">↗</span></button>)}</div></div> : conversation.map(message => <article className="message" key={message.id}><div className="question"><span className="eyebrow">YOU · {message.ticker}</span><p>{message.question}</p><button className="text-button" disabled={busy} onClick={() => { setDraft(message.question); setNotice('Question placed in the composer. Edit it, then send.'); document.getElementById('question')?.focus(); }}>Edit question</button></div><div className="answer"><span className="eyebrow">STOCKSENSE · SIMULATED RESPONSE</span>{message.state === 'loading' && <p role="status" className="working"><span className="pulse"/> Reading the sample data…</p>}{message.answer && <p className="answer-text">{message.answer}</p>}{message.state === 'streaming' && <p role="status" className="small muted">Writing a simulated explanation…</p>}{message.incomplete && <p className="incomplete">Stopped · Incomplete response</p>}{message.state === 'error' && <div className="error" role="alert"><strong>We couldn’t complete this demo response.</strong><p>This is a simulated error. Your question and draft are safe.</p><button disabled={busy} onClick={() => submit(message.question, 'loading', message.id)}>Retry</button></div>}{message.state === 'success' && <div className="response-actions"><button onClick={() => copy(message)} disabled={!message.answer}>Copy</button><button disabled={busy} onClick={() => submit(message.question, 'loading', message.id)}>Regenerate</button><button aria-label="Helpful response" aria-pressed={message.feedback === 'Helpful'} onClick={() => { patch(message.id, { feedback: 'Helpful' }); setNotice('Thanks — marked as helpful for this session.'); }}>Helpful</button><button aria-label="Unhelpful response" aria-pressed={message.feedback === 'Unhelpful'} onClick={() => { patch(message.id, { feedback: 'Unhelpful' }); setNotice('Thanks — marked as unhelpful for this session.'); }}>Unhelpful</button>{message.feedback && <span className="small muted">Feedback: {message.feedback}</span>}</div>}</div></article>)}
            </div>
            <form className="composer" onSubmit={e => { e.preventDefault(); if (!active.current && draft.trim()) { submit(draft); setDraft(''); } }}><label htmlFor="question">Your question about {ticker}</label><textarea id="question" rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What would you like to understand?"/><div className="composer-footer"><span className="small muted">Sample data. Simulated explanations.</span><div className="button-row"><button type="button" disabled={!busy} onClick={stop}>Stop</button><button className="primary" disabled={busy || !draft.trim()} type="submit">Send ↗</button></div></div></form>
          </section>
          <section className="prototype"><div><strong>Prototype controls</strong><p className="small muted">Show a state · resets this ticker’s conversation</p></div><div className="state-buttons">{(['empty', 'loading', 'streaming', 'error', 'success'] as State[]).map(mode => <button key={mode} onClick={() => demo(mode)} aria-pressed={state === mode}>{mode}</button>)}</div></section>
        </div>
      </div><div className="notice" role="status" aria-live="polite">{notice || `Demo workspace · ${ticker} · ${state} state`}</div>
    </main><footer>StockSense <span>Exercise 1 · Local interactive wireframe · All figures are fictional fixtures</span></footer>
  </div>;
}
