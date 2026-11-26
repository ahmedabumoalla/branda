BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE loyalty_audit_private.stamp_inactivity_settings (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
  days integer CHECK (days BETWEEN 1 AND 3650),
  revision integer NOT NULL DEFAULT 0,
  CHECK (cafe_id = 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2')
);
CREATE TABLE loyalty_audit_private.stamp_inactivity_resets (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cafe_id uuid NOT NULL REFERENCES loyalty_audit_private.stamp_inactivity_settings(cafe_id),
  card_id uuid NOT NULL,
  stamps_before integer NOT NULL CHECK (stamps_before > 0),
  last_stamp_at timestamptz NOT NULL,
  days integer NOT NULL,
  reset_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE loyalty_audit_private.stamp_inactivity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_audit_private.stamp_inactivity_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_audit_private.stamp_inactivity_settings, loyalty_audit_private.stamp_inactivity_resets FROM PUBLIC, anon, authenticated, service_role;

-- A null revision reads the current policy; saving null days disables it.
CREATE FUNCTION public.loyalty_stamp_inactivity_settings(p_cafe uuid, p_days integer DEFAULT NULL, p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg loyalty_audit_private.stamp_inactivity_settings;
BEGIN
  IF p_cafe IS DISTINCT FROM 'ec9b4415-b68e-4554-acbd-c918bd5cc2f2'::uuid
     OR auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
     OR (public.is_cafe_owner(p_cafe) OR public.is_platform_admin()) IS NOT TRUE
     OR public.brand_account_not_cancelled(p_cafe) IS NOT TRUE OR platform_access_private.service_enabled(p_cafe,'loyalty') IS NOT TRUE
  THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_revision IS NULL THEN
    SELECT * INTO cfg FROM loyalty_audit_private.stamp_inactivity_settings WHERE cafe_id=p_cafe;
  ELSE
    IF p_days IS NOT NULL AND p_days NOT BETWEEN 1 AND 3650 THEN RAISE EXCEPTION 'Invalid days' USING ERRCODE='22023'; END IF;
    INSERT INTO loyalty_audit_private.stamp_inactivity_settings(cafe_id) VALUES(p_cafe) ON CONFLICT DO NOTHING;
    UPDATE loyalty_audit_private.stamp_inactivity_settings SET days=p_days,revision=revision+1
      WHERE cafe_id=p_cafe AND revision=p_revision RETURNING * INTO cfg;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stale revision' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN jsonb_build_object('days',cfg.days,'revision',coalesce(cfg.revision,0));
END $$;
REVOKE ALL ON FUNCTION public.loyalty_stamp_inactivity_settings(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.loyalty_stamp_inactivity_settings(uuid,integer,integer) TO authenticated;

CREATE FUNCTION loyalty_audit_private.last_stamp_at(c public.loyalty_cards)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce((SELECT e.created_at FROM public.loyalty_card_events e
    WHERE e.card_id=c.id AND e.cafe_id=c.cafe_id AND e.event_type='stamp'
    ORDER BY e.created_at DESC LIMIT 1),c.last_used_at,c.issued_at)
$$;

CREATE FUNCTION loyalty_audit_private.expire_stamp_counter(p_card uuid)
RETURNS public.loyalty_cards LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.loyalty_cards; cfg loyalty_audit_private.stamp_inactivity_settings; last_stamp timestamptz;
BEGIN
  SELECT * INTO STRICT c FROM public.loyalty_cards WHERE id=p_card AND cafe_id='ec9b4415-b68e-4554-acbd-c918bd5cc2f2' FOR UPDATE;
  IF c.status <> 'active' OR c.stamps_in_cycle <= 0 THEN RETURN c; END IF;
  SELECT s.* INTO cfg FROM loyalty_audit_private.stamp_inactivity_settings s
    JOIN public.cafe_loyalty_programs p ON p.cafe_id=s.cafe_id AND p.enabled AND p.points_mode='stamps'
    WHERE s.cafe_id=c.cafe_id AND s.days IS NOT NULL AND public.brand_account_not_cancelled(s.cafe_id)
      AND platform_access_private.service_enabled(s.cafe_id,'loyalty') FOR SHARE OF s;
  IF cfg.days IS NULL THEN RETURN c; END IF;
  last_stamp := loyalty_audit_private.last_stamp_at(c);
  IF last_stamp <= statement_timestamp() - cfg.days * interval '24 hours' THEN
    INSERT INTO loyalty_audit_private.stamp_inactivity_resets(cafe_id,card_id,stamps_before,last_stamp_at,days)
      VALUES(c.cafe_id,c.id,c.stamps_in_cycle,last_stamp,cfg.days);
    -- The existing card update trigger enqueues a quiet wallet sync in this transaction.
    UPDATE public.loyalty_cards SET stamps_in_cycle=0,updated_at=clock_timestamp()
      WHERE id=c.id AND cafe_id=c.cafe_id RETURNING * INTO c;
  END IF;
  RETURN c;
END $$;

CREATE FUNCTION loyalty_audit_private.sweep_stamp_inactivity()
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE cfg loyalty_audit_private.stamp_inactivity_settings; target uuid;
BEGIN
  SELECT s.* INTO cfg FROM loyalty_audit_private.stamp_inactivity_settings s
    JOIN public.cafe_loyalty_programs p ON p.cafe_id=s.cafe_id AND p.enabled AND p.points_mode='stamps'
    WHERE s.days IS NOT NULL AND public.brand_account_not_cancelled(s.cafe_id)
      AND platform_access_private.service_enabled(s.cafe_id,'loyalty') FOR SHARE OF s;
  IF NOT FOUND THEN RETURN; END IF;
  FOR target IN SELECT c.id FROM public.loyalty_cards c
    WHERE c.cafe_id=cfg.cafe_id AND c.status='active' AND c.stamps_in_cycle>0
      AND loyalty_audit_private.last_stamp_at(c) <= statement_timestamp() - cfg.days * interval '24 hours'
    ORDER BY c.id LIMIT 250 FOR UPDATE OF c SKIP LOCKED
  LOOP
    PERFORM loyalty_audit_private.expire_stamp_counter(target);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION loyalty_audit_private.last_stamp_at(public.loyalty_cards),loyalty_audit_private.expire_stamp_counter(uuid),loyalty_audit_private.sweep_stamp_inactivity() FROM PUBLIC,anon,authenticated,service_role;

-- Check expiry under the card lock before any writer can issue a reward from an overdue balance.
-- Keep the deployed request replay, daily limits, permissions and ledger logic intact.
DO $patch$
DECLARE route record; definition text;
BEGIN
  FOR route IN SELECT * FROM (VALUES
    ('public.apply_rast_loyalty_stamp(uuid,text,uuid,uuid,uuid)'::regprocedure,'v_stamps := v_card.stamps_in_cycle + 1;', 'v_card'),
    ('brand_finance_private.stamp_sale_customer(uuid,uuid)'::regprocedure,'v_stamps:=c.stamps_in_cycle+1;', 'c'),
    ('public.record_loyalty_card_operation_legacy(uuid,text,text,numeric,text,text)'::regprocedure,'v_new_stamps := v_card.stamps_in_cycle + 1;', 'v_card')
  ) AS t(proc, marker, cardvar) LOOP
    definition := pg_get_functiondef(route.proc);
    IF array_length(string_to_array(definition,route.marker),1) <> 2 THEN RAISE EXCEPTION 'Unexpected stamp implementation in %',route.proc; END IF;
    EXECUTE replace(definition,route.marker,format(
      'IF %1$s.cafe_id = %2$L::uuid THEN %1$s := loyalty_audit_private.expire_stamp_counter(%1$s.id); END IF; %3$s',
      route.cardvar,'ec9b4415-b68e-4554-acbd-c918bd5cc2f2',route.marker));
  END LOOP;
END $patch$;
SELECT cron.schedule('farrouj-stamp-inactivity','* * * * *','SELECT loyalty_audit_private.sweep_stamp_inactivity()');
COMMIT;
