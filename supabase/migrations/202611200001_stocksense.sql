-- Run through Supabase migrations/SQL editor. Never put passwords in this file.
begin;
create extension if not exists vector with schema extensions;
create role stocksense_reader nologin;
create role stocksense_ingest nologin;
grant stocksense_reader, stocksense_ingest to postgres;
grant usage on schema public, extensions to stocksense_reader, stocksense_ingest;

create table public.stocks (
 id text primary key check(id in ('reliance','tcs','apple','microsoft')),
 name text not null, symbol text unique not null, exchange text not null,
 market text not null, currency text not null, calendar text not null
);
insert into public.stocks values
 ('reliance','Reliance Industries','RELIANCE.BSE','BSE','India','INR','XBOM'),
 ('tcs','Tata Consultancy Services','TCS.BSE','BSE','India','INR','XBOM'),
 ('apple','Apple','AAPL','NASDAQ','US','USD','XNYS'),
 ('microsoft','Microsoft','MSFT','NASDAQ','US','USD','XNYS');
create table public.prices (
 stock_id text references public.stocks(id), session date not null,
 close double precision not null check(close>0), primary key(stock_id,session)
);
create table public.price_cache (
 stock_id text primary key references public.stocks(id), payload jsonb not null,
 fetched_at timestamptz not null default now()
);
create table public.news (
 id uuid primary key default gen_random_uuid(), stock_id text not null references public.stocks(id),
 canonical_url text not null check(canonical_url like 'https://%'), title text not null,
 summary text not null default '', publisher text not null, feed_id text not null,
 source_kind text not null check(source_kind in ('publisher','official-announcement')),
 published_at timestamptz not null, publication_precision text not null default 'timestamp' check(publication_precision in ('date','timestamp')), first_seen_at timestamptz not null default now(),
 relevant boolean not null, sentiment text not null check(sentiment in ('positive','neutral','negative')),
 embedding extensions.vector(384), search_text tsvector generated always as (to_tsvector('english',title||' '||summary)) stored,
 unique(stock_id,canonical_url)
);
create index news_search on public.news using gin(search_text);
create index news_stock_time on public.news(stock_id,published_at desc);
create table public.analysis (
 news_id uuid primary key references public.news(id), model text not null,
 classified_at timestamptz not null default now(), response jsonb not null
);
create table public.forecasts (
 stock_id text references public.stocks(id), cutoff timestamptz not null,
 generated_at timestamptz not null default now(), payload jsonb not null,
 primary key(stock_id,cutoff)
);
create table public.workflow_runs (
 id uuid primary key default gen_random_uuid(), external_id text unique not null,
 started_at timestamptz not null default now(), finished_at timestamptz,
 status text not null check(status in ('running','success','failed','partial')),
 counts jsonb not null default '{}', failures jsonb not null default '[]'
);
create table public.source_checks (
 feed_id text primary key, checked_at timestamptz not null default now(),
 status text not null, item_count integer not null default 0
);
create table public.provider_budgets (
 provider text primary key check(provider in ('alpha','groq')), day date not null,
 calls integer not null, last_call timestamptz not null
);
create table public.watchlists (
 owner_id uuid not null references auth.users(id) on delete cascade,
 stock_id text not null references public.stocks(id), created_at timestamptz not null default now(),
 primary key(owner_id,stock_id)
);

-- Guest reads contain only public stock data. Ingestion gets no watchlist/auth access.
do $$ declare t text; begin
 foreach t in array array['stocks','prices','price_cache','news','analysis','forecasts','workflow_runs','source_checks'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('grant select on public.%I to anon,authenticated,stocksense_reader,stocksense_ingest',t);
   execute format('create policy public_read on public.%I for select to anon,authenticated,stocksense_reader using (true)',t);
   execute format('create policy ingest_access on public.%I to stocksense_ingest using (true) with check (true)',t);
 end loop;
end $$;
drop policy public_read on public.news;
create policy public_read on public.news for select to anon,authenticated,stocksense_reader using(relevant);
drop policy public_read on public.analysis;
-- Raw model output is never publicly exposed.
revoke all on public.analysis from anon,authenticated,stocksense_reader;
grant insert,update on public.prices,public.price_cache,public.news,public.analysis,public.forecasts,public.workflow_runs,public.source_checks to stocksense_ingest;
alter table public.provider_budgets enable row level security;
alter table public.watchlists enable row level security;
grant select,insert,delete on public.watchlists to authenticated;
revoke all on public.watchlists from anon,stocksense_reader,stocksense_ingest;
create policy own_watchlist_read on public.watchlists for select to authenticated using((select auth.uid())=owner_id);
create policy own_watchlist_insert on public.watchlists for insert to authenticated with check((select auth.uid())=owner_id);
create policy own_watchlist_delete on public.watchlists for delete to authenticated using((select auth.uid())=owner_id);

create function public.reserve_provider_call(p_provider text,p_daily int,p_spacing int)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.provider_budgets; budget int; begin
 if p_provider not in ('alpha','groq') then return false; end if;
 budget:=least(p_daily,case when p_provider='alpha' then 8 else 20 end);
 insert into public.provider_budgets values(p_provider,(now() at time zone 'UTC')::date,0,'1970-01-01') on conflict do nothing;
 select * into r from public.provider_budgets where provider=p_provider for update;
 if (r.day=(now() at time zone 'UTC')::date and r.calls>=budget) or now()-r.last_call<make_interval(secs=>greatest(p_spacing,3)) then return false; end if;
 update public.provider_budgets set day=(now() at time zone 'UTC')::date,calls=case when r.day=(now() at time zone 'UTC')::date then r.calls+1 else 1 end,last_call=now() where provider=p_provider;
 return true;
end $$;
revoke all on function public.reserve_provider_call(text,int,int) from public,anon,authenticated;
grant execute on function public.reserve_provider_call(text,int,int) to stocksense_ingest;

-- Reciprocal rank fusion of stock-filtered full-text and 384-dimensional semantic search.
create function public.hybrid_stock_search(p_stock text,p_query text,p_embedding extensions.vector(384),p_limit int default 6)
returns setof public.news language sql stable security invoker set search_path=public,extensions as $$
 with text_results as (
 select id,row_number() over(order by ts_rank_cd(search_text,websearch_to_tsquery('english',p_query)) desc) as rank
 from public.news where stock_id=p_stock and relevant and search_text@@websearch_to_tsquery('english',p_query) limit 20
 ), vector_results as (
 select id,row_number() over(order by embedding<=>p_embedding) as rank
 from public.news where stock_id=p_stock and relevant and embedding is not null and embedding<=>p_embedding<0.8 limit 20
 ), fused as (
 select coalesce(t.id,v.id) as id,coalesce(1.0/(60+t.rank),0)+coalesce(1.0/(60+v.rank),0) as score
 from text_results t full join vector_results v using(id)
 ) select n.* from fused f join public.news n on n.id=f.id order by f.score desc limit least(greatest(p_limit,1),8)
$$;
revoke all on function public.hybrid_stock_search(text,text,extensions.vector,int) from public;
grant execute on function public.hybrid_stock_search(text,text,extensions.vector,int) to stocksense_reader;
commit;
