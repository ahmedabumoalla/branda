-- Barndaksa performance foundation indexes.
-- Safe migration: creates indexes only when tables/columns exist.

create or replace function public.barndaksa_create_index_if_columns(
  p_index_name text,
  p_table_name text,
  p_columns text,
  p_where text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_column text;
  sql text;
begin
  if to_regclass('public.' || p_table_name) is null then
    return;
  end if;

  foreach v_column in array regexp_split_to_array(replace(replace(p_columns, ' desc', ''), ' asc', ''), '\s*,\s*') loop
    v_column := trim(split_part(v_column, ' ', 1));
    if v_column = '' then
      continue;
    end if;
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = p_table_name
        and column_name = v_column
    ) then
      return;
    end if;
  end loop;

  sql := format('create index if not exists %I on public.%I (%s)', p_index_name, p_table_name, p_columns);
  if p_where is not null and length(trim(p_where)) > 0 then
    sql := sql || ' where ' || p_where;
  end if;
  execute sql;
end;
$$;

select public.barndaksa_create_index_if_columns('idx_barndaksa_cafes_slug_active', 'cafes', 'slug, status');
select public.barndaksa_create_index_if_columns('idx_barndaksa_cafe_settings_cafe_id', 'cafe_settings', 'cafe_id');
select public.barndaksa_create_index_if_columns('idx_barndaksa_cafe_custom_identity_cafe_id', 'cafe_custom_identity', 'cafe_id');
select public.barndaksa_create_index_if_columns('idx_barndaksa_cafe_themes_cafe_id', 'cafe_themes', 'cafe_id');
select public.barndaksa_create_index_if_columns('idx_barndaksa_menu_categories_public', 'menu_categories', 'cafe_id, sort_order', 'deleted_at is null and visible = true');
select public.barndaksa_create_index_if_columns('idx_barndaksa_menu_products_public', 'menu_products', 'cafe_id, sort_order', 'deleted_at is null and available = true');
select public.barndaksa_create_index_if_columns('idx_barndaksa_menu_products_category', 'menu_products', 'cafe_id, category_id, sort_order', 'deleted_at is null');
select public.barndaksa_create_index_if_columns('idx_barndaksa_offers_public', 'offers', 'cafe_id, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_branches_public', 'branches', 'cafe_id, active');
select public.barndaksa_create_index_if_columns('idx_barndaksa_reservation_services_public', 'reservation_services', 'cafe_id, active, sort_order');
select public.barndaksa_create_index_if_columns('idx_barndaksa_reservations_owner_status', 'reservations', 'cafe_id, status, created_at desc', 'deleted_at is null');
select public.barndaksa_create_index_if_columns('idx_barndaksa_reservations_customer', 'reservations', 'customer_id, created_at desc', 'deleted_at is null');
select public.barndaksa_create_index_if_columns('idx_barndaksa_orders_owner_status', 'orders', 'cafe_id, status, created_at desc', 'deleted_at is null');
select public.barndaksa_create_index_if_columns('idx_barndaksa_orders_customer', 'orders', 'customer_id, created_at desc', 'deleted_at is null');
select public.barndaksa_create_index_if_columns('idx_barndaksa_order_items_order', 'order_items', 'order_id');
select public.barndaksa_create_index_if_columns('idx_barndaksa_customer_profiles_user_cafe', 'customer_profiles', 'user_id, cafe_id');
select public.barndaksa_create_index_if_columns('idx_barndaksa_customer_profiles_cafe_phone', 'customer_profiles', 'cafe_id, phone');
select public.barndaksa_create_index_if_columns('idx_barndaksa_loyalty_cards_customer_cafe', 'loyalty_cards', 'customer_id, cafe_id');
select public.barndaksa_create_index_if_columns('idx_barndaksa_experience_submissions_customer', 'experience_reward_submissions', 'customer_id, cafe_id, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_experience_submissions_owner', 'experience_reward_submissions', 'cafe_id, status, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_notifications_owner', 'notifications', 'cafe_id, read, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_customer_notifications', 'customer_notifications', 'customer_id, read, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_visit_events_cafe_created', 'cafe_visit_events', 'cafe_id, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_visit_events_session', 'cafe_visit_events', 'cafe_id, session_id, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_subscriptions_cafe_status', 'subscriptions', 'cafe_id, status, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_subscription_transactions_cafe', 'subscription_transactions', 'cafe_id, created_at desc');
select public.barndaksa_create_index_if_columns('idx_barndaksa_platform_discount_coupons_code', 'platform_discount_coupons', 'code, active');
select public.barndaksa_create_index_if_columns('idx_barndaksa_brand_referrals_code', 'brand_referrals', 'referral_code, active');

drop function if exists public.barndaksa_create_index_if_columns(text, text, text, text);
