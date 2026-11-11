BEGIN;
CREATE TABLE public.bf_invoice_settings (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object' AND octet_length(settings::text)<=4000),
 revision integer NOT NULL CHECK(revision>0),updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX bf_invoice_settings_actor ON public.bf_invoice_settings(updated_by);
CREATE TABLE public.bf_invoice_settings_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),revision integer NOT NULL CHECK(revision>0),
 before_settings jsonb NOT NULL,after_settings jsonb NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,revision)
);
CREATE INDEX bf_invoice_settings_events_cafe ON public.bf_invoice_settings_events(cafe_id,created_at DESC,id);
CREATE INDEX bf_invoice_settings_events_actor ON public.bf_invoice_settings_events(created_by);
ALTER TABLE public.bf_invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_settings_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_settings,public.bf_invoice_settings_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_settings_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.invoice_settings(p_cafe_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT settings FROM public.bf_invoice_settings WHERE cafe_id=p_cafe_id),
 '{"allowLineEditing":true,"previewBeforeSave":true,"priceHints":"last","copyNotesOnConversion":true,"decimalDisplay":"always","allowDeposits":true,"discountMode":"both","allowBelowCost":true,"defaultPaid":true}'::jsonb)
$$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_settings(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_invoice_settings(p_cafe_id uuid,p_action text DEFAULT 'get',p_settings jsonb DEFAULT NULL,p_revision integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE role_name text;stored public.bf_invoice_settings%ROWTYPE;current_settings jsonb;current_revision integer;key text;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('get','save') THEN RAISE EXCEPTION 'Invalid settings action' USING ERRCODE='22023';END IF;
 IF p_action='save' THEN
  IF role_name<>'owner' THEN RAISE EXCEPTION 'Only the owner can change invoice settings' USING ERRCODE='42501';END IF;
  IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' OR octet_length(p_settings::text)>4000 THEN RAISE EXCEPTION 'Invalid invoice settings' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_settings))<>9 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE k NOT IN('allowLineEditing','previewBeforeSave','priceHints','copyNotesOnConversion','decimalDisplay','allowDeposits','discountMode','allowBelowCost','defaultPaid')) THEN RAISE EXCEPTION 'Invalid invoice settings keys' USING ERRCODE='22023';END IF;
  FOREACH key IN ARRAY ARRAY['allowLineEditing','previewBeforeSave','copyNotesOnConversion','allowDeposits','allowBelowCost','defaultPaid'] LOOP
   IF jsonb_typeof(p_settings->key) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid invoice setting boolean' USING ERRCODE='22023';END IF;
  END LOOP;
  IF coalesce(p_settings->>'priceHints','') NOT IN('hidden','last') OR coalesce(p_settings->>'decimalDisplay','') NOT IN('always','never','auto') OR coalesce(p_settings->>'discountMode','') NOT IN('both','invoice','line') THEN RAISE EXCEPTION 'Invalid invoice setting option' USING ERRCODE='22023';END IF;
  -- Same tenant posting lock as invoice issuance; owner changes cannot race posting.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 END IF;
 SELECT * INTO stored FROM public.bf_invoice_settings WHERE cafe_id=p_cafe_id;
 -- Revision and preferences come from the same row snapshot, including reads.
 current_settings:=coalesce(stored.settings,brand_finance_private.invoice_settings(NULL));current_revision:=coalesce(stored.revision,0);
 IF p_action='save' AND p_settings IS DISTINCT FROM current_settings THEN
  IF p_revision<>current_revision THEN RAISE EXCEPTION 'Invoice settings conflict' USING ERRCODE='40001';END IF;
  INSERT INTO public.bf_invoice_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,current_revision+1,auth.uid())
   ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  INSERT INTO public.bf_invoice_settings_events(cafe_id,revision,before_settings,after_settings,created_by) VALUES(p_cafe_id,current_revision+1,current_settings,p_settings,auth.uid());
  current_settings:=p_settings;current_revision:=current_revision+1;
 END IF;
 RETURN jsonb_build_object('settings',current_settings,'revision',current_revision,'nextNumber',null);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_settings(uuid,text,jsonb,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_settings(uuid,text,jsonb,integer) TO authenticated;

-- Preserve the established issue path and immutable snapshot retry. All checks
-- use the source catalog or the inventory trigger's actual posting cost.
DO $patch$
DECLARE body text;old text;replacement text;
BEGIN
 SELECT pg_get_functiondef('public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric)'::regprocedure) INTO body;
 IF md5(body)<>'638c9d949eabac037d0b241abeab55b3' THEN RAISE EXCEPTION 'Unexpected company issuance baseline';END IF;
 body:=replace(body,'  file_ids jsonb;', '  prefs jsonb;line_cost_status text;file_ids jsonb;');
 old:='  inv:=draft.payload->''invoice''; seller:=draft.payload->''issuer'';';
 replacement:=E'  prefs:=brand_finance_private.invoice_settings(p_cafe_id);\n'||old;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing settings anchor';END IF;body:=replace(body,old,replacement);
 old:='  shipping_mode:=coalesce(draft.payload->>''shipping'',''none'');';
 replacement:=$guard$  IF NOT (prefs->>'allowDeposits')::boolean AND deposit_value>0 THEN RAISE EXCEPTION 'Invoice settings: deposits disabled' USING ERRCODE='22023';END IF;
$guard$||old;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing deposit anchor';END IF;body:=replace(body,old,replacement);
 old:='    rate:=coalesce((entry->>''vatRate'')::numeric,(inv->>''vatRate'')::numeric,cfg.vat_rate);';
 replacement:=$guard$    IF NOT (prefs->>'allowLineEditing')::boolean AND (price IS DISTINCT FROM product.price OR (coalesce(entry->>'description','')<>'' AND coalesce(entry->>'description','') IS DISTINCT FROM coalesce(to_jsonb(product)->>'description',''))) THEN RAISE EXCEPTION 'Invoice settings: catalog line editing disabled' USING ERRCODE='22023';END IF;
$guard$||old;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing catalog price anchor';END IF;body:=replace(body,old,replacement);
 old:='    IF row_discount>gross THEN';
 replacement:=$guard$    IF prefs->>'discountMode'='invoice' AND row_discount>0 THEN RAISE EXCEPTION 'Invoice settings: line discounts disabled' USING ERRCODE='22023';END IF;
$guard$||old;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing line discount anchor';END IF;body:=replace(body,old,replacement);
 old:='  IF doc_discount>after_rows THEN';
 replacement:=$guard$  IF prefs->>'discountMode'='line' AND doc_discount>0 THEN RAISE EXCEPTION 'Invoice settings: invoice discounts disabled' USING ERRCODE='22023';END IF;
$guard$||old;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing invoice discount anchor';END IF;body:=replace(body,old,replacement);
 old:='      RETURNING bf_document_lines.cost INTO cost;';
 replacement:=$guard$      RETURNING bf_document_lines.cost,bf_document_lines.cost_status INTO cost,line_cost_status;
    IF NOT (prefs->>'allowBelowCost')::boolean THEN
     IF line_cost_status IS DISTINCT FROM 'known' THEN RAISE EXCEPTION 'Invoice settings: known inventory cost required' USING ERRCODE='22023';END IF;
     IF (entry->>'net')::numeric<cost THEN RAISE EXCEPTION 'Invoice settings: below inventory cost' USING ERRCODE='22023';END IF;
    END IF;$guard$;
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing actual inventory cost anchor';END IF;body:=replace(body,old,replacement);
 EXECUTE body;
END $patch$;
DO $conversion$
DECLARE body text;old text;
BEGIN
 SELECT pg_get_functiondef('public.brand_finance_convert_quote(uuid,uuid,integer)'::regprocedure) INTO body;
 IF md5(body)<>'a06629d60ae95fe54f8be1652ceeba24' THEN RAISE EXCEPTION 'Unexpected quote conversion baseline';END IF;
 old:=' PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60416));';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing conversion lock anchor';END IF;
 body:=replace(body,old,E' PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));\n'||old);
 old:=' payload:=q.payload->''document'';';
 IF strpos(body,old)=0 THEN RAISE EXCEPTION 'Missing conversion payload anchor';END IF;
 body:=replace(body,old,old||E'\n'||$guard$ IF NOT (brand_finance_private.invoice_settings(p_cafe_id)->>'copyNotesOnConversion')::boolean THEN payload:=jsonb_set(payload,'{invoice,note}','""'::jsonb);END IF;$guard$);
 EXECUTE body;
END $conversion$;
NOTIFY pgrst,'reload schema';
COMMIT;
