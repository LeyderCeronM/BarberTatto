-- SOLO para la base local de Docker: crea los roles que Supabase ya trae de fábrica.
-- No ejecutes esto en Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator noinherit login password 'authenticator-dev-pw';
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
