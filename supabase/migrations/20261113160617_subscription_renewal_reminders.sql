BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
CREATE SCHEMA subscription_reminders_private;
REVOKE ALL ON SCHEMA subscription_reminders_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA subscription_reminders_private TO service_role;

CREATE FUNCTION subscription_reminders_private.phone(value text) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 WITH clean AS(SELECT regexp_replace(coalesce(value,''),'[^0-9]','','g') digits)
 SELECT CASE WHEN digits ~ '^9665[0-9]{8}$' THEN digits WHEN digits ~ '^009665[0-9]{8}$' THEN substr(digits,3)
 WHEN digits ~ '^05[0-9]{8}$' THEN '966'||substr(digits,2) WHEN digits ~ '^5[0-9]{8}$' THEN '966'||digits ELSE NULL END FROM clean
$$;
REVOKE ALL ON FUNCTION subscription_reminders_private.phone(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION subscription_reminders_private.phone(text) TO service_role;

-- Auth tables stay private; expose only the eligible owner's phone to this worker.
CREATE FUNCTION subscription_reminders_private.active_owner(p_owner uuid) RETURNS TABLE(phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT u.phone FROM auth.users u WHERE u.id=p_owner AND u.deleted_at IS NULL AND(u.banned_until IS NULL OR u.banned_until<=now())
$$;
REVOKE ALL ON FUNCTION subscription_reminders_private.active_owner(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION subscription_reminders_private.active_owner(uuid) TO service_role;

-- Use the shared brand deadline, including an already paid queued renewal.
CREATE VIEW subscription_reminders_private.deadlines WITH(security_invoker=true) AS
 WITH terms AS (
 SELECT s.cafe_id,max(s.expires_at) expires_at,bool_or(s.expires_at IS NULL) unlimited,
 bool_or((s.started_at IS NULL OR s.started_at<=now()) AND(s.expires_at IS NULL OR s.expires_at>now())) has_current
 FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id AND p.active
 WHERE s.status IN('active','trialing') AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial'
 GROUP BY s.cafe_id
 ) SELECT c.id cafe_id,c.name brand_name,c.owner_user_id owner_id,t.expires_at,
 coalesce(subscription_reminders_private.phone(u.phone),subscription_reminders_private.phone(p.phone),subscription_reminders_private.phone(settings.owner_phone)) phone
 FROM terms t JOIN public.cafes c ON c.id=t.cafe_id
 JOIN public.profiles p ON p.id=c.owner_user_id AND p.status='active'
 JOIN LATERAL subscription_reminders_private.active_owner(c.owner_user_id) u ON true
 LEFT JOIN public.cafe_settings settings ON settings.cafe_id=c.id
 WHERE c.status='active' AND c.deleted_at IS NULL AND NOT t.unlimited AND t.has_current AND t.expires_at>now();
REVOKE ALL ON subscription_reminders_private.deadlines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON subscription_reminders_private.deadlines TO service_role;

CREATE TABLE public.subscription_renewal_reminders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),owner_id uuid NOT NULL,
 expires_at timestamptz NOT NULL,hours_before smallint NOT NULL CHECK(hours_before IN(24,12)),
 due_at timestamptz NOT NULL,valid_until timestamptz NOT NULL,
 phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),brand_name text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','leased','dispatching','queued','unknown','failed','cancelled')),
 attempts int NOT NULL DEFAULT 0 CHECK(attempts>=0),available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,lease_until timestamptz,provider_message_id text CHECK(length(provider_message_id)<=200),
 last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,expires_at,hours_before),CHECK(valid_until>due_at)
);
ALTER TABLE public.subscription_renewal_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_renewal_reminders FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.subscription_renewal_reminders TO service_role;
CREATE INDEX subscription_reminder_pending ON public.subscription_renewal_reminders(available_at,due_at,id) WHERE status='pending';
CREATE INDEX subscription_reminder_leases ON public.subscription_renewal_reminders(lease_until) WHERE status IN('leased','dispatching');

