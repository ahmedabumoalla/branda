-- Optional cleanup: remove old unpaid checkout drafts from subscription history table.
-- This does not touch active/trialing/cancelled/expired subscriptions.
delete from public.subscriptions
where status = 'past_due'
  and coalesce(payment_provider, '') in ('', 'paypal', 'paymob')
  and paid_at is null
  and started_at is null;

notify pgrst, 'reload schema';
