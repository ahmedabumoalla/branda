-- Rast purchases must be approved through the authenticated cashier workflow.
-- Keep a rejecting function body as defense against an accidental future grant.
BEGIN;

CREATE OR REPLACE FUNCTION public.scan_owner_loyalty_stamp(p_cafe_id uuid,p_card_code text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Use authenticated Rast cashier scanner' USING ERRCODE='42501';
END;
$$;
REVOKE ALL ON FUNCTION public.scan_owner_loyalty_stamp(uuid,text,uuid)
  FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
