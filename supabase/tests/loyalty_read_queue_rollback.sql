-- Run after the reviewed migration inside a transaction. No real customer sends.
BEGIN;
CREATE FUNCTION loyalty_read_private.fixture_failure() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF current_setting('test.loyalty_queue_fail',true)='yes' AND NEW.invoice_barcode LIKE 'SCAN-%' THEN
  RAISE EXCEPTION 'Fixture transient failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER loyalty_queue_fixture_failure AFTER INSERT ON public.loyalty_card_events
FOR EACH ROW EXECUTE FUNCTION loyalty_read_private.fixture_failure();

DO $$
DECLARE a uuid; b uuid; ca uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid(); pa uuid; pb uuid;
 v_phone text; phone_b text; code text; code_b text; card uuid; display text; r jsonb; row_result jsonb;
 req uuid:=gen_random_uuid(); req2 uuid:=gen_random_uuid(); req3 uuid:=gen_random_uuid(); req4 uuid:=gen_random_uuid();
 token_a text:='fixture-read-'||gen_random_uuid()::text; token_b text:='fixture-read-'||gen_random_uuid()::text;
 before_cards jsonb; after_cards jsonb; original_owner uuid; audits integer; raw_count integer;
 invitation jsonb; invite_id uuid; new_phone text; new_profile uuid; new_card_id uuid; new_req uuid;
