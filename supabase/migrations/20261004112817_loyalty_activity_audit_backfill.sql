-- Historical source events only. Previous card previews were not persisted and cannot
-- be reconstructed. Actor/customer labels are snapshots at import time, not a claim
-- that these were the labels at the historical event time. Before-balances stay NULL.
-- Forward-only: preserve imported evidence when rolling application code back.
BEGIN;
SELECT loyalty_audit_private.capture_ledger_event(e.id,'historical')
FROM public.loyalty_card_events e
WHERE NOT EXISTS (SELECT 1 FROM public.loyalty_activity_events a WHERE a.source_event_id=e.id);
SELECT loyalty_audit_private.capture_experience_redemption(d.id,'historical')
FROM public.customer_reward_redemptions d
JOIN public.customer_reward_instances r ON r.id=d.reward_instance_id AND r.cafe_id=d.cafe_id AND r.source_type='experience'
WHERE d.status='redeemed' AND NOT EXISTS (SELECT 1 FROM public.loyalty_activity_events a WHERE a.source_redemption_id=d.id);
COMMIT;
