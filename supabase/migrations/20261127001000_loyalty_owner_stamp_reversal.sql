BEGIN;
SET LOCAL lock_timeout='5s';

-- Preserve the append-only corrections already made for the first participating tenant.
ALTER TABLE loyalty_audit_private.farouj_stamp_voids RENAME TO stamp_voids;
ALTER TABLE loyalty_audit_private.stamp_voids ADD COLUMN cafe_id uuid NOT NULL DEFAULT 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2';
ALTER TABLE loyalty_audit_private.stamp_voids ALTER COLUMN cafe_id DROP DEFAULT;

CREATE FUNCTION loyalty_audit_private.loyalty_owner(p_cafe uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cafes c JOIN public.profiles p ON p.id=auth.uid() AND p.status='active'
    WHERE c.id=p_cafe AND c.owner_user_id=p.id AND c.status IN ('active','published') AND c.deleted_at IS NULL
      AND public.brand_account_not_cancelled(c.id) AND platform_access_private.service_enabled(c.id,'loyalty')
  )
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.loyalty_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.void_owner_cashier_stamp(p_cafe uuid,p_activity uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a public.loyalty_activity_events; e public.loyalty_card_events; c public.loyalty_cards;
  reset loyalty_audit_private.stamp_inactivity_resets; reward public.customer_reward_instances;
  balance integer; threshold integer; adjustment integer:=-1; cancelled uuid; available integer;
  void_id uuid; barcode text;
BEGIN
  IF NOT loyalty_audit_private.loyalty_owner(p_cafe) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.loyalty_activity_events WHERE id=p_activity AND cafe_id=p_cafe AND kind='stamp' AND outcome='success';
  IF a.source_event_id IS NULL THEN RETURN 'unavailable'; END IF;
  SELECT * INTO e FROM public.loyalty_card_events WHERE id=a.source_event_id AND cafe_id=p_cafe AND card_id=a.card_id AND event_type='stamp' AND stamps_added=1;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  SELECT * INTO c FROM public.loyalty_cards WHERE cafe_id=p_cafe AND id=e.card_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM loyalty_audit_private.stamp_voids WHERE cafe_id=p_cafe AND source_event_id=e.id) THEN RETURN 'already_void'; END IF;
  IF e.invoice_barcode IS NOT NULL AND EXISTS(SELECT 1 FROM public.loyalty_card_events v WHERE v.cafe_id=p_cafe AND v.card_id=e.card_id AND v.event_type='void' AND v.invoice_barcode=e.invoice_barcode AND v.created_at>=e.created_at) THEN RETURN 'already_void'; END IF;

  -- Expire a due cycle before allocating the correction. A reset separates historical and current balances.
  IF p_cafe='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' THEN
    c:=loyalty_audit_private.expire_stamp_counter(c.id);
  END IF;
  SELECT * INTO reset FROM loyalty_audit_private.stamp_inactivity_resets
    WHERE cafe_id=p_cafe AND card_id=c.id AND reset_at>a.occurred_at ORDER BY reset_at,id LIMIT 1;
  IF reset.id IS NULL THEN balance:=c.stamps_in_cycle;
  ELSE SELECT reset.stamps_before+coalesce(sum(v.reset_balance_delta),0) INTO balance FROM loyalty_audit_private.stamp_voids v WHERE v.cafe_id=p_cafe AND v.reset_id=reset.id;
  END IF;

  -- The first award closing this stamp's cycle owns its historical threshold.
  SELECT r.* INTO reward FROM public.loyalty_activity_events awarded
    JOIN public.customer_reward_instances r ON r.cafe_id=awarded.cafe_id AND r.loyalty_card_id=awarded.card_id
       AND r.source_type='loyalty' AND r.source_id=awarded.source_event_id
    WHERE awarded.cafe_id=p_cafe AND awarded.card_id=c.id AND awarded.kind='stamp' AND awarded.outcome='success'
      AND awarded.rewards_delta>0 AND awarded.occurred_at>=a.occurred_at
      AND (reset.id IS NULL OR awarded.occurred_at<reset.reset_at)
      AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.stamp_voids v WHERE v.cafe_id=p_cafe AND v.cancelled_reward_id=r.id)
    ORDER BY awarded.occurred_at,awarded.id LIMIT 1 FOR UPDATE OF r;
  IF reward.status='redeemed' THEN RETURN 'redeemed_reward'; END IF;
  IF c.total_purchases<1 OR balance<0 THEN RETURN 'unavailable'; END IF;
  IF balance=0 THEN
    IF reward.id IS NULL OR reward.status NOT IN ('available','expired') OR c.completed_cycles<1 THEN RETURN 'unavailable'; END IF;
    IF coalesce(reward.metadata->>'purchasesRequired','') !~ '^[1-9][0-9]{0,5}$' THEN RETURN 'unavailable'; END IF;
    threshold:=(reward.metadata->>'purchasesRequired')::integer;
    adjustment:=threshold-1;
    UPDATE public.customer_reward_instances SET status='cancelled',updated_at=clock_timestamp() WHERE id=reward.id AND cafe_id=p_cafe;
    cancelled:=reward.id;
  END IF;
  SELECT count(*) INTO available FROM public.customer_reward_instances WHERE cafe_id=p_cafe AND loyalty_card_id=c.id
    AND status='available' AND (expires_at IS NULL OR expires_at>now());
  UPDATE public.loyalty_cards SET stamps_in_cycle=stamps_in_cycle+CASE WHEN reset.id IS NULL THEN adjustment ELSE 0 END,
    completed_cycles=completed_cycles-CASE WHEN cancelled IS NULL THEN 0 ELSE 1 END,
    total_purchases=total_purchases-1,available_rewards=available,updated_at=clock_timestamp()
    WHERE id=c.id AND cafe_id=p_cafe RETURNING * INTO c;
  -- Existing reporting keys voids by invoice barcode. Only reuse a unique, non-ambiguous barcode.
  IF e.invoice_barcode IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.loyalty_card_events other
    WHERE other.cafe_id=p_cafe AND other.card_id=c.id AND other.event_type='stamp' AND other.invoice_barcode=e.invoice_barcode AND other.id<>e.id)
  THEN barcode:=e.invoice_barcode; END IF;
  INSERT INTO public.loyalty_card_events(cafe_id,card_id,performed_by,event_type,invoice_barcode,stamps_added,reward_delta,stamps_after,rewards_after,note)
    VALUES(p_cafe,c.id,auth.uid(),'void',barcode,-1,CASE WHEN cancelled IS NULL THEN 0 ELSE -1 END,c.stamps_in_cycle,available,'Owner reversed stamp '||e.id)
    RETURNING id INTO void_id;
  INSERT INTO loyalty_audit_private.stamp_voids(cafe_id,activity_id,source_event_id,void_event_id,card_id,owner_id,reset_id,reset_balance_delta,cancelled_reward_id)
    VALUES(p_cafe,a.id,e.id,void_id,c.id,auth.uid(),reset.id,CASE WHEN reset.id IS NULL THEN 0 ELSE adjustment END,cancelled);
  RETURN 'voided';
