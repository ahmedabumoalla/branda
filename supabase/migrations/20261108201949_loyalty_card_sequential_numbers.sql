-- New loyalty cards count from one independently for each brand
-- Existing display numbers, secure codes, cards and ledger rows are immutable
-- Forward-only rollback: retain this counter once any new low-number card exists
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $guards$ BEGIN
 IF md5(pg_get_functiondef('loyalty_enrollment_private.assign_display_number()'::regprocedure))<>'0961a311f48c5e86ed58f5c2abae5255' THEN RAISE EXCEPTION 'Reviewed loyalty function changed: assign_display_number';END IF;
 IF md5(pg_get_functiondef('enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamp with time zone)'::regprocedure))<>'45f3112231922e3a29f1514abba05fb7' THEN RAISE EXCEPTION 'Reviewed loyalty function changed: enqueue_loyalty_read';END IF;
 IF md5(pg_get_functiondef('loyalty_read_private.process_one(uuid,uuid)'::regprocedure))<>'cb24899725de5a7dbf45f1871894eba6' THEN RAISE EXCEPTION 'Reviewed loyalty function changed: process_one';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.loyalty_cards'::regclass AND tgname='loyalty_card_display_number' AND tgenabled='O' AND tgfoid='loyalty_enrollment_private.assign_display_number()'::regprocedure) THEN RAISE EXCEPTION 'Card allocator trigger changed';END IF;
 IF EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='loyalty_enrollment_private' AND tablename='display_number_counters') THEN RAISE EXCEPTION 'Counter already exists';END IF;
END $guards$;
CREATE TEMP TABLE card_numbers_before ON COMMIT DROP AS SELECT (SELECT jsonb_object_agg(k,v) FROM(VALUES ('loyalty_cards',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.loyalty_cards x)),('loyalty_transactions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.loyalty_transactions x)),('loyalty_card_events',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.loyalty_card_events x)),('customer_profiles',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.customer_profiles x)),('wallet_passes',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.wallet_passes x))) h(k,v)) AS snapshot;
CREATE TABLE loyalty_enrollment_private.display_number_counters(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
 next_number integer NOT NULL DEFAULT 1 CHECK(next_number BETWEEN 1 AND 100000)
);
ALTER TABLE loyalty_enrollment_private.display_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON loyalty_enrollment_private.display_number_counters FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.loyalty_cards DROP CONSTRAINT loyalty_cards_display_number_check;
ALTER TABLE public.loyalty_cards ADD CONSTRAINT loyalty_cards_display_number_check CHECK(display_number BETWEEN 1 AND 99999) NOT VALID;
ALTER TABLE public.loyalty_cards VALIDATE CONSTRAINT loyalty_cards_display_number_check;

CREATE OR REPLACE FUNCTION loyalty_enrollment_private.assign_display_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $allocator$
DECLARE v_number integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.display_number IS DISTINCT FROM OLD.display_number THEN RAISE EXCEPTION 'Card display number is immutable';END IF;
  RETURN NEW;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-display:'||NEW.cafe_id::text,0));
 -- The existing enrollment retry does not consume a number or renumber a card
 IF EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=NEW.cafe_id AND customer_profile_id=NEW.customer_profile_id) THEN
  NEW.display_number:=NULL;
  RETURN NEW;
 END IF;
 INSERT INTO loyalty_enrollment_private.display_number_counters(cafe_id) VALUES(NEW.cafe_id) ON CONFLICT(cafe_id) DO NOTHING;
 SELECT next_number INTO STRICT v_number FROM loyalty_enrollment_private.display_number_counters WHERE cafe_id=NEW.cafe_id FOR UPDATE;
 LOOP
  IF v_number>99999 THEN RAISE EXCEPTION 'Card display numbers exhausted for this brand';END IF;
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.loyalty_cards WHERE cafe_id=NEW.cafe_id AND (display_number=v_number OR card_code=v_number::text));
  v_number:=v_number+1;
 END LOOP;
 NEW.display_number:=v_number;
 UPDATE loyalty_enrollment_private.display_number_counters SET next_number=v_number+1 WHERE cafe_id=NEW.cafe_id;
 RETURN NEW;
END $allocator$;
REVOKE ALL ON FUNCTION loyalty_enrollment_private.assign_display_number() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.enqueue_loyalty_read(p_session_token text, p_request_id uuid, p_method text, p_value text, p_expected_cafe_id uuid, p_expected_cashier_id uuid, p_client_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 IF (p_method='phone' AND v !~ '^9665[0-9]{8}$') OR (p_method='code' AND v !~ '^[1-9][0-9]{0,4}$' AND v !~ '^[A-Z0-9_-]{4,100}$') THEN
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
END $function$
;
CREATE OR REPLACE FUNCTION loyalty_read_private.process_one(p_cafe_id uuid, p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  ELSIF q.identifier ~ '^[1-9][0-9]{0,4}$' THEN
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
   result=(r-'cardCode'-'rewardCode')||jsonb_build_object('cardCreated',new_card,'cardId',card.id),identifier=NULL,completed_at=clock_timestamp(),updated_at=clock_timestamp(),
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
END $function$
;
DO $verify$ BEGIN
 IF(SELECT jsonb_object_agg(k,v) FROM(VALUES ('loyalty_cards',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.loyalty_cards x)),('loyalty_transactions',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.loyalty_transactions x)),('loyalty_card_events',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.loyalty_card_events x)),('customer_profiles',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.customer_profiles x)),('wallet_passes',(SELECT md5(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'')) FROM public.wallet_passes x))) h(k,v)) IS DISTINCT FROM(SELECT snapshot FROM card_numbers_before) THEN RAISE EXCEPTION 'Existing loyalty data changed';END IF;
 IF EXISTS(SELECT 1 FROM loyalty_enrollment_private.display_number_counters) THEN RAISE EXCEPTION 'Migration must not allocate cards';END IF;
 IF has_table_privilege('anon','loyalty_enrollment_private.display_number_counters','SELECT') OR has_table_privilege('authenticated','loyalty_enrollment_private.display_number_counters','INSERT') OR has_table_privilege('service_role','loyalty_enrollment_private.display_number_counters','UPDATE') THEN RAISE EXCEPTION 'Counter privileges are public';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='loyalty_enrollment_private.display_number_counters'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'Counter RLS missing';END IF;
END $verify$;
COMMIT;
