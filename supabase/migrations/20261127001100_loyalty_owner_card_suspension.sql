BEGIN;
SET LOCAL lock_timeout = '5s';

-- Keep the first tenant's existing immutable audit records in the same table.
ALTER TABLE loyalty_audit_private.farouj_card_suspensions RENAME TO owner_card_suspensions;
ALTER TABLE loyalty_audit_private.owner_card_suspensions DROP CONSTRAINT farouj_card_suspensions_cafe_id_check;

CREATE FUNCTION public.suspend_owner_loyalty_card(p_cafe uuid, p_customer uuid, p_card uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id
    WHERE c.id=p_cafe AND p.id=auth.uid() AND p.status='active'
      AND c.status IN ('active','published') AND loyalty_audit_private.loyalty_owner(c.id)
    FOR SHARE OF c,p
  ) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT status INTO STRICT previous_status FROM public.loyalty_cards
    WHERE id=p_card AND cafe_id=p_cafe AND customer_profile_id=p_customer FOR UPDATE;
  IF previous_status='suspended' THEN RETURN; END IF;
  UPDATE public.loyalty_cards SET status='suspended',updated_at=clock_timestamp()
    WHERE id=p_card AND cafe_id=p_cafe AND customer_profile_id=p_customer;
  INSERT INTO loyalty_audit_private.owner_card_suspensions(cafe_id,card_id,customer_id,suspended_by)
    VALUES(p_cafe,p_card,p_customer,auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.suspend_owner_loyalty_card(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.suspend_owner_loyalty_card(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.suspend_farouj_owner_card(p_customer uuid,p_card uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.suspend_owner_loyalty_card('ec9b4415-b68e-4554-acbd-c918bd5cc2f2',p_customer,p_card)
$$;

-- Recheck the locked card on every tenant under the same conditions previously applied to Farouj.
DO $patch$
DECLARE procedure_id regprocedure; definition text; old_guard text; new_guard text;
BEGIN
  FOR procedure_id,old_guard,new_guard IN SELECT * FROM (VALUES
    ('brand_finance_private.stamp_sale_customer(uuid,uuid)'::regprocedure,
      $old$IF c.cafe_id='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' AND c.status<>'active' THEN$old$,
      $new$IF c.status<>'active' THEN$new$),
    ('public.record_loyalty_card_operation_legacy(uuid,text,text,numeric,text,text)'::regprocedure,
      $old$IF v_card.cafe_id='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' THEN
      SELECT * INTO STRICT v_card FROM public.loyalty_cards WHERE id=v_card.id FOR UPDATE;
      IF v_card.status<>'active' THEN RAISE EXCEPTION 'Loyalty card suspended'; END IF;
    END IF;$old$,
      $new$SELECT * INTO STRICT v_card FROM public.loyalty_cards WHERE id=v_card.id AND cafe_id=p_cafe_id FOR UPDATE;
      IF v_card.status<>'active' THEN RAISE EXCEPTION 'Loyalty card suspended'; END IF;$new$)
  ) AS edits(fn,old_value,new_value) LOOP
    old_guard:=replace(old_guard,chr(13),'');
    new_guard:=replace(new_guard,chr(13),'');
    definition:=replace(pg_get_functiondef(procedure_id),chr(13),'');
    IF array_length(string_to_array(definition,old_guard),1) IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Unexpected guard in %',procedure_id; END IF;
    EXECUTE replace(definition,old_guard,new_guard);
  END LOOP;
END $patch$;
NOTIFY pgrst, 'reload schema';
COMMIT;
