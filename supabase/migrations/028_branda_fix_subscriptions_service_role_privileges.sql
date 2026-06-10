-- 028_branda_fix_subscriptions_service_role_privileges.sql
-- Fix PayPal subscription checkout writes through server-side service role.
-- This does not open public access; it only restores table privileges for Supabase service_role.

grant usage on schema public to service_role;

grant select, insert, update, delete on table public.subscriptions to service_role;
grant select on table public.platform_plans to service_role;
grant select on table public.cafes to service_role;
grant select on table public.cafe_members to service_role;
grant select on table public.profiles to service_role;

grant usage, select on all sequences in schema public to service_role;

-- Keep normal authenticated users governed by existing RLS policies.
