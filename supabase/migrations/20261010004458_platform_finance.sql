BEGIN;

CREATE TABLE public.platform_finance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind text NOT NULL CHECK (kind IN ('collection','payment')),
  source text NOT NULL CHECK (source IN ('manual_subscription','subscription_approval','manual_payment')),
  category text NOT NULL CHECK (category IN ('subscription','database','hosting','whatsapp','software','other')),
  party text NOT NULL CHECK (length(btrim(party)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  occurred_on date NOT NULL,
  currency text NOT NULL CHECK (currency IN ('SAR','USD')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  exchange_rate numeric(12,6) NOT NULL CHECK (exchange_rate > 0 AND exchange_rate <= 10000),
  amount_sar numeric(16,2) GENERATED ALWAYS AS (round(amount * exchange_rate,2)) STORED,
  reference text NOT NULL DEFAULT '' CHECK (length(reference)<=200),
  notes text NOT NULL DEFAULT '' CHECK (length(notes)<=2000),
  cafe_id uuid REFERENCES public.cafes(id) ON DELETE RESTRICT,
  subscription_request_id uuid UNIQUE REFERENCES public.subscription_payment_requests(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  receipt_bucket text CHECK (receipt_bucket IN ('platform-finance-receipts','subscription-receipts')),
  receipt_path text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  submission jsonb,
  CHECK ((currency='SAR' AND exchange_rate=1) OR currency='USD'),
  CHECK ((kind='collection' AND category='subscription' AND cafe_id IS NOT NULL AND subscription_request_id IS NOT NULL AND currency='SAR')
    OR (kind='payment' AND source='manual_payment' AND category<>'subscription' AND subscription_request_id IS NULL AND subscription_id IS NULL)),
  CHECK ((receipt_bucket IS NULL) = (receipt_path IS NULL))
);
CREATE INDEX platform_finance_entries_date_idx ON public.platform_finance_entries(occurred_on DESC,id);
CREATE INDEX platform_finance_entries_kind_date_idx ON public.platform_finance_entries(kind,occurred_on DESC);
CREATE INDEX platform_finance_entries_subscription_idx ON public.platform_finance_entries(subscription_id) WHERE subscription_id IS NOT NULL;
ALTER TABLE public.platform_finance_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_finance_entries FROM anon,authenticated;
GRANT SELECT ON public.platform_finance_entries TO authenticated,service_role;
CREATE POLICY platform_finance_admin_read ON public.platform_finance_entries FOR SELECT TO authenticated
  USING ((SELECT public.is_platform_admin()));

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('platform-finance-receipts','platform-finance-receipts',false,5242880,ARRAY['application/pdf','image/jpeg','image/png']);
CREATE POLICY platform_finance_receipt_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='platform-finance-receipts' AND (SELECT public.is_platform_admin()));
CREATE POLICY platform_finance_receipt_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='platform-finance-receipts' AND (SELECT public.is_platform_admin())
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(pdf|jpg|png)$');
-- No overwrite/delete permission: evidence referenced by a posted voucher stays immutable

CREATE FUNCTION public.record_approved_subscription_collection() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND NEW.amount_sar>0 THEN
    INSERT INTO public.platform_finance_entries(kind,source,category,party,description,occurred_on,currency,amount,exchange_rate,
      cafe_id,subscription_request_id,subscription_id,receipt_bucket,receipt_path,created_by)
    SELECT 'collection','subscription_approval','subscription',c.name,NEW.plan_name,
      (COALESCE(NEW.reviewed_at,now()) AT TIME ZONE 'Asia/Riyadh')::date,'SAR',NEW.amount_sar,1,
      NEW.cafe_id,NEW.id,NEW.approved_subscription_id,
      CASE WHEN NEW.receipt_storage_path IS NOT NULL THEN 'subscription-receipts' END,NEW.receipt_storage_path,NEW.reviewed_by
    FROM public.cafes c WHERE c.id=NEW.cafe_id
    ON CONFLICT(subscription_request_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_approved_subscription_collection() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER platform_finance_subscription_collection AFTER UPDATE OF status ON public.subscription_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.record_approved_subscription_collection();

-- Mirror approved historical payments once without creating or changing any subscription
INSERT INTO public.platform_finance_entries(kind,source,category,party,description,occurred_on,currency,amount,exchange_rate,
  cafe_id,subscription_request_id,subscription_id,receipt_bucket,receipt_path,created_by)
SELECT 'collection','subscription_approval','subscription',c.name,r.plan_name,
  (COALESCE(r.reviewed_at,r.created_at) AT TIME ZONE 'Asia/Riyadh')::date,'SAR',r.amount_sar,1,
  r.cafe_id,r.id,r.approved_subscription_id,CASE WHEN r.receipt_storage_path IS NOT NULL THEN 'subscription-receipts' END,
  r.receipt_storage_path,r.reviewed_by
FROM public.subscription_payment_requests r JOIN public.cafes c ON c.id=r.cafe_id
WHERE r.status='approved' AND r.amount_sar>0 ON CONFLICT(subscription_request_id) DO NOTHING;

CREATE FUNCTION public.admin_post_finance_entry(p_id uuid,p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_existing public.platform_finance_entries%ROWTYPE;
  v_request public.subscription_payment_requests%ROWTYPE;
  v_plan public.platform_plans%ROWTYPE;
  v_request_id uuid:=nullif(p_input->>'requestId','')::uuid;
  v_cafe_id uuid:=nullif(p_input->>'cafeId','')::uuid;
  v_kind text:=p_input->>'kind';
  v_amount numeric:=(p_input->>'amount')::numeric;
  v_rate numeric:=(p_input->>'exchangeRate')::numeric;
  v_months integer:=(p_input->>'months')::integer;
  v_date date:=(p_input->>'date')::date;
  v_receipt text:=p_input->>'receiptPath';
  v_party text:=btrim(p_input->>'party');
  v_base numeric; v_annual numeric; v_total numeric; v_subscription uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_id IS NULL OR p_input IS NULL THEN RAISE EXCEPTION 'Invalid input'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  SELECT * INTO v_existing FROM public.platform_finance_entries WHERE id=p_id;
  IF FOUND THEN
    IF v_existing.submission IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'Voucher already exists with different details'; END IF;
    RETURN v_existing.id;
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('collection','payment') OR v_amount IS NULL OR v_amount<=0 OR v_amount<>round(v_amount,2)
    OR v_date IS NULL OR v_date>(now() AT TIME ZONE 'Asia/Riyadh')::date OR v_date<'2000-01-01'::date
    OR v_rate IS NULL OR v_rate<>round(v_rate,6) THEN RAISE EXCEPTION 'Invalid amount or date'; END IF;
  IF v_receipt IS NULL OR v_receipt !~ ('^'||p_id::text||'/[0-9a-f]{64}\.(pdf|jpg|png)$')
    OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='platform-finance-receipts' AND name=v_receipt)
    THEN RAISE EXCEPTION 'Receipt is required'; END IF;
  IF v_kind='collection' THEN
    IF p_input->>'currency' IS DISTINCT FROM 'SAR' OR v_rate<>1 THEN RAISE EXCEPTION 'Subscriptions use SAR'; END IF;
    -- Existing review path locks request before brand just like the approval function
    IF v_request_id IS NOT NULL THEN
      SELECT * INTO v_request FROM public.subscription_payment_requests WHERE id=v_request_id FOR UPDATE;
      IF NOT FOUND OR v_request.cafe_id IS DISTINCT FROM v_cafe_id OR v_request.status NOT IN ('awaiting_receipt','pending_review')
        OR v_request.amount_sar<>v_amount THEN RAISE EXCEPTION 'Request unavailable or amount mismatch'; END IF;
    END IF;
    SELECT name INTO v_party FROM public.cafes WHERE id=v_cafe_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Brand unavailable'; END IF;
    IF v_request_id IS NULL THEN
      IF EXISTS(SELECT 1 FROM public.subscription_payment_requests WHERE cafe_id=v_cafe_id AND status IN ('awaiting_receipt','pending_review'))
        THEN RAISE EXCEPTION 'Select the existing subscription request'; END IF;
      IF v_months IS NULL OR v_months NOT IN (1,3,6,12) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
      SELECT * INTO v_plan FROM public.platform_plans WHERE id=p_input->>'planId' AND active=true FOR SHARE;
      IF NOT FOUND OR v_plan.price_sar<=0 OR v_plan.id='owner_trial_7d' OR NOT (v_months=ANY(v_plan.duration_options))
        THEN RAISE EXCEPTION 'Plan unavailable'; END IF;
      v_base:=round(v_plan.price_sar*v_months,2);
      v_annual:=CASE WHEN v_months=12 THEN round(v_base*v_plan.annual_discount_percent/100,2) ELSE 0 END;
      v_total:=v_base-v_annual;
      IF v_amount<>v_total THEN RAISE EXCEPTION 'Subscription amount mismatch'; END IF;
      INSERT INTO public.subscription_payment_requests(cafe_id,plan_id,requested_by,plan_name,base_amount_sar,
        discount_amount_sar,tax_amount_sar,amount_sar,duration_unit,duration_count,payment_method,status,receipt_channel,annual_discount_amount_sar)
      VALUES(v_cafe_id,v_plan.id,auth.uid(),v_plan.name,v_base,v_annual,round(v_total-v_total/1.15,2),v_total,'month',v_months,
        'bank_transfer','pending_review','whatsapp',v_annual) RETURNING id INTO v_request_id;
    ELSE
      UPDATE public.subscription_payment_requests SET status='pending_review',receipt_channel='whatsapp',updated_at=now() WHERE id=v_request_id;
    END IF;
  END IF;
  INSERT INTO public.platform_finance_entries(id,kind,source,category,party,description,occurred_on,currency,amount,exchange_rate,
    reference,notes,cafe_id,subscription_request_id,receipt_bucket,receipt_path,created_by,submission)
  VALUES(p_id,v_kind,CASE WHEN v_kind='collection' THEN 'manual_subscription' ELSE 'manual_payment' END,
    CASE WHEN v_kind='collection' THEN 'subscription' ELSE p_input->>'category' END,v_party,btrim(p_input->>'description'),
    v_date,p_input->>'currency',v_amount,v_rate,COALESCE(p_input->>'reference',''),COALESCE(p_input->>'notes',''),
    CASE WHEN v_kind='collection' THEN v_cafe_id END,CASE WHEN v_kind='collection' THEN v_request_id END,
    'platform-finance-receipts',v_receipt,auth.uid(),p_input);
  IF v_kind='collection' THEN
    v_subscription:=public.admin_approve_subscription_request(v_request_id);
    UPDATE public.platform_finance_entries SET subscription_id=v_subscription WHERE id=p_id;
  END IF;
  PERFORM public.write_audit_log(v_cafe_id,'post_platform_finance_entry','platform_finance_entries',p_id,
    jsonb_build_object('kind',v_kind,'request_id',v_request_id,'subscription_id',v_subscription));
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_post_finance_entry(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_post_finance_entry(uuid,jsonb) TO authenticated;

CREATE FUNCTION public.admin_finance_totals(p_from date,p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  RETURN (SELECT jsonb_build_object('collections',COALESCE(sum(amount_sar) FILTER(WHERE kind='collection'),0),
    'payments',COALESCE(sum(amount_sar) FILTER(WHERE kind='payment'),0),'count',count(*))
    FROM public.platform_finance_entries WHERE occurred_on BETWEEN p_from AND p_to);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finance_totals(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_totals(date,date) TO authenticated;
COMMIT;
