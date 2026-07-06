-- 067_add_order_not_completed_status.sql
-- Adds terminal cashier order statuses without changing existing order flow.

do $$
begin
  if to_regtype('public.order_status') is not null then
    alter type public.order_status add value if not exists 'completed';
    alter type public.order_status add value if not exists 'not_completed';
  end if;
end $$;

alter table if exists public.orders
  add column if not exists not_completed_reason text;

notify pgrst, 'reload schema';

select 'order_not_completed_status_ready' as status;
