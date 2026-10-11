BEGIN;
CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid, p_feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p_feature IN ('menu','offers','loyalty','settings','pager')
    AND EXISTS (
      SELECT 1 FROM (
        SELECT p.features, p.active, s.started_at, s.expires_at
        FROM public.subscriptions s JOIN public.platform_plans p ON p.id=s.plan_id
        WHERE s.cafe_id=p_cafe_id AND s.status IN ('active','trialing')
        ORDER BY s.created_at DESC LIMIT 1
      ) plan
      WHERE plan.active AND (plan.started_at IS NULL OR plan.started_at<=now()) AND (plan.expires_at IS NULL OR plan.expires_at>now())
        AND (plan.features ? p_feature OR plan.features ? 'all')
    )
    AND NOT EXISTS (SELECT 1 FROM public.brand_feature_overrides o
      WHERE o.cafe_id=p_cafe_id AND o.feature_id=p_feature AND NOT o.enabled);
$$;
REVOKE ALL ON FUNCTION platform_access_private.service_enabled(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_access_private.service_enabled(uuid,text) TO anon,authenticated,service_role;
CREATE SCHEMA pager_private;
REVOKE ALL ON SCHEMA pager_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA pager_private TO service_role;

CREATE FUNCTION pager_private.enabled(p_cafe uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS (SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active')
    AND EXISTS (
      SELECT 1 FROM (
        SELECT p.features,p.active,s.started_at,s.expires_at FROM public.subscriptions s
        JOIN public.platform_plans p ON p.id=s.plan_id
        WHERE s.cafe_id=p_cafe AND s.status IN ('active','trialing') ORDER BY s.created_at DESC LIMIT 1
      ) p WHERE p.active AND (p.started_at IS NULL OR p.started_at<=now()) AND (p.expires_at IS NULL OR p.expires_at>now())
        AND (p.features ? 'pager' OR p.features ? 'all')
    ) AND NOT EXISTS (SELECT 1 FROM public.brand_feature_overrides WHERE cafe_id=p_cafe AND feature_id='pager' AND NOT enabled)
$$;
REVOKE ALL ON FUNCTION pager_private.enabled(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pager_private.enabled(uuid) TO service_role;

CREATE TABLE public.pager_orders (
  id uuid PRIMARY KEY, cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  invoice_number text NOT NULL CHECK(length(invoice_number) BETWEEN 1 AND 120 AND length(btrim(invoice_number))>0),
  phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
  status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','ready','received','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz, received_at timestamptz, cancelled_at timestamptz,
  created_by text NOT NULL, created_station text NOT NULL, creator_id uuid,
  called_by text, called_station text, caller_id uuid, received_by text,
  feedback_hash text NOT NULL UNIQUE CHECK(feedback_hash ~ '^[0-9a-f]{64}$'),
  rating integer CHECK(rating BETWEEN 1 AND 5), notes text NOT NULL DEFAULT '' CHECK(length(notes)<=1000), rated_at timestamptz,
  message_status text CHECK(message_status IN ('pending','provider_queued','failed')),
  last_message_at timestamptz, message_count integer NOT NULL DEFAULT 0,
  UNIQUE(id,cafe_id), CHECK((rating IS NULL)=(rated_at IS NULL))
);
CREATE UNIQUE INDEX pager_active_invoice ON public.pager_orders(cafe_id,invoice_number) WHERE status IN ('waiting','ready');
CREATE INDEX pager_cafe_history ON public.pager_orders(cafe_id,created_at DESC,id DESC);
CREATE INDEX pager_cafe_queue ON public.pager_orders(cafe_id,status,created_at DESC);

CREATE TABLE public.pager_message_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, cafe_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('ready','rating')),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','dispatching','done','cancelled')),
  due_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
  last_error text, provider_id text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,kind), FOREIGN KEY(order_id,cafe_id) REFERENCES public.pager_orders(id,cafe_id)
);
CREATE INDEX pager_due_jobs ON public.pager_message_jobs(due_at,id) WHERE state IN ('pending','leased','dispatching');
CREATE INDEX pager_jobs_tenant ON public.pager_message_jobs(cafe_id,order_id);

CREATE TABLE public.pager_message_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.pager_message_jobs(id), order_id uuid NOT NULL REFERENCES public.pager_orders(id),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id), kind text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL CHECK(status IN ('provider_queued','failed')),
  provider_id text, error_code text
);
CREATE INDEX pager_attempts_order ON public.pager_message_attempts(cafe_id,order_id,attempted_at DESC);
ALTER TABLE public.pager_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_message_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pager_message_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pager_orders,public.pager_message_jobs,public.pager_message_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.pager_orders,public.pager_message_jobs,public.pager_message_attempts TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.pager_message_attempts_id_seq TO service_role;

