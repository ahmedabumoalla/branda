BEGIN;
-- Prepared only: activation requires primary mode AND an explicit enrollment switch.
CREATE FUNCTION pager_private.enroll_new_customer(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.pager_orders; member_id uuid; card public.loyalty_cards; result jsonb; staff_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_messaging_private.policy WHERE singleton
   AND pager_enrollment_enabled AND NOT backup_only) THEN RETURN; END IF;
 SELECT * INTO STRICT o FROM public.pager_orders WHERE id=p_order;
 IF NOT platform_access_private.service_enabled(o.cafe_id,'loyalty')
   OR NOT EXISTS(SELECT 1 FROM public.cafe_loyalty_programs WHERE cafe_id=o.cafe_id AND enabled) THEN RETURN; END IF;
 -- Share the enrollment lock with the normal enrollment and phone scanner paths.
 PERFORM pg_advisory_xact_lock(hashtextextended('loyalty-enroll:'||o.cafe_id::text||':'||o.phone,0));
 -- Even an inactive/ambiguous existing customer is left entirely unchanged.
 IF EXISTS(SELECT 1 FROM public.customer_profiles WHERE cafe_id=o.cafe_id AND phone_normalized=o.phone) THEN RETURN; END IF;
 result:=public.enroll_loyalty_customer_direct(o.cafe_id,'عميل الولاء',o.phone,
   encode(extensions.digest('pager:'||o.cafe_id::text||':'||o.phone,'sha256'),'hex'));
 IF result->>'ok' IS DISTINCT FROM 'true' OR (result->>'returning_customer')::boolean THEN
   RAISE EXCEPTION 'Pager enrollment unavailable';
 END IF;
 member_id:=(result->>'profile_id')::uuid;
 SELECT * INTO STRICT card FROM public.loyalty_cards WHERE cafe_id=o.cafe_id AND customer_profile_id=member_id FOR UPDATE;
 SELECT id INTO staff_id FROM public.cafe_cashiers WHERE id=o.creator_id AND cafe_id=o.cafe_id AND active AND can_use_pager;
 result:=public.apply_rast_loyalty_stamp(o.cafe_id,card.card_code,o.id,staff_id,
   CASE WHEN staff_id IS NULL THEN o.creator_id ELSE NULL END);
 IF coalesce(result->>'status','') NOT IN('stamped','reward_issued') THEN RAISE EXCEPTION 'Pager first stamp failed'; END IF;
 INSERT INTO loyalty_read_private.card_link_jobs(cafe_id,profile_id,card_id,card_created)
 VALUES(o.cafe_id,member_id,card.id,true) ON CONFLICT(card_id,delivery_day) DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION pager_private.enroll_new_customer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION pager_private.enroll_new_customer(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pager_create_order(p_id uuid,p_cafe uuid,p_invoice text,p_phone text,p_actor text,p_station text,p_actor_id uuid,p_feedback_hash text)
RETURNS public.pager_orders LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v public.pager_orders; inserted_count integer;
BEGIN
 IF NOT pager_private.enabled(p_cafe) THEN RAISE EXCEPTION 'Pager service unavailable' USING ERRCODE='42501'; END IF;
 IF p_invoice IS NULL OR length(p_invoice)>120 OR length(btrim(p_invoice))=0 OR p_phone !~ '^9665[0-9]{8}$'
   OR length(p_actor)>200 OR length(p_station)>100 THEN RAISE EXCEPTION 'Invalid pager order'; END IF;
 INSERT INTO public.pager_orders(id,cafe_id,invoice_number,phone,created_by,created_station,creator_id,feedback_hash)
 VALUES(p_id,p_cafe,p_invoice,p_phone,p_actor,p_station,p_actor_id,p_feedback_hash) ON CONFLICT(id) DO NOTHING;
 GET DIAGNOSTICS inserted_count=ROW_COUNT;
 SELECT * INTO v FROM public.pager_orders WHERE id=p_id AND cafe_id=p_cafe;
 IF NOT FOUND OR v.invoice_number IS DISTINCT FROM p_invoice OR v.phone IS DISTINCT FROM p_phone
   THEN RAISE EXCEPTION 'Idempotency conflict'; END IF;
 -- Never backfill old orders or generate new work from a replayed request.
 IF inserted_count=1 THEN PERFORM pager_private.enroll_new_customer(p_id); END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.pager_create_order(uuid,uuid,text,text,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pager_create_order(uuid,uuid,text,text,text,text,uuid,text) TO service_role;
COMMIT;
