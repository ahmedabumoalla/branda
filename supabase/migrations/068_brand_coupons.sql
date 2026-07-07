-- 068_brand_coupons.sql
-- Database foundation for brand-owned customer coupons.

begin;

create table if not exists public.brand_coupons (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  code text not null,
  title text not null,
  description text,
  discount_type text not null,
  discount_value numeric not null,
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer,
  max_redemptions_per_customer integer,
  minimum_order_amount numeric not null default 0,
  target_segment text not null default 'all',
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_coupons_code_not_blank check (btrim(code) <> ''),
  constraint brand_coupons_title_not_blank check (btrim(title) <> ''),
  constraint brand_coupons_discount_type_allowed check (discount_type in ('percentage', 'fixed')),
  constraint brand_coupons_discount_value_positive check (discount_value > 0),
  constraint brand_coupons_percentage_cap check (
    discount_type <> 'percentage' or discount_value <= 100
  ),
  constraint brand_coupons_minimum_order_amount_non_negative check (minimum_order_amount >= 0),
  constraint brand_coupons_max_redemptions_positive check (
    max_redemptions is null or max_redemptions > 0
  ),
  constraint brand_coupons_max_per_customer_positive check (
    max_redemptions_per_customer is null or max_redemptions_per_customer > 0
  ),
  constraint brand_coupons_target_segment_allowed check (
    target_segment in (
      'all',
      'new_customers',
      'inactive_customers',
      'loyalty_customers',
      'high_value_customers'
    )
  ),
  constraint brand_coupons_status_allowed check (status in ('draft', 'active', 'paused', 'expired'))
);

create unique index if not exists idx_brand_coupons_cafe_code_lower
  on public.brand_coupons(cafe_id, lower(code));

create index if not exists idx_brand_coupons_cafe_status
  on public.brand_coupons(cafe_id, status);

create index if not exists idx_brand_coupons_cafe_dates
  on public.brand_coupons(cafe_id, starts_at, ends_at);

drop trigger if exists set_brand_coupons_updated_at on public.brand_coupons;
create trigger set_brand_coupons_updated_at
  before update on public.brand_coupons
  for each row execute function public.set_updated_at();

create table if not exists public.brand_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.brand_coupons(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  discount_amount numeric not null default 0,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint brand_coupon_redemptions_discount_non_negative check (discount_amount >= 0)
);

create index if not exists idx_brand_coupon_redemptions_coupon_id
  on public.brand_coupon_redemptions(coupon_id);

create index if not exists idx_brand_coupon_redemptions_cafe_id
  on public.brand_coupon_redemptions(cafe_id);

create index if not exists idx_brand_coupon_redemptions_customer_id
  on public.brand_coupon_redemptions(customer_id);

create index if not exists idx_brand_coupon_redemptions_order_id
  on public.brand_coupon_redemptions(order_id);

create unique index if not exists idx_brand_coupon_redemptions_order_once
  on public.brand_coupon_redemptions(order_id)
  where order_id is not null;

create or replace function public.validate_brand_coupon_redemption_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.brand_coupons coupon
    where coupon.id = new.coupon_id
      and coupon.cafe_id = new.cafe_id
  ) then
    raise exception 'brand coupon redemption coupon scope mismatch';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customer_profiles customer
    where customer.id = new.customer_id
      and customer.cafe_id = new.cafe_id
  ) then
    raise exception 'brand coupon redemption customer scope mismatch';
  end if;

  if new.order_id is not null and not exists (
    select 1
    from public.orders order_row
    where order_row.id = new.order_id
      and order_row.cafe_id = new.cafe_id
  ) then
    raise exception 'brand coupon redemption order scope mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_brand_coupon_redemption_scope on public.brand_coupon_redemptions;
create trigger validate_brand_coupon_redemption_scope
  before insert or update on public.brand_coupon_redemptions
  for each row execute function public.validate_brand_coupon_redemption_scope();

alter table public.brand_coupons enable row level security;
alter table public.brand_coupon_redemptions enable row level security;

drop policy if exists brand_coupons_staff_select on public.brand_coupons;
create policy brand_coupons_staff_select
  on public.brand_coupons
  for select to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.is_platform_admin()
  );

drop policy if exists brand_coupons_staff_insert on public.brand_coupons;
create policy brand_coupons_staff_insert
  on public.brand_coupons
  for insert to authenticated
  with check (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.is_platform_admin()
  );

drop policy if exists brand_coupons_staff_update on public.brand_coupons;
create policy brand_coupons_staff_update
  on public.brand_coupons
  for update to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.is_platform_admin()
  )
  with check (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.is_platform_admin()
  );

drop policy if exists brand_coupons_staff_delete on public.brand_coupons;
create policy brand_coupons_staff_delete
  on public.brand_coupons
  for delete to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.is_platform_admin()
  );

drop policy if exists brand_coupon_redemptions_staff_select on public.brand_coupon_redemptions;
create policy brand_coupon_redemptions_staff_select
  on public.brand_coupon_redemptions
  for select to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.has_cafe_permission(cafe_id, 'orders')
    or public.is_platform_admin()
  );

drop policy if exists brand_coupon_redemptions_platform_admin_insert on public.brand_coupon_redemptions;
create policy brand_coupon_redemptions_platform_admin_insert
  on public.brand_coupon_redemptions
  for insert to authenticated
  with check (public.is_platform_admin());

drop policy if exists brand_coupon_redemptions_platform_admin_update on public.brand_coupon_redemptions;
create policy brand_coupon_redemptions_platform_admin_update
  on public.brand_coupon_redemptions
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists brand_coupon_redemptions_platform_admin_delete on public.brand_coupon_redemptions;
create policy brand_coupon_redemptions_platform_admin_delete
  on public.brand_coupon_redemptions
  for delete to authenticated
  using (public.is_platform_admin());

grant select, insert, update, delete on public.brand_coupons to authenticated;
grant select, insert, update, delete on public.brand_coupon_redemptions to authenticated;
grant select, insert, update, delete on public.brand_coupons to service_role;
grant select, insert, update, delete on public.brand_coupon_redemptions to service_role;

revoke all on function public.validate_brand_coupon_redemption_scope() from public;
grant execute on function public.validate_brand_coupon_redemption_scope() to service_role;

notify pgrst, 'reload schema';

commit;

select 'brand_coupons_ready' as status;
