-- BARNDAKSA PERFORMANCE FAST PATH
-- Run once in Supabase SQL Editor. Safe, additive, and non-destructive.

create extension if not exists citext with schema public;

create or replace function public.barndaksa_perf_index_if_columns(
  p_index_name text,
  p_table_name text,
  p_columns text[],
  p_where text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean;
  v_has_table boolean;
  v_has_columns boolean;
  v_columns_sql text;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = p_table_name
  ) into v_has_table;

  if not v_has_table then
    return;
  end if;

  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'i'
      and c.relname = p_index_name
  ) into v_exists;

  if v_exists then
    return;
  end if;

  select count(*) = array_length(p_columns, 1)
  from information_schema.columns
  where table_schema = 'public'
    and table_name = p_table_name
    and column_name = any(p_columns)
  into v_has_columns;

  if not v_has_columns then
    return;
  end if;

  select string_agg(format('%I', col), ', ')
  from unnest(p_columns) as col
  into v_columns_sql;

  execute format(
    'create index if not exists %I on public.%I (%s)%s',
    p_index_name,
    p_table_name,
    v_columns_sql,
    case when p_where is null or btrim(p_where) = '' then '' else ' where ' || p_where end
  );
end;
$$;

select public.barndaksa_perf_index_if_columns('idx_perf_cafes_slug', 'cafes', array['slug']);
select public.barndaksa_perf_index_if_columns('idx_perf_cafes_owner_user_id', 'cafes', array['owner_user_id']);
select public.barndaksa_perf_index_if_columns('idx_perf_cafe_members_user_id', 'cafe_members', array['user_id']);
select public.barndaksa_perf_index_if_columns('idx_perf_cafe_members_cafe_id', 'cafe_members', array['cafe_id']);

select public.barndaksa_perf_index_if_columns('idx_perf_cafe_settings_cafe_id', 'cafe_settings', array['cafe_id']);
select public.barndaksa_perf_index_if_columns('idx_perf_cafe_custom_identity_cafe_id', 'cafe_custom_identity', array['cafe_id']);
select public.barndaksa_perf_index_if_columns('idx_perf_cafe_themes_cafe_id', 'cafe_themes', array['cafe_id']);

select public.barndaksa_perf_index_if_columns('idx_perf_menu_categories_cafe_visible_sort', 'menu_categories', array['cafe_id','visible','sort_order']);
select public.barndaksa_perf_index_if_columns('idx_perf_menu_products_cafe_category_available_sort', 'menu_products', array['cafe_id','category_id','available','sort_order']);
select public.barndaksa_perf_index_if_columns('idx_perf_menu_products_cafe_pickup', 'menu_products', array['cafe_id','available_for_pickup']);
select public.barndaksa_perf_index_if_columns('idx_perf_menu_products_updated_at', 'menu_products', array['cafe_id','updated_at']);

select public.barndaksa_perf_index_if_columns('idx_perf_offers_cafe_visible_status_dates', 'offers', array['cafe_id','visible_in_cafe','status','start_date','end_date']);
select public.barndaksa_perf_index_if_columns('idx_perf_branches_cafe_active_sort', 'branches', array['cafe_id','active','sort_order']);
select public.barndaksa_perf_index_if_columns('idx_perf_cafe_pages_cafe_active_sort', 'cafe_pages', array['cafe_id','active','sort_order']);
select public.barndaksa_perf_index_if_columns('idx_perf_reservation_services_cafe_active_sort', 'reservation_services', array['cafe_id','active','sort_order']);

