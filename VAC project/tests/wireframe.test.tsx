import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: dom.window.document, configurable: true });
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(globalThis, 'HTMLElement', { value: dom.window.HTMLElement });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, writable: true });

const { render, screen, fireEvent, cleanup, act } = await import('@testing-library/react');
const { default: Home } = await import('../src/app/wireframe/page');
const { stocks, metrics, prompts } = await import('../src/lib/fixtures');
const sleep = (ms: number) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });

test('Exercise 1: stock context, watchlist undo, alerts, five AI states and recovery', async () => {
  render(<Home />);
  assert.equal(screen.getAllByRole('button').filter(b => prompts.some(p => b.textContent?.includes(p))).length, 3);
  assert.ok(screen.getByText('Make sense of the numbers.'));
  for (const stock of stocks) assert.equal(metrics(stock).price, stock.history.at(-1));

  fireEvent.click(screen.getByRole('button', { name: '✓ Saved · Remove' }));
  assert.ok(screen.getByRole('button', { name: '＋ Add to watchlist' }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo removal of RELIANCE' }));
  assert.ok(screen.getByRole('button', { name: '✓ Saved · Remove' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'INFY' } });
  assert.ok(screen.getByText('Context: INFY'));
  fireEvent.click(screen.getByRole('button', { name: '＋ Add to watchlist' }));
  fireEvent.click(screen.getByRole('button', { name: /TCS.*Tata Consultancy/ }));
  assert.ok(screen.getByText('Context: TCS'));

  fireEvent.change(screen.getByLabelText('Notify when sample price is above (INR)'), { target: { value: '3500' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create demo alert' }));
  assert.ok(screen.getByText(/Demo: TCS above/));
  assert.ok(screen.getByText('Inactive example rule'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove demo alert for TCS' }));
  assert.equal(screen.queryByText('Inactive example rule'), null);

  fireEvent.click(screen.getByRole('button', { name: new RegExp(prompts[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
  assert.ok(screen.getByText('Reading the sample data…'));
  assert.equal((screen.getByRole('button', { name: 'Send ↗' }) as HTMLButtonElement).disabled, true);
  await sleep(1400);
  assert.ok(screen.getByText('Writing a simulated explanation…'));
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  assert.ok(screen.getByText('Stopped · Incomplete response'));
  const stoppedText = document.querySelector('.answer-text')?.textContent;
  await sleep(100);
  assert.equal(document.querySelector('.answer-text')?.textContent, stoppedText);

  fireEvent.click(screen.getByRole('button', { name: 'Edit question' }));
  assert.equal((screen.getByRole('textbox') as HTMLTextAreaElement).value, prompts[1]);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Preserve this draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'error' }));
  assert.ok(screen.getByRole('alert'));
  assert.ok(screen.getByText(prompts[0]));
  assert.equal((screen.getByRole('textbox') as HTMLTextAreaElement).value, 'Preserve this draft');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  assert.ok(screen.getByText('Reading the sample data…'));
  assert.equal((screen.getByRole('textbox') as HTMLTextAreaElement).value, 'Preserve this draft');
  await sleep(4200);
  assert.ok(screen.getByRole('button', { name: 'Copy' }));
  let copied = '';
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { copied = text; } }, configurable: true });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
  assert.ok(copied.startsWith('Simulated response · TCS'));
  assert.ok(screen.getByText('Simulated response copied.'));
  fireEvent.click(screen.getByRole('button', { name: 'Helpful response' }));
  assert.ok(screen.getByText('Feedback: Helpful'));
  fireEvent.click(screen.getByRole('button', { name: 'Unhelpful response' }));
  assert.ok(screen.getByText('Feedback: Unhelpful'));
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
  assert.ok(screen.getByText('Reading the sample data…'));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'RELIANCE' } });
  assert.ok(screen.getByText('Context: RELIANCE'));
  assert.equal(screen.queryByText('Stopped · Incomplete response'), null);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'TCS' } });
  assert.ok(screen.getByText('Stopped · Incomplete response'));

  for (const state of ['empty', 'loading', 'streaming', 'error', 'success']) {
    fireEvent.click(screen.getByRole('button', { name: state }));
    assert.equal(screen.getByRole('button', { name: state }).getAttribute('aria-pressed'), 'true');
  }
  fireEvent.click(screen.getByRole('button', { name: 'empty' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'My custom question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send ↗' }));
  fireEvent.click(screen.getByRole('button', { name: 'Send ↗' }));
  assert.equal(screen.getAllByText('My custom question').length, 1);
  assert.equal((screen.getByRole('textbox') as HTMLTextAreaElement).value, '');
  cleanup();
  await sleep(100);
});

