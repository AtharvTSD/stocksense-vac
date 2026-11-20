import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const secrets = [process.env.GROQ_API_KEY, process.env.ALPHA_VANTAGE_API_KEY].filter(Boolean);
for (const route of ['/', '/?market=US', '/stocks/reliance', '/stocks/tcs', '/stocks/apple', '/stocks/microsoft', '/wireframe', '/stocks/unknown']) {
  const response = await fetch('http://127.0.0.1:3100' + route);
  const html = await response.text();
  assert.equal(response.status, route.endsWith('unknown') ? 404 : 200);
  assert.ok(secrets.every(key => !html.includes(key)), 'Credential leaked in response');
  if (route.startsWith('/stocks/') && !route.endsWith('unknown')) {
    assert.ok(html.includes('Next trading session'));
    assert.ok(html.includes('SYNTHETIC HEADLINES'));
    assert.ok(html.includes('View chart values'));
  }
  console.log(`${response.status} ${route} · credential check passed`);
}
async function checkBundles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await checkBundles(file);
    else {
      const text = await readFile(file, 'utf8');
      assert.ok(secrets.every(key => !text.includes(key)), 'Credential leaked in browser artifact');
    }
  }
}
await checkBundles('.next/static');
console.log('Browser artifacts · credential check passed');
