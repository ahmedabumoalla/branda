BEGIN;
CREATE SCHEMA platform_messaging_private;
REVOKE ALL ON SCHEMA platform_messaging_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA platform_messaging_private TO service_role;
CREATE TABLE platform_messaging_private.policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 backup_only boolean NOT NULL DEFAULT true,
 pager_enrollment_enabled boolean NOT NULL DEFAULT false,
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE platform_messaging_private.policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_messaging_private.policy FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO platform_messaging_private.policy(singleton) VALUES(true);
CREATE FUNCTION public.platform_messaging_policy() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('backupOnly',backup_only,'pagerEnrollmentEnabled',pager_enrollment_enabled AND NOT backup_only)
 FROM platform_messaging_private.policy WHERE singleton;
$$;
REVOKE ALL ON FUNCTION public.platform_messaging_policy() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_messaging_policy() TO service_role;
CREATE FUNCTION platform_messaging_private.ready_limit() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN backup_only THEN 1 ELSE 2 END FROM platform_messaging_private.policy WHERE singleton;
$$;
REVOKE ALL ON FUNCTION platform_messaging_private.ready_limit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform_messaging_private.ready_limit() TO service_role;
-- Suppressed work is terminal, never deferred until the primary reconnects.
CREATE FUNCTION platform_messaging_private.suppress_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb:=to_jsonb(NEW); patch jsonb; field text;
BEGIN
 IF NOT (SELECT backup_only FROM platform_messaging_private.policy WHERE singleton) THEN RETURN NEW; END IF;
 IF row_data->>TG_ARGV[0] NOT IN ('pending','processing','dispatching','leased','queued','sending','scheduled') THEN RETURN NEW; END IF;
 patch:=jsonb_build_object(TG_ARGV[0],TG_ARGV[1]);
 FOREACH field IN ARRAY ARRAY['lease_token','lease_until','claim_token'] LOOP
  IF row_data ? field THEN patch:=patch||jsonb_build_object(field,NULL); END IF;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['finished_at','completed_at','updated_at'] LOOP
  IF row_data ? field THEN patch:=patch||jsonb_build_object(field,clock_timestamp()); END IF;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['error_code','last_error','error'] LOOP
  IF row_data ? field THEN patch:=patch||jsonb_build_object(field,'temporary_backup_mode'); END IF;
 END LOOP;
 NEW:=jsonb_populate_record(NEW,patch);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_messaging_private.suppress_job() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER temporary_backup_suppress BEFORE INSERT OR UPDATE ON loyalty_audit_private.wallet_welcomes FOR EACH ROW EXECUTE FUNCTION platform_messaging_private.suppress_job('status','expired');
