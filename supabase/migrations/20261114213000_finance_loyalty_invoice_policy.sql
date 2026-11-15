-- Owner invoice eligibility settings reuse the original card/event ledger
-- No service entitlement, reward program, historical invoice or balance changes
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE brand_finance_private.loyalty_invoice_settings(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
 credit_earns_stamp boolean NOT NULL DEFAULT true,
 minimum_invoice_amount numeric NOT NULL DEFAULT 0
  CHECK(minimum_invoice_amount>=0 AND minimum_invoice_amount<=100000000 AND minimum_invoice_amount=round(minimum_invoice_amount,2)),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brand_finance_private.loyalty_invoice_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_finance_private.loyalty_invoice_settings FROM PUBLIC,anon,authenticated,service_role;
-- Snapshot eligibility at issuance: later policy changes do not rewrite history
ALTER TABLE public.bf_sale_customers ADD COLUMN invoice_stamp_eligible boolean NOT NULL DEFAULT true;

CREATE FUNCTION public.finance_loyalty_settings_read(p_cafe uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s brand_finance_private.loyalty_invoice_settings;
BEGIN
 IF brand_finance_private.role_for(p_cafe) IS DISTINCT FROM 'owner'
 OR platform_access_private.service_enabled(p_cafe,'finance') IS DISTINCT FROM true
 OR platform_access_private.service_enabled(p_cafe,'loyalty') IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'FINANCE_LOYALTY_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 SELECT * INTO s FROM brand_finance_private.loyalty_invoice_settings WHERE cafe_id=p_cafe;
 RETURN jsonb_build_object('creditEarnsStamp',coalesce(s.credit_earns_stamp,true),'minimumInvoiceAmount',coalesce(s.minimum_invoice_amount,0));
END $$;

CREATE FUNCTION public.finance_loyalty_settings_save(p_cafe uuid,p_credit_earns_stamp boolean,p_minimum_invoice_amount numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.finance_loyalty_settings_read(p_cafe);
 IF p_credit_earns_stamp IS NULL OR p_minimum_invoice_amount IS NULL
 OR p_minimum_invoice_amount<0 OR p_minimum_invoice_amount>100000000
 OR p_minimum_invoice_amount<>round(p_minimum_invoice_amount,2) THEN
  RAISE EXCEPTION 'FINANCE_LOYALTY_INVALID_INPUT' USING ERRCODE='22023';
 END IF;
 INSERT INTO brand_finance_private.loyalty_invoice_settings(cafe_id,credit_earns_stamp,minimum_invoice_amount)
 VALUES(p_cafe,p_credit_earns_stamp,p_minimum_invoice_amount)
 ON CONFLICT(cafe_id) DO UPDATE SET credit_earns_stamp=excluded.credit_earns_stamp,
 minimum_invoice_amount=excluded.minimum_invoice_amount,updated_at=now();
 RETURN jsonb_build_object('creditEarnsStamp',p_credit_earns_stamp,'minimumInvoiceAmount',p_minimum_invoice_amount);
END $$;

CREATE FUNCTION brand_finance_private.invoice_earns_stamp(p_cafe uuid,p_total numeric,p_paid numeric) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_total>=coalesce(s.minimum_invoice_amount,0)
 AND (coalesce(s.credit_earns_stamp,true) OR p_paid>=p_total)
 FROM (SELECT 1) singleton LEFT JOIN brand_finance_private.loyalty_invoice_settings s ON s.cafe_id=p_cafe
$$;

-- Fail closed on source drift; preserve the original idempotency, refund, identity,
-- French daily limit, reward issuance and wallet synchronization mechanisms
DO $migration$
DECLARE source text;anchor text:=' SELECT * INTO STRICT d FROM public.bf_documents WHERE id=p_document;';
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.stamp_sale_customer(uuid,uuid)'::regprocedure) INTO source;
 IF position(anchor IN source)=0 OR position('invoice_stamp_eligible' IN source)>0 THEN RAISE EXCEPTION 'Unexpected original loyalty stamp function';END IF;
 source:=replace(source,anchor,anchor||E'\n IF s.invoice_stamp_eligible IS DISTINCT FROM true THEN\n  UPDATE public.bf_sale_customers SET loyalty_status=''unavailable'' WHERE document_id=d.id; RETURN;\n END IF;');
 EXECUTE source;
END $migration$;

-- Reject ineligible new bindings immediately, including customers who enroll later
CREATE FUNCTION brand_finance_private.enforce_invoice_loyalty_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.bf_documents;
BEGIN
 IF NEW.loyalty_status='pending_enrollment' THEN
  SELECT * INTO STRICT d FROM public.bf_documents WHERE id=NEW.document_id AND cafe_id=NEW.cafe_id AND kind='sale';
  NEW.invoice_stamp_eligible:=brand_finance_private.invoice_earns_stamp(d.cafe_id,d.total,d.paid) IS NOT DISTINCT FROM true;
  IF NOT NEW.invoice_stamp_eligible THEN NEW.loyalty_status:='unavailable';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bf_sale_customer_invoice_policy BEFORE INSERT ON public.bf_sale_customers
 FOR EACH ROW EXECUTE FUNCTION brand_finance_private.enforce_invoice_loyalty_policy();

REVOKE ALL ON FUNCTION brand_finance_private.invoice_earns_stamp(uuid,numeric,numeric),brand_finance_private.enforce_invoice_loyalty_policy() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.finance_loyalty_settings_read(uuid),public.finance_loyalty_settings_save(uuid,boolean,numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_loyalty_settings_read(uuid),public.finance_loyalty_settings_save(uuid,boolean,numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
