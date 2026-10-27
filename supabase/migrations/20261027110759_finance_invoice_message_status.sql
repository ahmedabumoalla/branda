-- Delivery observations are separate from dispatch acceptance. No message is sent here.
ALTER TABLE public.bf_customer_message_jobs
 ADD COLUMN provider_status text CHECK (provider_status IN ('pending','sent','delivered','read','failed','yellowCard')),
 ADD COLUMN provider_checked_at timestamptz,
 ADD COLUMN provider_confirmed_at timestamptz,
 ADD COLUMN provider_check_error text CHECK (provider_check_error IS NULL OR provider_check_error='status_unavailable'),
 ADD COLUMN provider_poll_token uuid;

CREATE OR REPLACE FUNCTION public.brand_finance_invoice_message_statuses(p_cafe_id uuid,p_document_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role text; v_result jsonb;
BEGIN
 v_role:=brand_finance_private.role_for(p_cafe_id);
 IF v_role NOT IN ('owner','manager','accountant','auditor','cashier') OR v_role IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF p_document_ids IS NULL OR cardinality(p_document_ids)>100 OR array_position(p_document_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid invoice IDs' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'documentId',d.id,
  'status',CASE WHEN j.provider_status='read' THEN 'read' WHEN j.provider_status='delivered' THEN 'delivered'
   WHEN j.provider_status='sent' THEN 'sent' WHEN j.provider_status='failed' THEN 'failed' WHEN j.provider_status='yellowCard' THEN 'review'
   WHEN j.id IS NULL THEN 'not_requested' WHEN j.state='pending' THEN 'queued' WHEN j.state='dispatching' THEN 'sending'
   WHEN j.state='queued' THEN 'queued' WHEN j.state='rejected' THEN 'failed' WHEN j.state='unknown' THEN 'review'
   WHEN j.state='cancelled' THEN 'cancelled' ELSE 'unknown' END,
  'reason',CASE WHEN j.provider_status='failed' THEN 'provider_failed' WHEN j.provider_status='yellowCard' THEN 'provider_suspended'
   WHEN j.provider_status IN ('delivered','read') THEN NULL WHEN j.id IS NULL AND d.customer_phone IS NULL THEN 'no_phone'
   WHEN j.id IS NULL AND NOT platform_access_private.service_enabled(d.cafe_id,'loyalty') THEN 'loyalty_unavailable'
   WHEN j.id IS NULL THEN 'not_queued' WHEN j.state='rejected' THEN 'provider_rejected' WHEN j.error_code='dispatch_expired' THEN 'dispatch_expired'
   WHEN j.state='unknown' THEN 'delivery_uncertain' WHEN j.state='cancelled' THEN 'cancelled'
   WHEN j.provider_check_error IS NOT NULL THEN 'status_unavailable' ELSE NULL END,
  'updatedAt',coalesce(j.provider_confirmed_at,j.finished_at,j.created_at,d.created_at),'checkedAt',j.provider_checked_at
 ) ORDER BY d.id),'[]'::jsonb) INTO v_result FROM public.bf_documents d
 LEFT JOIN public.bf_customer_message_jobs j ON j.document_id=d.id AND j.cafe_id=d.cafe_id
 WHERE d.cafe_id=p_cafe_id AND d.id=ANY(p_document_ids) AND d.kind='sale' AND (v_role<>'cashier' OR d.created_by=auth.uid());
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.brand_finance_claim_message_status_checks(p_cafe_id uuid,p_document_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_document_ids IS NULL OR cardinality(p_document_ids)>100 OR array_position(p_document_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Invalid invoice IDs' USING ERRCODE='22023'; END IF;
 WITH eligible AS (
  SELECT j.id FROM public.bf_customer_message_jobs j
  WHERE j.cafe_id=p_cafe_id AND j.document_id=ANY(p_document_ids) AND j.state='queued' AND j.provider_message_id IS NOT NULL
   AND coalesce(j.provider_status,'pending') NOT IN ('read','failed')
   AND (j.provider_checked_at IS NULL OR j.provider_checked_at<clock_timestamp()-interval '60 seconds')
  ORDER BY j.provider_checked_at NULLS FIRST,j.created_at,j.id LIMIT 8 FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE public.bf_customer_message_jobs j SET provider_checked_at=clock_timestamp(),provider_poll_token=gen_random_uuid()
  FROM eligible e WHERE j.id=e.id RETURNING j.*
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'pollToken',j.provider_poll_token,'messageId',j.provider_message_id,'phone',s.phone)),'[]'::jsonb)
 INTO v_result FROM claimed j JOIN public.bf_sale_customers s ON s.document_id=j.document_id AND s.cafe_id=j.cafe_id;
 RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.brand_finance_finish_message_status_check(p_job_id uuid,p_poll_token uuid,p_provider_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_job public.bf_customer_message_jobs; v_accept boolean;
BEGIN
 IF p_provider_status IS NOT NULL AND p_provider_status NOT IN ('pending','sent','delivered','read','failed','yellowCard') THEN RAISE EXCEPTION 'Invalid provider status' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_job FROM public.bf_customer_message_jobs WHERE id=p_job_id AND provider_poll_token=p_poll_token FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 v_accept:=p_provider_status IS NOT NULL AND CASE
  WHEN v_job.provider_status='read' THEN p_provider_status='read'
  WHEN v_job.provider_status='delivered' THEN p_provider_status IN ('delivered','read')
  WHEN v_job.provider_status='sent' THEN p_provider_status IN ('sent','delivered','read','failed','yellowCard') ELSE true END;
 UPDATE public.bf_customer_message_jobs SET
  provider_status=CASE WHEN v_accept THEN p_provider_status ELSE provider_status END,
  provider_confirmed_at=CASE WHEN v_accept AND provider_status IS DISTINCT FROM p_provider_status THEN clock_timestamp() ELSE provider_confirmed_at END,
  provider_check_error=CASE WHEN p_provider_status IS NULL THEN 'status_unavailable' ELSE NULL END,
  provider_poll_token=NULL
 WHERE id=v_job.id;
END $$;

REVOKE ALL ON FUNCTION public.brand_finance_invoice_message_statuses(uuid,uuid[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_message_statuses(uuid,uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_claim_message_status_checks(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.brand_finance_finish_message_status_check(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_claim_message_status_checks(uuid,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_finish_message_status_check(uuid,uuid,text) TO service_role;
