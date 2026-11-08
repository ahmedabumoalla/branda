-- Durable admission is separate from customer resolution and stamp execution.
-- The existing stamp core, reward rules, audit triggers and wallet queue remain authoritative.
BEGIN;

CREATE SCHEMA loyalty_read_private;
REVOKE ALL ON SCHEMA loyalty_read_private FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE loyalty_read_private.operations (
 cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
 request_id uuid NOT NULL,
 cashier_id uuid NOT NULL,
 session_id uuid NOT NULL,
 cashier_name text NOT NULL,
 method text NOT NULL CHECK(method IN('code','phone')),
 identifier text,
 identifier_hash text NOT NULL,
 identifier_hint text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','succeeded','failed','duplicate')),
 retryable boolean NOT NULL DEFAULT false,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
 automatic_attempts integer NOT NULL DEFAULT 0 CHECK(automatic_attempts BETWEEN 0 AND 5),
 error_code text,
 result jsonb,
 invitation_job_id uuid,
 invitation_status text,
 client_created_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 last_retried_by uuid,
 last_retried_at timestamptz,
 PRIMARY KEY(cafe_id,request_id)
);
ALTER TABLE loyalty_read_private.operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_read_private.operations FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX loyalty_reads_dispatch_idx ON loyalty_read_private.operations(available_at,created_at,cafe_id,request_id) WHERE status='pending';
CREATE INDEX loyalty_reads_owner_idx ON loyalty_read_private.operations(cafe_id,created_at DESC,request_id DESC);
CREATE INDEX loyalty_reads_cashier_idx ON loyalty_read_private.operations(cafe_id,cashier_id,created_at DESC);
CREATE INDEX loyalty_reads_retry_idx ON loyalty_read_private.operations(cafe_id,created_at) WHERE status='failed' AND retryable;
CREATE INDEX loyalty_reads_invitation_idx ON loyalty_read_private.operations(invitation_job_id) WHERE invitation_job_id IS NOT NULL;

CREATE TABLE loyalty_read_private.card_link_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES public.customer_profiles(id) ON DELETE CASCADE,
 card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
 card_created boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','dispatching','queued','rejected','unknown','expired')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 delivery_day date NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date,
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempted_at timestamptz,
 finished_at timestamptz,
 claim_token uuid,
 provider_message_id text CHECK(length(provider_message_id)<=200),
 UNIQUE(card_id,delivery_day)
);
ALTER TABLE loyalty_read_private.card_link_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_read_private.card_link_jobs FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX loyalty_card_links_dispatch_idx ON loyalty_read_private.card_link_jobs(available_at,created_at) WHERE status='pending';
CREATE INDEX loyalty_card_links_history_idx ON loyalty_read_private.card_link_jobs(card_id,created_at DESC);

CREATE FUNCTION loyalty_read_private.operation_json(p_row loyalty_read_private.operations) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('requestId',p_row.request_id,'status',p_row.status,
  'method',p_row.method,'identifierHint',p_row.identifier_hint,'cashierName',p_row.cashier_name,
  'customerName',p_row.result->>'customerName','availableRewards',p_row.result->'availableRewards',
  'rewardIssued',coalesce((p_row.result->>'rewardIssued')::boolean,false),
  'cardCreated',coalesce((p_row.result->>'cardCreated')::boolean,false),
  'stampsInCycle',p_row.result->'stampsInCycle','purchasesRequired',p_row.result->'purchasesRequired',
  'errorCode',p_row.error_code,'retryable',p_row.retryable,'attempts',p_row.attempts,
  'createdAt',p_row.created_at,'completedAt',p_row.completed_at,'invitationStatus',p_row.invitation_status)
$$;
REVOKE ALL ON FUNCTION loyalty_read_private.operation_json(loyalty_read_private.operations) FROM PUBLIC,anon,authenticated,service_role;

