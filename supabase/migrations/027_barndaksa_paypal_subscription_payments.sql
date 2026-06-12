-- 027_barndaksa_paypal_subscription_payments.sql
-- Adds payment processor metadata for Barndaksa subscription payments.

alter table public.subscriptions
  add column if not exists payment_provider text,
  add column if not exists payment_method_label text,
  add column if not exists paypal_order_id text,
  add column if not exists paypal_capture_id text,
  add column if not exists paypal_currency text,
  add column if not exists paypal_amount numeric(12,2),
  add column if not exists paypal_exchange_rate numeric(12,6),
  add column if not exists paid_at timestamptz;

create index if not exists idx_subscriptions_paypal_order_id
  on public.subscriptions(paypal_order_id)
  where paypal_order_id is not null;

create index if not exists idx_subscriptions_paypal_capture_id
  on public.subscriptions(paypal_capture_id)
  where paypal_capture_id is not null;

comment on column public.subscriptions.payment_provider is 'Internal payment processor. Example: paypal.';
comment on column public.subscriptions.payment_method_label is 'User-facing method label shown to brands. Example: بطاقة بنكية.';
comment on column public.subscriptions.paypal_order_id is 'PayPal order id stored internally only.';
comment on column public.subscriptions.paypal_capture_id is 'PayPal capture id stored internally only.';
