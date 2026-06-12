-- Barndaksa finance refinement: platform coupons, plan limits, trial/free defaults and invoice support.

alter table public.platform_plans
  add column if not exists category_id text default 'cafes_coffee',
  add column if not exists max_orders_monthly integer,
  add column if not exists max_products_monthly integer,
  add column if not exists max_reservations_monthly integer,
  add column if not exists max_branches integer,
  add column if not exists trial_days integer default 15,
  add column if not exists free_after_trial boolean default false;

alter table public.subscriptions
  add column if not exists platform_coupon_id uuid,
  add column if not exists paid_at timestamptz,
  add column if not exists invoice_number text;

create table if not exists public.platform_discount_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  eligible_plan_ids text[] not null default '{}',
  valid_from timestamptz,
  valid_until timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions
  drop constraint if exists subscriptions_platform_coupon_id_fkey;
alter table public.subscriptions
  add constraint subscriptions_platform_coupon_id_fkey
  foreign key (platform_coupon_id) references public.platform_discount_coupons(id) on delete set null;

create index if not exists idx_platform_discount_coupons_code_active on public.platform_discount_coupons(code, active);
create index if not exists idx_subscriptions_platform_coupon_id on public.subscriptions(platform_coupon_id);
create index if not exists idx_subscriptions_paid_lookup on public.subscriptions(cafe_id, status, amount_sar, created_at desc);

alter table public.platform_discount_coupons enable row level security;

drop policy if exists platform_discount_coupons_admin_all on public.platform_discount_coupons;
create policy platform_discount_coupons_admin_all on public.platform_discount_coupons
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select, insert, update, delete on public.platform_discount_coupons to authenticated;
grant select, insert, update, delete on public.platform_discount_coupons to service_role;
grant select, update on public.subscriptions to service_role;
grant select, update on public.platform_plans to service_role;

create or replace function public.increment_platform_coupon_redemption(p_coupon_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_discount_coupons
  set redeemed_count = redeemed_count + 1,
      updated_at = now()
  where id = p_coupon_id;
end;
$$;

grant execute on function public.increment_platform_coupon_redemption(uuid) to authenticated, service_role;

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
    id, name, price_sar, offer_enabled, offer_price_sar, duration_unit, duration_count,
    description, features, active, is_default, sort_order, category_id,
    max_orders_monthly, max_products_monthly, max_reservations_monthly, max_branches,
    trial_days, free_after_trial, updated_at
  ) values (
    p_id, p_name, p_price_sar, p_offer_enabled, p_offer_price_sar, p_duration_unit, p_duration_count,
    p_description, p_features, p_active, p_is_default, 100, coalesce(p_category_id, 'cafes_coffee'),
    p_max_orders_monthly, p_max_products_monthly, p_max_reservations_monthly, p_max_branches,
    coalesce(p_trial_days, 15), coalesce(p_free_after_trial, false), now()
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

create or replace function public.activate_default_trial_subscription_for_cafe(p_cafe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.platform_plans%rowtype;
  v_trial_days integer;
begin
  select pp.* into v_plan
  from public.platform_plans pp
  join public.platform_settings ps on ps.default_plan_id = pp.id
  where ps.id = 'default'
  limit 1;

  if not found then
    select * into v_plan from public.platform_plans where active = true order by price_sar asc limit 1;
  end if;

  if not found then
    return;
  end if;

  v_trial_days := coalesce(v_plan.trial_days, 15);

  insert into public.subscriptions (
    cafe_id, plan_id, status, amount_sar, base_amount_sar, discount_amount_sar,
    plan_name_snapshot, duration_unit, duration_count, activation_source, started_at, expires_at,
    payment_provider, payment_method_label
  ) values (
    p_cafe_id, v_plan.id, 'trialing', 0, 0, 0,
    v_plan.name, 'day', v_trial_days, 'default_trial', now(), now() + make_interval(days => v_trial_days),
    'internal', 'تجربة مجانية 15 يوم'
  )
  on conflict do nothing;
end;
$$;

grant execute on function public.activate_default_trial_subscription_for_cafe(uuid) to authenticated, service_role;

create or replace function public.move_expired_trials_to_free_plan()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_free_plan_id text;
  v_count integer := 0;
begin
  select id into v_free_plan_id from public.platform_plans where free_after_trial = true and active = true order by price_sar asc limit 1;
  if v_free_plan_id is null then
    select id into v_free_plan_id from public.platform_plans where active = true order by price_sar asc limit 1;
  end if;
  if v_free_plan_id is null then
    return 0;
  end if;

  update public.subscriptions
  set status = 'cancelled', cancelled_at = now()
  where status = 'trialing' and expires_at is not null and expires_at < now();

  insert into public.subscriptions (cafe_id, plan_id, status, amount_sar, base_amount_sar, discount_amount_sar, plan_name_snapshot, duration_unit, duration_count, activation_source, started_at, payment_provider, payment_method_label)
  select distinct s.cafe_id, p.id, 'active', 0, 0, 0, p.name, 'month', 1, 'free_after_trial', now(), 'internal', 'باقة مجانية بعد التجربة'
  from public.subscriptions s
  cross join public.platform_plans p
  where p.id = v_free_plan_id
    and s.status = 'cancelled'
    and s.activation_source = 'default_trial'
    and not exists (
      select 1 from public.subscriptions active_sub
      where active_sub.cafe_id = s.cafe_id and active_sub.status in ('active','trialing')
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.move_expired_trials_to_free_plan() to authenticated, service_role;

comment on column public.platform_plans.max_orders_monthly is 'Monthly order limit controlled by admin plans.';
comment on column public.platform_plans.max_products_monthly is 'Monthly visible product limit controlled by admin plans.';
comment on column public.platform_plans.max_reservations_monthly is 'Monthly reservation limit controlled by admin plans.';
comment on column public.platform_plans.max_branches is 'Allowed branch count controlled by admin plans.';
comment on table public.platform_discount_coupons is 'Admin-managed coupons for paid subscriptions, renewals and upgrades, separate from representative coupons.';

create or replace function public.force_signup_default_plan_to_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_days integer;
begin
  if new.activation_source = 'signup_default_plan' then
    select coalesce(trial_days, 15) into v_trial_days from public.platform_plans where id = new.plan_id;
    new.status := 'trialing';
    new.amount_sar := 0;
    new.base_amount_sar := coalesce(new.base_amount_sar, 0);
    new.discount_amount_sar := coalesce(new.discount_amount_sar, 0);
    new.started_at := coalesce(new.started_at, now());
    new.expires_at := new.started_at + make_interval(days => coalesce(v_trial_days, 15));
    new.duration_unit := 'day';
    new.duration_count := coalesce(v_trial_days, 15);
    new.payment_provider := coalesce(new.payment_provider, 'internal');
    new.payment_method_label := coalesce(new.payment_method_label, 'تجربة مجانية 15 يوم');
  end if;
  return new;
end;
$$;

drop trigger if exists before_signup_default_plan_trial on public.subscriptions;
create trigger before_signup_default_plan_trial
before insert on public.subscriptions
for each row
execute function public.force_signup_default_plan_to_trial();

grant execute on function public.force_signup_default_plan_to_trial() to authenticated, service_role;