END $$;
REVOKE ALL ON FUNCTION public.void_owner_cashier_stamp(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.void_owner_cashier_stamp(uuid,uuid) TO authenticated;

-- Preserve the tenant binding of previously loaded clients.
CREATE OR REPLACE FUNCTION public.farouj_void_cashier_stamp(p_activity uuid)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.void_owner_cashier_stamp('ec9b4415-b68e-4554-acbd-c918bd5cc2f2',p_activity)
$$;

-- Keep existing reporting contracts and permissions while updating the audit joins.
DO $patch$
DECLARE change record; src text;
BEGIN
  FOR change IN SELECT * FROM (VALUES
    ('public.get_owner_loyalty_activity_v2(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer,uuid,boolean)'::regprocedure,
     'loyalty_audit_private.farouj_owner(p_cafe_id)','loyalty_audit_private.loyalty_owner(p_cafe_id)'),
    ('public.get_owner_loyalty_activity_v2(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer,uuid,boolean)'::regprocedure,
     'loyalty_audit_private.farouj_stamp_voids v ON v.activity_id=e.id','loyalty_audit_private.stamp_voids v ON v.cafe_id=e.cafe_id AND v.activity_id=e.id'),
    ('brand_finance_private.loyalty_customer_balance(uuid,uuid)'::regprocedure,
     'loyalty_audit_private.farouj_stamp_voids v WHERE v.source_event_id=e.id','loyalty_audit_private.stamp_voids v WHERE v.cafe_id=e.cafe_id AND v.source_event_id=e.id'),
    ('loyalty_audit_private.last_stamp_at(public.loyalty_cards)'::regprocedure,
     'loyalty_audit_private.farouj_stamp_voids v WHERE v.source_event_id=e.id','loyalty_audit_private.stamp_voids v WHERE v.cafe_id=e.cafe_id AND v.source_event_id=e.id'),
    ('public.get_owner_loyalty_branch_report(uuid,timestamptz,timestamptz,uuid,text,integer,integer,boolean)'::regprocedure,
     'SELECT * FROM loyalty_audit_private.branch_events(p_cafe_id) e','SELECT e.*,v.activity_id IS NOT NULL AS stamp_voided FROM loyalty_audit_private.branch_events(p_cafe_id) e LEFT JOIN loyalty_audit_private.stamp_voids v ON v.cafe_id=e.cafe_id AND v.activity_id=e.id'),
    ('public.get_owner_loyalty_branch_report(uuid,timestamptz,timestamptz,uuid,text,integer,integer,boolean)'::regprocedure,
     $a$sum(e.stamps_delta) FILTER(WHERE e.kind='stamp'$a$,$b$sum(e.stamps_delta) FILTER(WHERE NOT e.stamp_voided AND e.kind='stamp'$b$),
    ('public.get_owner_loyalty_branch_report(uuid,timestamptz,timestamptz,uuid,text,integer,integer,boolean)'::regprocedure,
     $a$sum(stamps_delta) FILTER(WHERE kind='stamp'$a$,$b$sum(stamps_delta) FILTER(WHERE NOT stamp_voided AND kind='stamp'$b$)
  ) AS edits(fn,old_text,new_text) LOOP
    src:=pg_get_functiondef(change.fn);
    IF strpos(src,change.old_text)=0 THEN RAISE EXCEPTION 'Unexpected loyalty report function: %', change.fn; END IF;
    EXECUTE replace(src,change.old_text,change.new_text);
  END LOOP;
END $patch$;
COMMIT;