-- Every exposed RPC is service-role only; authenticated owner/staff/admin context
-- is established in the server boundary before selecting the tenant and actor
CREATE FUNCTION public.pager_create_order(p_id uuid,p_cafe uuid,p_invoice text,p_phone text,p_actor text,p_station text,p_actor_id uuid,p_feedback_hash text)
RETURNS public.pager_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.pager_orders;
BEGIN
  IF NOT pager_private.enabled(p_cafe) THEN RAISE EXCEPTION 'Pager service unavailable' USING ERRCODE='42501'; END IF;
  IF p_invoice IS NULL OR length(p_invoice)>120 OR length(btrim(p_invoice))=0 OR p_phone !~ '^9665[0-9]{8}$'
    OR length(p_actor)>200 OR length(p_station)>100 THEN RAISE EXCEPTION 'Invalid pager order'; END IF;
  INSERT INTO public.pager_orders(id,cafe_id,invoice_number,phone,created_by,created_station,creator_id,feedback_hash)
  VALUES(p_id,p_cafe,p_invoice,p_phone,p_actor,p_station,p_actor_id,p_feedback_hash) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v FROM public.pager_orders WHERE id=p_id AND cafe_id=p_cafe;
  IF NOT FOUND OR v.invoice_number IS DISTINCT FROM p_invoice OR v.phone IS DISTINCT FROM p_phone
    THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
  RETURN v;
END $$;

CREATE FUNCTION public.pager_transition_order(p_cafe uuid,p_order uuid,p_status text,p_actor text,p_station text,p_actor_id uuid)
RETURNS public.pager_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.pager_orders;
BEGIN
  IF NOT pager_private.enabled(p_cafe) THEN RAISE EXCEPTION 'Pager service unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.pager_orders WHERE id=p_order AND cafe_id=p_cafe FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_status NOT IN ('ready','received','cancelled') OR p_status IS NULL THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v.status=p_status THEN RETURN v; END IF;
  IF v.status IN ('received','cancelled') OR (p_status='received' AND v.status<>'ready')
    THEN RAISE EXCEPTION 'Order status changed'; END IF;
  UPDATE public.pager_orders SET status=p_status,
    ready_at=CASE WHEN p_status='ready' THEN now() ELSE ready_at END,
    received_at=CASE WHEN p_status='received' THEN now() ELSE received_at END,
    cancelled_at=CASE WHEN p_status='cancelled' THEN now() ELSE cancelled_at END,
    called_by=CASE WHEN p_status='ready' THEN p_actor ELSE called_by END,
    called_station=CASE WHEN p_status='ready' THEN p_station ELSE called_station END,
    caller_id=CASE WHEN p_status='ready' THEN p_actor_id ELSE caller_id END,
    received_by=CASE WHEN p_status='received' THEN p_actor ELSE received_by END,
    message_status=CASE WHEN p_status IN ('ready','received') THEN 'pending' ELSE message_status END
    WHERE id=p_order RETURNING * INTO v;
  IF p_status='ready' THEN
    INSERT INTO public.pager_message_jobs(order_id,cafe_id,kind) VALUES(p_order,p_cafe,'ready') ON CONFLICT(order_id,kind) DO NOTHING;
  ELSE
    UPDATE public.pager_message_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now()
      WHERE order_id=p_order AND kind='ready' AND state NOT IN ('done','cancelled');
    IF p_status='received' THEN
      INSERT INTO public.pager_message_jobs(order_id,cafe_id,kind) VALUES(p_order,p_cafe,'rating') ON CONFLICT(order_id,kind) DO NOTHING;
    END IF;
  END IF;
  RETURN v;
END $$;