CREATE FUNCTION public.claim_subscription_renewal_reminders(p_limit int DEFAULT 20) RETURNS SETOF public.subscription_renewal_reminders
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 -- A crashed sender may already have submitted its POST; never resend an unknown outcome.
 UPDATE public.subscription_renewal_reminders SET status='unknown',last_error='dispatch_outcome_unknown',lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE status='dispatching' AND lease_until<=now();
 UPDATE public.subscription_renewal_reminders SET status='cancelled',last_error='deadline_or_recipient_changed',lease_token=NULL,lease_until=NULL,updated_at=now()
 WHERE status IN('pending','leased') AND(valid_until<=now() OR NOT EXISTS(
 SELECT 1 FROM subscription_reminders_private.deadlines d WHERE d.cafe_id=subscription_renewal_reminders.cafe_id AND d.expires_at=subscription_renewal_reminders.expires_at
 AND d.owner_id=subscription_renewal_reminders.owner_id AND d.phone=subscription_renewal_reminders.phone));
 UPDATE public.subscription_renewal_reminders SET status='pending',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE status='leased' AND lease_until<=now();
 INSERT INTO public.subscription_renewal_reminders(cafe_id,owner_id,expires_at,hours_before,due_at,valid_until,phone,brand_name)
 SELECT d.cafe_id,d.owner_id,d.expires_at,h.hours,d.expires_at-make_interval(hours=>h.hours),d.expires_at-make_interval(hours=>h.hours)+interval '30 minutes',d.phone,d.brand_name
 FROM subscription_reminders_private.deadlines d CROSS JOIN(VALUES(24),(12)) h(hours)
 WHERE d.phone IS NOT NULL AND d.expires_at-make_interval(hours=>h.hours)<=now()
 AND d.expires_at-make_interval(hours=>h.hours)+interval '30 minutes'>now()
 ON CONFLICT(cafe_id,expires_at,hours_before) DO NOTHING;
 RETURN QUERY WITH picked AS (
 SELECT id FROM public.subscription_renewal_reminders WHERE status='pending' AND available_at<=now() AND due_at<=now() AND valid_until>now()
 ORDER BY due_at,id LIMIT greatest(1,least(coalesce(p_limit,20),20)) FOR UPDATE SKIP LOCKED
 ) UPDATE public.subscription_renewal_reminders j SET status='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
 FROM picked WHERE j.id=picked.id RETURNING j.*;
END $$;

CREATE FUNCTION public.authorize_subscription_renewal_reminder(p_id uuid,p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.subscription_renewal_reminders;
BEGIN
 SELECT * INTO j FROM public.subscription_renewal_reminders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.status<>'leased' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() THEN RETURN false;END IF;
 IF j.valid_until<=now() OR NOT EXISTS(SELECT 1 FROM subscription_reminders_private.deadlines d WHERE d.cafe_id=j.cafe_id AND d.expires_at=j.expires_at AND d.owner_id=j.owner_id AND d.phone=j.phone) THEN
 UPDATE public.subscription_renewal_reminders SET status='cancelled',last_error='deadline_or_recipient_changed',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;RETURN false;END IF;
 UPDATE public.subscription_renewal_reminders SET status='dispatching',attempts=attempts+1,updated_at=now() WHERE id=j.id;
 RETURN true;
END $$;

CREATE FUNCTION public.finish_subscription_renewal_reminder(p_id uuid,p_token uuid,p_outcome text,p_provider_id text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.subscription_renewal_reminders; next_status text;
BEGIN
 IF p_outcome NOT IN('queued','rejected','unknown','not_sent') OR p_outcome IS NULL THEN RAISE EXCEPTION 'Invalid reminder outcome';END IF;
 IF p_outcome='queued' AND(nullif(p_provider_id,'') IS NULL OR length(p_provider_id)>200) THEN RAISE EXCEPTION 'Missing provider acknowledgement';END IF;
 SELECT * INTO j FROM public.subscription_renewal_reminders WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR j.lease_token IS DISTINCT FROM p_token OR NOT(j.status='dispatching' OR(j.status='leased' AND p_outcome='not_sent')) THEN RETURN false;END IF;
 next_status:=CASE WHEN p_outcome IN('queued','unknown') THEN p_outcome
 WHEN j.valid_until<=now() THEN 'cancelled' WHEN p_outcome='not_sent' OR j.attempts<3 THEN 'pending' ELSE 'failed' END;
 UPDATE public.subscription_renewal_reminders SET status=next_status,
 attempts=CASE WHEN p_outcome='not_sent' AND j.status='dispatching' THEN greatest(0,attempts-1) ELSE attempts END,
 available_at=now()+CASE WHEN p_outcome='not_sent' THEN interval '1 minute' ELSE interval '5 minutes' END,
 provider_message_id=CASE WHEN p_outcome='queued' THEN p_provider_id ELSE NULL END,
 last_error=CASE WHEN p_outcome='queued' THEN NULL ELSE p_outcome END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=j.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_subscription_renewal_reminders(int),public.authorize_subscription_renewal_reminder(uuid,uuid),public.finish_subscription_renewal_reminder(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_subscription_renewal_reminders(int),public.authorize_subscription_renewal_reminder(uuid,uuid),public.finish_subscription_renewal_reminder(uuid,uuid,text,text) TO service_role;
COMMIT;
