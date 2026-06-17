-- BARNDAKSA_PLANS_FEATURES_LOYALTY_REPS_DB_FINAL_FIXED.sql
-- إصلاح خطأ cannot change return type بإسقاط الدوال القديمة قبل إعادة إنشائها.
-- شغّل هذا الملف بدل الملف السابق كاملًا من Supabase SQL Editor.

begin;

drop function if exists public.admin_assign_plan_without_payment(uuid, text);
drop function if exists public.get_current_representative_dashboard();

commit;


-- BARNDAKSA_PLANS_FEATURES_LOYALTY_REPS_DB_FINAL.sql
-- شغله مرة واحدة من Supabase SQL Editor بعد تطبيق الباتش.

create extension if not exists citext with schema public;

alter table if exists public.platform_plans
  add column if not exists offer_label text,
  add column if not exists offer_ends_at timestamptz,
  add column if not exists duration_options integer[] default array[1,2,12,24];

update public.platform_plans
set duration_options = array[1,2,12,24]
where duration_options is null or cardinality(duration_options) = 0;

create table if not exists public.representative_activity_logs (
  id uuid primary key default gen_random_uuid(),
  representative_id uuid not null references public.platform_representatives(id) on delete cascade,
  cafe_id uuid references public.cafes(id) on delete set null,
  action_type text not null,
  title text not null,
  detail text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.representative_activity_logs enable row level security;

drop policy if exists representative_activity_logs_admin_read on public.representative_activity_logs;
create policy representative_activity_logs_admin_read on public.representative_activity_logs
for select to authenticated using (is_platform_admin());

drop policy if exists representative_activity_logs_self_read on public.representative_activity_logs;
create policy representative_activity_logs_self_read on public.representative_activity_logs
for select to authenticated using (
  exists (
    select 1 from public.platform_representatives r
    where r.id = representative_activity_logs.representative_id
      and r.user_id = auth.uid()
  )
);

grant select on public.representative_activity_logs to authenticated;
grant insert, select on public.representative_activity_logs to service_role;

create index if not exists idx_platform_plans_active_sort on public.platform_plans(active, sort_order);
create index if not exists idx_subscriptions_cafe_status_created on public.subscriptions(cafe_id, status, created_at desc);
create index if not exists idx_brand_referrals_rep_cafe on public.brand_referrals(representative_id, cafe_id);
create index if not exists idx_cashier_logs_clean_ops on public.cafe_cashier_activity_logs(cafe_id, action_type, created_at desc);
create index if not exists idx_rep_activity_logs_rep_created on public.representative_activity_logs(representative_id, created_at desc);

create or replace function public.admin_assign_plan_without_payment(p_cafe_id uuid, p_plan_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.platform_plans%rowtype;
begin
  if not public.is_platform_admin() then
    raise exception 'Forbidden';
  end if;

  select * into v_plan from public.platform_plans where id = p_plan_id;
  if not found then
    raise exception 'Plan not found';
  end if;

  update public.subscriptions
     set status = 'cancelled', cancelled_at = now(), updated_at = now()
   where cafe_id = p_cafe_id and status in ('active','trialing','past_due');

  insert into public.subscriptions(
    cafe_id, plan_id, status, amount_sar, base_amount_sar, discount_amount_sar,
    plan_name_snapshot, duration_unit, duration_count, activation_source,
    payment_provider, payment_method_label, started_at, expires_at
  ) values (
    p_cafe_id, p_plan_id, 'active', coalesce(v_plan.offer_price_sar, v_plan.price_sar, 0), coalesce(v_plan.price_sar, 0),
    greatest(coalesce(v_plan.price_sar, 0) - coalesce(v_plan.offer_price_sar, v_plan.price_sar, 0), 0),
    v_plan.name, 'month', 1, 'admin_manual_change', 'admin', 'تغيير يدوي من الأدمن', now(), null
  );
end;
$$;

grant execute on function public.admin_assign_plan_without_payment(uuid, text) to authenticated;

create or replace function public.get_current_representative_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep record;
  v_coupon record;
  v_result jsonb;
begin
  select * into v_rep from public.platform_representatives where user_id = auth.uid() and active = true limit 1;
  if not found then
    raise exception 'Representative not found';
  end if;

  select * into v_coupon from public.representative_coupons where representative_id = v_rep.id order by created_at desc limit 1;

  with referral_rows as (
    select
      br.*,
      c.name,
      c.slug,
      cs.owner_name,
      cs.owner_phone,
      cs.owner_email,
      b.name as branch_name,
      b.address as branch_address,
      b.city as branch_city,
      b.lat as branch_lat,
      b.lng as branch_lng
    from public.brand_referrals br
    join public.cafes c on c.id = br.cafe_id
    left join public.cafe_settings cs on cs.cafe_id = c.id
    left join lateral (
      select * from public.branches bx where bx.cafe_id = c.id and bx.deleted_at is null order by bx.is_primary desc, bx.created_at asc limit 1
    ) b on true
    where br.representative_id = v_rep.id
  ), subscription_rows as (
    select
      rr.cafe_id,
      jsonb_agg(jsonb_build_object(
        'id', s.id,
        'planName', coalesce(s.plan_name_snapshot, s.plan_id),
        'startedAt', s.started_at,
        'expiresAt', s.expires_at,
        'amount', coalesce(s.amount_sar,0),
        'commissionRate', coalesce(cm.rate_percent, 0),
        'commissionAmount', coalesce(cm.amount_sar, 0),
        'commissionStatus', coalesce(cm.status, 'none'),
        'type', coalesce(cm.commission_type, case when coalesce(s.activation_source,'') ilike '%renew%' then 'renewal' else 'initial' end)
      ) order by s.created_at desc) as subscriptions,
      count(*) filter (where s.status in ('active','trialing','expired','cancelled')) as renewals_count,
      coalesce(sum(s.amount_sar) filter (where s.status in ('active','trialing','expired','cancelled')),0) as amount_sum
    from referral_rows rr
    left join public.subscriptions s on s.cafe_id = rr.cafe_id and s.amount_sar > 0 and s.status in ('active','trialing','expired','cancelled')
    left join public.representative_commissions cm on cm.subscription_id = s.id
    left join public.representative_coupons rc on rc.id = rr.coupon_id
    group by rr.cafe_id
  ), brand_json as (
    select jsonb_agg(jsonb_build_object(
      'id', rr.cafe_id,
      'name', rr.name,
      'slug', rr.slug,
      'ownerName', rr.owner_name,
      'ownerPhone', rr.owner_phone,
      'ownerEmail', rr.owner_email,
      'registeredAt', rr.registered_at,
      'firstPaidSubscriptionAt', rr.first_paid_subscription_at,
      'commissionEndAt', rr.commission_end_at,
      'renewalsCount', coalesce(sr.renewals_count, 0),
      'subscriptionsAmount', coalesce(sr.amount_sum, 0),
      'commissionAmount', coalesce((select sum(amount_sar) from public.representative_commissions where representative_id = v_rep.id and cafe_id = rr.cafe_id), 0),
      'unsettledAmount', coalesce((select sum(amount_sar) from public.representative_commissions where representative_id = v_rep.id and cafe_id = rr.cafe_id and status <> 'paid'), 0),
      'branch', case when rr.branch_name is null then null else jsonb_build_object('name', rr.branch_name, 'address', rr.branch_address, 'city', rr.branch_city, 'lat', rr.branch_lat, 'lng', rr.branch_lng) end,
      'subscriptions', coalesce(sr.subscriptions, '[]'::jsonb)
    ) order by rr.registered_at desc) as brands from referral_rows rr left join subscription_rows sr on sr.cafe_id = rr.cafe_id
  ), activity_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', l.id,
      'title', l.title,
      'detail', l.detail,
      'actionType', l.action_type,
      'createdAt', l.created_at,
      'payload', l.payload
    ) order by l.created_at desc), '[]'::jsonb) as activities
    from public.representative_activity_logs l where l.representative_id = v_rep.id
  )
  select jsonb_build_object(
    'representative', jsonb_build_object('id', v_rep.id, 'employeeNumber', v_rep.employee_number, 'fullName', v_rep.full_name, 'email', v_rep.email, 'couponCode', coalesce(v_coupon.code,'')),
    'summary', jsonb_build_object(
      'registeredBrandsCount', (select count(*) from public.brand_referrals where representative_id = v_rep.id),
      'paidBrandsCount', (select count(*) from public.brand_referrals where representative_id = v_rep.id and first_paid_subscription_at is not null),
      'subscriptionsAmount', coalesce((select sum(base_amount_sar) from public.representative_commissions where representative_id = v_rep.id),0),
      'commissionAmount', coalesce((select sum(amount_sar) from public.representative_commissions where representative_id = v_rep.id),0),
      'unsettledAmount', coalesce((select sum(amount_sar) from public.representative_commissions where representative_id = v_rep.id and status <> 'paid'),0)
    ),
    'brands', coalesce((select brands from brand_json), '[]'::jsonb),
    'activities', (select activities from activity_json)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_current_representative_dashboard() to authenticated;
