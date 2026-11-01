-- Run as the database owner after the migration. No provider calls; every fixture rolls back.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.platform_campaign_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
DO $$
DECLARE
  actor uuid; other_actor uuid; cafe_a uuid:=gen_random_uuid(); cafe_b uuid:=gen_random_uuid();
  profile_a uuid:=gen_random_uuid(); profile_b uuid:=gen_random_uuid(); profile_c uuid:=gen_random_uuid(); profile_d uuid:=gen_random_uuid();
  profile_e uuid:=gen_random_uuid(); phone_a text; phone_b text; phone_c text; phone_d text; base bigint;
  campaign uuid; second_campaign uuid; third_campaign uuid; media uuid:=gen_random_uuid(); key uuid:=gen_random_uuid();
  audience jsonb; result jsonb; job jsonb; later_job jsonb; denied boolean; i integer;
  scheduled_time timestamptz; older_time timestamptz; scheduled_key uuid; scheduled_campaign uuid; zone_time timestamptz;
BEGIN
  SELECT id INTO actor FROM public.profiles WHERE role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
  IF actor IS NULL THEN RAISE EXCEPTION 'An active platform admin is required for rollback verification'; END IF;
  -- Keep existing service/package and profile triggers enabled. The owner-run fixture
  -- transaction represents this active administrator rather than an anonymous write.
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor::text,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  SELECT id INTO other_actor FROM public.profiles WHERE id<>actor AND role='platform_admin' AND status='active' ORDER BY id LIMIT 1;
  other_actor:=coalesce(other_actor,gen_random_uuid());
  LOOP
    base:=10000000+floor(random()*70000000)::bigint;
    phone_a:='9665'||base; phone_b:='9665'||(base+1); phone_c:='9665'||(base+2); phone_d:='9665'||(base+3);
    EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE public.normalize_customer_phone(phone) IN (phone_a,phone_b,phone_c,phone_d))
      AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions WHERE phone IN (phone_a,phone_b,phone_c,phone_d));
  END LOOP;
  INSERT INTO public.cafes(id,slug,name,owner_user_id,status) VALUES
    (cafe_a,'platform-campaign-test-'||cafe_a,'Campaign fixture Alpha',actor,'active'),
    (cafe_b,'platform-campaign-test-'||cafe_b,'Campaign fixture Beta',actor,'active');
  INSERT INTO public.customer_profiles(id,cafe_id,full_name,phone,status) VALUES
    (profile_a,cafe_a,'Campaign recipient Alpha',phone_a,'active'),
    (profile_b,cafe_b,'Campaign recipient Alternate',phone_a,'active'),
    (profile_c,cafe_a,'Campaign recipient Beta',phone_b,'active'),
    (profile_d,cafe_b,'Campaign recipient Blocked',phone_c,'blocked'),
    (profile_e,cafe_a,'Campaign recipient Same blocked phone',phone_c,'active');
  INSERT INTO public.loyalty_cards(cafe_id,customer_profile_id,customer_name,customer_phone,status)
    VALUES(cafe_a,profile_a,'Old card name',phone_d,'active');
  audience:=public.platform_marketing_audience(actor,cafe_a,'',1);
  PERFORM pg_temp.platform_campaign_assert((audience->>'total')::integer=2,'phone dedupe plus cross-brand block');
  PERFORM pg_temp.platform_campaign_assert(jsonb_array_length((SELECT item->'brands' FROM jsonb_array_elements(audience->'items') item WHERE item->>'phone'=phone_a))=2,'all brand memberships returned once');
  PERFORM pg_temp.platform_campaign_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(audience->'items') item WHERE item->>'phone'=phone_d),'linked card uses canonical profile phone');
  PERFORM pg_temp.platform_campaign_assert((public.platform_marketing_audience(actor,cafe_b,'',1)->>'total')::integer=1,'brand filter is respected');
  PERFORM pg_temp.platform_campaign_assert((public.platform_marketing_audience(actor,cafe_a,'recipient Beta',1)->>'total')::integer=1,'literal name search');
  PERFORM pg_temp.platform_campaign_assert((public.platform_marketing_audience(actor,cafe_a,'%',1)->>'total')::integer=0,'search wildcards stay literal');
  PERFORM pg_temp.platform_campaign_assert(jsonb_array_length(public.platform_marketing_audience(actor,cafe_a,'',2)->'items')=0,'second page does not repeat contacts');
  denied:=false; BEGIN PERFORM public.platform_marketing_audience(gen_random_uuid(),NULL,'',1); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'non-admin audience denied');
  result:=public.platform_marketing_create_campaign(actor,key,'Campaign title','Exact campaign body',NULL,cafe_a,'',ARRAY[phone_a,phone_a,phone_b]);
  campaign:=(result->>'campaignId')::uuid;
  PERFORM pg_temp.platform_campaign_assert((result->>'total')::integer=2,'selected numbers deduplicated in snapshot');
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_create_campaign(actor,key,'Campaign title','Exact campaign body',NULL,cafe_a,'',ARRAY[phone_b,phone_a])=result,'retry order does not change idempotency');
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,key,'Changed title','Exact campaign body',NULL,cafe_a,'',ARRAY[phone_a,phone_b]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'changed idempotent content rejected');
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Empty','Message',NULL,cafe_a,'',ARRAY[]::text[]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'empty selected audience rejected');
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Blocked','Message',NULL,cafe_a,'',ARRAY[phone_a,phone_c]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'unavailable selected recipient fails atomically');
  PERFORM pg_temp.platform_campaign_assert((SELECT count(*)=1 FROM public.platform_marketing_campaigns WHERE created_by=actor AND audience_filter->>'brandId'=cafe_a::text),'invalid campaigns leave no partial rows');
  INSERT INTO public.platform_marketing_media(id,created_by,storage_path,file_name,mime_type,byte_size,status,content_sha256,ready_at)
    VALUES(media,actor,actor||'/ready/'||media||'.jpg','fixture.jpg','image/jpeg',100,'ready',repeat('a',64),now());
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Caption',repeat('x',1025),media,cafe_a,'',ARRAY[phone_a]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'media caption limit enforced');
  UPDATE public.platform_marketing_media SET status='uploading',ready_at=NULL,content_sha256=NULL WHERE id=media;
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Unsealed media','Message',media,cafe_a,'',ARRAY[phone_a]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'unsealed upload cannot enter a campaign');
  UPDATE public.platform_marketing_media SET status='ready',ready_at=now(),content_sha256=repeat('a',64) WHERE id=media;
  UPDATE public.platform_marketing_media SET expires_at=now()-interval '1 second' WHERE id=media;
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Expired','Message',media,cafe_a,'',ARRAY[phone_a]); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'expired prepared media rejected');
  UPDATE public.platform_marketing_media SET expires_at=now()+interval '1 hour' WHERE id=media;
  result:=public.platform_marketing_create_campaign(actor,gen_random_uuid(),'All matching','Message',media,cafe_b,'',NULL);
  second_campaign:=(result->>'campaignId')::uuid;
  PERFORM pg_temp.platform_campaign_assert((result->>'total')::integer=1,'all matching snapshots complete filtered audience');
  PERFORM public.platform_marketing_cancel(actor,second_campaign);
  PERFORM pg_temp.platform_campaign_assert((SELECT status='cancelled' FROM public.platform_marketing_recipients WHERE campaign_id=second_campaign),'cancel pending recipients');

  -- Isolate the synthetic jobs at the front and hold the singleton lock until rollback.
  PERFORM 1 FROM public.platform_marketing_sender_state WHERE singleton FOR UPDATE;
  UPDATE public.platform_marketing_sender_state SET recipient_id=NULL,lease_until=NULL,last_dispatch_at=NULL WHERE singleton;
  UPDATE public.platform_marketing_recipients SET created_at='1900-01-01' WHERE campaign_id=campaign;
  job:=public.platform_marketing_claim_job();
  PERFORM pg_temp.platform_campaign_assert(job->>'campaign_id'=campaign::text,'claim chooses the fixture snapshot');
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_claim_job() IS NULL,'one outstanding lease for platform sender');
  denied:=false; BEGIN PERFORM public.platform_marketing_finish_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid,'accepted','fake-message',NULL); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'cannot accept a message before durable attempt intent');
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((job->>'id')::uuid,gen_random_uuid()),'wrong lease cannot dispatch');
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_begin_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid),'valid lease begins one dispatch');
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid),'dispatch intent cannot begin twice');
  PERFORM public.platform_marketing_finish_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid,'accepted','fixture-message',NULL);
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_claim_job() IS NULL,'global five-second dispatch pacing');
  UPDATE public.platform_marketing_sender_state SET last_dispatch_at=clock_timestamp()-interval '6 seconds' WHERE singleton;
  job:=public.platform_marketing_claim_job();
  INSERT INTO public.brand_marketing_suppressions(cafe_id,phone,reason) VALUES(cafe_b,job->>'phone','manual');
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid),'suppression after claim blocks send across brands');
  PERFORM public.platform_marketing_finish_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid,'queued',NULL,NULL);
  PERFORM pg_temp.platform_campaign_assert((SELECT status='suppressed' FROM public.platform_marketing_recipients WHERE id=(job->>'id')::uuid),'defer cannot undo suppression');
  PERFORM pg_temp.platform_campaign_assert((SELECT status='completed' FROM public.platform_marketing_campaigns WHERE id=campaign),'completed when no pending recipients remain');
  DELETE FROM public.brand_marketing_suppressions WHERE cafe_id=cafe_b AND phone=job->>'phone';

  result:=public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Uncertain lease','Exact body without footer',NULL,cafe_a,'',ARRAY[phone_a,phone_b]);
  third_campaign:=(result->>'campaignId')::uuid;
  UPDATE public.platform_marketing_recipients SET created_at='1900-01-01' WHERE campaign_id=third_campaign;
  job:=public.platform_marketing_claim_job();
  PERFORM pg_temp.platform_campaign_assert(job->>'body'='Exact body without footer','queued body remains exact without appended footer');
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_begin_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid),'uncertainty case begins');
  UPDATE public.platform_marketing_recipients SET lease_until=clock_timestamp()-interval '1 second' WHERE id=(job->>'id')::uuid;
  UPDATE public.platform_marketing_sender_state SET lease_until=clock_timestamp()-interval '1 second',last_dispatch_at=clock_timestamp()-interval '6 seconds' WHERE singleton;
  later_job:=public.platform_marketing_claim_job();
  PERFORM pg_temp.platform_campaign_assert((SELECT status='uncertain' FROM public.platform_marketing_recipients WHERE id=(job->>'id')::uuid),'expired attempted lease never queued again');
  PERFORM pg_temp.platform_campaign_assert(later_job->>'id'<>job->>'id','next claim is another recipient');
  PERFORM public.platform_marketing_cancel(actor,third_campaign);
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((later_job->>'id')::uuid,(later_job->>'lease_token')::uuid),'cancel after claim blocks provider dispatch');
  PERFORM public.platform_marketing_finish_dispatch((later_job->>'id')::uuid,(later_job->>'lease_token')::uuid,'queued',NULL,NULL);
  PERFORM pg_temp.platform_campaign_assert((SELECT status='cancelled' FROM public.platform_marketing_recipients WHERE id=(later_job->>'id')::uuid),'late defer preserves cancellation');
  PERFORM pg_temp.platform_campaign_assert((SELECT status='cancelled' FROM public.platform_marketing_campaigns WHERE id=third_campaign),'cancelled campaign never overwritten by finalization');
  audience:=public.platform_marketing_history(actor);
  PERFORM pg_temp.platform_campaign_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(audience) h WHERE h->>'id'=campaign::text AND (h->>'accepted')::integer=1 AND (h->>'suppressed')::integer=1 AND (h->>'pending')::integer=0),'history counts acceptance separately from delivery');
  result:=public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Unattempted lease','Message',NULL,cafe_a,'',ARRAY[phone_a]);
  second_campaign:=(result->>'campaignId')::uuid;
  UPDATE public.platform_marketing_recipients SET created_at='1900-01-01' WHERE campaign_id=second_campaign;
  UPDATE public.platform_marketing_sender_state SET last_dispatch_at=clock_timestamp()-interval '6 seconds' WHERE singleton;
  job:=public.platform_marketing_claim_job();
  UPDATE public.platform_marketing_recipients SET lease_until=clock_timestamp()-interval '1 second' WHERE id=(job->>'id')::uuid;
  UPDATE public.platform_marketing_sender_state SET lease_until=clock_timestamp()-interval '1 second' WHERE singleton;
  later_job:=public.platform_marketing_claim_job();
  PERFORM pg_temp.platform_campaign_assert(later_job->>'id'=job->>'id' AND later_job->>'lease_token'<>job->>'lease_token','expired unattempted lease can safely be reclaimed with new token');
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid),'stale lease token cannot send after reclamation');
  UPDATE public.profiles SET status='suspended' WHERE id=actor;
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((later_job->>'id')::uuid,(later_job->>'lease_token')::uuid),'revoked administrator cannot dispatch a previously claimed recipient');
  PERFORM public.platform_marketing_finish_dispatch((later_job->>'id')::uuid,(later_job->>'lease_token')::uuid,'queued',NULL,NULL);
  PERFORM pg_temp.platform_campaign_assert((SELECT status='suppressed' FROM public.platform_marketing_recipients WHERE id=(later_job->>'id')::uuid),'revoked creator suppressed at finalization');
  UPDATE public.profiles SET status='active' WHERE id=actor;
  FOR i IN 1..32 LOOP
    LOOP
      phone_d:='9665'||(10000000+floor(random()*70000000)::bigint);
      EXIT WHEN NOT EXISTS(SELECT 1 FROM public.customer_profiles WHERE public.normalize_customer_phone(phone)=phone_d)
        AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions WHERE phone=phone_d);
    END LOOP;
    INSERT INTO public.customer_profiles(cafe_id,full_name,phone,status) VALUES(cafe_a,'Pagination fixture '||i,phone_d,'active');
  END LOOP;
  audience:=public.platform_marketing_audience(actor,cafe_a,'',1);
  PERFORM pg_temp.platform_campaign_assert((audience->>'total')::integer=34 AND jsonb_array_length(audience->'items')=25,'audience reports full total and bounded first page');
  PERFORM pg_temp.platform_campaign_assert(jsonb_array_length(public.platform_marketing_audience(actor,cafe_a,'',2)->'items')=9,'remaining contacts are available on next page');
  result:=public.platform_marketing_create_campaign(actor,gen_random_uuid(),'All pages','Message',NULL,cafe_a,'',NULL);
  PERFORM pg_temp.platform_campaign_assert((result->>'total')::integer=34,'all matching snapshot includes every page');
  PERFORM public.platform_marketing_cancel(actor,(result->>'campaignId')::uuid);
  scheduled_time:=date_trunc('minute',clock_timestamp())+interval '1 hour';
  scheduled_key:=gen_random_uuid();
  result:=public.platform_marketing_create_campaign(actor,scheduled_key,'Scheduled campaign','Scheduled body',NULL,cafe_a,'',ARRAY[phone_a],scheduled_time);
  scheduled_campaign:=(result->>'campaignId')::uuid;
  UPDATE public.platform_marketing_recipients SET created_at='1900-01-01' WHERE campaign_id=scheduled_campaign;
  PERFORM pg_temp.platform_campaign_assert((SELECT scheduled_at=scheduled_time FROM public.platform_marketing_campaigns WHERE id=scheduled_campaign),'requested start instant persisted');
  zone_time:=(to_char(scheduled_time AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD"T"HH24:MI:SS')||'+03:00')::timestamptz;
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_create_campaign(actor,scheduled_key,'Scheduled campaign','Scheduled body',NULL,cafe_a,'',ARRAY[phone_a],zone_time)=result,'equivalent timezone offsets match the same idempotent request');
  job:=public.platform_marketing_claim_job();
  PERFORM pg_temp.platform_campaign_assert(job IS NULL OR job->>'campaign_id'<>scheduled_campaign::text,'future campaign is not claimed early');
  IF job IS NOT NULL THEN PERFORM public.platform_marketing_finish_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid,'queued',NULL,NULL); END IF;
  audience:=public.platform_marketing_history(actor);
  PERFORM pg_temp.platform_campaign_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(audience) h WHERE h->>'id'=scheduled_campaign::text AND (h->>'scheduledAt')::timestamptz=scheduled_time),'history exposes exact scheduled start');
  -- Simulate the same persisted request after its start has passed without waiting in tests.
  older_time:=clock_timestamp()-interval '1 minute';
  UPDATE public.platform_marketing_campaigns SET scheduled_at=older_time,request_payload=jsonb_set(request_payload,'{scheduledAt}',to_jsonb(extract(epoch FROM older_time))) WHERE id=scheduled_campaign;
  PERFORM pg_temp.platform_campaign_assert(public.platform_marketing_create_campaign(actor,scheduled_key,'Scheduled campaign','Scheduled body',NULL,cafe_a,'',ARRAY[phone_a],older_time)=result,'late idempotent retry reconciles even after scheduled time passed');
  job:=public.platform_marketing_claim_job();
  PERFORM pg_temp.platform_campaign_assert(job->>'campaign_id'=scheduled_campaign::text,'due campaign is claimed');
  UPDATE public.platform_marketing_campaigns SET scheduled_at=scheduled_time WHERE id=scheduled_campaign;
  PERFORM pg_temp.platform_campaign_assert(NOT public.platform_marketing_begin_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid),'dispatch rechecks scheduled time after claim');
  PERFORM public.platform_marketing_finish_dispatch((job->>'id')::uuid,(job->>'lease_token')::uuid,'queued',NULL,NULL);
  PERFORM public.platform_marketing_cancel(actor,scheduled_campaign);
  PERFORM pg_temp.platform_campaign_assert((SELECT status='cancelled' FROM public.platform_marketing_recipients WHERE campaign_id=scheduled_campaign),'scheduled campaign can be cancelled before it is due');
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Past schedule','Message',NULL,cafe_a,'',ARRAY[phone_a],clock_timestamp()-interval '1 minute'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'new explicit past start rejected');
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Too distant','Message',NULL,cafe_a,'',ARRAY[phone_a],clock_timestamp()+interval '366 days'); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'new start beyond 365 days rejected');
  denied:=false; BEGIN PERFORM public.platform_marketing_create_campaign(actor,gen_random_uuid(),'Infinite start','Message',NULL,cafe_a,'',ARRAY[phone_a],'infinity'::timestamptz); EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
  PERFORM pg_temp.platform_campaign_assert(denied,'non-finite start rejected');
  PERFORM pg_temp.platform_campaign_assert(NOT has_table_privilege('anon','public.platform_marketing_recipients','SELECT') AND NOT has_table_privilege('authenticated','public.platform_marketing_campaigns','INSERT'),'browser roles have no campaign table access');
  PERFORM pg_temp.platform_campaign_assert(NOT has_function_privilege('authenticated','public.platform_marketing_audience(uuid,uuid,text,integer)','EXECUTE') AND NOT has_function_privilege('anon','public.platform_marketing_claim_job()','EXECUTE'),'browser roles cannot spoof actor through RPC');
  PERFORM pg_temp.platform_campaign_assert((SELECT NOT public FROM storage.buckets WHERE id='platform-marketing-media'),'campaign bucket stays private');
  RAISE NOTICE 'Platform marketing rollback checks passed';
END $$;
ROLLBACK;
