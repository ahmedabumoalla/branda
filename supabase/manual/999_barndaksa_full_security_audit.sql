-- Barndaksa deep security audit: run in Supabase SQL editor or with psql.
-- This is read-only. It reports RLS, policies, grants, SECURITY DEFINER functions, and storage buckets.

select 'rls_status' as section, n.nspname as schema, c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select 'table_policies' as section, schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select 'dangerous_anon_grants' as section, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
  and table_name in ('profiles','orders','order_items','reservations','customer_profiles','customer_sessions','subscriptions','audit_logs','platform_settings','cafe_members')
order by table_name, privilege_type;

select 'anon_public_grants' as section, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'anon'
order by table_name, privilege_type;

select 'security_definer_functions' as section, n.nspname as schema, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '') as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef = true
order by p.proname;

select 'functions_missing_search_path' as section, n.nspname as schema, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
  and coalesce(array_to_string(p.proconfig, ','), '') not ilike '%search_path%'
order by p.proname;

select 'storage_buckets' as section, id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
order by name;

select 'storage_policies' as section, schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

select 'extensions' as section, extname, extversion
from pg_extension
order by extname;
