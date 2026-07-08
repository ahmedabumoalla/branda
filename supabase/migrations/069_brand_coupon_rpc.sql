-- 069_brand_coupon_rpc.sql
-- Atomic RPC foundation for applying brand-owned customer coupons.

begin;

create or replace function public.apply_brand_coupon_redemption(
  p_cafe_id uuid,
  p_coupon_code text,
  p_customer_id uuid,
  p_order_id uuid,
  p_subtotal numeric
)
returns table (
  coupon_id uuid,
  coupon_code text,
  discount_amount numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_coupon public.brand_coupons%rowtype;
  v_total_redemptions integer;
  v_customer_redemptions integer;
  v_raw_discount numeric;
  v_discount numeric;
begin
  if p_cafe_id is null then
    raise exception 'Brand id is required.';
  end if;

  if p_subtotal is null or p_subtotal < 0 then
    raise exception 'Order subtotal is invalid.';
  end if;

  v_code := upper(btrim(coalesce(p_coupon_code, '')));

  if v_code = '' then
    raise exception 'Coupon code is required.';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null then
      raise exception 'Login is required to use this coupon.';
    end if;

    if p_customer_id is null
      or p_customer_id <> public.get_customer_profile_id(p_cafe_id) then
      raise exception 'This coupon cannot be used for this customer.';
    end if;
  end if;

  select coupon.*
    into v_coupon
  from public.brand_coupons coupon
  where coupon.cafe_id = p_cafe_id
    and upper(btrim(coupon.code)) = v_code
  for update;

  if not found then
    raise exception 'Coupon was not found.';
  end if;

  if v_coupon.status <> 'active' then
    raise exception 'Coupon is not active.';
  end if;

  if v_coupon.starts_at is not null and v_coupon.starts_at > now() then
    raise exception 'Coupon has not started yet.';
  end if;

  if v_coupon.ends_at is not null and v_coupon.ends_at < now() then
    raise exception 'Coupon has expired.';
  end if;

  if p_subtotal < coalesce(v_coupon.minimum_order_amount, 0) then
    raise exception 'Minimum order amount is not met.';
  end if;

  if v_coupon.discount_type not in ('percentage', 'fixed') then
    raise exception 'Discount type is invalid.';
  end if;

  if v_coupon.discount_value is null or v_coupon.discount_value <= 0 then
    raise exception 'Discount value is invalid.';
  end if;

  if v_coupon.discount_type = 'percentage' and v_coupon.discount_value > 100 then
    raise exception 'Discount value is invalid.';
  end if;

  if p_customer_id is not null and not exists (
    select 1
    from public.customer_profiles customer
    where customer.id = p_customer_id
      and customer.cafe_id = p_cafe_id
  ) then
    raise exception 'Customer does not belong to this brand.';
  end if;

  if p_order_id is not null and not exists (
    select 1
    from public.orders order_row
    where order_row.id = p_order_id
      and order_row.cafe_id = p_cafe_id
  ) then
    raise exception 'Order does not belong to this brand.';
  end if;

  if p_order_id is not null and exists (
    select 1
    from public.brand_coupon_redemptions redemption
    where redemption.order_id = p_order_id
  ) then
    raise exception 'A coupon has already been used for this order.';
  end if;

  select count(*)::integer
    into v_total_redemptions
  from public.brand_coupon_redemptions redemption
  where redemption.coupon_id = v_coupon.id;

  if v_coupon.max_redemptions is not null
    and v_total_redemptions >= v_coupon.max_redemptions then
    raise exception 'Coupon redemption limit has been reached.';
  end if;

  if v_coupon.max_redemptions_per_customer is not null then
    if p_customer_id is null then
      raise exception 'This coupon requires login to use it.';
    end if;

    select count(*)::integer
      into v_customer_redemptions
    from public.brand_coupon_redemptions redemption
    where redemption.coupon_id = v_coupon.id
      and redemption.customer_id = p_customer_id;

    if v_customer_redemptions >= v_coupon.max_redemptions_per_customer then
      raise exception 'Coupon redemption limit for this customer has been reached.';
    end if;
  end if;

  if v_coupon.discount_type = 'percentage' then
    v_raw_discount := p_subtotal * v_coupon.discount_value / 100;
  else
    v_raw_discount := v_coupon.discount_value;
  end if;

  v_discount := round(least(greatest(coalesce(v_raw_discount, 0), 0), p_subtotal), 2);

  if v_discount < 0 then
    raise exception 'Unable to apply coupon. Please try again.';
  end if;

  insert into public.brand_coupon_redemptions (
    coupon_id,
    cafe_id,
    customer_id,
    order_id,
    discount_amount
  ) values (
    v_coupon.id,
    p_cafe_id,
    p_customer_id,
    p_order_id,
    v_discount
  );

  return query
  select
    v_coupon.id,
    v_coupon.code,
    v_discount;
end;
$$;

revoke all on function public.apply_brand_coupon_redemption(uuid, text, uuid, uuid, numeric) from public;
grant execute on function public.apply_brand_coupon_redemption(uuid, text, uuid, uuid, numeric) to service_role;

notify pgrst, 'reload schema';

commit;

select 'brand_coupon_rpc_ready' as status;

