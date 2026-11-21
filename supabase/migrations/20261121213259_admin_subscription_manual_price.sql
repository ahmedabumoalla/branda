-- The negotiated price belongs to this subscription. Receipts keep their original amounts.
create table public.admin_subscription_prices (
  subscription_id uuid primary key references public.subscriptions(id) on delete cascade,
  price_sar numeric(10,2) not null check (price_sar between 0 and 99999999.99),
  updated_by uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.admin_subscription_prices enable row level security;
revoke all on public.admin_subscription_prices from public, anon, authenticated;
grant select on public.admin_subscription_prices to authenticated;
create policy admin_subscription_price_read on public.admin_subscription_prices
  for select to authenticated using ((select public.is_platform_admin()));

create function public.set_admin_subscription_price(
  p_cafe uuid, p_subscription uuid, p_price numeric, p_expected numeric
) returns void language plpgsql security definer set search_path = '' as $$
declare
  saved_price numeric;
begin
  if auth.uid() is null or public.is_platform_admin() is not true then
    raise exception 'Platform admin required' using errcode = '42501';
  end if;
  if p_price is null or p_price not between 0 and 99999999.99 or p_price <> round(p_price,2) then
    raise exception 'Invalid subscription price' using errcode = '22023';
  end if;
  perform 1 from public.subscriptions s join public.platform_plans p on p.id=s.plan_id and p.active
    where s.id=p_subscription and s.cafe_id=p_cafe and s.status in ('active','trialing')
      and ((s.status='trialing' and s.activation_source='admin_prepared_trial')
        or ((s.started_at is null or s.started_at<=now()) and (s.expires_at is null or s.expires_at>now())))
    for update of s;
  if not found then raise exception 'Subscription no longer current' using errcode='P0002'; end if;
  select price_sar into saved_price from public.admin_subscription_prices where subscription_id=p_subscription;
  if saved_price is distinct from p_expected then
    raise exception 'Price changed' using errcode='40001';
  end if;
  insert into public.admin_subscription_prices(subscription_id,price_sar,updated_by)
    values(p_subscription,p_price,auth.uid())
    on conflict(subscription_id) do update set price_sar=excluded.price_sar, updated_by=excluded.updated_by, updated_at=now();
end $$;
revoke all on function public.set_admin_subscription_price(uuid,uuid,numeric,numeric) from public, anon;
grant execute on function public.set_admin_subscription_price(uuid,uuid,numeric,numeric) to authenticated;
