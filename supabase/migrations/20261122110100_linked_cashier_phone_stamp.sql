BEGIN;
SET LOCAL lock_timeout='5s';

CREATE FUNCTION public.stamp_linked_cashier_by_phone(p_session_token text,p_phone text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE member jsonb; result jsonb;
BEGIN
  PERFORM public.brand_finance_loyalty_session_guard(p_session_token);
  IF NOT EXISTS (
    SELECT 1 FROM public.cafe_cashier_sessions WHERE token=p_session_token AND finance_user_id IS NOT NULL
      AND expires_at>now() AND revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Linked cashier session required' USING ERRCODE='42501'; END IF;

  BEGIN
    member := loyalty_read_private.ensure_cashier_phone_card(p_session_token,p_phone,p_request_id,'stamps');
    IF (member->>'ok') IS DISTINCT FROM 'true' THEN RETURN member; END IF;
    result := public.execute_loyalty_audited_operation(p_session_token,member->>'cardCode',p_request_id,'stamp');
    -- A pending employee approval refers to the issued card code. Keep that
    -- identity stable until the approver and cashier complete the transaction.
    IF member->>'cardCreated'='true' AND coalesce(result->>'status','') NOT IN ('stamped','reward_issued','approval_pending') THEN
      RAISE EXCEPTION 'Stamp not posted' USING ERRCODE='P7681';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P7681' THEN NULL;
  END;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.stamp_linked_cashier_by_phone(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_linked_cashier_by_phone(text,text,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
