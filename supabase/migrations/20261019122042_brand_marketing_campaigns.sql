BEGIN;

CREATE TABLE public.brand_marketing_connections (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
  requested_phone text NOT NULL CHECK(requested_phone ~ '^9665[0-9]{8}$'),
  verified_phone text,
  status text NOT NULL DEFAULT 'disconnected' CHECK(status IN ('disconnected','provisioning','pairing','connected','mismatch','uncertain','error','disconnecting')),
  instance_id text UNIQUE, encrypted_credentials text, webhook_token_hash text,
  provision_attempted_at timestamptz, generation uuid NOT NULL DEFAULT gen_random_uuid(),
  lease_token uuid, lease_until timestamptz, dispatch_lock_until timestamptz,
  last_error text, created_by uuid NOT NULL REFERENCES public.profiles(id),
  last_dispatch_at timestamptz, dispatch_day date, dispatch_count integer NOT NULL DEFAULT 0,
  first_dispatch_at timestamptz, consecutive_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.brand_marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id), request_key uuid NOT NULL, content_hash text NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100), body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
  status text NOT NULL CHECK(status IN ('queued','scheduled','sending','completed','cancelled','paused')),
  scheduled_at timestamptz NOT NULL, consent_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cafe_id,request_key), UNIQUE(id,cafe_id)
);
CREATE TABLE public.brand_marketing_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL, cafe_id uuid NOT NULL,
  phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','accepted','delivered','read','failed','uncertain','cancelled','suppressed')),
  lease_token uuid, claimed_at timestamptz, attempted_at timestamptz, accepted_at timestamptz,
  instance_id text, provider_message_id text, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(campaign_id,cafe_id) REFERENCES public.brand_marketing_campaigns(id,cafe_id) ON DELETE CASCADE,
  UNIQUE(campaign_id,phone), UNIQUE(instance_id,provider_message_id)
);
CREATE INDEX brand_marketing_recipient_queue ON public.brand_marketing_recipients(cafe_id,created_at,id) WHERE status='queued';
CREATE INDEX brand_marketing_campaign_history ON public.brand_marketing_campaigns(cafe_id,created_at DESC);
CREATE INDEX brand_marketing_campaign_recipients ON public.brand_marketing_recipients(campaign_id,status);
CREATE TABLE public.brand_marketing_suppressions (
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE, phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
  reason text NOT NULL CHECK(reason IN ('manual','incoming','link')), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cafe_id,phone)
);
CREATE TABLE public.brand_marketing_delivery_receipts (
  instance_id text NOT NULL, message_id text NOT NULL, status text NOT NULL CHECK(status IN ('accepted','delivered','read','failed')),
  received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(instance_id,message_id,status)
);
CREATE INDEX brand_marketing_receipts_expiry ON public.brand_marketing_delivery_receipts(received_at);

-- Browser roles cannot read recipient phones, webhook tokens or encrypted provider credentials.
ALTER TABLE public.brand_marketing_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_marketing_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_marketing_delivery_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_marketing_connections,public.brand_marketing_campaigns,public.brand_marketing_recipients,public.brand_marketing_suppressions,public.brand_marketing_delivery_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.brand_marketing_connections,public.brand_marketing_campaigns,public.brand_marketing_recipients,public.brand_marketing_suppressions,public.brand_marketing_delivery_receipts TO service_role;

CREATE FUNCTION public.marketing_actor_allowed(p_cafe uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.cafes c JOIN public.profiles actor ON actor.id=p_actor AND actor.status='active'
  JOIN LATERAL (SELECT s.* FROM public.subscriptions s WHERE s.cafe_id=c.id AND s.status IN ('active','trialing') ORDER BY s.created_at DESC LIMIT 1) s ON true
  JOIN public.platform_plans p ON p.id=s.plan_id AND p.active
  WHERE c.id=p_cafe AND c.deleted_at IS NULL AND c.status IN ('active','published')
   AND (c.owner_user_id=p_actor OR actor.role='platform_admin' OR EXISTS(SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=c.id AND m.user_id=p_actor AND m.role IN ('owner','manager')))
   AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
   AND (p.features @> '["marketing_campaigns"]'::jsonb OR p.features @> '["all"]'::jsonb)
   AND NOT EXISTS(SELECT 1 FROM public.brand_feature_overrides o WHERE o.cafe_id=c.id AND o.feature_id='marketing_campaigns' AND NOT o.enabled)
 );
$$;

