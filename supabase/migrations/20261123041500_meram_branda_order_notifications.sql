BEGIN;
SET LOCAL lock_timeout = '5s';

-- The worker resolves Branda's verified notifications number before claiming a job.
DROP FUNCTION public.meram_order_notice_claim(uuid,text,text);
CREATE FUNCTION public.meram_order_notice_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  meram constant uuid := '98fd33d5-522d-46e7-adeb-34b04a665f4f';
  job public.gift_orders%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cafes c WHERE c.id = meram AND c.deleted_at IS NULL
      AND c.status IN ('active','published') AND public.brand_account_not_cancelled(c.id)
      AND platform_access_private.service_enabled(c.id,'menu')
  ) THEN RETURN NULL; END IF;

  UPDATE public.gift_orders SET rejection_notice_status = 'dispatching',
    rejection_notice_attempt = gen_random_uuid(), rejection_notice_started = clock_timestamp()
  WHERE id = (
    SELECT o.id FROM public.gift_orders o WHERE o.cafe_id = meram AND o.status = 'cancelled'
      AND o.rejection_notice_status = 'pending'
    ORDER BY o.updated_at,o.id LIMIT 1 FOR UPDATE SKIP LOCKED
  ) RETURNING * INTO job;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id',job.id,'attempt',job.rejection_notice_attempt,
    'number',job.number,'customerPhone',job.phone,'reason',job.rejection_reason);
END $$;
REVOKE ALL ON FUNCTION public.meram_order_notice_claim() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meram_order_notice_claim() TO service_role;

-- Retire the Meram-only opt-in introduced with the order workflow.
DO $$
DECLARE
  definition text := pg_get_functiondef('public.loco_whatsapp_actor_allowed(uuid,uuid)'::regprocedure);
  old_list text := $list$'8dbf85ba-df8f-4218-bc6f-9d2b39e937ef'::uuid,'98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid)$list$;
BEGIN
  IF strpos(definition,old_list) = 0 THEN RAISE EXCEPTION 'Review current brand sender permissions'; END IF;
  EXECUTE replace(definition,old_list,$list$'8dbf85ba-df8f-4218-bc6f-9d2b39e937ef'::uuid)$list$);
END $$;
ALTER TABLE public.brand_marketing_connections DROP CONSTRAINT brand_marketing_transactional_supported_brand;
ALTER TABLE public.brand_marketing_connections ADD CONSTRAINT brand_marketing_transactional_supported_brand CHECK (
  transactional_requested_at IS NULL OR cafe_id IN ('321fd305-1883-48df-ab69-829cf7d1bc48','8dbf85ba-df8f-4218-bc6f-9d2b39e937ef')
);
NOTIFY pgrst,'reload schema';
COMMIT;