UPDATE loyalty_audit_private.wallet_welcomes SET status=status WHERE status IN ('pending','processing','dispatching','leased');
CREATE TRIGGER temporary_backup_suppress BEFORE INSERT OR UPDATE ON loyalty_read_private.card_link_jobs FOR EACH ROW EXECUTE FUNCTION platform_messaging_private.suppress_job('status','expired');
UPDATE loyalty_read_private.card_link_jobs SET status=status WHERE status IN ('pending','processing','dispatching','leased');
CREATE TRIGGER temporary_backup_suppress BEFORE INSERT OR UPDATE ON public.bf_customer_message_jobs FOR EACH ROW EXECUTE FUNCTION platform_messaging_private.suppress_job('state','cancelled');
UPDATE public.bf_customer_message_jobs SET state=state WHERE state IN ('pending','processing','dispatching','leased');
CREATE TRIGGER temporary_backup_suppress BEFORE INSERT OR UPDATE ON public.bf_shift_cash_alerts FOR EACH ROW EXECUTE FUNCTION platform_messaging_private.suppress_job('status','rejected');
UPDATE public.bf_shift_cash_alerts SET status=status WHERE status IN ('pending','processing','dispatching','leased');
CREATE TRIGGER temporary_backup_suppress BEFORE INSERT OR UPDATE ON public.salon_message_jobs FOR EACH ROW EXECUTE FUNCTION platform_messaging_private.suppress_job('state','cancelled');
UPDATE public.salon_message_jobs SET state=state WHERE state IN ('pending','processing','dispatching','leased');
CREATE TRIGGER temporary_backup_suppress BEFORE INSERT OR UPDATE ON public.platform_marketing_recipients FOR EACH ROW EXECUTE FUNCTION platform_messaging_private.suppress_job('status','suppressed');
UPDATE public.platform_marketing_recipients SET status=status WHERE status IN ('pending','processing','dispatching','leased','queued');
UPDATE public.platform_marketing_campaigns SET status='cancelled',updated_at=clock_timestamp() WHERE status IN('queued','sending','scheduled');
UPDATE loyalty_read_private.operations o SET invitation_status=j.status FROM loyalty_read_private.card_link_jobs j WHERE o.invitation_job_id=j.id AND j.status='expired';
UPDATE phone_otp_delivery_private.deliveries SET status='expired',encrypted_payload=NULL,lease_token=NULL,completed_at=clock_timestamp() WHERE status IN('pending','processing');
UPDATE public.pager_message_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,last_error='backup_cutover_cancelled',updated_at=clock_timestamp() WHERE state IN('pending','leased','dispatching');
CREATE OR REPLACE FUNCTION public.pager_claim_messages(p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid,order_id uuid,cafe_id uuid,phone text,brand_name text,invoice_number text,kind text,lease_token uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RETURN QUERY WITH picked AS (
    SELECT j.id FROM public.pager_message_jobs j JOIN public.pager_orders o ON o.id=j.order_id
    WHERE ((j.state='pending' AND j.due_at<=now()) OR (j.state IN ('leased','dispatching') AND j.lease_until<now()))
      AND ((j.kind='ready' AND o.status='ready' AND o.message_count<platform_messaging_private.ready_limit()) OR (j.kind='rating' AND o.status='received' AND o.rating IS NULL))
      AND (j.kind<>'ready' OR o.last_message_at IS NULL OR o.last_message_at<=now()-interval '55 seconds')
      AND pager_private.enabled(j.cafe_id)
    ORDER BY j.due_at,j.id LIMIT greatest(1,least(coalesce(p_limit,20),100)) FOR UPDATE OF j SKIP LOCKED
  ), claimed AS (
    UPDATE public.pager_message_jobs j SET state='leased',lease_token=gen_random_uuid(),lease_until=now()+interval '90 seconds',updated_at=now()
      FROM picked WHERE j.id=picked.id RETURNING j.*
  ) SELECT j.id,j.order_id,j.cafe_id,o.phone,c.name,o.invoice_number,j.kind,j.lease_token
      FROM claimed j JOIN public.pager_orders o ON o.id=j.order_id JOIN public.cafes c ON c.id=j.cafe_id;
END $$;

-- Final state/entitlement check immediately before the external provider call
-- Once HTTP is in flight its delivery cannot be recalled; receipt cancels all future work
CREATE OR REPLACE FUNCTION public.pager_authorize_dispatch(p_job uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.pager_message_jobs; o public.pager_orders;
BEGIN
  SELECT * INTO j FROM public.pager_message_jobs WHERE id=p_job;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO o FROM public.pager_orders WHERE id=j.order_id FOR UPDATE;
  SELECT * INTO j FROM public.pager_message_jobs WHERE id=p_job FOR UPDATE;
  IF j.lease_token IS DISTINCT FROM p_lease OR j.state<>'leased' OR j.lease_until<=now() THEN RETURN false; END IF;
  IF j.kind='ready' AND o.message_count>=platform_messaging_private.ready_limit() THEN
    UPDATE public.pager_message_jobs SET state='done',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_job;
    RETURN false;
  END IF;
  IF j.kind='ready' AND o.last_message_at>now()-interval '55 seconds' THEN RETURN false; END IF;
  IF NOT pager_private.enabled(j.cafe_id) OR NOT ((j.kind='ready' AND o.status='ready' AND o.message_count<platform_messaging_private.ready_limit()) OR (j.kind='rating' AND o.status='received' AND o.rating IS NULL)) THEN
    UPDATE public.pager_message_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_job;
    RETURN false;
  END IF;
  UPDATE public.pager_message_jobs SET state='dispatching',attempts=attempts+1,updated_at=now() WHERE id=p_job;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.pager_finish_message(p_job uuid,p_lease uuid,p_provider_id text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.pager_message_jobs; o public.pager_orders; good boolean;
BEGIN
  SELECT * INTO j FROM public.pager_message_jobs WHERE id=p_job;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO o FROM public.pager_orders WHERE id=j.order_id FOR UPDATE;
  SELECT * INTO j FROM public.pager_message_jobs WHERE id=p_job FOR UPDATE;
  IF j.lease_token IS DISTINCT FROM p_lease OR j.state<>'dispatching' THEN RETURN false; END IF;
  good := p_error IS NULL AND nullif(p_provider_id,'') IS NOT NULL;
  INSERT INTO public.pager_message_attempts(job_id,order_id,cafe_id,kind,status,provider_id,error_code)
  VALUES(j.id,j.order_id,j.cafe_id,j.kind,CASE WHEN good THEN 'provider_queued' ELSE 'failed' END,
    CASE WHEN good THEN left(p_provider_id,200) END,CASE WHEN NOT good THEN left(coalesce(p_error,'provider_missing_id'),100) END);
  UPDATE public.pager_orders SET message_status=CASE WHEN good THEN 'provider_queued' ELSE 'failed' END,
    last_message_at=now(),message_count=message_count+CASE WHEN good THEN 1 ELSE 0 END WHERE id=o.id;
  UPDATE public.pager_message_jobs SET state=CASE
      WHEN NOT pager_private.enabled(j.cafe_id) OR (j.kind='ready' AND o.status<>'ready') OR (j.kind='rating' AND (o.status<>'received' OR o.rating IS NOT NULL)) THEN 'cancelled'
      WHEN j.kind='rating' AND good THEN 'done'
      WHEN j.kind='ready' AND o.message_count + CASE WHEN good THEN 1 ELSE 0 END >= platform_messaging_private.ready_limit() THEN 'done'
      ELSE 'pending' END,
    -- Preserve the scheduled minute cadence instead of adding provider latency
    -- to every interval Skip missed slots rather than replaying a backlog
    due_at=CASE WHEN good THEN j.due_at + interval '60 seconds' *
        greatest(1,floor(extract(epoch FROM now()-j.due_at)/60)+1)
      ELSE now()+make_interval(secs=>least(900,60*power(2,least(j.failures,4)))::integer) END,
    failures=CASE WHEN good THEN 0 ELSE failures+1 END,provider_id=CASE WHEN good THEN left(p_provider_id,200) ELSE provider_id END,
    last_error=CASE WHEN good THEN NULL ELSE left(coalesce(p_error,'provider_missing_id'),100) END,
    lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_job;
  RETURN true;
END $$;

COMMIT;