-- No session token is persisted in the queue. Admission remains the established
-- cashier permission check; accepted work may survive normal session expiry.
CREATE FUNCTION public.enqueue_loyalty_read(
 p_session_token text,p_request_id uuid,p_method text,p_value text,
 p_expected_cafe_id uuid,p_expected_cashier_id uuid,p_client_created_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cafe_cashier_sessions; q loyalty_read_private.operations; v text; h text; actor_name text;
BEGIN
 PERFORM platform_access_private.assert_cashier_loyalty(p_session_token);
 SELECT * INTO STRICT s FROM public.cafe_cashier_sessions WHERE token=p_session_token;
 IF s.cafe_id IS DISTINCT FROM p_expected_cafe_id OR s.cashier_id IS DISTINCT FROM p_expected_cashier_id THEN
  RETURN jsonb_build_object('ok',false,'errorCode','session_scope_changed');
 END IF;
 IF p_request_id IS NULL OR p_method IS NULL OR p_method NOT IN('code','phone') OR p_value IS NULL OR length(p_value)>100 THEN
  RETURN jsonb_build_object('ok',false,'errorCode','invalid_identifier');
 END IF;
 v:=upper(btrim(p_value));
 IF (p_method='phone' AND v !~ '^9665[0-9]{8}$') OR (p_method='code' AND v !~ '^[A-Z0-9_-]{4,100}$') THEN
  RETURN jsonb_build_object('ok',false,'errorCode','invalid_identifier');
 END IF;
 -- Keyed digest is not a phone dictionary: the per-installation DB secret never leaves the private schema.
 h:=encode(extensions.hmac(p_method||':'||v,(SELECT secret FROM loyalty_read_private.settings WHERE singleton),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-read:'||s.cafe_id::text||p_request_id::text,0));
 SELECT * INTO q FROM loyalty_read_private.operations WHERE cafe_id=s.cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF q.cashier_id<>s.cashier_id OR q.identifier_hash<>h OR q.method<>p_method THEN
   RETURN jsonb_build_object('ok',false,'errorCode','request_conflict');
  END IF;
  RETURN jsonb_build_object('ok',true,'operation',loyalty_read_private.operation_json(q),'replayed',true);
 END IF;
 IF (SELECT count(*) FROM loyalty_read_private.operations WHERE cafe_id=s.cafe_id AND cashier_id=s.cashier_id AND status='pending')>=500 THEN
  RETURN jsonb_build_object('ok',false,'errorCode','queue_capacity','retryable',true);
 END IF;
 SELECT full_name INTO actor_name FROM public.cafe_cashiers WHERE id=s.cashier_id AND cafe_id=s.cafe_id;
 INSERT INTO loyalty_read_private.operations(cafe_id,request_id,cashier_id,session_id,cashier_name,method,identifier,identifier_hash,identifier_hint,client_created_at)
 VALUES(s.cafe_id,p_request_id,s.cashier_id,s.id,actor_name,p_method,v,h,'***'||right(v,4),p_client_created_at) RETURNING * INTO q;
 RETURN jsonb_build_object('ok',true,'operation',loyalty_read_private.operation_json(q));
END $$;

CREATE TABLE loyalty_read_private.settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),secret text NOT NULL);
ALTER TABLE loyalty_read_private.settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_read_private.settings FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO loyalty_read_private.settings(secret) VALUES(encode(extensions.gen_random_bytes(32),'hex'));

CREATE FUNCTION public.get_cashier_loyalty_reads(
 p_session_token text,p_request_ids uuid[],p_expected_cafe_id uuid,p_expected_cashier_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cafe_cashier_sessions; result jsonb;
BEGIN
 PERFORM platform_access_private.assert_cashier_loyalty(p_session_token);
 SELECT * INTO STRICT s FROM public.cafe_cashier_sessions WHERE token=p_session_token;
 IF s.cafe_id IS DISTINCT FROM p_expected_cafe_id OR s.cashier_id IS DISTINCT FROM p_expected_cashier_id THEN
  RETURN jsonb_build_object('ok',false,'errorCode','session_scope_changed');
 END IF;
 IF p_request_ids IS NULL OR cardinality(p_request_ids)>100 THEN RAISE EXCEPTION 'Invalid read request IDs'; END IF;
 SELECT coalesce(jsonb_agg(loyalty_read_private.operation_json(q) ORDER BY q.created_at DESC),'[]'::jsonb) INTO result
 FROM loyalty_read_private.operations q WHERE q.cafe_id=s.cafe_id AND q.cashier_id=s.cashier_id AND q.request_id=ANY(p_request_ids);
 RETURN jsonb_build_object('ok',true,'operations',result);
END $$;

CREATE FUNCTION loyalty_read_private.process_one(p_cafe_id uuid,p_request_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q loyalty_read_private.operations; c public.cafe_cashiers; b public.cafes;
 card public.loyalty_cards; r jsonb; reason text; transient boolean:=false; owner_profile public.profiles;
 member public.customer_profiles; member_count integer; new_card boolean:=false; invitation loyalty_read_private.card_link_jobs;
BEGIN
 SELECT * INTO STRICT q FROM loyalty_read_private.operations WHERE cafe_id=p_cafe_id AND request_id=p_request_id FOR UPDATE;
 IF q.status<>'pending' THEN RETURN; END IF;
 UPDATE loyalty_read_private.operations SET attempts=attempts+1,automatic_attempts=automatic_attempts+1,updated_at=clock_timestamp()
 WHERE cafe_id=p_cafe_id AND request_id=p_request_id RETURNING * INTO q;
 BEGIN
  IF q.created_at<clock_timestamp()-interval '30 days' OR q.identifier IS NULL THEN RAISE EXCEPTION 'Read operation expired'; END IF;
  SELECT * INTO c FROM public.cafe_cashiers WHERE id=q.cashier_id AND cafe_id=q.cafe_id FOR SHARE;
  IF NOT FOUND OR NOT c.active OR NOT c.can_use_loyalty THEN RAISE EXCEPTION 'Cashier disabled'; END IF;
  SELECT * INTO b FROM public.cafes WHERE id=q.cafe_id FOR SHARE;
  IF NOT FOUND OR b.deleted_at IS NOT NULL OR b.status NOT IN('active','published') THEN RAISE EXCEPTION 'Brand disabled'; END IF;
  IF c.owner_user_id IS NOT NULL THEN
   SELECT * INTO owner_profile FROM public.profiles WHERE id=c.owner_user_id AND status='active' FOR SHARE;
   IF NOT FOUND OR (b.owner_user_id IS DISTINCT FROM c.owner_user_id AND owner_profile.role<>'platform_admin') THEN RAISE EXCEPTION 'Cashier disabled'; END IF;
  END IF;
  IF NOT platform_access_private.service_enabled(q.cafe_id,'loyalty') THEN RAISE EXCEPTION 'Loyalty program disabled'; END IF;
  IF q.method='phone' THEN
   -- Same lock and original profile rules as direct enrollment. A cashier adds
   -- loyalty membership only, never an Auth account, verified phone or login link.
   PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||q.cafe_id::text||':'||q.identifier,0));
   SELECT count(*) INTO member_count FROM public.customer_profiles WHERE cafe_id=q.cafe_id AND phone_normalized=q.identifier;
   IF member_count>1 THEN RAISE EXCEPTION 'Loyalty card unavailable'; END IF;
   SELECT * INTO member FROM public.customer_profiles WHERE cafe_id=q.cafe_id AND phone_normalized=q.identifier FOR UPDATE;
   IF FOUND THEN
    IF member.status<>'active' OR member.blocked_at IS NOT NULL OR member.phone_auth_conflict THEN RAISE EXCEPTION 'Loyalty card unavailable'; END IF;
    new_card:=NOT EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND customer_profile_id=member.id);
    PERFORM public.issue_rast_loyalty_card(member.id);
   ELSE
    r:=public.enroll_loyalty_customer_direct(q.cafe_id,'عميل الولاء',q.identifier,q.identifier_hash);
    IF r->>'ok' IS DISTINCT FROM 'true' THEN
     IF r->>'reason'='rate_limited' THEN RAISE EXCEPTION 'Enrollment temporarily limited'; END IF;
     RAISE EXCEPTION 'Loyalty card unavailable';
    END IF;
    SELECT * INTO STRICT member FROM public.customer_profiles WHERE id=(r->>'profile_id')::uuid AND cafe_id=q.cafe_id;
    new_card:=true;
   END IF;
   SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND customer_profile_id=member.id FOR UPDATE;
  ELSIF q.identifier ~ '^[0-9]{5}$' THEN
   SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND display_number=q.identifier::integer FOR UPDATE;
   IF NOT FOUND THEN SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND card_code=q.identifier FOR UPDATE; END IF;
  ELSE
   SELECT * INTO card FROM public.loyalty_cards WHERE cafe_id=q.cafe_id AND card_code=q.identifier FOR UPDATE;
  END IF;
  IF card.id IS NULL OR card.status<>'active' OR NOT EXISTS(SELECT 1 FROM public.customer_profiles cp WHERE cp.id=card.customer_profile_id AND cp.cafe_id=q.cafe_id AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict) THEN
   RAISE EXCEPTION 'Loyalty card unavailable';
  END IF;
  PERFORM 1 FROM public.customer_profiles WHERE id=card.customer_profile_id AND cafe_id=q.cafe_id FOR SHARE;
  -- No preview, synthetic login or alternate stamp algorithm. The existing core
  -- locks the card and request; its reward/audit/wallet triggers commit with this row.
  r:=public.apply_rast_loyalty_stamp(q.cafe_id,card.card_code,q.request_id,q.cashier_id,NULL);
  IF coalesce(r->>'status','') NOT IN('stamped','reward_issued','recent_scan') THEN RAISE EXCEPTION 'Unexpected stamp result'; END IF;
  IF r->>'status'='recent_scan' THEN
   PERFORM loyalty_audit_private.append_attempt(q.cafe_id,q.cashier_id,card.id,'stamp','duplicate','recent_scan',q.request_id);
  END IF;
  IF q.method='phone' AND r->>'status' IN('stamped','reward_issued')
   AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events WHERE cafe_id=q.cafe_id AND card_id=card.id AND kind IN('download','save_link'))
   AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations WHERE cafe_id=q.cafe_id AND card_id=card.id) THEN
   SELECT * INTO invitation FROM loyalty_read_private.card_link_jobs WHERE card_id=card.id
    AND (created_at>clock_timestamp()-interval '24 hours' OR status IN('pending','dispatching','unknown')) ORDER BY created_at DESC LIMIT 1;
   IF NOT FOUND THEN
    INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
    VALUES(q.cafe_id,card.customer_profile_id,card.id,new_card)
    ON CONFLICT(card_id,delivery_day) DO NOTHING RETURNING * INTO invitation;
   END IF;
  END IF;
  UPDATE loyalty_read_private.operations SET status=CASE WHEN r->>'status'='recent_scan' THEN 'duplicate' ELSE 'succeeded' END,
   retryable=false,error_code=CASE WHEN r->>'status'='recent_scan' THEN 'recent_scan' END,
   result=(r-'cardCode'-'rewardCode')||jsonb_build_object('cardCreated',new_card),identifier=NULL,completed_at=clock_timestamp(),updated_at=clock_timestamp(),
   invitation_job_id=invitation.id,invitation_status=invitation.status
  WHERE cafe_id=q.cafe_id AND request_id=q.request_id;
 EXCEPTION WHEN OTHERS THEN
  reason:=CASE SQLERRM WHEN 'Read operation expired' THEN 'operation_expired' WHEN 'Cashier disabled' THEN 'cashier_disabled'
   WHEN 'Brand disabled' THEN 'brand_disabled' WHEN 'Loyalty program disabled' THEN 'program_disabled'
   WHEN 'Loyalty card not found' THEN 'card_unavailable' WHEN 'Loyalty card unavailable' THEN 'card_unavailable' WHEN 'Loyalty card suspended' THEN 'card_unavailable'
   WHEN 'Loyalty enrollment unavailable' THEN 'program_disabled'
   WHEN 'Invalid scan request' THEN 'invalid_identifier' WHEN 'Scan request conflict' THEN 'request_conflict' ELSE 'operation_failed' END;
  transient:=reason='operation_failed' AND q.attempts<20 AND q.created_at>=clock_timestamp()-interval '30 days';
  UPDATE loyalty_read_private.operations SET status=CASE WHEN transient AND q.automatic_attempts<5 THEN 'pending' ELSE 'failed' END,
   retryable=transient,error_code=reason,available_at=clock_timestamp()+make_interval(secs=>least(900,5*power(3,q.automatic_attempts)::integer)),
   identifier=CASE WHEN transient THEN identifier ELSE NULL END,completed_at=CASE WHEN transient AND q.automatic_attempts<5 THEN NULL ELSE clock_timestamp() END,
   updated_at=clock_timestamp() WHERE cafe_id=q.cafe_id AND request_id=q.request_id;
 END;
