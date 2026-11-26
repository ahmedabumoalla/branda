BEGIN;
SET LOCAL lock_timeout='5s';

CREATE TABLE loyalty_audit_private.farouj_stamp_voids (
  activity_id uuid PRIMARY KEY,
  source_event_id uuid NOT NULL UNIQUE,
  void_event_id uuid NOT NULL UNIQUE,
  card_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  reset_id bigint,
  reset_balance_delta integer NOT NULL,
  cancelled_reward_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE loyalty_audit_private.farouj_stamp_voids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.farouj_stamp_voids FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX farouj_stamp_voids_reset_idx ON loyalty_audit_private.farouj_stamp_voids(reset_id) WHERE reset_id IS NOT NULL;

CREATE FUNCTION loyalty_audit_private.farouj_owner(p_cafe uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p_cafe='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' AND EXISTS (
    SELECT 1 FROM public.cafes c JOIN public.profiles p ON p.id=auth.uid() AND p.status='active'
    WHERE c.id=p_cafe AND c.owner_user_id=p.id AND c.deleted_at IS NULL
      AND public.brand_account_not_cancelled(c.id) AND platform_access_private.service_enabled(c.id,'loyalty')
  )
$$;
REVOKE ALL ON FUNCTION loyalty_audit_private.farouj_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.farouj_void_cashier_stamp(p_activity uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE brand CONSTANT uuid:='ec9b4415-b68e-4554-acbd-c918bd5cc2f2';
  a public.loyalty_activity_events; e public.loyalty_card_events; c public.loyalty_cards;
  reset loyalty_audit_private.stamp_inactivity_resets; reward public.customer_reward_instances;
  balance integer; threshold integer; adjustment integer:=-1; cancelled uuid; available integer;
  void_id uuid; barcode text;
BEGIN
  IF NOT loyalty_audit_private.farouj_owner(brand) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO a FROM public.loyalty_activity_events WHERE id=p_activity AND cafe_id=brand AND kind='stamp' AND outcome='success';
  IF a.source_event_id IS NULL THEN RETURN 'unavailable'; END IF;
  SELECT * INTO e FROM public.loyalty_card_events WHERE id=a.source_event_id AND cafe_id=brand AND card_id=a.card_id AND event_type='stamp' AND stamps_added=1;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  SELECT * INTO c FROM public.loyalty_cards WHERE cafe_id=brand AND id=e.card_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unavailable'; END IF;
  IF EXISTS(SELECT 1 FROM loyalty_audit_private.farouj_stamp_voids WHERE source_event_id=e.id) THEN RETURN 'already_void'; END IF;
  IF e.invoice_barcode IS NOT NULL AND EXISTS(SELECT 1 FROM public.loyalty_card_events v WHERE v.cafe_id=brand AND v.card_id=e.card_id AND v.event_type='void' AND v.invoice_barcode=e.invoice_barcode AND v.created_at>=e.created_at) THEN RETURN 'already_void'; END IF;

  -- Expire a due cycle before allocating the correction. A reset separates historical and current balances.
  c:=loyalty_audit_private.expire_stamp_counter(c.id);
  SELECT * INTO reset FROM loyalty_audit_private.stamp_inactivity_resets
    WHERE cafe_id=brand AND card_id=c.id AND reset_at>a.occurred_at ORDER BY reset_at,id LIMIT 1;
  IF reset.id IS NULL THEN balance:=c.stamps_in_cycle;
  ELSE SELECT reset.stamps_before+coalesce(sum(v.reset_balance_delta),0) INTO balance FROM loyalty_audit_private.farouj_stamp_voids v WHERE v.reset_id=reset.id;
  END IF;

  -- The first award closing this stamp's cycle owns its historical threshold.
  SELECT r.* INTO reward FROM public.loyalty_activity_events awarded
    JOIN public.customer_reward_instances r ON r.cafe_id=awarded.cafe_id AND r.loyalty_card_id=awarded.card_id
       AND r.source_type='loyalty' AND r.source_id=awarded.source_event_id
    WHERE awarded.cafe_id=brand AND awarded.card_id=c.id AND awarded.kind='stamp' AND awarded.outcome='success'
      AND awarded.rewards_delta>0 AND awarded.occurred_at>=a.occurred_at
      AND (reset.id IS NULL OR awarded.occurred_at<reset.reset_at)
      AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.farouj_stamp_voids v WHERE v.cancelled_reward_id=r.id)
    ORDER BY awarded.occurred_at,awarded.id LIMIT 1 FOR UPDATE OF r;
  IF reward.status='redeemed' THEN RETURN 'redeemed_reward'; END IF;
  IF c.total_purchases<1 OR balance<0 THEN RETURN 'unavailable'; END IF;
  IF balance=0 THEN
    IF reward.id IS NULL OR reward.status NOT IN ('available','expired') OR c.completed_cycles<1 THEN RETURN 'unavailable'; END IF;
    IF coalesce(reward.metadata->>'purchasesRequired','') !~ '^[1-9][0-9]{0,5}$' THEN RETURN 'unavailable'; END IF;
    threshold:=(reward.metadata->>'purchasesRequired')::integer;
    adjustment:=threshold-1;
    UPDATE public.customer_reward_instances SET status='cancelled',updated_at=clock_timestamp() WHERE id=reward.id;
    cancelled:=reward.id;
  END IF;
  SELECT count(*) INTO available FROM public.customer_reward_instances WHERE cafe_id=brand AND loyalty_card_id=c.id
    AND status='available' AND (expires_at IS NULL OR expires_at>now());
  UPDATE public.loyalty_cards SET stamps_in_cycle=stamps_in_cycle+CASE WHEN reset.id IS NULL THEN adjustment ELSE 0 END,
    completed_cycles=completed_cycles-CASE WHEN cancelled IS NULL THEN 0 ELSE 1 END,
    total_purchases=total_purchases-1,available_rewards=available,updated_at=clock_timestamp()
    WHERE id=c.id AND cafe_id=brand RETURNING * INTO c;
  -- Existing reporting keys voids by invoice barcode. Only reuse a unique, non-ambiguous barcode.
  IF e.invoice_barcode IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.loyalty_card_events other
    WHERE other.cafe_id=brand AND other.card_id=c.id AND other.event_type='stamp' AND other.invoice_barcode=e.invoice_barcode AND other.id<>e.id)
  THEN barcode:=e.invoice_barcode; END IF;
  INSERT INTO public.loyalty_card_events(cafe_id,card_id,performed_by,event_type,invoice_barcode,stamps_added,reward_delta,stamps_after,rewards_after,note)
    VALUES(brand,c.id,auth.uid(),'void',barcode,-1,CASE WHEN cancelled IS NULL THEN 0 ELSE -1 END,c.stamps_in_cycle,available,'Owner reversed stamp '||e.id)
    RETURNING id INTO void_id;
  INSERT INTO loyalty_audit_private.farouj_stamp_voids(activity_id,source_event_id,void_event_id,card_id,owner_id,reset_id,reset_balance_delta,cancelled_reward_id)
    VALUES(a.id,e.id,void_id,c.id,auth.uid(),reset.id,CASE WHEN reset.id IS NULL THEN 0 ELSE adjustment END,cancelled);
  RETURN 'voided';
END $$;
REVOKE ALL ON FUNCTION public.farouj_void_cashier_stamp(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.farouj_void_cashier_stamp(uuid) TO authenticated;

-- Keep the original event visible, and exclude reversed stamps from the owner's stamp totals.
DO $patch$
DECLARE fn regprocedure; src text; edits text[][]; pair text[];
BEGIN
  fn:='public.get_owner_loyalty_activity_v2(uuid,timestamptz,timestamptz,uuid,text,text,text,integer,integer,uuid,boolean)'::regprocedure;
  src:=pg_get_functiondef(fn);
  edits:=ARRAY[
    ARRAY['SELECT e.* FROM loyalty_audit_private.branch_events(p_cafe_id) e','SELECT e.*, v.activity_id IS NOT NULL AS stamp_voided FROM loyalty_audit_private.branch_events(p_cafe_id) e LEFT JOIN loyalty_audit_private.farouj_stamp_voids v ON v.activity_id=e.id'],
    ARRAY[$a$'events',coalesce((SELECT$a$,$b$'canVoidStamps',loyalty_audit_private.farouj_owner(p_cafe_id),'events',coalesce((SELECT$b$],
    ARRAY[$a$'id',id,'occurredAt'$a$,$b$'stampVoided',stamp_voided,'id',id,'occurredAt'$b$],
    ARRAY[$a$sum(stamps_delta) FILTER(WHERE kind='stamp'$a$,$b$sum(stamps_delta) FILTER(WHERE NOT stamp_voided AND kind='stamp'$b$],
    ARRAY[$a$sum(s.stamps_delta) FILTER(WHERE s.kind='stamp'$a$,$b$sum(s.stamps_delta) FILTER(WHERE NOT s.stamp_voided AND s.kind='stamp'$b$]
  ];
  FOREACH pair SLICE 1 IN ARRAY edits LOOP
    IF strpos(src,pair[1])=0 THEN RAISE EXCEPTION 'Unexpected activity function'; END IF;
    src:=replace(src,pair[1],pair[2]);
  END LOOP;
  EXECUTE src;
  fn:='brand_finance_private.loyalty_customer_balance(uuid,uuid)'::regprocedure;
  src:=pg_get_functiondef(fn);
  IF strpos(src,'AND e.stamps_added > 0')=0 THEN RAISE EXCEPTION 'Unexpected balance function'; END IF;
  EXECUTE replace(src,'AND e.stamps_added > 0','AND e.stamps_added > 0 AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.farouj_stamp_voids v WHERE v.source_event_id=e.id)');
END $patch$;

CREATE OR REPLACE FUNCTION loyalty_audit_private.last_stamp_at(c public.loyalty_cards)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce((SELECT e.created_at FROM public.loyalty_card_events e
    WHERE e.card_id=c.id AND e.cafe_id=c.cafe_id AND e.event_type='stamp'
      AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.farouj_stamp_voids v WHERE v.source_event_id=e.id)
    ORDER BY e.created_at DESC LIMIT 1),c.last_used_at,c.issued_at)
$$;
COMMIT;
