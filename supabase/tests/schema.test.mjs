import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

test('actual PostgreSQL migration, hybrid search, budgets, idempotence and two-owner RLS', async () => {
  const pg = new PGlite({ extensions: { vector } });
  try {
    // Only the hosted Auth identity function is simulated; policies and PostgreSQL execution are real.
    await pg.exec(`create role anon; create role authenticated; create schema extensions; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await pg.exec(fs.readFileSync(new URL('../migrations/202611200001_stocksense.sql', import.meta.url), 'utf8'));
    await pg.exec(fs.readFileSync(new URL('../migrations/202611210002_runtime_role.sql', import.meta.url), 'utf8'));
    const a = '00000000-0000-4000-8000-000000000001', b = '00000000-0000-4000-8000-000000000002';
    await pg.exec(`insert into auth.users values ('${a}'),('${b}'); set role authenticated; set request.jwt.claim.sub='${a}';`);
    await pg.query('insert into public.watchlists(owner_id,stock_id) values($1,$2)', [a, 'apple']);
    await assert.rejects(pg.query('insert into public.watchlists(owner_id,stock_id) values($1,$2)', [b, 'tcs']), /row-level security/);
    assert.equal((await pg.query('select * from public.watchlists')).rows.length, 1);
    await pg.exec(`set request.jwt.claim.sub='${b}';`);
    assert.equal((await pg.query('select * from public.watchlists')).rows.length, 0);
    await pg.query('insert into public.watchlists(owner_id,stock_id) values($1,$2)', [b, 'tcs']);
    assert.equal((await pg.query('delete from public.watchlists where owner_id=$1 returning *', [a])).rows.length, 0);
    await pg.exec('reset role; set role stocksense_ingest;');
    await assert.rejects(pg.query('select * from public.watchlists'), /permission denied/);
    assert.equal((await pg.query("select public.reserve_provider_call('alpha',8,13) allowed")).rows[0].allowed, true);
    assert.equal((await pg.query("select public.reserve_provider_call('alpha',8,13) allowed")).rows[0].allowed, false);
    const embedding = '[' + [1, ...Array(383).fill(0)].join(',') + ']';
    const sql = `insert into public.news(stock_id,canonical_url,title,publisher,feed_id,source_kind,published_at,first_seen_at,relevant,sentiment,embedding)
      values($1,$2,$3,'Fixture publisher','fixture','publisher','2026-11-19T12:00:00Z','2026-11-19T13:00:00Z',true,'neutral',$4::extensions.vector)
      on conflict(stock_id,canonical_url) do nothing returning id`;
    const args = ['apple', 'https://example.com/schema-fixture', 'Apple supply chain research', embedding];
    assert.equal((await pg.query(sql, args)).rows.length, 1);
    assert.equal((await pg.query(sql, args)).rows.length, 0, 'replay inserts no duplicate');
    await pg.query(sql, ['tcs', 'https://example.com/other-stock', 'Apple supply chain research', embedding]);
    await pg.exec('reset role; set role stocksense_reader;');
    const found = await pg.query('select stock_id,title from public.hybrid_stock_search($1,$2,$3::extensions.vector,6)', ['apple', 'supply chain', embedding]);
    assert.equal(found.rows.length, 1);
    assert.equal(found.rows[0].stock_id, 'apple');
    await assert.rejects(pg.query("select public.reserve_provider_call('alpha',8,13)"), /permission denied/);
    await assert.rejects(pg.query('select * from public.analysis'), /permission denied/);
  } finally { await pg.close(); }
});
