BEGIN;
SET LOCAL lock_timeout = '5s';

-- The original gift order is the only order, price, reservation and financial identity.
INSERT INTO public.gift_store_settings(cafe_id,enabled,delivery_enabled,pickup_enabled,delivery_fee,payment_methods,delivery_notes)
SELECT id,true,true,false,0,ARRAY['bank_transfer'],'يؤكد فريق ميرام رسوم التوصيل حسب الموقع قبل الدفع'
FROM public.cafes WHERE id='98fd33d5-522d-46e7-adeb-34b04a665f4f' AND slug='brand-5fbb1397e4c4' AND business_category='gifts_flowers'
ON CONFLICT(cafe_id) DO NOTHING;

ALTER TABLE public.gift_orders
  ADD COLUMN rejection_reason text CHECK (length(rejection_reason) BETWEEN 3 AND 1000),
  ADD COLUMN rejection_notice_status text CHECK (rejection_notice_status IN ('pending','dispatching','sent','unknown','failed')),
  ADD COLUMN rejection_notice_attempt uuid,
  ADD COLUMN rejection_notice_started timestamptz;
CREATE INDEX gift_meram_pending_notice ON public.gift_orders(updated_at,id) WHERE rejection_notice_status='pending';
CREATE INDEX gift_meram_inflight_notice ON public.gift_orders(rejection_notice_started) WHERE rejection_notice_status='dispatching';

-- Private sender opt-in through the existing verified, owner-only connection editor.
ALTER TABLE public.brand_marketing_connections DROP CONSTRAINT brand_marketing_transactional_supported_brand;
ALTER TABLE public.brand_marketing_connections ADD CONSTRAINT brand_marketing_transactional_supported_brand CHECK (
  transactional_requested_at IS NULL OR cafe_id IN ('321fd305-1883-48df-ab69-829cf7d1bc48','8dbf85ba-df8f-4218-bc6f-9d2b39e937ef','98fd33d5-522d-46e7-adeb-34b04a665f4f')
);

