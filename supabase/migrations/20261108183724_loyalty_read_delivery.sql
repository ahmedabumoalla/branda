-- Immediate scoped wallet synchronization and provider-verified card invitations.
-- v1 dispatch remains conservative until the application adopts the v2 proof check.
BEGIN;

ALTER TABLE loyalty_read_private.card_link_jobs DROP CONSTRAINT card_link_jobs_status_check;
ALTER TABLE loyalty_read_private.card_link_jobs ADD CONSTRAINT card_link_jobs_status_check
 CHECK(status IN('pending','dispatching','queued','rejected','unknown','expired','skipped'));

DO $patch$
DECLARE original text; updated text; exclusion text;
BEGIN
 original:=replace(pg_get_functiondef('loyalty_read_private.process_one(uuid,uuid)'::regprocedure),E'\r\n',E'\n');
 exclusion:='   AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events WHERE cafe_id=q.cafe_id AND card_id=card.id AND kind IN(''download'',''save_link''))';
 IF strpos(original,exclusion)=0 OR strpos(original,'jsonb_build_object(''cardCreated'',new_card)')=0 THEN RAISE EXCEPTION 'Unexpected read processor definition'; END IF;
 updated:=replace(replace(original,exclusion,''),'jsonb_build_object(''cardCreated'',new_card)','jsonb_build_object(''cardCreated'',new_card,''cardId'',card.id)');
 EXECUTE updated;

 original:=replace(pg_get_functiondef('public.claim_stamp_card_link(boolean,boolean)'::regprocedure),E'\r\n',E'\n');
 exclusion:='  AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events e WHERE e.cafe_id=w.cafe_id AND e.card_id=w.card_id AND e.kind IN(''download'',''save_link''))';
 IF strpos(original,exclusion)=0 OR strpos(original,'''stampsInCycle'',lc.stamps_in_cycle')=0 THEN RAISE EXCEPTION 'Unexpected invitation claim definition'; END IF;
 updated:=replace(original,'FUNCTION public.claim_stamp_card_link(','FUNCTION public.claim_stamp_card_link_v2(');
 updated:=replace(updated,exclusion,'');
 updated:=replace(updated,'''stampsInCycle'',lc.stamps_in_cycle','''googleIssued'',EXISTS(SELECT 1 FROM public.wallet_passes wp WHERE wp.card_id=j.card_id AND wp.cafe_id=j.cafe_id AND wp.provider=''google''),''stampsInCycle'',lc.stamps_in_cycle');
 EXECUTE updated;
 -- An already-issued Google object with missing historical events is also held
 -- for v2. The old dispatcher never sends without the new provider proof check.
 updated:=replace(original,exclusion,exclusion||E'\n  AND NOT EXISTS(SELECT 1 FROM public.wallet_passes wp WHERE wp.card_id=w.card_id AND wp.cafe_id=w.cafe_id AND wp.provider=''google'')');
 EXECUTE updated;
END $patch$;

CREATE OR REPLACE FUNCTION public.process_loyalty_reads(p_limit integer DEFAULT 20,p_cafe_id uuid DEFAULT NULL,p_request_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q record; n integer:=0; ids uuid[]:='{}'; card_id uuid;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR cardinality(p_request_ids)>100 THEN RAISE EXCEPTION 'Invalid read batch'; END IF;
 FOR q IN SELECT cafe_id,request_id FROM loyalty_read_private.operations
 WHERE status='pending' AND available_at<=clock_timestamp() AND (p_cafe_id IS NULL OR cafe_id=p_cafe_id)
 AND (p_request_ids IS NULL OR request_id=ANY(p_request_ids)) ORDER BY available_at,created_at LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  PERFORM loyalty_read_private.process_one(q.cafe_id,q.request_id); n:=n+1;
  SELECT (result->>'cardId')::uuid INTO card_id FROM loyalty_read_private.operations
   WHERE cafe_id=q.cafe_id AND request_id=q.request_id AND status='succeeded';
  IF card_id IS NOT NULL AND NOT card_id=ANY(ids) THEN ids:=array_append(ids,card_id); END IF;
 END LOOP;
 UPDATE loyalty_read_private.operations SET identifier=NULL,retryable=false,status='failed',error_code='operation_expired',completed_at=clock_timestamp()
 WHERE (cafe_id,request_id) IN(SELECT cafe_id,request_id FROM loyalty_read_private.operations WHERE identifier IS NOT NULL
 AND created_at<clock_timestamp()-interval '30 days' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED);
 RETURN jsonb_build_object('processed',n,'cardIds',to_jsonb(ids));
END $$;

-- Uses precisely the existing wallet queue lease semantics, restricted to sync
-- jobs for the just-committed cards. Announcement jobs and other cards are untouched.
CREATE FUNCTION public.claim_wallet_notification_jobs_for_cards(p_card_ids uuid[],p_limit integer DEFAULT 20)
RETURNS SETOF public.wallet_notification_jobs LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate record; job public.wallet_notification_jobs; claimed integer:=0; cards uuid[]:='{}';
BEGIN
 IF p_card_ids IS NULL OR cardinality(p_card_ids)>100 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid scoped wallet batch'; END IF;
 -- Both old/global and new/scoped callers use this same lock namespace. Claiming
 -- a pending successor while its predecessor is active can overwrite a newer pass.
 FOR candidate IN SELECT id,card_id,kind FROM public.wallet_notification_jobs
  WHERE card_id=ANY(p_card_ids) AND kind='sync' AND ((status='pending' AND available_at<=now()) OR (status='processing' AND claimed_at<now()-interval '5 minutes'))
  ORDER BY created_at,id LIMIT least(2000,p_limit*20) LOOP
  IF candidate.kind='sync' AND candidate.card_id IS NOT NULL THEN
   IF candidate.card_id=ANY(cards) OR NOT pg_try_advisory_xact_lock(hashtextextended('wallet-sync-card:'||candidate.card_id::text,0)) THEN CONTINUE; END IF;
  END IF;
  SELECT * INTO job FROM public.wallet_notification_jobs WHERE id=candidate.id
   AND ((status='pending' AND available_at<=now()) OR (status='processing' AND claimed_at<now()-interval '5 minutes')) FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF candidate.kind='sync' AND candidate.card_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.wallet_notification_jobs WHERE card_id=candidate.card_id AND id<>candidate.id
    AND kind='sync' AND status='processing' AND claimed_at>=now()-interval '5 minutes'
  ) THEN CONTINUE; END IF;
  UPDATE public.wallet_notification_jobs SET status='processing',claimed_at=now(),attempts=attempts+1,updated_at=now()
  WHERE id=candidate.id RETURNING * INTO job;
  IF candidate.kind='sync' AND candidate.card_id IS NOT NULL THEN cards:=array_append(cards,candidate.card_id); END IF;
  claimed:=claimed+1; RETURN NEXT job;
  EXIT WHEN claimed>=p_limit;
 END LOOP;
END $$;

-- Derive the global claim from the exact same body so serialization cannot drift.
DO $global_claim$
DECLARE definition text;
BEGIN
 IF has_function_privilege('anon','public.claim_wallet_notification_jobs(integer)','EXECUTE') OR has_function_privilege('authenticated','public.claim_wallet_notification_jobs(integer)','EXECUTE') THEN RAISE EXCEPTION 'Unexpected global wallet claim grants'; END IF;
 definition:=pg_get_functiondef('public.claim_wallet_notification_jobs_for_cards(uuid[],integer)'::regprocedure);
 definition:='CREATE OR REPLACE FUNCTION public.claim_wallet_notification_jobs(p_limit integer DEFAULT 20)'||E'\n '||substring(definition FROM position('RETURNS' IN definition));
 definition:=replace(definition,'p_card_ids IS NULL OR cardinality(p_card_ids)>100 OR ','');
 definition:=replace(definition,'card_id=ANY(p_card_ids) AND kind=''sync'' AND ','');
 EXECUTE definition;
END $global_claim$;

CREATE FUNCTION public.finish_stamp_card_link_v2(p_id uuid,p_token uuid,p_status text,p_provider_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j loyalty_read_private.card_link_jobs;
BEGIN
 IF p_status IS NULL OR p_status NOT IN('queued','rejected','unknown','skipped','deferred') OR length(p_provider_message_id)>200
  OR (p_status='queued' AND coalesce(length(p_provider_message_id),0)=0) THEN RAISE EXCEPTION 'Invalid invitation result'; END IF;
 SELECT * INTO j FROM loyalty_read_private.card_link_jobs WHERE id=p_id AND claim_token=p_token AND status='dispatching' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF p_status='deferred' THEN
  -- No WhatsApp POST occurred: do not spend a delivery attempt on a failed proof GET.
  UPDATE loyalty_read_private.card_link_jobs SET status=CASE WHEN created_at>clock_timestamp()-interval '24 hours' THEN 'pending' ELSE 'expired' END,
   attempts=greatest(0,attempts-1),available_at=clock_timestamp()+interval '5 minutes',claim_token=NULL,
   finished_at=CASE WHEN created_at>clock_timestamp()-interval '24 hours' THEN NULL ELSE clock_timestamp() END
  WHERE id=j.id RETURNING * INTO j;
 ELSE
  UPDATE loyalty_read_private.card_link_jobs SET status=CASE WHEN p_status='rejected' AND attempts<3 AND created_at>clock_timestamp()-interval '24 hours' THEN 'pending' ELSE p_status END,
   available_at=clock_timestamp()+make_interval(secs=>60*power(3,attempts)::integer),provider_message_id=p_provider_message_id,
   finished_at=CASE WHEN p_status='rejected' AND attempts<3 THEN NULL ELSE clock_timestamp() END
  WHERE id=j.id RETURNING * INTO j;
 END IF;
 UPDATE loyalty_read_private.operations SET invitation_status=j.status WHERE invitation_job_id=j.id;
 RETURN true;
END $$;

-- Explicit, bounded repair for previously completed phone reads. No enrollment,
-- stamp, balance or reward changes; never reconstruct a raw submitted identifier.
CREATE FUNCTION public.enqueue_stamp_card_links_for_reads(p_cafe_id uuid,p_request_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q loyalty_read_private.operations; card record; job loyalty_read_private.card_link_jobs; ids uuid[]:='{}'; secret_key text;
BEGIN
 IF p_cafe_id IS NULL OR p_request_ids IS NULL OR cardinality(p_request_ids)>100 THEN RAISE EXCEPTION 'Invalid invitation repair scope'; END IF;
 SELECT secret INTO STRICT secret_key FROM loyalty_read_private.settings WHERE singleton;
 FOR q IN SELECT * FROM loyalty_read_private.operations WHERE cafe_id=p_cafe_id AND request_id=ANY(p_request_ids)
  AND method='phone' AND status='succeeded' AND created_at>clock_timestamp()-interval '24 hours'
  AND invitation_job_id IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LOOP
  BEGIN
   SELECT lc.id,lc.customer_profile_id INTO STRICT card FROM public.customer_profiles cp
   JOIN public.loyalty_cards lc ON lc.customer_profile_id=cp.id AND lc.cafe_id=cp.cafe_id
   JOIN public.cafes c ON c.id=cp.cafe_id JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id AND p.enabled
   WHERE cp.cafe_id=q.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict AND lc.status='active'
    AND c.deleted_at IS NULL AND c.status IN('active','published') AND platform_access_private.service_enabled(c.id,'loyalty')
    AND encode(extensions.hmac('phone:'||cp.phone_normalized,secret_key,'sha256'),'hex')=q.identifier_hash
    AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations ar WHERE ar.card_id=lc.id AND ar.cafe_id=lc.cafe_id)
   FOR UPDATE OF lc FOR SHARE OF cp;
  EXCEPTION WHEN no_data_found OR too_many_rows THEN CONTINUE;
  END;
  SELECT * INTO job FROM loyalty_read_private.card_link_jobs WHERE card_id=card.id
   AND (created_at>clock_timestamp()-interval '24 hours' OR status IN('pending','dispatching','unknown')) ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
   INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
   VALUES(q.cafe_id,card.customer_profile_id,card.id,false) ON CONFLICT(card_id,delivery_day) DO NOTHING RETURNING * INTO job;
  END IF;
  IF job.id IS NOT NULL THEN
   UPDATE loyalty_read_private.operations SET result=result||jsonb_build_object('cardId',card.id),invitation_job_id=job.id,invitation_status=job.status
   WHERE cafe_id=q.cafe_id AND request_id=q.request_id;
   IF NOT job.id=ANY(ids) THEN ids:=array_append(ids,job.id); END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('jobIds',to_jsonb(ids));
END $$;

REVOKE ALL ON FUNCTION public.claim_stamp_card_link_v2(boolean,boolean),public.finish_stamp_card_link_v2(uuid,uuid,text,text),
 public.claim_wallet_notification_jobs_for_cards(uuid[],integer),public.enqueue_stamp_card_links_for_reads(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_stamp_card_link_v2(boolean,boolean),public.finish_stamp_card_link_v2(uuid,uuid,text,text),
 public.claim_wallet_notification_jobs_for_cards(uuid[],integer),public.enqueue_stamp_card_links_for_reads(uuid,uuid[]) TO service_role;
COMMIT;
