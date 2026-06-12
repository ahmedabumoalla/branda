-- Fix admin_save_platform_plan when platform_plans.features is jsonb.
-- Supabase/Postgres does not implicitly cast text[] to jsonb in INSERT/UPDATE.

create or replace function public.admin_save_platform_plan(
  p_id text,
  p_name text,
  p_price_sar numeric,
  p_offer_enabled boolean,
  p_offer_price_sar numeric,
  p_duration_unit text,
  p_duration_count integer,
  p_description text,
  p_features text[],
  p_active boolean,
  p_is_default boolean,
  p_category_id text default null,
  p_max_orders_monthly integer default null,
  p_max_products_monthly integer default null,
  p_max_reservations_monthly integer default null,
  p_max_branches integer default null,
  p_trial_days integer default null,
  p_free_after_trial boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only platform admin can save platform plans';
  end if;

  if p_is_default then
    update public.platform_settings set default_plan_id = p_id where id = 'default';
    update public.platform_plans set is_default = false where id <> p_id;
  end if;

  if p_free_after_trial then
    update public.platform_plans set free_after_trial = false where id <> p_id;
  end if;

  insert into public.platform_plans (
    id,
    name,
    price_sar,
    offer_enabled,
    offer_price_sar,
    duration_unit,
    duration_count,
    description,
    features,
    active,
    is_default,
    sort_order,
    category_id,
    max_orders_monthly,
    max_products_monthly,
    max_reservations_monthly,
    max_branches,
    trial_days,
    free_after_trial,
    updated_at
  ) values (
    p_id,
    p_name,
    p_price_sar,
    p_offer_enabled,
    p_offer_price_sar,
    p_duration_unit,
    p_duration_count,
    p_description,
    to_jsonb(coalesce(p_features, array[]::text[])),
    p_active,
    p_is_default,
    100,
    coalesce(p_category_id, 'cafes_coffee'),
    p_max_orders_monthly,
    p_max_products_monthly,
    p_max_reservations_monthly,
    p_max_branches,
    coalesce(p_trial_days, 15),
    coalesce(p_free_after_trial, false),
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    price_sar = excluded.price_sar,
    offer_enabled = excluded.offer_enabled,
    offer_price_sar = excluded.offer_price_sar,
    duration_unit = excluded.duration_unit,
    duration_count = excluded.duration_count,
    description = excluded.description,
    features = excluded.features,
    active = excluded.active,
    is_default = excluded.is_default,
    category_id = excluded.category_id,
    max_orders_monthly = excluded.max_orders_monthly,
    max_products_monthly = excluded.max_products_monthly,
    max_reservations_monthly = excluded.max_reservations_monthly,
    max_branches = excluded.max_branches,
    trial_days = excluded.trial_days,
    free_after_trial = excluded.free_after_trial,
    updated_at = now();
end;
$$;

grant execute on function public.admin_save_platform_plan(text,text,numeric,boolean,numeric,text,integer,text,text[],boolean,boolean,text,integer,integer,integer,integer,integer,boolean) to authenticated, service_role;