CREATE FUNCTION public.marketing_claim_connection(p_cafe uuid,p_actor uuid,p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.brand_marketing_connections; allowed_create boolean; token uuid:=gen_random_uuid();
BEGIN
 IF NOT public.marketing_actor_allowed(p_cafe,p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 INSERT INTO public.brand_marketing_connections(cafe_id,requested_phone,created_by) VALUES(p_cafe,p_phone,p_actor) ON CONFLICT(cafe_id) DO NOTHING;
 SELECT * INTO c FROM public.brand_marketing_connections WHERE cafe_id=p_cafe FOR UPDATE;
 IF c.lease_until>now() OR c.status IN ('connected','disconnecting') THEN RAISE EXCEPTION 'Connection busy' USING ERRCODE='55000'; END IF;
 IF c.requested_phone<>p_phone AND c.provision_attempted_at IS NOT NULL THEN RAISE EXCEPTION 'Disconnect first' USING ERRCODE='55000'; END IF;
 allowed_create:=c.provision_attempted_at IS NULL;
 UPDATE public.brand_marketing_connections SET requested_phone=p_phone,status='provisioning',lease_token=token,lease_until=now()+interval '2 minutes',
  provision_attempted_at=coalesce(provision_attempted_at,now()),generation=gen_random_uuid(),last_error=NULL,updated_at=now() WHERE cafe_id=p_cafe RETURNING * INTO c;
 RETURN to_jsonb(c)||jsonb_build_object('allow_create',allowed_create);
END $$;

CREATE FUNCTION public.marketing_create_campaign(p_cafe uuid,p_actor uuid,p_key uuid,p_hash text,p_title text,p_body text,p_phones text[],p_scheduled timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.brand_marketing_campaigns; result uuid;
BEGIN
 IF NOT public.marketing_actor_allowed(p_cafe,p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.brand_marketing_connections WHERE cafe_id=p_cafe AND status='connected' AND verified_phone=requested_phone FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection required' USING ERRCODE='55000'; END IF;
 SELECT * INTO existing FROM public.brand_marketing_campaigns WHERE cafe_id=p_cafe AND request_key=p_key;
 IF FOUND THEN IF existing.content_hash<>p_hash THEN RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE='22023'; END IF; RETURN existing.id; END IF;
 IF cardinality(p_phones) NOT BETWEEN 1 AND 1000 OR EXISTS(SELECT 1 FROM unnest(p_phones) x WHERE x IS NULL OR x!~'^9665[0-9]{8}$')
  OR p_scheduled IS NULL OR p_scheduled>now()+interval '90 days' THEN RAISE EXCEPTION 'Invalid campaign' USING ERRCODE='22023'; END IF;
 INSERT INTO public.brand_marketing_campaigns(cafe_id,created_by,request_key,content_hash,title,body,status,scheduled_at,consent_at)
 VALUES(p_cafe,p_actor,p_key,p_hash,p_title,p_body,CASE WHEN p_scheduled>now() THEN 'scheduled' ELSE 'queued' END,greatest(p_scheduled,now()),now()) RETURNING id INTO result;
 INSERT INTO public.brand_marketing_recipients(campaign_id,cafe_id,phone,status)
 SELECT result,p_cafe,x,CASE WHEN EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=p_cafe AND s.phone=x) THEN 'suppressed' ELSE 'queued' END FROM (SELECT DISTINCT unnest(p_phones) x) phones;
 UPDATE public.brand_marketing_campaigns SET status='completed' WHERE id=result AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_recipients WHERE campaign_id=result AND status='queued');
 RETURN result;
END $$;

CREATE FUNCTION public.marketing_suppress(p_cafe uuid,p_phone text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.brand_marketing_connections WHERE cafe_id=p_cafe FOR UPDATE;
 INSERT INTO public.brand_marketing_suppressions(cafe_id,phone,reason) VALUES(p_cafe,p_phone,p_reason) ON CONFLICT DO NOTHING;
 UPDATE public.brand_marketing_recipients SET status='suppressed',updated_at=now() WHERE cafe_id=p_cafe AND phone=p_phone AND (status='queued' OR (status='processing' AND attempted_at IS NULL));
 UPDATE public.brand_marketing_campaigns p SET status='completed',updated_at=now() WHERE p.cafe_id=p_cafe AND p.status IN ('queued','scheduled','sending')
  AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_recipients remaining WHERE remaining.campaign_id=p.id AND remaining.status IN ('queued','processing'));
END $$;

CREATE FUNCTION public.marketing_cancel_campaign(p_cafe uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.brand_marketing_connections WHERE cafe_id=p_cafe FOR UPDATE;
 UPDATE public.brand_marketing_campaigns SET status='cancelled',updated_at=now() WHERE cafe_id=p_cafe AND id=p_id;
 UPDATE public.brand_marketing_recipients SET status='cancelled',updated_at=now() WHERE cafe_id=p_cafe AND campaign_id=p_id AND (status='queued' OR(status='processing' AND attempted_at IS NULL));
END $$;

CREATE FUNCTION public.marketing_disconnect_connection(p_cafe uuid,p_generation uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.brand_marketing_connections; token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO c FROM public.brand_marketing_connections WHERE cafe_id=p_cafe FOR UPDATE;
 IF NOT FOUND OR c.generation<>p_generation OR c.lease_until>now() OR c.dispatch_lock_until>now() THEN RAISE EXCEPTION 'Connection busy' USING ERRCODE='55000'; END IF;
 UPDATE public.brand_marketing_connections SET status='disconnecting',generation=token,lease_until=now()+interval '2 minutes',updated_at=now() WHERE cafe_id=p_cafe;
 UPDATE public.brand_marketing_campaigns SET status='cancelled',updated_at=now() WHERE cafe_id=p_cafe AND status IN ('queued','scheduled','sending','paused');
 UPDATE public.brand_marketing_recipients SET status='cancelled',updated_at=now() WHERE cafe_id=p_cafe AND (status='queued' OR(status='processing' AND attempted_at IS NULL));
 RETURN token;
END $$;
REVOKE ALL ON FUNCTION public.marketing_disconnect_connection(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_disconnect_connection(uuid,uuid) TO service_role;

CREATE FUNCTION public.marketing_claim_jobs(p_limit integer DEFAULT 15) RETURNS SETOF jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.brand_marketing_connections; r public.brand_marketing_recipients; campaign public.brand_marketing_campaigns; token uuid;
BEGIN
 -- An interrupted POST is never automatically retried. Only definitely unattempted work can be reclaimed.
 FOR c IN SELECT conn.* FROM public.brand_marketing_connections conn WHERE EXISTS(
  SELECT 1 FROM public.brand_marketing_recipients stale WHERE stale.cafe_id=conn.cafe_id AND stale.status='processing' AND stale.claimed_at<now()-interval '3 minutes') FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.brand_marketing_recipients SET status=CASE WHEN attempted_at IS NULL THEN 'queued' ELSE 'uncertain' END,lease_token=NULL,updated_at=now()
   WHERE cafe_id=c.cafe_id AND status='processing' AND claimed_at<now()-interval '3 minutes';
  UPDATE public.brand_marketing_connections SET dispatch_lock_until=NULL WHERE cafe_id=c.cafe_id;
  UPDATE public.brand_marketing_campaigns p SET status='completed',updated_at=now() WHERE p.cafe_id=c.cafe_id AND p.status IN ('queued','scheduled','sending')
   AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_recipients remaining WHERE remaining.campaign_id=p.id AND remaining.status IN ('queued','processing'));
 END LOOP;
 DELETE FROM public.brand_marketing_delivery_receipts WHERE received_at<now()-interval '7 days';
 FOR c IN SELECT * FROM public.brand_marketing_connections WHERE status='connected' AND verified_phone=requested_phone
  AND (dispatch_lock_until IS NULL OR dispatch_lock_until<now()) AND (last_dispatch_at IS NULL OR last_dispatch_at<=now()-interval '1 minute')
  AND NOT coalesce(dispatch_day=(now() AT TIME ZONE 'Asia/Riyadh')::date AND (dispatch_count>=200 OR first_dispatch_at<=now()-interval '8 hours'),false)
  AND NOT coalesce(dispatch_day<(now() AT TIME ZONE 'Asia/Riyadh')::date AND consecutive_days>=3 AND (now() AT TIME ZONE 'Asia/Riyadh')::date<=dispatch_day+14,false)
  AND EXISTS(SELECT 1 FROM public.brand_marketing_recipients pending JOIN public.brand_marketing_campaigns p ON p.id=pending.campaign_id WHERE pending.cafe_id=brand_marketing_connections.cafe_id AND pending.status='queued' AND p.status IN ('queued','scheduled','sending') AND p.scheduled_at<=now() AND public.marketing_actor_allowed(pending.cafe_id,p.created_by) AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=pending.cafe_id AND s.phone=pending.phone))
  ORDER BY last_dispatch_at NULLS FIRST LIMIT least(greatest(p_limit,1),25) FOR UPDATE SKIP LOCKED LOOP
  SELECT x.* INTO r FROM public.brand_marketing_recipients x JOIN public.brand_marketing_campaigns p ON p.id=x.campaign_id
   WHERE x.cafe_id=c.cafe_id AND x.status='queued' AND p.status IN ('queued','scheduled','sending') AND p.scheduled_at<=now()
    AND public.marketing_actor_allowed(c.cafe_id,p.created_by)
    AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=x.cafe_id AND s.phone=x.phone)
   ORDER BY p.created_at,x.created_at,x.id LIMIT 1 FOR UPDATE OF x SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO campaign FROM public.brand_marketing_campaigns WHERE id=r.campaign_id;
  token:=gen_random_uuid();
  UPDATE public.brand_marketing_connections SET dispatch_lock_until=now()+interval '3 minutes' WHERE cafe_id=c.cafe_id;
  UPDATE public.brand_marketing_recipients SET status='processing',lease_token=token,claimed_at=now(),updated_at=now() WHERE id=r.id;
  RETURN NEXT jsonb_build_object('id',r.id,'cafe_id',c.cafe_id,'phone',r.phone,'campaign_id',r.campaign_id,'created_by',campaign.created_by,
   'body',campaign.body,'title',campaign.title,'lease_token',token,'instance_id',c.instance_id,'encrypted_credentials',c.encrypted_credentials,'requested_phone',c.requested_phone,'generation',c.generation);
 END LOOP;
END $$;

CREATE FUNCTION public.marketing_begin_dispatch(p_id uuid,p_lease uuid,p_generation uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.brand_marketing_recipients; c public.brand_marketing_connections; p public.brand_marketing_campaigns; day date:=(now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
 SELECT * INTO r FROM public.brand_marketing_recipients WHERE id=p_id;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT * INTO c FROM public.brand_marketing_connections WHERE cafe_id=r.cafe_id FOR UPDATE;
 SELECT * INTO p FROM public.brand_marketing_campaigns WHERE id=r.campaign_id;
 SELECT * INTO r FROM public.brand_marketing_recipients WHERE id=p_id FOR UPDATE;
 IF r.status<>'processing' OR r.lease_token IS DISTINCT FROM p_lease OR r.attempted_at IS NOT NULL
  OR r.claimed_at IS NULL OR r.claimed_at<=now()-interval '3 minutes' OR c.dispatch_lock_until IS NULL OR c.dispatch_lock_until<=now()
  OR c.generation<>p_generation OR c.status<>'connected' OR c.verified_phone IS DISTINCT FROM c.requested_phone
  OR p.status NOT IN ('queued','scheduled','sending') OR NOT public.marketing_actor_allowed(c.cafe_id,p.created_by)
  OR EXISTS(SELECT 1 FROM public.brand_marketing_suppressions s WHERE s.cafe_id=r.cafe_id AND s.phone=r.phone)
  OR c.last_dispatch_at>now()-interval '1 minute' THEN RETURN false; END IF;
 IF c.dispatch_day=day AND (c.dispatch_count>=200 OR c.first_dispatch_at<=now()-interval '8 hours') THEN RETURN false; END IF;
 IF c.dispatch_day<day AND c.consecutive_days>=3 AND day<=c.dispatch_day+14 THEN RETURN false; END IF;
 UPDATE public.brand_marketing_connections SET last_dispatch_at=now(),dispatch_day=day,dispatch_lock_until=now()+interval '3 minutes',
  dispatch_count=CASE WHEN c.dispatch_day=day THEN c.dispatch_count+1 ELSE 1 END,
  first_dispatch_at=CASE WHEN c.dispatch_day=day THEN c.first_dispatch_at ELSE now() END,
  consecutive_days=CASE WHEN c.dispatch_day=day THEN c.consecutive_days WHEN c.dispatch_day=day-1 THEN c.consecutive_days+1 ELSE 1 END
 WHERE cafe_id=c.cafe_id;
 UPDATE public.brand_marketing_recipients SET attempted_at=now(),claimed_at=now(),instance_id=c.instance_id,updated_at=now() WHERE id=p_id;
 UPDATE public.brand_marketing_campaigns SET status='sending',updated_at=now() WHERE id=p.id;
 RETURN true;
END $$;

CREATE FUNCTION public.marketing_campaign_history(p_cafe uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY created_at DESC),'[]'::jsonb) FROM (
  SELECT p.created_at,jsonb_build_object('id',p.id,'title',p.title,'body',p.body,'status',p.status,'scheduledAt',p.scheduled_at,'createdAt',p.created_at,
   'total',count(r.id),'queued',count(r.id) FILTER(WHERE r.status IN ('queued','processing')),
   'accepted',count(r.id) FILTER(WHERE r.status='accepted'),'delivered',count(r.id) FILTER(WHERE r.status='delivered'),
   'read',count(r.id) FILTER(WHERE r.status='read'),'failed',count(r.id) FILTER(WHERE r.status='failed'),
   'uncertain',count(r.id) FILTER(WHERE r.status='uncertain'),'cancelled',count(r.id) FILTER(WHERE r.status='cancelled'),'suppressed',count(r.id) FILTER(WHERE r.status='suppressed')) item
  FROM (SELECT * FROM public.brand_marketing_campaigns WHERE cafe_id=p_cafe ORDER BY created_at DESC LIMIT 50) p
  LEFT JOIN public.brand_marketing_recipients r ON r.campaign_id=p.id GROUP BY p.id,p.title,p.body,p.status,p.scheduled_at,p.created_at
 ) history;
$$;
REVOKE ALL ON FUNCTION public.marketing_campaign_history(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_campaign_history(uuid) TO service_role;

CREATE FUNCTION public.marketing_finish_dispatch(p_id uuid,p_lease uuid,p_status text,p_message text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.brand_marketing_recipients; final_status text:=p_status;
BEGIN
 IF p_status NOT IN ('queued','accepted','failed','uncertain') THEN RAISE EXCEPTION 'Invalid state'; END IF;
 SELECT * INTO r FROM public.brand_marketing_recipients WHERE id=p_id;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM 1 FROM public.brand_marketing_connections WHERE cafe_id=r.cafe_id FOR UPDATE;
 SELECT * INTO r FROM public.brand_marketing_recipients WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.lease_token IS DISTINCT FROM p_lease THEN RETURN; END IF;
 IF p_status='queued' AND r.attempted_at IS NOT NULL THEN final_status:='uncertain'; END IF;
 IF r.status='processing' THEN
  IF p_status='accepted' THEN
   IF p_message IS NULL THEN RAISE EXCEPTION 'Missing receipt'; END IF;
   SELECT status INTO final_status FROM public.brand_marketing_delivery_receipts WHERE instance_id=r.instance_id AND message_id=p_message
    ORDER BY CASE status WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'failed' THEN 2 ELSE 1 END DESC LIMIT 1;
   final_status:=coalesce(final_status,'accepted');
  END IF;
  UPDATE public.brand_marketing_recipients SET status=final_status,provider_message_id=p_message,error_code=p_error,
   accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE accepted_at END,lease_token=NULL,updated_at=now() WHERE id=p_id;
 END IF;
 UPDATE public.brand_marketing_connections SET dispatch_lock_until=NULL WHERE cafe_id=r.cafe_id;
 UPDATE public.brand_marketing_campaigns SET status='completed',updated_at=now() WHERE id=r.campaign_id AND status IN ('queued','scheduled','sending')
  AND NOT EXISTS(SELECT 1 FROM public.brand_marketing_recipients WHERE campaign_id=r.campaign_id AND status IN ('queued','processing'));
END $$;

CREATE FUNCTION public.marketing_record_receipt(p_instance text,p_message text,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status NOT IN ('accepted','delivered','read','failed') OR length(p_message)>200 THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
 PERFORM 1 FROM public.brand_marketing_connections WHERE instance_id=p_instance FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO public.brand_marketing_delivery_receipts(instance_id,message_id,status) VALUES(p_instance,p_message,p_status) ON CONFLICT DO NOTHING;
 UPDATE public.brand_marketing_recipients SET status=p_status,updated_at=now()
 WHERE instance_id=p_instance AND provider_message_id=p_message AND
  ((p_status='read' AND status IN ('accepted','delivered','uncertain','failed')) OR (p_status='delivered' AND status IN ('accepted','uncertain','failed')) OR (p_status='failed' AND status IN ('accepted','uncertain')));
END $$;

REVOKE ALL ON FUNCTION public.marketing_actor_allowed(uuid,uuid),public.marketing_claim_connection(uuid,uuid,text),public.marketing_create_campaign(uuid,uuid,uuid,text,text,text,text[],timestamptz),public.marketing_suppress(uuid,text,text),public.marketing_cancel_campaign(uuid,uuid),public.marketing_claim_jobs(integer),public.marketing_begin_dispatch(uuid,uuid,uuid),public.marketing_finish_dispatch(uuid,uuid,text,text,text),public.marketing_record_receipt(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_actor_allowed(uuid,uuid),public.marketing_claim_connection(uuid,uuid,text),public.marketing_create_campaign(uuid,uuid,uuid,text,text,text,text[],timestamptz),public.marketing_suppress(uuid,text,text),public.marketing_cancel_campaign(uuid,uuid),public.marketing_claim_jobs(integer),public.marketing_begin_dispatch(uuid,uuid,uuid),public.marketing_finish_dispatch(uuid,uuid,text,text,text),public.marketing_record_receipt(text,text,text) TO service_role;
COMMIT;
