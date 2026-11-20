begin;
-- Keep account-wide caps below the documented free allowances. Preserve all
-- existing counters; this is not a quota reset. The caller can request a lower cap.
create or replace function public.reserve_provider_call(p_provider text,p_daily int,p_spacing int)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.provider_budgets; budget int; begin
 if p_provider not in ('alpha','groq') or p_provider is null then return false; end if;
 budget:=least(greatest(p_daily,0),case when p_provider='alpha' then 20 else 40 end);
 insert into public.provider_budgets values(p_provider,(now() at time zone 'UTC')::date,0,'1970-01-01') on conflict do nothing;
 select * into r from public.provider_budgets where provider=p_provider for update;
 if (r.day=(now() at time zone 'UTC')::date and r.calls>=budget) or now()-r.last_call<make_interval(secs=>greatest(p_spacing,3)) then return false; end if;
 update public.provider_budgets set day=(now() at time zone 'UTC')::date,calls=case when r.day=(now() at time zone 'UTC')::date then r.calls+1 else 1 end,last_call=now() where provider=p_provider;
 return true;
end $$;
revoke all on function public.reserve_provider_call(text,int,int) from public,anon,authenticated;
grant execute on function public.reserve_provider_call(text,int,int) to stocksense_ingest;
commit;
