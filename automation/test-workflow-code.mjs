import assert from 'node:assert/strict';
import fs from 'node:fs';
const workflow = JSON.parse(fs.readFileSync(new URL('./stocksense.workflow.json', import.meta.url), 'utf8'));
for (const node of workflow.nodes) if (node.parameters.jsCode) new Function('$input', '$', '$json', node.parameters.jsCode);
const group = workflow.nodes.find(n => n.name === 'Group headlines');
for (const [name, interval] of [['Reserve classifier quota', 4000], ['Groq company sentiment', 22000]]) {
  assert.deepEqual(workflow.nodes.find(n => n.name === name).parameters.options.batching.batch, { batchSize: 1, batchInterval: interval });
}
const stock = { id: 'apple', name: 'Apple', aliases: ['apple'] };
const official = Array.from({ length: 10 }, (_, i) => ({ stock_id: 'apple', title: 'Fictional Apple announcement ' + i, url: 'https://example.com/official/' + i, published_at: '2026-11-19T10:00:00Z' }));
const world = Array.from({ length: 8 }, (_, i) => ({ market: 'World', title: 'Fictional technology supply chain event ' + i, url: 'https://example.com/world/' + i, published_at: '2026-11-19T11:00:00Z' }));
const result = new Function('$input', '$', group.parameters.jsCode)({ all: () => [{ json: { status: 'ok', records: [...official, ...world] } }] }, () => ({ first: () => ({ json: { stocks: [stock] } }) }));
assert.equal(result[0].json.records.length, 8);
assert.equal(result[0].json.records.filter(r => r.stock_id).length, 4);
assert.equal(result[0].json.records.filter(r => r.market === 'World').length, 4);
console.log('Workflow code syntax, bounded batches and room for company-linked world news verified with fixtures.');
