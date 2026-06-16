-- 050_barndaksa_paymob_subscriptions_and_feature_gates.sql
-- Paymob subscription checkout metadata + payment events + feature-gate safe columns.

begin;

alter table public.subscriptions
  add column if not exists paymob_intention_id text,
  add column if not exists paymob_transaction_id text,
  add column if not exists paymob_order_id text,
  add column if not exists paymob_reference text;

create index if not exists idx_subscriptions_paymob_intention_id
  on public.subscriptions(paymob_intention_id)
  where paymob_intention_id is not null;

create index if not exists idx_subscriptions_paymob_transaction_id
  on public.subscriptions(paymob_transaction_id)
  where paymob_transaction_id is not null;

create table if not exists public.subscription_payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider_event_id text,
  event_type text not null,
  verified boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_payment_events_subscription
  on public.subscription_payment_events(subscription_id, created_at desc);

create index if not exists idx_subscription_payment_events_provider_event
  on public.subscription_payment_events(provider, provider_event_id)
  where provider_event_id is not null;

alter table public.subscription_payment_events enable row level security;

drop policy if exists subscription_payment_events_admin_read on public.subscription_payment_events;
create policy subscription_payment_events_admin_read on public.subscription_payment_events
  for select to authenticated
  using (public.is_platform_admin());

grant select on public.subscription_payment_events to authenticated;
grant select, insert, update, delete on public.subscription_payment_events to service_role;
grant select, update on public.subscriptions to service_role;

-- Keep historical bank-transfer rows readable, but new product UI will only expose paymob + paypal.
alter table public.subscription_payment_requests
  drop constraint if exists subscription_payment_requests_payment_method_check;

alter table public.subscription_payment_requests
  add constraint subscription_payment_requests_payment_method_check
  check (payment_method in ('paymob','paypal','card_paypal','bank_transfer','cash'));

notify pgrst, 'reload schema';

commit;

select 'barndaksa_paymob_subscriptions_and_feature_gates_ready' as status;