END $$;
REVOKE ALL ON FUNCTION loyalty_read_private.process_one(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.process_loyalty_reads(p_limit integer DEFAULT 20,p_cafe_id uuid DEFAULT NULL,p_request_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q record; n integer:=0;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR cardinality(p_request_ids)>100 THEN RAISE EXCEPTION 'Invalid read batch'; END IF;
 FOR q IN SELECT cafe_id,request_id FROM loyalty_read_private.operations
 WHERE status='pending' AND available_at<=clock_timestamp() AND (p_cafe_id IS NULL OR cafe_id=p_cafe_id)
 AND (p_request_ids IS NULL OR request_id=ANY(p_request_ids)) ORDER BY available_at,created_at LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  PERFORM loyalty_read_private.process_one(q.cafe_id,q.request_id); n:=n+1;
 END LOOP;
 -- Bound sensitive unresolved identifiers to 30 days; retain masked audit/idempotency
 -- tombstones so an old request can never become a new stamp after cleanup.
 UPDATE loyalty_read_private.operations SET identifier=NULL,retryable=false,status='failed',error_code='operation_expired',completed_at=clock_timestamp()
 WHERE (cafe_id,request_id) IN(SELECT cafe_id,request_id FROM loyalty_read_private.operations WHERE identifier IS NOT NULL
 AND created_at<clock_timestamp()-interval '30 days' ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED);
 RETURN jsonb_build_object('processed',n);
END $$;

CREATE FUNCTION public.get_owner_loyalty_reads(p_cafe_id uuid,p_page integer DEFAULT 1,p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT loyalty_audit_private.can_read(p_cafe_id) OR NOT platform_access_private.service_enabled(p_cafe_id,'loyalty') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR (p_status IS NOT NULL AND p_status NOT IN('pending','processing','succeeded','failed','needs_review','duplicate')) THEN RAISE EXCEPTION 'Invalid read filters'; END IF;
 WITH scope AS MATERIALIZED(SELECT * FROM loyalty_read_private.operations WHERE cafe_id=p_cafe_id),
 filtered AS(SELECT * FROM scope WHERE p_status IS NULL OR status=p_status),
 page AS(SELECT * FROM filtered ORDER BY created_at DESC,request_id DESC LIMIT 25 OFFSET (p_page-1)*25)
 SELECT jsonb_build_object('operations',coalesce((SELECT jsonb_agg(loyalty_read_private.operation_json(p) ORDER BY created_at DESC,request_id DESC) FROM page p),'[]'::jsonb),
  'total',(SELECT count(*) FROM filtered),'page',p_page,'pageSize',25,
  'summary',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status='pending'),'succeeded',count(*) FILTER(WHERE status='succeeded'),
   'failed',count(*) FILTER(WHERE status='failed'),'duplicate',count(*) FILTER(WHERE status='duplicate'),'retryable',count(*) FILTER(WHERE status='failed' AND retryable)) FROM scope)) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.retry_owner_loyalty_reads(p_cafe_id uuid,p_request_ids uuid[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
 IF NOT loyalty_audit_private.can_read(p_cafe_id) OR NOT platform_access_private.service_enabled(p_cafe_id,'loyalty') THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF cardinality(p_request_ids)>100 THEN RAISE EXCEPTION 'Invalid read retry IDs'; END IF;
 WITH selected AS(SELECT cafe_id,request_id FROM loyalty_read_private.operations WHERE cafe_id=p_cafe_id AND status='failed' AND retryable
  AND attempts<20 AND identifier IS NOT NULL AND created_at>=clock_timestamp()-interval '30 days'
  AND (p_request_ids IS NULL OR request_id=ANY(p_request_ids)) ORDER BY created_at FOR UPDATE SKIP LOCKED)
 UPDATE loyalty_read_private.operations q SET status='pending',automatic_attempts=0,retryable=false,available_at=clock_timestamp(),
  completed_at=NULL,updated_at=clock_timestamp(),last_retried_by=auth.uid(),last_retried_at=clock_timestamp()
 FROM selected s WHERE q.cafe_id=s.cafe_id AND q.request_id=s.request_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('retried',n);
END $$;

-- Card invitations are distinct from post-download welcomes. A lost provider
-- response is unknown and never silently resent, even by a later day's scan.
CREATE FUNCTION public.claim_stamp_card_link(p_primary_ready boolean,p_loco_ready boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j loyalty_read_private.card_link_jobs; context jsonb;
BEGIN
 WITH changed AS (
  UPDATE loyalty_read_private.card_link_jobs SET status='unknown',finished_at=clock_timestamp()
  WHERE id IN(SELECT id FROM loyalty_read_private.card_link_jobs WHERE status='dispatching'
   AND attempted_at<clock_timestamp()-interval '5 minutes' LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id,status
 ) UPDATE loyalty_read_private.operations q SET invitation_status=c.status FROM changed c WHERE q.invitation_job_id=c.id;
 WITH changed AS (
  UPDATE loyalty_read_private.card_link_jobs SET status='expired',finished_at=clock_timestamp()
  WHERE id IN(SELECT id FROM loyalty_read_private.card_link_jobs WHERE status='pending'
   AND created_at<clock_timestamp()-interval '24 hours' LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id,status
 ) UPDATE loyalty_read_private.operations q SET invitation_status=c.status FROM changed c WHERE q.invitation_job_id=c.id;
 IF NOT coalesce(p_primary_ready,false) AND NOT coalesce(p_loco_ready,false) THEN RETURN NULL; END IF;
 SELECT w.* INTO j FROM loyalty_read_private.card_link_jobs w
 JOIN public.loyalty_cards lc ON lc.id=w.card_id AND lc.cafe_id=w.cafe_id AND lc.customer_profile_id=w.profile_id
 JOIN public.customer_profiles cp ON cp.id=w.profile_id AND cp.cafe_id=w.cafe_id
 JOIN public.cafes c ON c.id=w.cafe_id
 JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=w.cafe_id
 WHERE w.status='pending' AND w.attempts<3 AND w.available_at<=clock_timestamp()
  AND ((w.cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48'::uuid AND coalesce(p_loco_ready,false))
    OR (w.cafe_id<>'321fd305-1883-48df-ab69-829cf7d1bc48'::uuid AND coalesce(p_primary_ready,false)))
  AND lc.status='active' AND cp.status='active' AND cp.blocked_at IS NULL AND NOT cp.phone_auth_conflict
  AND cp.phone_normalized ~ '^9665[0-9]{8}$' AND c.status IN('active','published') AND c.deleted_at IS NULL
  AND lp.enabled AND platform_access_private.service_enabled(c.id,'loyalty')
  AND NOT EXISTS(SELECT 1 FROM loyalty_audit_private.wallet_customer_events e WHERE e.cafe_id=w.cafe_id AND e.card_id=w.card_id AND e.kind IN('download','save_link'))
  AND NOT EXISTS(SELECT 1 FROM public.wallet_apple_registrations ar WHERE ar.cafe_id=w.cafe_id AND ar.card_id=w.card_id)
 ORDER BY w.available_at,w.created_at LIMIT 1 FOR UPDATE OF w SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE loyalty_read_private.card_link_jobs SET status='dispatching',attempts=attempts+1,attempted_at=clock_timestamp(),claim_token=gen_random_uuid()
 WHERE id=j.id RETURNING * INTO j;
 UPDATE loyalty_read_private.operations SET invitation_status='dispatching' WHERE invitation_job_id=j.id;
 SELECT jsonb_build_object('id',j.id,'claimToken',j.claim_token,'cafeId',j.cafe_id,'profileId',j.profile_id,'cardId',j.card_id,
  'brandSlug',c.slug,'brandName',c.name,'phone',cp.phone_normalized,'cardCreated',j.card_created,
  'stampsInCycle',lc.stamps_in_cycle,'purchasesRequired',lp.purchases_required,'rewardName',lp.reward_name)
 INTO context FROM public.cafes c JOIN public.customer_profiles cp ON cp.id=j.profile_id AND cp.cafe_id=c.id
 JOIN public.loyalty_cards lc ON lc.id=j.card_id AND lc.cafe_id=c.id
 JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=c.id WHERE c.id=j.cafe_id;
 RETURN context;
END $$;

CREATE FUNCTION public.finish_stamp_card_link(p_id uuid,p_token uuid,p_status text,p_provider_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j loyalty_read_private.card_link_jobs;
BEGIN
 IF p_status IS NULL OR p_status NOT IN('queued','rejected','unknown') OR length(p_provider_message_id)>200
  OR (p_status='queued' AND coalesce(length(p_provider_message_id),0)=0) THEN RAISE EXCEPTION 'Invalid invitation result'; END IF;
 SELECT * INTO j FROM loyalty_read_private.card_link_jobs WHERE id=p_id AND claim_token=p_token AND status='dispatching' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE loyalty_read_private.card_link_jobs SET status=CASE WHEN p_status='rejected' AND attempts<3 AND created_at>clock_timestamp()-interval '24 hours' THEN 'pending' ELSE p_status END,
  available_at=clock_timestamp()+make_interval(secs=>60*power(3,attempts)::integer),provider_message_id=p_provider_message_id,
  finished_at=CASE WHEN p_status='rejected' AND attempts<3 THEN NULL ELSE clock_timestamp() END
 WHERE id=j.id RETURNING * INTO j;
 UPDATE loyalty_read_private.operations SET invitation_status=j.status WHERE invitation_job_id=j.id;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz),
 public.get_cashier_loyalty_reads(text,uuid[],uuid,uuid),public.process_loyalty_reads(integer,uuid,uuid[]),
 public.claim_stamp_card_link(boolean,boolean),public.finish_stamp_card_link(uuid,uuid,text,text),
 public.get_owner_loyalty_reads(uuid,integer,text),public.retry_owner_loyalty_reads(uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz),
 public.get_cashier_loyalty_reads(text,uuid[],uuid,uuid),public.process_loyalty_reads(integer,uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_stamp_card_link(boolean,boolean),public.finish_stamp_card_link(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_loyalty_reads(uuid,integer,text),public.retry_owner_loyalty_reads(uuid,uuid[]) TO authenticated;

COMMIT;