-- Take catalog stock on manual delivery. A later financial settlement for this delivered order
-- still writes its original accounting/inventory ledger and skips the second catalog deduction.
CREATE FUNCTION gift_commerce_private.meram_deliver_stock(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  meram constant uuid := '98fd33d5-522d-46e7-adeb-34b04a665f4f';
  line record; details jsonb; stock integer; position integer;
BEGIN
  FOR line IN SELECT product_id,option_id,quantity FROM public.gift_order_lines
    WHERE cafe_id=meram AND order_id=p_order AND stock_tracked ORDER BY product_id,id LOOP
    SELECT commerce_details INTO details FROM public.menu_products WHERE cafe_id=meram AND id=line.product_id FOR UPDATE;
    IF line.option_id IS NULL THEN
      stock:=(details->>'stock')::integer;
    ELSE
      SELECT (ordinal-1)::integer,(opt->>'stock')::integer INTO position,stock
      FROM jsonb_array_elements(details->'options') WITH ORDINALITY options(opt,ordinal) WHERE opt->>'id'=line.option_id;
    END IF;
    IF stock IS NULL OR stock<line.quantity THEN RAISE EXCEPTION 'الكمية المتبقية لا تكفي لتسليم الطلب'; END IF;
    details:=jsonb_set(details,CASE WHEN line.option_id IS NULL THEN ARRAY['stock'] ELSE ARRAY['options',position::text,'stock'] END,to_jsonb(stock-line.quantity));
    UPDATE public.menu_products SET commerce_details=details,updated_at=now() WHERE cafe_id=meram AND id=line.product_id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION gift_commerce_private.meram_deliver_stock(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Patch narrow verified anchors to retain the current grants, caller authorization, VAT,
-- components and checkout attachments from all intervening migrations.
CREATE FUNCTION pg_temp.meram_edit(fn regprocedure, before_text text, after_text text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE definition text := replace(pg_get_functiondef(fn),chr(13),'');
BEGIN
  IF (length(definition)-length(replace(definition,before_text,'')))/length(before_text)<>1 THEN
    RAISE EXCEPTION 'Review changed Meram migration anchor in %',fn;
  END IF;
  EXECUTE replace(definition,before_text,after_text);
END $$;
SELECT pg_temp.meram_edit('public.loco_whatsapp_actor_allowed(uuid,uuid)',
  $old$'8dbf85ba-df8f-4218-bc6f-9d2b39e937ef'::uuid)$old$,
  $new$'8dbf85ba-df8f-4218-bc6f-9d2b39e937ef'::uuid,'98fd33d5-522d-46e7-adeb-34b04a665f4f'::uuid)$new$);
SELECT pg_temp.meram_edit('public.gift_order_manage(uuid,uuid,uuid,text,jsonb)',
  $old$ELSIF p_action='complete' AND o.status IN('accepted','preparing','ready') AND o.payment_status='paid' THEN$old$,
  $new$ELSIF p_action='complete' AND p_cafe='98fd33d5-522d-46e7-adeb-34b04a665f4f' AND o.status IN('accepted','preparing','ready') AND o.payment_status='unpaid' THEN
    PERFORM gift_commerce_private.meram_deliver_stock(o.id);
    new_status:='completed';
  ELSIF p_action='complete' AND o.status IN('accepted','preparing','ready') AND o.payment_status='paid' THEN$new$);
SELECT pg_temp.meram_edit('public.gift_order_manage(uuid,uuid,uuid,text,jsonb)',
  $old$IF l.stock_tracked THEN$old$,
  $new$IF l.stock_tracked AND NOT (p_cafe='98fd33d5-522d-46e7-adeb-34b04a665f4f' AND o.status='completed') THEN$new$);
SELECT pg_temp.meram_edit('public.gift_order_submit(text,uuid,jsonb,text)',
  $old$x.status NOT IN('cancelled','refunded')$old$,
  $new$x.status NOT IN('cancelled','refunded') AND NOT (x.cafe_id='98fd33d5-522d-46e7-adeb-34b04a665f4f' AND x.status='completed')$new$);
SELECT pg_temp.meram_edit('public.gift_order_manage(uuid,uuid,uuid,text,jsonb)',
  $old$new_status:='cancelled';$old$,
  $new$new_status:='cancelled';
    IF p_cafe='98fd33d5-522d-46e7-adeb-34b04a665f4f' THEN
      IF o.status NOT IN ('pending','quote_requested') THEN RAISE EXCEPTION 'لا يمكن رفض طلب بعد تأكيده'; END IF;
      UPDATE public.gift_orders SET rejection_reason=btrim(p_payload->>'note'),rejection_notice_status='pending'
        WHERE id=p_order AND cafe_id=p_cafe;
    END IF;$new$);
SELECT pg_temp.meram_edit('public.gift_order_track(text,uuid)',
  $old$'items',(SELECT jsonb_agg$old$,
  $new$'rejectionReason',o.rejection_reason,'items',(SELECT jsonb_agg$new$);
DROP FUNCTION pg_temp.meram_edit(regprocedure,text,text);

-- The private link exposes the rejection reason immediately. The same transaction enqueues
-- one proactive notice. This RPC only starts a send for the connected generation checked by the worker.
CREATE FUNCTION public.meram_order_notice_due() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- A worker may have died after its provider POST. Close the attempt as unknown
  -- without making it eligible to be sent again.
  UPDATE public.gift_orders SET rejection_notice_status='unknown'
    WHERE cafe_id='98fd33d5-522d-46e7-adeb-34b04a665f4f' AND rejection_notice_status='dispatching' AND rejection_notice_started<clock_timestamp()-interval '10 minutes';
  RETURN EXISTS(SELECT 1 FROM public.gift_orders o JOIN public.cafes c ON c.id=o.cafe_id
    WHERE o.cafe_id='98fd33d5-522d-46e7-adeb-34b04a665f4f' AND o.status='cancelled'
      AND o.rejection_notice_status='pending' AND c.deleted_at IS NULL AND c.status IN('active','published'));
END $$;
CREATE FUNCTION public.meram_order_notice_claim(p_generation uuid,p_phone text,p_instance text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  meram constant uuid := '98fd33d5-522d-46e7-adeb-34b04a665f4f';
  job public.gift_orders%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.brand_marketing_connections m JOIN public.cafes c ON c.id=m.cafe_id WHERE m.cafe_id=meram
    AND c.status IN('active','published') AND c.deleted_at IS NULL AND public.brand_account_not_cancelled(meram)
    AND platform_access_private.service_enabled(meram,'menu') AND m.transactional_requested_at IS NOT NULL AND m.status='connected' AND m.generation=p_generation
    AND m.instance_id=p_instance AND m.requested_phone=p_phone AND m.verified_phone=p_phone) THEN RETURN NULL; END IF;
  SELECT * INTO job FROM public.gift_orders WHERE cafe_id=meram AND status='cancelled' AND rejection_notice_status='pending'
    ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.gift_orders SET rejection_notice_status='dispatching',rejection_notice_attempt=gen_random_uuid(),rejection_notice_started=clock_timestamp()
    WHERE id=job.id RETURNING * INTO job;
  RETURN jsonb_build_object('id',job.id,'attempt',job.rejection_notice_attempt,'number',job.number,'customerPhone',job.phone,'reason',job.rejection_reason);
END $$;
CREATE FUNCTION public.meram_order_notice_finish(p_id uuid,p_attempt uuid,p_state text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_state IS NULL OR p_state NOT IN ('sent','failed','unknown') THEN RETURN false; END IF;
  UPDATE public.gift_orders SET rejection_notice_status=p_state WHERE cafe_id='98fd33d5-522d-46e7-adeb-34b04a665f4f'
    AND id=p_id AND rejection_notice_status='dispatching' AND rejection_notice_attempt=p_attempt;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.meram_order_notice_due(),public.meram_order_notice_claim(uuid,text,text),public.meram_order_notice_finish(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meram_order_notice_due(),public.meram_order_notice_claim(uuid,text,text),public.meram_order_notice_finish(uuid,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
