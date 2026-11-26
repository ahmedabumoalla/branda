BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE loyalty_audit_private.farouj_card_suspensions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cafe_id uuid NOT NULL CHECK (cafe_id = 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2'),
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id),
  customer_id uuid NOT NULL REFERENCES public.customer_profiles(id),
  suspended_by uuid NOT NULL,
  suspended_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE loyalty_audit_private.farouj_card_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE loyalty_audit_private.farouj_card_suspensions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.suspend_farouj_owner_card(p_customer uuid, p_card uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $suspend$
DECLARE
  brand CONSTANT uuid := 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2';
  actor uuid := auth.uid();
  previous_status text;
BEGIN
  IF actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.cafes c JOIN public.profiles owner_profile ON owner_profile.id = c.owner_user_id
    WHERE c.id = brand AND c.owner_user_id = actor AND owner_profile.status = 'active'
      AND c.status IN ('active','published') AND c.deleted_at IS NULL
      AND public.brand_account_not_cancelled(c.id) AND platform_access_private.service_enabled(c.id,'loyalty')
    FOR SHARE OF c, owner_profile
  ) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT status INTO STRICT previous_status FROM public.loyalty_cards
    WHERE id=p_card AND cafe_id=brand AND customer_profile_id=p_customer FOR UPDATE;
  IF previous_status='suspended' THEN RETURN; END IF;
  UPDATE public.loyalty_cards SET status='suspended',updated_at=clock_timestamp() WHERE id=p_card;
  INSERT INTO loyalty_audit_private.farouj_card_suspensions(cafe_id,card_id,customer_id,suspended_by)
    VALUES(brand,p_card,p_customer,actor);
END $suspend$;
REVOKE ALL ON FUNCTION public.suspend_farouj_owner_card(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.suspend_farouj_owner_card(uuid,uuid) TO authenticated;

-- The financial sale may have resolved a card just before the owner suspended it.
-- Keep the sale and mark its stamp unavailable after acquiring the actual card lock.
DO $concurrency$
DECLARE proc regprocedure; marker text; body text;
BEGIN
  proc := 'brand_finance_private.stamp_sale_customer(uuid,uuid)'::regprocedure;
  marker := 'SELECT * INTO STRICT c FROM public.loyalty_cards WHERE id=p_card AND cafe_id=s.cafe_id FOR UPDATE;';
  body := pg_get_functiondef(proc);
  IF array_length(string_to_array(body,marker),1) <> 2 THEN RAISE EXCEPTION 'Unexpected POS stamp definition'; END IF;
  EXECUTE replace(body, marker, marker || $guard$
    IF c.cafe_id='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' AND c.status<>'active' THEN
      UPDATE public.bf_sale_customers SET loyalty_status='unavailable' WHERE document_id=d.id; RETURN;
    END IF;$guard$);

  proc := 'public.record_loyalty_card_operation_legacy(uuid,text,text,numeric,text,text)'::regprocedure;
  marker := 'IF p_operation = ''stamp'' THEN';
  body := pg_get_functiondef(proc);
  IF array_length(string_to_array(body,marker),1) <> 2 THEN RAISE EXCEPTION 'Unexpected legacy stamp definition'; END IF;
  EXECUTE replace(body, marker, $guard$
    IF v_card.cafe_id='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' THEN
      SELECT * INTO STRICT v_card FROM public.loyalty_cards WHERE id=v_card.id FOR UPDATE;
      IF v_card.status<>'active' THEN RAISE EXCEPTION 'Loyalty card suspended'; END IF;
    END IF;
    $guard$ || marker);
END $concurrency$;
NOTIFY pgrst, 'reload schema';
COMMIT;
