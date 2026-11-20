import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv[2] || 'http://127.0.0.1:3100';
const secretNames = /^(GROQ_API_KEY|ALPHA_VANTAGE_API_KEY|INGESTION_TOKEN|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SETUP_ADMIN_KEY|DATABASE_PASSWORD|FACULTY_[AB]_PASSWORD|VERCEL_OIDC_TOKEN)$/;
const secrets = [];
for (const file of ['VAC project/.env.local', 'backend/.env']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/);
    if (m && secretNames.test(m[1])) {
      const value = m[2].trim().replace(/^['"]|['"]$/g, '');
      if (value.length > 8) secrets.push(value);
    }
  }
}
const safe = text => assert.ok(secrets.every(key => !text.includes(key)), 'Credential exposure detected');
for (const route of ['/', '/?market=US', '/stocks/reliance', '/stocks/tcs', '/stocks/apple', '/stocks/microsoft', '/stocks/unknown', '/api/pilot/internal/ingestion/config']) {
  const response = await fetch(base + route);
  const html = await response.text();
  safe(html);
  const missing = route.includes('unknown') || route.includes('/internal/');
  assert.equal(response.status, missing ? 404 : 200);
  if (!missing) {
    assert.ok(html.includes('StockSense'));
    assert.ok(html.includes('No relevant stored headlines yet.'));
    const css = [...html.matchAll(/href="([^\"]+\.css[^\"]*)"/g)].map(m => m[1]);
    assert.ok(css.length);
    let styled = false;
    for (const asset of css) {
      const result = await fetch(new URL(asset, base));
      assert.equal(result.status, 200);
      const content = await result.text(); safe(content);
      styled ||= content.includes('.ss-app');
    }
    assert.ok(styled, 'Dashboard stylesheet missing');
  }
  console.log(`${response.status} ${route} · secret check passed`);
}
function bundles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) bundles(file);
    else safe(fs.readFileSync(file, 'utf8'));
  }
}
bundles('VAC project/.next/static');
console.log('Production styles and browser artifact secret checks passed.');
