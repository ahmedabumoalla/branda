BEGIN;
-- Disable only the separate loyalty welcome; card-link and OTP queues are untouched
CREATE OR REPLACE FUNCTION loyalty_audit_private.enqueue_wallet_welcome()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.claim_wallet_welcome(p_card_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::jsonb $$;
CREATE OR REPLACE FUNCTION public.claim_routed_wallet_welcome(p_card_id uuid,p_primary_ready boolean,p_loco_ready boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::jsonb $$;
CREATE OR REPLACE FUNCTION public.claim_routed_wallet_welcome(p_card_id uuid,p_primary_ready boolean,p_loco_ready boolean,p_wahed_ready boolean)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::jsonb $$;
UPDATE loyalty_audit_private.wallet_welcomes SET status='expired',finished_at=clock_timestamp() WHERE status='pending';
COMMIT;
