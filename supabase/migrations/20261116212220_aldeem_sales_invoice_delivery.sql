BEGIN;
SET LOCAL lock_timeout='5s';

-- Only manual POS receipt deliveries use this ledger; company invoices retain their existing one.
CREATE TABLE public.bf_aldeem_sales_invoice_deliveries (
 document_id uuid PRIMARY KEY,
 cafe_id uuid NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL DEFAULT 'sending' CHECK(status IN('sending','queued','rejected','unknown')),
 lease_token uuid NOT NULL DEFAULT gen_random_uuid(),
 provider_message_id text CHECK(length(provider_message_id) BETWEEN 1 AND 200),
 attempts integer NOT NULL DEFAULT 1 CHECK(attempts BETWEEN 1 AND 3),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_aldeem_sales_delivery_cafe ON public.bf_aldeem_sales_invoice_deliveries(cafe_id,created_at DESC);
CREATE INDEX bf_aldeem_sales_delivery_actor ON public.bf_aldeem_sales_invoice_deliveries(created_by);
ALTER TABLE public.bf_aldeem_sales_invoice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_aldeem_sales_invoice_deliveries FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.aldeem_sales_invoice_receipt(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt jsonb;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501'; END IF;
 receipt:=brand_finance_private.customer_message_receipt(p_cafe_id,p_id);
 IF receipt IS NULL THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501'; END IF;
 RETURN receipt;
END $$;

CREATE FUNCTION public.aldeem_claim_sales_invoice_delivery(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt jsonb;delivery public.bf_aldeem_sales_invoice_deliveries%ROWTYPE;existing_job text;
BEGIN
 receipt:=public.aldeem_sales_invoice_receipt(p_cafe_id,p_id);
 IF NOT public.brand_account_not_cancelled(p_cafe_id) OR EXISTS(SELECT 1 FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=p_id)
 THEN RAISE EXCEPTION 'Delivery unavailable' USING ERRCODE='42501'; END IF;
 IF coalesce(receipt->>'customerPhone','') !~ '^9665[0-9]{8}$' THEN RAISE EXCEPTION 'Invalid recipient' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,6111621));
 -- Existing automatic receipt sends are authoritative; never duplicate a pending or ambiguous one.
 SELECT state INTO existing_job FROM public.bf_customer_message_jobs WHERE cafe_id=p_cafe_id AND document_id=p_id FOR UPDATE;
 IF existing_job IN('pending','dispatching','queued','unknown') THEN
  RETURN jsonb_build_object('claimed',false,'status',CASE WHEN existing_job IN('pending','dispatching') THEN 'sending' ELSE existing_job END);
 END IF;
 SELECT * INTO delivery FROM public.bf_aldeem_sales_invoice_deliveries WHERE document_id=p_id FOR UPDATE;
 IF FOUND THEN
  IF delivery.status='sending' AND delivery.created_at<clock_timestamp()-interval '2 minutes' THEN
   UPDATE public.bf_aldeem_sales_invoice_deliveries SET status='unknown',finished_at=clock_timestamp() WHERE document_id=p_id;
   RETURN jsonb_build_object('claimed',false,'status','unknown');
  END IF;
  IF delivery.status<>'rejected' OR delivery.attempts>=3 OR delivery.finished_at>=clock_timestamp()-interval '30 seconds' THEN
   RETURN jsonb_build_object('claimed',false,'status',delivery.status);
  END IF;
  UPDATE public.bf_aldeem_sales_invoice_deliveries SET status='sending',lease_token=gen_random_uuid(),provider_message_id=NULL,finished_at=NULL,created_at=clock_timestamp(),attempts=attempts+1
  WHERE document_id=p_id RETURNING * INTO delivery;
 ELSE
  IF (SELECT count(*) FROM public.bf_aldeem_sales_invoice_deliveries WHERE cafe_id=p_cafe_id AND created_at>clock_timestamp()-interval '1 minute')>=20 THEN RAISE EXCEPTION 'Rate limited' USING ERRCODE='54000'; END IF;
  INSERT INTO public.bf_aldeem_sales_invoice_deliveries(document_id,cafe_id,created_by) VALUES(p_id,p_cafe_id,auth.uid()) RETURNING * INTO delivery;
 END IF;
 RETURN jsonb_build_object('claimed',true,'status','sending','id',delivery.document_id,'leaseToken',delivery.lease_token);
END $$;

CREATE FUNCTION public.aldeem_finish_sales_invoice_delivery(p_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_status IS NULL OR p_status NOT IN('queued','rejected','unknown') OR (p_status='queued' AND coalesce(length(p_provider_message_id),0) NOT BETWEEN 1 AND 200)
 THEN RAISE EXCEPTION 'Invalid delivery outcome' USING ERRCODE='22023'; END IF;
 UPDATE public.bf_aldeem_sales_invoice_deliveries SET status=p_status,provider_message_id=p_provider_message_id,finished_at=clock_timestamp()
 WHERE document_id=p_id AND lease_token=p_lease_token AND status='sending';
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_sales_invoice_receipt(uuid,uuid),public.aldeem_claim_sales_invoice_delivery(uuid,uuid),public.aldeem_finish_sales_invoice_delivery(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_sales_invoice_receipt(uuid,uuid),public.aldeem_claim_sales_invoice_delivery(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aldeem_finish_sales_invoice_delivery(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