select public.barndaksa_perf_index_if_columns('idx_perf_reservations_cafe_status_created', 'reservations', array['cafe_id','status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_reservations_customer_created', 'reservations', array['customer_id','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_reservations_code', 'reservations', array['reservation_code']);

select public.barndaksa_perf_index_if_columns('idx_perf_orders_cafe_status_created', 'orders', array['cafe_id','status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_orders_customer_created', 'orders', array['customer_id','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_order_items_order_id', 'order_items', array['order_id']);

select public.barndaksa_perf_index_if_columns('idx_perf_customer_profiles_cafe_user', 'customer_profiles', array['cafe_id','user_id']);
select public.barndaksa_perf_index_if_columns('idx_perf_customer_profiles_cafe_phone', 'customer_profiles', array['cafe_id','phone']);
select public.barndaksa_perf_index_if_columns('idx_perf_customer_profiles_cafe_created', 'customer_profiles', array['cafe_id','created_at']);

select public.barndaksa_perf_index_if_columns('idx_perf_loyalty_cards_cafe_customer', 'loyalty_cards', array['cafe_id','customer_id']);
select public.barndaksa_perf_index_if_columns('idx_perf_loyalty_cards_card_code', 'loyalty_cards', array['card_code']);
select public.barndaksa_perf_index_if_columns('idx_perf_loyalty_card_events_card_created', 'loyalty_card_events', array['card_id','created_at']);

select public.barndaksa_perf_index_if_columns('idx_perf_notifications_cafe_audience_read_created', 'notifications', array['cafe_id','audience','read','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_notifications_customer_created', 'notifications', array['customer_id','created_at']);

select public.barndaksa_perf_index_if_columns('idx_perf_experience_submissions_cafe_status_created', 'experience_reward_submissions', array['cafe_id','status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_experience_submissions_customer_created', 'experience_reward_submissions', array['customer_id','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_experience_reward_items_submission', 'experience_reward_items', array['submission_id']);

select public.barndaksa_perf_index_if_columns('idx_perf_reviews_cafe_status_created', 'reviews', array['cafe_id','status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_subscriptions_cafe_status_created', 'subscriptions', array['cafe_id','status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_platform_plans_active_sort', 'platform_plans', array['active','sort_order']);
select public.barndaksa_perf_index_if_columns('idx_perf_subscription_requests_status_created', 'subscription_payment_requests', array['status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_platform_contact_requests_status_created', 'platform_contact_requests', array['status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_domain_orders_cafe_status_created', 'domain_orders', array['cafe_id','status','created_at']);
select public.barndaksa_perf_index_if_columns('idx_perf_cashier_sessions_token', 'cafe_cashier_sessions', array['token']);
select public.barndaksa_perf_index_if_columns('idx_perf_cashiers_cafe_email', 'cafe_cashiers', array['cafe_id','email']);

create or replace function public.get_owner_dashboard_shell_fast(p_cafe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pendingReservations', coalesce((
      select count(*)::int
      from public.reservations
      where cafe_id = p_cafe_id
        and status = 'pending'
        and deleted_at is null
    ), 0),
    'pendingOrders', coalesce((
      select count(*)::int
      from public.orders
      where cafe_id = p_cafe_id
        and status = 'pending_cafe'
        and deleted_at is null
    ), 0),
    'pendingExperienceReviews', coalesce((
      select count(*)::int
      from public.experience_reward_submissions
      where cafe_id = p_cafe_id
        and status = 'pending'
    ), 0)
  );
$$;

grant execute on function public.get_owner_dashboard_shell_fast(uuid) to authenticated, service_role;

-- Keep the contact form working if the previous fix has not been run yet.
do $$
begin
  if to_regclass('public.platform_contact_requests') is not null then
    grant insert, select, update on public.platform_contact_requests to service_role;
  end if;
end $$;

create or replace function public.barndaksa_perf_analyze_if_exists(p_table_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass(format('public.%I', p_table_name)) is not null then
    execute format('analyze public.%I', p_table_name);
  end if;
end;
$$;

select public.barndaksa_perf_analyze_if_exists('cafes');
select public.barndaksa_perf_analyze_if_exists('cafe_members');
select public.barndaksa_perf_analyze_if_exists('cafe_settings');
select public.barndaksa_perf_analyze_if_exists('menu_categories');
select public.barndaksa_perf_analyze_if_exists('menu_products');
select public.barndaksa_perf_analyze_if_exists('offers');
select public.barndaksa_perf_analyze_if_exists('branches');
select public.barndaksa_perf_analyze_if_exists('reservations');
select public.barndaksa_perf_analyze_if_exists('orders');
select public.barndaksa_perf_analyze_if_exists('order_items');
select public.barndaksa_perf_analyze_if_exists('customer_profiles');
select public.barndaksa_perf_analyze_if_exists('loyalty_cards');
select public.barndaksa_perf_analyze_if_exists('loyalty_card_events');
select public.barndaksa_perf_analyze_if_exists('notifications');
select public.barndaksa_perf_analyze_if_exists('subscriptions');

select 'BARNDAKSA_PERFORMANCE_DB_FAST_PATH_DONE' as status;