CREATE FUNCTION public.pager_claim_messages(p_limit integer DEFAULT 20)
RETURNS TABLE(id uuid,order_id uuid,cafe_id uuid,phone text,brand_name text,invoice_number text,kind text,lease_token uuid)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RETURN QUERY WITH picked AS (
    SELECT j.id FROM public.pager_message_jobs j JOIN public.pager_orders o ON o.id=j.order_id
    WHERE ((j.state='pending' AND j.due_at<=now()) OR (j.state IN ('leased','dispatching') AND j.lease_until<now()))
      AND ((j.kind='ready' AND o.status='ready') OR (j.kind='rating' AND o.status='received' AND o.rating IS NULL))
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
CREATE FUNCTION public.pager_authorize_dispatch(p_job uuid,p_lease uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.pager_message_jobs; o public.pager_orders;
BEGIN
  SELECT * INTO j FROM public.pager_message_jobs WHERE id=p_job;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO o FROM public.pager_orders WHERE id=j.order_id FOR UPDATE;
  SELECT * INTO j FROM public.pager_message_jobs WHERE id=p_job FOR UPDATE;
  IF j.lease_token IS DISTINCT FROM p_lease OR j.state<>'leased' OR j.lease_until<=now() THEN RETURN false; END IF;
  IF j.kind='ready' AND o.last_message_at>now()-interval '55 seconds' THEN RETURN false; END IF;
  IF NOT pager_private.enabled(j.cafe_id) OR NOT ((j.kind='ready' AND o.status='ready') OR (j.kind='rating' AND o.status='received' AND o.rating IS NULL)) THEN
    UPDATE public.pager_message_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=p_job;
    RETURN false;
  END IF;
  UPDATE public.pager_message_jobs SET state='dispatching',attempts=attempts+1,updated_at=now() WHERE id=p_job;
  RETURN true;
END $$;

CREATE FUNCTION public.pager_finish_message(p_job uuid,p_lease uuid,p_provider_id text DEFAULT NULL,p_error text DEFAULT NULL)
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
      WHEN j.kind='rating' AND good THEN 'done' ELSE 'pending' END,
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

CREATE FUNCTION public.pager_submit_feedback(p_hash text,p_rating integer,p_notes text DEFAULT '') RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.pager_orders;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5
    OR p_notes IS NULL OR length(p_notes)>1000 THEN RAISE EXCEPTION 'Invalid feedback'; END IF;
  SELECT * INTO v FROM public.pager_orders WHERE feedback_hash=p_hash AND status='received' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v.rating IS NOT NULL THEN RETURN v.rating=p_rating AND v.notes=p_notes; END IF;
  UPDATE public.pager_orders SET rating=p_rating,notes=p_notes,rated_at=now() WHERE id=v.id;
  UPDATE public.pager_message_jobs SET state='cancelled',lease_token=NULL,lease_until=NULL,updated_at=now()
    WHERE order_id=v.id AND kind='rating' AND state NOT IN ('done','cancelled');
  RETURN true;
END $$;

CREATE FUNCTION public.pager_metrics(p_cafe uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('total',count(*),'waiting',count(*) FILTER(WHERE status='waiting'),
    'ready',count(*) FILTER(WHERE status='ready'),'received',count(*) FILTER(WHERE status='received'),
    'cancelled',count(*) FILTER(WHERE status='cancelled'),
    'averagePreparationSeconds',avg(extract(epoch FROM ready_at-created_at)) FILTER(WHERE ready_at IS NOT NULL),
    'averageCollectionSeconds',avg(extract(epoch FROM received_at-ready_at)) FILTER(WHERE received_at IS NOT NULL),
    'averageRating',avg(rating),'ratedCount',count(rating)) FROM public.pager_orders WHERE cafe_id=p_cafe
$$;

REVOKE ALL ON FUNCTION public.pager_create_order(uuid,uuid,text,text,text,text,uuid,text),
 public.pager_transition_order(uuid,uuid,text,text,text,uuid),public.pager_claim_messages(integer),
 public.pager_authorize_dispatch(uuid,uuid),public.pager_finish_message(uuid,uuid,text,text),
 public.pager_submit_feedback(text,integer,text),public.pager_metrics(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_create_order(uuid,uuid,text,text,text,text,uuid,text),
 public.pager_transition_order(uuid,uuid,text,text,text,uuid),public.pager_claim_messages(integer),
 public.pager_authorize_dispatch(uuid,uuid),public.pager_finish_message(uuid,uuid,text,text),
 public.pager_submit_feedback(text,integer,text),public.pager_metrics(uuid) TO service_role;
CREATE FUNCTION public.pager_get_page(p_cafe uuid,p_page integer DEFAULT 0,p_status text DEFAULT 'active',p_query text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE v_total bigint; v_orders jsonb;
BEGIN
  IF p_page IS NULL OR p_page<0 OR p_page>100000 OR p_status IS NULL OR p_status NOT IN ('all','active','waiting','ready','received','cancelled')
    OR p_query IS NULL OR length(p_query)>120 THEN RAISE EXCEPTION 'Invalid filter'; END IF;
  SELECT count(*) INTO v_total FROM public.pager_orders o WHERE o.cafe_id=p_cafe
    AND (p_status='all' OR (p_status='active' AND o.status IN ('waiting','ready')) OR o.status=p_status)
    AND (p_query='' OR position(lower(p_query) IN lower(o.invoice_number))>0 OR position(p_query IN o.phone)>0);
  SELECT coalesce(jsonb_agg(to_jsonb(items)),'[]'::jsonb) INTO v_orders FROM (
    SELECT o.id,o.cafe_id,o.invoice_number,o.phone,o.status,o.created_at,o.ready_at,o.received_at,
      o.created_by,o.created_station,o.called_by,o.called_station,o.rating,o.notes,o.rated_at,
      o.message_status,o.last_message_at,o.message_count
    FROM public.pager_orders o WHERE o.cafe_id=p_cafe
      AND (p_status='all' OR (p_status='active' AND o.status IN ('waiting','ready')) OR o.status=p_status)
      AND (p_query='' OR position(lower(p_query) IN lower(o.invoice_number))>0 OR position(p_query IN o.phone)>0)
    ORDER BY o.created_at DESC,o.id DESC LIMIT 30 OFFSET p_page*30
  ) items;
  RETURN jsonb_build_object('orders',v_orders,'total',v_total,'page',p_page,'pageSize',30,'metrics',public.pager_metrics(p_cafe));
END $$;
REVOKE ALL ON FUNCTION public.pager_get_page(uuid,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_get_page(uuid,integer,text,text) TO service_role;
COMMIT;
