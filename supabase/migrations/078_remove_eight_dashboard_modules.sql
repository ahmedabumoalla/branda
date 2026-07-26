begin;

do $$
begin
  if to_regclass('public.brand_coupon_redemptions') is not null then
    drop policy if exists brand_coupon_redemptions_staff_select on public.brand_coupon_redemptions;
    drop policy if exists brand_coupon_redemptions_platform_admin_insert on public.brand_coupon_redemptions;
    drop policy if exists brand_coupon_redemptions_platform_admin_update on public.brand_coupon_redemptions;
    drop policy if exists brand_coupon_redemptions_platform_admin_delete on public.brand_coupon_redemptions;
    drop trigger if exists validate_brand_coupon_redemption_scope on public.brand_coupon_redemptions;
  end if;

  if to_regclass('public.brand_coupons') is not null then
    drop policy if exists brand_coupons_staff_select on public.brand_coupons;
    drop policy if exists brand_coupons_staff_insert on public.brand_coupons;
    drop policy if exists brand_coupons_staff_update on public.brand_coupons;
    drop policy if exists brand_coupons_staff_delete on public.brand_coupons;
    drop trigger if exists set_brand_coupons_updated_at on public.brand_coupons;
  end if;
end;
$$;

drop function if exists public.apply_brand_coupon_redemption(uuid, text, uuid, uuid, numeric);
drop function if exists public.validate_brand_coupon_redemption_scope();

drop table if exists public.brand_coupon_redemptions;
drop table if exists public.brand_coupons;
drop table if exists public.cafe_pages;

do $$
declare
  removed_feature_ids text[] := array[
    'pages',
    'advanced_coupons',
    'gift_cards_wallet',
    'coffee_subscriptions',
    'advanced_direct_orders',
    'marketplace_boost',
    'pos_integrations',
    'company_accounts'
  ];
begin
  if to_regclass('public.brand_feature_overrides') is not null then
    delete from public.brand_feature_overrides
    where feature_id = any(removed_feature_ids);
  end if;

  if to_regclass('public.platform_plans') is not null then
    update public.platform_plans
    set features =
      features
      - 'pages'
      - 'advanced_coupons'
      - 'gift_cards_wallet'
      - 'coffee_subscriptions'
      - 'advanced_direct_orders'
      - 'marketplace_boost'
      - 'pos_integrations'
      - 'company_accounts'
    where features ?| removed_feature_ids;
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
