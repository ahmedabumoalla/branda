BEGIN;
DO $$
DECLARE a uuid; staff uuid:=gen_random_uuid(); token text:='delivery-fixture-'||gen_random_uuid();
 phones text[]:='{}'; profiles uuid[]:='{}'; cards uuid[]:='{}'; requests uuid[]:='{}';
 p text; e jsonb; r jsonb; invite jsonb; invitation uuid; stamp_count integer; i integer;
 first_job uuid; next_job uuid; message_job uuid; selected_ids uuid[]; result_ids uuid[];
BEGIN
 SELECT c.id INTO a FROM public.cafes c JOIN public.cafe_loyalty_programs lp ON lp.cafe_id=c.id AND lp.enabled
 WHERE c.deleted_at IS NULL AND c.status IN('active','published') AND platform_access_private.service_enabled(c.id,'loyalty') LIMIT 1;
 ASSERT a IS NOT NULL;
 FOR i IN 1..3 LOOP
  LOOP
   p:='9665'||lpad(floor(random()*100000000)::bigint::text,8,'0');
   EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE phone_normalized=p);
  END LOOP;
  e:=public.enroll_loyalty_customer_direct(a,'Delivery Fixture '||i,p,md5(p)||md5(p)); ASSERT e->>'ok'='true';
  phones:=array_append(phones,p);profiles:=array_append(profiles,(e->>'profile_id')::uuid);
  cards:=array_append(cards,(SELECT id FROM public.loyalty_cards WHERE cafe_id=a AND customer_profile_id=profiles[i]));
  requests:=array_append(requests,gen_random_uuid());
 END LOOP;
 INSERT INTO public.cafe_cashiers(id,cafe_id,full_name,email,password_hash,temporary_password,can_use_loyalty)
 VALUES(staff,a,'Delivery Employee',staff::text||'@fixture.invalid','fixture','',true);
 INSERT INTO public.cafe_cashier_sessions(cafe_id,cashier_id,token) VALUES(a,staff,token);
 INSERT INTO public.wallet_passes(cafe_id,card_id,provider) VALUES(a,cards[1],'google'),(a,cards[2],'google'),(a,cards[3],'apple');
 INSERT INTO loyalty_audit_private.wallet_customer_events(cafe_id,card_id,provider,kind) VALUES(a,cards[1],'google','save_link');

 ASSERT NOT has_function_privilege('anon','public.claim_stamp_card_link_v2(boolean,boolean)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.finish_stamp_card_link_v2(uuid,uuid,text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.claim_wallet_notification_jobs_for_cards(uuid[],integer)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','public.enqueue_stamp_card_links_for_reads(uuid,uuid[])','EXECUTE');
 ASSERT has_function_privilege('service_role','public.claim_wallet_notification_jobs_for_cards(uuid[],integer)','EXECUTE');
 ASSERT strpos(pg_get_functiondef('public.claim_stamp_card_link(boolean,boolean)'::regprocedure),'wallet_customer_events')>0;
 ASSERT strpos(pg_get_functiondef('public.claim_stamp_card_link(boolean,boolean)'::regprocedure),'public.wallet_passes')>0,'Old dispatcher excludes all issued Google passes';
 ASSERT strpos(pg_get_functiondef('public.claim_stamp_card_link_v2(boolean,boolean)'::regprocedure),'wallet_customer_events')=0,'V2 does not confuse save-link generation with saved wallet';

 PERFORM public.enqueue_loyalty_read(token,requests[1],'phone',phones[1],a,staff);
 r:=public.process_loyalty_reads(10,a,ARRAY[requests[1]]);
 ASSERT r->>'processed'='1' AND r->'cardIds'=jsonb_build_array(cards[1]),'Worker exposes only successfully processed card IDs';
 ASSERT (SELECT result->>'cardId'=cards[1]::text FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=requests[1]);
 ASSERT (SELECT count(*)=1 FROM loyalty_read_private.card_link_jobs WHERE card_id=cards[1]),'Google save link does not suppress invitation';
 ASSERT public.claim_stamp_card_link(true,true) IS NULL,'Old code holds Google invitation during rollout';
 invite:=public.claim_stamp_card_link_v2(true,true);
 ASSERT invite->>'cardId'=cards[1]::text AND invite->>'googleIssued'='true';
 ASSERT NOT invite ? 'cardCode','Claim does not disclose an unnecessary card credential';
 invitation:=(invite->>'id')::uuid;
 ASSERT public.finish_stamp_card_link_v2(invitation,(invite->>'claimToken')::uuid,'deferred');
 ASSERT (SELECT status='pending' AND attempts=0 AND available_at>clock_timestamp()+interval '4 minutes' FROM loyalty_read_private.card_link_jobs WHERE id=invitation),'Proof GET failure backs off without spending POST attempt';
 ASSERT public.claim_stamp_card_link_v2(true,true) IS NULL;
 UPDATE loyalty_read_private.card_link_jobs SET available_at=now()-interval '1 second' WHERE id=invitation;
 invite:=public.claim_stamp_card_link_v2(true,true);
 ASSERT public.finish_stamp_card_link_v2(invitation,(invite->>'claimToken')::uuid,'skipped');
 ASSERT (SELECT status='skipped' FROM loyalty_read_private.card_link_jobs WHERE id=invitation),'Verified saved card skips message';
 ASSERT (SELECT invitation_status='skipped' AND status='succeeded' FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=requests[1]);

 -- Issued Google object without an event still waits for v2 provider verification.
 PERFORM public.enqueue_loyalty_read(token,requests[2],'phone',phones[2],a,staff);
 r:=public.process_loyalty_reads(10,a,ARRAY[requests[2]]);
 ASSERT r->'cardIds'=jsonb_build_array(cards[2]);
 ASSERT public.claim_stamp_card_link(true,true) IS NULL;
 invite:=public.claim_stamp_card_link_v2(true,true);
 ASSERT invite->>'cardId'=cards[2]::text AND invite->>'googleIssued'='true';
 invitation:=(invite->>'id')::uuid;
 ASSERT public.finish_stamp_card_link_v2(invitation,(invite->>'claimToken')::uuid,'unknown');
 ASSERT public.claim_stamp_card_link_v2(true,true) IS NULL,'Ambiguous WhatsApp result is never retried';
 ASSERT NOT public.finish_stamp_card_link_v2(invitation,(invite->>'claimToken')::uuid,'deferred'),'Late GET completion cannot reset unknown POST';

 -- Actual Apple device registration remains sufficient proof.
 INSERT INTO public.wallet_apple_registrations(cafe_id,card_id,device_library_id,pass_type_id,push_token)
 VALUES(a,cards[3],'delivery-fixture-device','pass.fixture','fixture-push-token');
 PERFORM public.enqueue_loyalty_read(token,requests[3],'phone',phones[3],a,staff);
 r:=public.process_loyalty_reads(10,a,ARRAY[requests[3]]);
 ASSERT r->'cardIds'=jsonb_build_array(cards[3]);
 ASSERT NOT EXISTS(SELECT 1 FROM loyalty_read_private.card_link_jobs WHERE card_id=cards[3]),'Registered Apple pass suppresses invitation';

 -- A successful legacy phone read can be repaired without replaying its stamp.
 SELECT total_purchases INTO stamp_count FROM public.loyalty_cards WHERE id=cards[1];
 DELETE FROM loyalty_read_private.card_link_jobs WHERE card_id=cards[1];
 UPDATE loyalty_read_private.operations SET invitation_job_id=NULL,invitation_status=NULL,result=result-'cardId' WHERE cafe_id=a AND request_id=requests[1];
 r:=public.enqueue_stamp_card_links_for_reads(gen_random_uuid(),ARRAY[requests[1]]);
 ASSERT jsonb_array_length(r->'jobIds')=0,'Repair is tenant scoped';
 r:=public.enqueue_stamp_card_links_for_reads(a,ARRAY[requests[1],requests[3]]);
 ASSERT jsonb_array_length(r->'jobIds')=1,'Repair queues only unsaved eligible card';
 ASSERT (SELECT total_purchases=stamp_count FROM public.loyalty_cards WHERE id=cards[1]),'Repair never adds another stamp';
 ASSERT (SELECT result->>'cardId'=cards[1]::text FROM loyalty_read_private.operations WHERE cafe_id=a AND request_id=requests[1]);
 r:=public.enqueue_stamp_card_links_for_reads(a,ARRAY[requests[1]]);
 ASSERT jsonb_array_length(r->'jobIds')=0,'Repair replay cannot create duplicate jobs';
 UPDATE loyalty_read_private.operations SET invitation_job_id=NULL,invitation_status=NULL WHERE cafe_id=a AND request_id=requests[2];
 r:=public.enqueue_stamp_card_links_for_reads(a,ARRAY[requests[2]]);
 ASSERT jsonb_array_length(r->'jobIds')=1;
 ASSERT (SELECT count(*)=1 AND bool_and(status='unknown') FROM loyalty_read_private.card_link_jobs WHERE card_id=cards[2]),'Repair preserves uncertain delivery without resend';
 -- Leave invitation pending rows invisible to a test dispatcher; no real POST is made.

 -- Wallet claims serialize both fresh pending successors and stale predecessors.
 SELECT id INTO first_job FROM public.wallet_notification_jobs WHERE card_id=cards[1] AND kind='sync' AND status='pending';
 ASSERT first_job IS NOT NULL;
 SELECT array_agg(id) INTO selected_ids FROM public.claim_wallet_notification_jobs_for_cards(ARRAY[cards[1]],5);
 ASSERT cardinality(selected_ids)=1 AND selected_ids[1]=first_job;
 SELECT array_agg(id) INTO selected_ids FROM public.claim_wallet_notification_jobs_for_cards(ARRAY[cards[1]],5);
 ASSERT selected_ids IS NULL,'Fresh lease cannot be claimed twice';
 INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind) VALUES(a,cards[1],'sync') RETURNING id INTO next_job;
 INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind,title,body) VALUES(a,cards[1],'message','Fixture','Fixture') RETURNING id INTO message_job;
 SELECT array_agg(card_id) INTO result_ids FROM public.claim_wallet_notification_jobs_for_cards(ARRAY[cards[1],cards[2]],5);
 ASSERT result_ids=ARRAY[cards[2]],'Other card proceeds while same-card successor is held';
 ASSERT (SELECT status='pending' FROM public.wallet_notification_jobs WHERE id=next_job);
 ASSERT (SELECT status='pending' FROM public.wallet_notification_jobs WHERE id=message_job),'Scoped sync never claims announcements';
 SELECT array_agg(id) INTO selected_ids FROM public.claim_wallet_notification_jobs(100);
 ASSERT message_job=ANY(selected_ids),'Global claim preserves message delivery';
 ASSERT NOT next_job=ANY(selected_ids),'Global and scoped claim share same-card serialization';
 UPDATE public.wallet_notification_jobs SET claimed_at=now()-interval '6 minutes',created_at=now()-interval '10 minutes' WHERE id=first_job;
 SELECT array_agg(id) INTO selected_ids FROM public.claim_wallet_notification_jobs_for_cards(ARRAY[cards[1]],5);
 ASSERT selected_ids=ARRAY[first_job],'Only stale predecessor is reclaimed';
 ASSERT (SELECT status='pending' FROM public.wallet_notification_jobs WHERE id=next_job);
 ASSERT (SELECT count(*)=1 FROM public.wallet_notification_jobs WHERE card_id=cards[1] AND kind='sync' AND status='processing');
 BEGIN
  PERFORM public.claim_wallet_notification_jobs_for_cards(array_fill(cards[1],ARRAY[101]),1);
  RAISE EXCEPTION 'Expected oversized batch denial';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='Invalid scoped wallet batch'; END;
END $$;
ROLLBACK;
