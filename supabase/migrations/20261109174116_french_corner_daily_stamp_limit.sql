-- French Corner only: two credited stamps per customer per Saudi calendar day.
-- Existing card/event indexes cover the bounded count; no balances are rewritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE FUNCTION loyalty_read_private.french_daily_stamp_allowed(p_cafe uuid,p_card uuid,p_stamps integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_profile uuid; v_start timestamptz; v_count bigint;
BEGIN
 IF p_cafe IS DISTINCT FROM 'f91cbe65-1921-412b-98cc-451cccf2a86a'::uuid THEN RETURN true; END IF;
 SELECT customer_profile_id INTO STRICT v_profile FROM public.loyalty_cards WHERE cafe_id=p_cafe AND id=p_card;
 -- Serialize all cards and all entry points for this customer until commit.
 PERFORM pg_advisory_xact_lock(hashtextextended('french-daily-stamp:'||p_cafe::text||':'||v_profile::text,0));
 v_start:=date_trunc('day',transaction_timestamp() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh';
 SELECT coalesce(sum(e.stamps_added),0) INTO v_count FROM public.loyalty_cards c
 JOIN public.loyalty_card_events e ON e.card_id=c.id AND e.cafe_id=c.cafe_id
 WHERE c.cafe_id=p_cafe AND c.customer_profile_id=v_profile AND e.stamps_added>0
 AND e.created_at>=v_start AND e.created_at<v_start+interval '24 hours';
 RETURN p_stamps>0 AND v_count+p_stamps<=2;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.french_daily_stamp_allowed(uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION loyalty_read_private.enforce_french_daily_stamps()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.cafe_id='f91cbe65-1921-412b-98cc-451cccf2a86a'::uuid AND NEW.stamps_added>0 THEN
  IF NOT loyalty_read_private.french_daily_stamp_allowed(NEW.cafe_id,NEW.card_id,NEW.stamps_added) THEN
   RAISE EXCEPTION 'Daily stamp limit reached' USING ERRCODE='P0001';
  END IF;
  -- The accepted stamp day is server-owned, including delayed/offline requests.
  NEW.created_at:=transaction_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.enforce_french_daily_stamps() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER enforce_french_daily_stamps BEFORE INSERT ON public.loyalty_card_events
 FOR EACH ROW EXECUTE FUNCTION loyalty_read_private.enforce_french_daily_stamps();

-- Preserve the reviewed, deployed functions and their permission attributes.
-- Only add a permanent queue/audit rejection and a non-blocking POS opt-out.
DO $patch$
DECLARE definition text; needle text; signature text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['loyalty_read_private.process_one(uuid,uuid)','public.execute_loyalty_audited_operation(text,text,uuid,text)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  needle:='WHEN ''Scan request conflict'' THEN ''request_conflict''';
  IF strpos(definition,needle)=0 OR strpos(definition,'Daily stamp limit reached')>0 THEN RAISE EXCEPTION 'Unexpected daily-limit error mapping baseline: %',signature; END IF;
  EXECUTE replace(definition,needle,'WHEN ''Daily stamp limit reached'' THEN ''daily_stamp_limit'' '||needle);
 END LOOP;
 signature:='brand_finance_private.stamp_sale_customer(uuid,uuid)';
 definition:=pg_get_functiondef(signature::regprocedure);
 needle:='SELECT count(*) INTO v_rewards FROM public.customer_reward_instances';
 IF strpos(definition,needle)=0 OR strpos(definition,'french_daily_stamp_allowed')>0 THEN RAISE EXCEPTION 'Unexpected POS loyalty baseline'; END IF;
 EXECUTE replace(definition,needle,$insert$
 IF NOT loyalty_read_private.french_daily_stamp_allowed(s.cafe_id,c.id,1) THEN
  UPDATE public.bf_sale_customers SET card_id=c.id,loyalty_status='unavailable' WHERE document_id=d.id;
  RETURN;
 END IF;
 SELECT count(*) INTO v_rewards FROM public.customer_reward_instances$insert$);
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
