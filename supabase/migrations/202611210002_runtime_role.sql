-- Passwords are assigned only through private provisioning, never migrations/source control.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='stocksense_backend') then
  create role stocksense_backend nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
 end if;
end $$;
grant stocksense_reader,stocksense_ingest to stocksense_backend;
grant connect on database postgres to stocksense_backend;