BEGIN
 SELECT jsonb_object_agg(id,to_jsonb(c)) INTO before_cards FROM public.loyalty_cards c;
 SELECT c.id,c.owner_user_id INTO a,original_owner FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
 WHERE c.status IN('active','published') AND c.deleted_at IS NULL AND p.enabled AND c.owner_user_id IS NOT NULL
 AND EXISTS(SELECT 1 FROM public.profiles o WHERE o.id=c.owner_user_id AND o.status='active')
 AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
 SELECT c.id INTO b FROM public.cafes c JOIN public.cafe_loyalty_programs p ON p.cafe_id=c.id
 WHERE c.id<>a AND c.status IN('active','published') AND c.deleted_at IS NULL AND p.enabled
 AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
 ASSERT a IS NOT NULL AND b IS NOT NULL,'Two enabled loyalty fixture tenants required';
 LOOP
  v_phone:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=v_phone);
 END LOOP;
 LOOP
  phone_b:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
  EXIT WHEN phone_b<>v_phone AND NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=phone_b);
 END LOOP;
 r:=public.enroll_loyalty_customer_direct(a,'Queue Fixture A',v_phone,md5(v_phone)||md5(v_phone));
 ASSERT r->>'ok'='true';pa:=(r->>'profile_id')::uuid;
 r:=public.enroll_loyalty_customer_direct(b,'Queue Fixture B',phone_b,md5(phone_b)||md5(phone_b));
 ASSERT r->>'ok'='true';pb:=(r->>'profile_id')::uuid;
 SELECT id,card_code,display_number::text INTO card,code,display FROM public.loyalty_cards WHERE customer_profile_id=pa;
 SELECT card_code INTO code_b FROM public.loyalty_cards WHERE customer_profile_id=pb;
 INSERT INTO public.cafe_cashiers(id,cafe_id,full_name,email,password_hash,temporary_password,can_use_loyalty)
 VALUES(ca,a,'Queue Employee A',ca::text||'@fixture.invalid','fixture','',true),(cb,b,'Queue Employee B',cb::text||'@fixture.invalid','fixture','',true);
 INSERT INTO public.cafe_cashier_sessions(cafe_id,cashier_id,token) VALUES(a,ca,token_a),(b,cb,token_b);
 INSERT INTO public.wallet_passes(cafe_id,card_id,provider) VALUES(a,card,'apple');
 UPDATE public.cafe_loyalty_programs SET purchases_required=2 WHERE cafe_id=a;

 ASSERT NOT has_schema_privilege('anon','loyalty_read_private','USAGE');
 ASSERT NOT has_table_privilege('authenticated','loyalty_read_private.operations','SELECT');
 ASSERT NOT has_table_privilege('service_role','loyalty_read_private.settings','SELECT');
 ASSERT NOT has_function_privilege('authenticated','public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.process_loyalty_reads(integer,uuid,uuid[])','EXECUTE');
 ASSERT NOT has_function_privilege('service_role','public.retry_owner_loyalty_reads(uuid,uuid[])','EXECUTE');
 ASSERT has_function_privilege('service_role','public.enqueue_loyalty_read(text,uuid,text,text,uuid,uuid,timestamptz)','EXECUTE');
 ASSERT has_function_privilege('authenticated','public.get_owner_loyalty_reads(uuid,integer,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.claim_stamp_card_link(boolean,boolean)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','public.finish_stamp_card_link(uuid,uuid,text,text)','EXECUTE');
 ASSERT (SELECT count(*)=3 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='loyalty_read_private' AND c.relkind='r');
 r:=public.enqueue_loyalty_read(token_a,req,'code',code,b,cb);
 ASSERT r->>'errorCode'='session_scope_changed';
 ASSERT NOT EXISTS(SELECT 1 FROM loyalty_read_private.operations WHERE request_id=req);
 r:=public.enqueue_loyalty_read(token_a,req,'code',code,a,ca);
 ASSERT r->>'ok'='true' AND r->'operation'->>'status'='pending';
 ASSERT (SELECT total_purchases=0 FROM public.loyalty_cards WHERE id=card),'Admission must not resolve/stamp';
 ASSERT (SELECT result IS NULL FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req);
 ASSERT strpos(r::text,code)=0 AND strpos(r::text,v_phone)=0,'No full credentials or v_phone in status';
 r:=public.enqueue_loyalty_read(token_a,req,'code',code,a,ca);
 ASSERT r->>'replayed'='true';
 r:=public.enqueue_loyalty_read(token_a,req,'code',code_b,a,ca);
 ASSERT r->>'errorCode'='request_conflict';
 r:=public.enqueue_loyalty_read(token_a,req,'phone',v_phone,a,ca);
 ASSERT r->>'errorCode'='request_conflict','Request payload method cannot change';
 UPDATE public.cafe_cashier_sessions SET expires_at=now()-interval '1 second' WHERE token=token_a;
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req]);
 ASSERT (SELECT total_purchases=1 FROM public.loyalty_cards WHERE id=card),'Accepted request survives normal session expiry';
 ASSERT (SELECT status='succeeded' AND identifier IS NULL FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req);
 ASSERT (SELECT count(*)=1 FROM public.loyalty_card_events WHERE card_id=card AND event_type='stamp');
 ASSERT EXISTS(SELECT 1 FROM public.wallet_notification_jobs WHERE card_id=card AND kind='sync');
 ASSERT EXISTS(SELECT 1 FROM public.loyalty_activity_events WHERE card_id=card AND kind='stamp' AND outcome='success');
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req]);
 ASSERT (SELECT total_purchases=1 FROM public.loyalty_cards WHERE id=card),'Lost response replay stamps once';
 UPDATE public.cafe_cashier_sessions SET expires_at=now()+interval '1 hour' WHERE token=token_a;
 r:=public.enqueue_loyalty_read(token_a,req,'code',code,a,ca);
 ASSERT r->'operation'->>'status'='succeeded' AND r->>'replayed'='true','Completed tombstone replay';
 r:=public.get_cashier_loyalty_reads(token_b,ARRAY[req],b,cb);
 ASSERT jsonb_array_length(r->'operations')=0,'Cashier reads cannot cross tenants';
 r:=public.get_cashier_loyalty_reads(token_a,ARRAY[req],b,cb);
 ASSERT r->>'errorCode'='session_scope_changed';

 r:=public.enqueue_loyalty_read(token_a,req2,'phone',v_phone,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req2]);
 ASSERT (SELECT status='duplicate' AND error_code='recent_scan' FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req2);
 ASSERT (SELECT total_purchases=1 FROM public.loyalty_cards WHERE id=card),'Fresh request cannot bypass repeat-scan guard';
 UPDATE public.loyalty_card_events SET created_at=now()-interval '1 minute' WHERE card_id=card;
 r:=public.enqueue_loyalty_read(token_a,req3,'code',display,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req3]);
 ASSERT (SELECT status='succeeded' AND result->>'rewardIssued'='true' FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req3),'Display number resolves and issues reward';
 ASSERT (SELECT count(*)=1 FROM public.customer_reward_instances WHERE loyalty_card_id=card);
 UPDATE public.loyalty_card_events SET created_at=now()-interval '1 minute' WHERE card_id=card;
 r:=public.enqueue_loyalty_read(token_a,req4,'phone',v_phone,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req4]);
 ASSERT (SELECT status='succeeded' AND (result->>'availableRewards')::integer=1 FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req4),'Existing reward does not block stamp or redeem';
 ASSERT (SELECT total_purchases=3 FROM public.loyalty_cards WHERE id=card);
 ASSERT (SELECT customer_name='Queue Fixture A' FROM public.loyalty_cards WHERE id=card),'Existing customer name never overwritten by automatic enrollment';
 ASSERT NOT EXISTS(SELECT 1 FROM public.customer_reward_redemptions d JOIN public.customer_reward_instances ri ON ri.id=d.reward_instance_id WHERE ri.loyalty_card_id=card);

 req2:=gen_random_uuid();
 r:=public.enqueue_loyalty_read(token_a,req2,'code',code_b,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req2]);
 ASSERT (SELECT status='failed' AND NOT retryable AND error_code='card_unavailable' FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req2),'Foreign card permanently rejected';
 req3:=gen_random_uuid();
 r:=public.enqueue_loyalty_read(token_a,req3,'phone',v_phone,a,ca);
 UPDATE public.cafe_cashiers SET active=false WHERE id=ca;
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req3]);
 ASSERT (SELECT status='failed' AND NOT retryable AND error_code='cashier_disabled' FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req3),'Disabled original actor cannot run queued work';
 UPDATE public.cafe_cashiers SET active=true WHERE id=ca;
 req4:=gen_random_uuid();
 r:=public.enqueue_loyalty_read(token_a,req4,'phone',v_phone,a,ca);
 UPDATE public.customer_profiles SET blocked_at=now() WHERE id=pa;
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req4]);
 ASSERT (SELECT status='failed' AND NOT retryable FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req4),'Blocked customer remains blocked';
 UPDATE public.customer_profiles SET blocked_at=NULL WHERE id=pa;
 PERFORM set_config('request.jwt.claim.sub',original_owner::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',original_owner,'role','authenticated')::text,true);
 r:=public.retry_owner_loyalty_reads(a);
 ASSERT (r->>'retried')::integer=0,'Bulk retry excludes permanent failures';
 r:=public.get_owner_loyalty_reads(a);
 ASSERT (r->'summary'->>'succeeded')::integer>=3 AND (r->'summary'->>'duplicate')::integer>=1;
 ASSERT strpos(r::text,v_phone)=0 AND strpos(r::text,code)=0,'Dashboard returns masked identifiers';
 r:=public.get_owner_loyalty_reads(a,1,'processing');
 ASSERT (r->>'total')::integer=0,'Transient UI processing filter is valid and empty';
 r:=public.get_owner_loyalty_reads(a,1,'needs_review');
 ASSERT (r->>'total')::integer=0,'Review filter does not imply reward redemption changes';

 req:=gen_random_uuid();
 UPDATE public.loyalty_card_events SET created_at=now()-interval '1 minute' WHERE card_id=card;
 r:=public.enqueue_loyalty_read(token_a,req,'phone',v_phone,a,ca);
 PERFORM set_config('test.loyalty_queue_fail','yes',true);
 FOR raw_count IN 1..5 LOOP
  UPDATE loyalty_read_private.operations SET available_at=now()-interval '1 second' WHERE cafe_id=a AND request_id=req;
  PERFORM public.process_loyalty_reads(20,a,ARRAY[req]);
 END LOOP;
 ASSERT (SELECT status='failed' AND retryable AND attempts=5 FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=req),'Automatic retries stop at five';
 ASSERT (SELECT total_purchases=3 FROM public.loyalty_cards WHERE id=card),'Failed ledger transaction rolls back stamp';
 ASSERT (SELECT count(*)=1 FROM public.customer_reward_instances WHERE loyalty_card_id=card),'Failed stamp rolls back reward';
 PERFORM set_config('test.loyalty_queue_fail','no',true);
 r:=public.retry_owner_loyalty_reads(a,ARRAY[req]);
 ASSERT (r->>'retried')::integer=1;
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req]);
 ASSERT (SELECT total_purchases=4 FROM public.loyalty_cards WHERE id=card),'Owner retry finishes original operation once';
 ASSERT (SELECT count(*)=1 FROM public.loyalty_scan_requests WHERE cafe_id=a AND request_id=req);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[req]);
 ASSERT (SELECT total_purchases=4 FROM public.loyalty_cards WHERE id=card);

 -- Invitation failure never rewinds a committed stamp or turns it into a reward redemption.
 ASSERT public.claim_stamp_card_link(false,false) IS NULL,'Disconnected senders leave invitation pending';
 invitation:=public.claim_stamp_card_link(true,true);
 ASSERT invitation IS NOT NULL AND (invitation->>'cardId')::uuid=card;
 invite_id:=(invitation->>'id')::uuid;
 ASSERT NOT public.finish_stamp_card_link(invite_id,gen_random_uuid(),'unknown'),'Wrong delivery lease cannot finish';
 ASSERT public.finish_stamp_card_link(invite_id,(invitation->>'claimToken')::uuid,'unknown');
 ASSERT (SELECT total_purchases=4 FROM public.loyalty_cards WHERE id=card),'Unknown WhatsApp outcome cannot remove stamp';
 UPDATE loyalty_read_private.card_link_jobs SET created_at=now()-interval '2 days' WHERE id=invite_id;
 UPDATE public.loyalty_card_events SET created_at=now()-interval '1 minute' WHERE card_id=card;
 new_req:=gen_random_uuid();
 PERFORM public.enqueue_loyalty_read(token_a,new_req,'phone',v_phone,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 ASSERT (SELECT count(*)=1 FROM loyalty_read_private.card_link_jobs WHERE card_id=card),'Later scan cannot resend ambiguous delivery';
 ASSERT public.claim_stamp_card_link(true,true) IS NULL;

 LOOP
  new_phone:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=new_phone);
 END LOOP;
 new_req:=gen_random_uuid();
 PERFORM public.enqueue_loyalty_read(token_a,new_req,'phone',new_phone,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 SELECT cp.id,lc.id INTO new_profile,new_card_id FROM public.customer_profiles cp JOIN public.loyalty_cards lc ON lc.customer_profile_id=cp.id AND lc.cafe_id=cp.cafe_id WHERE cp.cafe_id=a AND cp.phone_normalized=new_phone;
 ASSERT new_profile IS NOT NULL AND new_card_id IS NOT NULL,'Unknown phone creates loyalty profile and card';
 ASSERT (SELECT user_id IS NULL AND NOT phone_verification_required FROM public.customer_profiles WHERE id=new_profile),'No fabricated Auth or verified phone';
 ASSERT (SELECT total_purchases=1 AND stamps_in_cycle=1 FROM public.loyalty_cards WHERE id=new_card_id),'New card first stamp committed exactly once';
 ASSERT (SELECT count(*)=1 FROM loyalty_read_private.card_link_jobs WHERE card_id=new_card_id AND card_created),'New card link queued atomically';
 r:=public.enqueue_loyalty_read(token_a,new_req,'phone',new_phone,a,ca);
 ASSERT r->'operation'->>'cardCreated'='true','Published operation exposes new-card result';
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 ASSERT (SELECT total_purchases=1 FROM public.loyalty_cards WHERE id=new_card_id);
 ASSERT (SELECT count(*)=1 FROM loyalty_read_private.card_link_jobs WHERE card_id=new_card_id),'Replay does not enqueue another invitation';
 FOR raw_count IN 1..3 LOOP
  UPDATE loyalty_read_private.card_link_jobs SET available_at=now()-interval '1 second' WHERE card_id=new_card_id;
  invitation:=public.claim_stamp_card_link(true,true);
  ASSERT invitation IS NOT NULL AND (invitation->>'cardId')::uuid=new_card_id;
  ASSERT public.finish_stamp_card_link((invitation->>'id')::uuid,(invitation->>'claimToken')::uuid,'rejected');
 END LOOP;
 ASSERT (SELECT status='rejected' AND attempts=3 FROM loyalty_read_private.card_link_jobs WHERE card_id=new_card_id),'Explicit rejected delivery stops after bounded retries';
 ASSERT public.claim_stamp_card_link(true,true) IS NULL;

 -- Reliable download intent suppresses another invite without blocking stamping.
 INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind) VALUES(a,new_card_id,'apple','download');
 UPDATE loyalty_read_private.card_link_jobs SET created_at=now()-interval '2 days' WHERE card_id=new_card_id;
 UPDATE public.loyalty_card_events SET created_at=now()-interval '1 minute' WHERE card_id=new_card_id;
 new_req:=gen_random_uuid();
 PERFORM public.enqueue_loyalty_read(token_a,new_req,'phone',new_phone,a,ca);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 ASSERT (SELECT total_purchases=2 FROM public.loyalty_cards WHERE id=new_card_id);
 ASSERT (SELECT count(*)=1 FROM loyalty_read_private.card_link_jobs WHERE card_id=new_card_id),'Downloaded card never receives redundant invitation';

 -- Enrollment, first stamp and invite are one transaction, including on failure.
 LOOP
  new_phone:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
  EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=new_phone);
 END LOOP;
 new_req:=gen_random_uuid();
 PERFORM public.enqueue_loyalty_read(token_a,new_req,'phone',new_phone,a,ca);
 PERFORM set_config('test.loyalty_queue_fail','yes',true);
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 ASSERT NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE cafe_id=a AND phone_normalized=new_phone),'Failed first stamp rolls back enrollment';
 ASSERT (SELECT status='pending' AND attempts=1 FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=new_req);
 UPDATE loyalty_read_private.operations SET attempts=19,automatic_attempts=4,available_at=now()-interval '1 second' WHERE cafe_id=a AND request_id=new_req;
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 ASSERT (SELECT status='failed' AND attempts=20 AND NOT retryable AND identifier IS NULL FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=new_req),'Global attempt cap cannot be reset by manual retry';
 PERFORM set_config('test.loyalty_queue_fail','no',true);
 new_req:=gen_random_uuid();
 PERFORM public.enqueue_loyalty_read(token_a,new_req,'phone',new_phone,a,ca);
 UPDATE loyalty_read_private.operations SET created_at=clock_timestamp()-interval '31 days' WHERE cafe_id=a AND request_id=new_req;
 PERFORM public.process_loyalty_reads(20,a,ARRAY[new_req]);
 ASSERT (SELECT status='failed' AND error_code='operation_expired' AND identifier IS NULL AND NOT retryable FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=new_req),'Old payload expires without losing replay tombstone';
 ASSERT NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE cafe_id=a AND phone_normalized=new_phone);

 INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id)
 SELECT b,pb,id FROM public.loyalty_cards WHERE customer_profile_id=pb RETURNING id INTO invite_id;
 invitation:=public.claim_stamp_card_link(true,true);
 ASSERT invitation->>'id'=invite_id::text;
 UPDATE loyalty_read_private.card_link_jobs SET attempted_at=clock_timestamp()-interval '6 minutes' WHERE id=invite_id;
 ASSERT public.claim_stamp_card_link(true,true) IS NULL;
 ASSERT (SELECT status='unknown' FROM loyalty_read_private.card_link_jobs WHERE id=invite_id),'Interrupted provider dispatch becomes unknown without resend';
 ASSERT NOT public.finish_stamp_card_link(invite_id,(invitation->>'claimToken')::uuid,'queued','late-fixture-id'),'Stale completion cannot overwrite ambiguous state';

 -- Retry all means every eligible failure, including more than one worker batch.
 INSERT INTO loyalty_read_private.operations(cafe_id,request_id,cashier_id,session_id,cashier_name,method,identifier,identifier_hash,identifier_hint,status,retryable,attempts,automatic_attempts,error_code)
 SELECT a,gen_random_uuid(),ca,(SELECT id FROM public.cafe_cashier_sessions WHERE token=token_a),'Queue Employee A','code','BULK_FIXTURE',repeat('a',64),'***TURE','failed',true,5,5,'operation_failed'
 FROM generate_series(1,501);
 SELECT total_purchases INTO audits FROM public.loyalty_cards WHERE id=card;
 r:=public.retry_owner_loyalty_reads(a);
 ASSERT (r->>'retried')::integer=501,'Retry all queues all eligible rows beyond 500';
 ASSERT (SELECT count(*)=501 FROM loyalty_read_private.operations WHERE cafe_id=a AND identifier='BULK_FIXTURE' AND status='pending');
 ASSERT (SELECT total_purchases=audits FROM public.loyalty_cards WHERE id=card),'Retry admission does not directly add stamps';
 r:=public.enqueue_loyalty_read(token_a,gen_random_uuid(),'code',code,a,ca);
 ASSERT r->>'errorCode'='queue_capacity' AND r->>'retryable'='true','Queue capacity failure remains retryable';

 PERFORM set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 BEGIN PERFORM public.get_owner_loyalty_reads(a); RAISE EXCEPTION 'Expected owner denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.retry_owner_loyalty_reads(a); RAISE EXCEPTION 'Expected retry denial'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 SELECT jsonb_object_agg(id,to_jsonb(c)) INTO after_cards FROM public.loyalty_cards c WHERE before_cards ? id::text;
 ASSERT before_cards IS NOT DISTINCT FROM after_cards,'All original cards remain unchanged';
END $$;
ROLLBACK;
