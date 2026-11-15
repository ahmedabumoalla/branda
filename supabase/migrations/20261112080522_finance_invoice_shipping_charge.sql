BEGIN;
-- Additive manual-invoice shipping only. No historical financial rows are rewritten.
-- Rollback before activation: this candidate is tested inside BEGIN/ROLLBACK.
-- After activation, rollback requires a forward migration and retaining issued history.
CREATE TABLE public.bf_invoice_shipping_drafts (
 draft_id uuid PRIMARY KEY REFERENCES public.bf_invoice_drafts(id) ON DELETE CASCADE,cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 selection jsonb,revision integer NOT NULL CHECK(revision>0),draft_revision integer NOT NULL CHECK(draft_revision>0),
 settings_revision integer NOT NULL CHECK(settings_revision>=0),option_revision integer,account_id uuid,
 updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(selection IS NULL OR jsonb_typeof(selection)='object'),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id)
);
CREATE INDEX bf_invoice_shipping_drafts_cafe ON public.bf_invoice_shipping_drafts(cafe_id,draft_id);
CREATE TABLE public.bf_invoice_shipping_charges (
 document_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,line_id uuid UNIQUE,account_id uuid NOT NULL,snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),FOREIGN KEY(cafe_id,line_id) REFERENCES public.bf_document_lines(cafe_id,id),
 FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id)
);
CREATE INDEX bf_invoice_shipping_charges_cafe ON public.bf_invoice_shipping_charges(cafe_id,document_id);
ALTER TABLE public.bf_invoice_shipping_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_shipping_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_shipping_drafts,public.bf_invoice_shipping_charges FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_invoice_shipping_charges_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_shipping_charges FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.shipping_charge_selection(p_selection jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF p_selection IS NULL OR p_selection='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_selection) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع رسوم الشحن' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_selection))<>4 OR NOT p_selection ?& ARRAY['optionId','name','amount','taxRate']
 OR jsonb_typeof(p_selection->'name') IS DISTINCT FROM 'string' OR length(btrim(p_selection->>'name')) NOT BETWEEN 1 AND 160
 OR NOT brand_finance_private.invoice_number_valid(p_selection->'amount',0,10000000,2)
 OR (p_selection->'taxRate'<>'null'::jsonb AND p_selection->'taxRate'<>'15'::jsonb)
 OR (p_selection->'optionId'<>'null'::jsonb AND (jsonb_typeof(p_selection->'optionId') IS DISTINCT FROM 'string' OR p_selection->>'optionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
 THEN RAISE EXCEPTION 'راجع خيار الشحن ومبلغه وضريبته' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('optionId',(p_selection->>'optionId')::uuid,'name',btrim(p_selection->>'name'),'amount',(p_selection->>'amount')::numeric,'taxRate',(p_selection->>'taxRate')::numeric);
END $$;

-- Derive the manual-only issuer, with an exact baseline and reversible patch parity.
DO $derive$
DECLARE original text;derived text;recovered text;before_parts text[]:=ARRAY[$old0$CREATE OR REPLACE FUNCTION brand_finance_private.issue_company_invoice_actor($old0$,$old1$  credit_sar numeric;credit_foreign numeric;cash_sar numeric;display_number text;journal_note text;line_id uuid;$old1$,$old2$  shipping_mode:=coalesce(draft.payload->>'shipping','none');$old2$,$old3$  final_rows:=rows;sar_total:=sar_net+sar_tax;sar_discount:=round((subtotal-after_rows+doc_discount)*fx,2);$old3$,$old4$  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,aid,cash_sar,0,NULL,journal_note);$old4$,$old5$brand_finance_private.account(p_cafe_id,'4000'),0,sar_net-sar_adjustment_net,NULL,journal_note)$old5$,$old6$'shipping',jsonb_build_object('mode',shipping_mode,'address',shipping_address)$old6$];after_parts text[]:=ARRAY[$new0$CREATE OR REPLACE FUNCTION brand_finance_private.issue_manual_invoice_shipping_actor($new0$,$new1$  credit_sar numeric;credit_foreign numeric;cash_sar numeric;display_number text;journal_note text;line_id uuid;
  shipping_charge jsonb;shipping_net numeric:=0;shipping_tax numeric:=0;shipping_sar_net numeric:=0;shipping_sar_tax numeric:=0;shipping_line_id uuid;requested_shipping_mode text;cod_service_id text;cod_service_indices jsonb:='[]';$new1$,$new2$  shipping_mode:=coalesce(draft.payload->>'shipping','none');requested_shipping_mode:=shipping_mode;
  IF shipping_mode='auto' THEN
   shipping_mode:=CASE WHEN nullif(btrim(customer.details->>'shippingStreet'),'') IS NOT NULL AND nullif(btrim(customer.details->>'shippingCity'),'') IS NOT NULL AND nullif(btrim(customer.details->>'shippingCountry'),'') IS NOT NULL THEN 'secondary' ELSE 'main' END;
  END IF;$new2$,$new3$  final_rows:=rows;sar_total:=sar_net+sar_tax;sar_discount:=round((subtotal-after_rows+doc_discount)*fx,2);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60622));
  SELECT settings->>'codServiceId' INTO cod_service_id FROM public.bf_shipping_settings WHERE cafe_id=p_cafe_id;
  SELECT coalesce(jsonb_agg(ordinality-1 ORDER BY ordinality),'[]'::jsonb) INTO cod_service_indices FROM jsonb_array_elements(final_rows) WITH ORDINALITY row(value,ordinality) WHERE value->>'productId'=cod_service_id AND value->>'kind'='service';
  shipping_charge:=brand_finance_private.shipping_charge_for_issue(p_cafe_id,p_draft_id,p_revision);
  IF shipping_charge IS NOT NULL THEN
   shipping_net:=(shipping_charge->>'amount')::numeric;
   IF shipping_net>0 AND jsonb_array_length(final_rows)>99 THEN RAISE EXCEPTION 'الحد الأقصى ٩٩ بندًا عند إضافة رسوم الشحن' USING ERRCODE='22023';END IF;
   shipping_tax:=round(shipping_net*coalesce((shipping_charge->>'taxRate')::numeric,0)/100,2);
   shipping_sar_net:=round(shipping_net*fx,2);shipping_sar_tax:=round(shipping_tax*fx,2);
   net:=net+shipping_net;tax:=tax+shipping_tax;total:=total+shipping_net+shipping_tax;
   sar_net:=sar_net+shipping_sar_net;sar_tax:=sar_tax+shipping_sar_tax;sar_total:=sar_net+sar_tax;sar_subtotal:=sar_subtotal+shipping_sar_net+CASE WHEN inclusive THEN shipping_sar_tax ELSE 0 END;
  END IF;$new3$,$new4$  IF shipping_charge IS NOT NULL THEN
   IF shipping_net>0 THEN
    shipping_line_id:=gen_random_uuid();
    INSERT INTO public.bf_document_lines(id,cafe_id,document_id,name,quantity,unit_price,net,tax,cost,activity_kind,vat_rate,tax_category,exemption_reason)
     VALUES(shipping_line_id,p_cafe_id,doc,shipping_charge->>'name',1,CASE WHEN inclusive THEN shipping_sar_net+shipping_sar_tax ELSE shipping_sar_net END,shipping_sar_net,shipping_sar_tax,0,'service',coalesce((shipping_charge->>'taxRate')::numeric,0),CASE WHEN shipping_charge->>'taxRate'='15' THEN 'S' ELSE 'O' END,'');
   END IF;
   shipping_charge:=shipping_charge||jsonb_build_object('tax',shipping_tax,'total',shipping_net+shipping_tax,'currency',currency_code,'exchangeRate',fx,'lineId',shipping_line_id,'sar',jsonb_build_object('amount',shipping_sar_net,'tax',shipping_sar_tax,'total',shipping_sar_net+shipping_sar_tax));
   INSERT INTO public.bf_invoice_shipping_charges(cafe_id,document_id,line_id,account_id,snapshot,created_by) VALUES(p_cafe_id,doc,shipping_line_id,(shipping_charge->>'accountId')::uuid,shipping_charge,p_actor);
   PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,(shipping_charge->>'accountId')::uuid,0,shipping_sar_net,NULL,journal_note);
  END IF;
  PERFORM brand_finance_private.invoice_line(p_cafe_id,doc,aid,cash_sar,0,NULL,journal_note);$new4$,$new5$brand_finance_private.account(p_cafe_id,'4000'),0,sar_net-sar_adjustment_net-shipping_sar_net,NULL,journal_note)$new5$,$new6$'codServiceLineIndices',cod_service_indices,'shippingCharge',shipping_charge,'shipping',jsonb_build_object('mode',requested_shipping_mode,'resolvedMode',shipping_mode,'address',shipping_address)$new6$];i integer;
BEGIN
 original:=pg_get_functiondef('brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)'::regprocedure);
 IF md5(original)<>'9eb38bb4b57a4594118e6ce5c3f6f268' THEN RAISE EXCEPTION 'Unexpected canonical actor baseline';END IF;
 original:=replace(original,E'\r\n',E'\n');derived:=original;
 FOR i IN 1..array_length(before_parts,1) LOOP
  IF (length(derived)-length(replace(derived,before_parts[i],'')))/length(before_parts[i])<>1 THEN RAISE EXCEPTION 'Manual shipping issuer insertion point % missing or ambiguous',i;END IF;
  derived:=replace(derived,before_parts[i],after_parts[i]);
 END LOOP;
 recovered:=derived;
 FOR i IN REVERSE array_length(before_parts,1)..1 LOOP recovered:=replace(recovered,after_parts[i],before_parts[i]);END LOOP;
 IF recovered<>original THEN RAISE EXCEPTION 'Manual shipping inverse parity failed';END IF;
 EXECUTE derived;
 IF md5(pg_get_functiondef('brand_finance_private.issue_company_invoice_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text)'::regprocedure))<>'9eb38bb4b57a4594118e6ce5c3f6f268' THEN RAISE EXCEPTION 'Canonical actor changed unexpectedly';END IF;
END $derive$;

DO $manual$ DECLARE original text;derived text; BEGIN
 original:=pg_get_functiondef('public.brand_finance_issue_company_invoice(uuid,uuid,integer,numeric)'::regprocedure);
 IF md5(original)<>'93ea5d14fd398378ee886cfce9fd334e' THEN RAISE EXCEPTION 'Unexpected manual issuer captures baseline';END IF;
 derived:=replace(original,'brand_finance_private.issue_company_invoice(p_cafe_id,p_draft_id,p_revision,p_expected_total,NULL,'''')','brand_finance_private.issue_manual_invoice_shipping_actor(auth.uid(),false,p_cafe_id,p_draft_id,p_revision,p_expected_total,NULL,'''')');
 IF derived=original THEN RAISE EXCEPTION 'Manual issuer dispatch point missing';END IF;
 EXECUTE derived;
END $manual$;


CREATE FUNCTION public.brand_finance_invoice_shipping_charge_context(p_cafe_id uuid,p_draft_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE settings jsonb;settings_revision integer;options jsonb;chosen public.bf_invoice_shipping_drafts%ROWTYPE;issued_id uuid;selected jsonb;
BEGIN
 PERFORM brand_finance_private.shipping_role(p_cafe_id);
 SELECT s.settings,s.revision INTO settings,settings_revision FROM public.bf_shipping_settings s WHERE s.cafe_id=p_cafe_id;
 IF p_draft_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id) THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
  SELECT * INTO chosen FROM public.bf_invoice_shipping_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  SELECT document_id INTO issued_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  IF issued_id IS NOT NULL THEN SELECT jsonb_build_object('optionId',snapshot->'optionId','name',snapshot->'name','amount',snapshot->'amount','taxRate',snapshot->'taxRate') INTO selected FROM public.bf_invoice_shipping_charges WHERE cafe_id=p_cafe_id AND document_id=issued_id;ELSE selected:=chosen.selection;END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'fee',o.fee,'taxRate',o.tax_rate,'revision',o.revision) ORDER BY o.display_order,o.name,o.id),'[]'::jsonb) INTO options FROM public.bf_shipping_options o WHERE o.cafe_id=p_cafe_id AND o.active AND o.deleted_at IS NULL;
 RETURN jsonb_build_object('enabled',coalesce((settings->>'enabled')::boolean,false),'settingsRevision',coalesce(settings_revision,0),'codServiceId',settings->'codServiceId','options',options,'selection',selected,'revision',coalesce(chosen.revision,0),'hasSelection',chosen.draft_id IS NOT NULL,'issued',issued_id IS NOT NULL);
END $$;

CREATE FUNCTION public.brand_finance_set_invoice_shipping_charge(p_cafe_id uuid,p_draft_id uuid,p_draft_revision integer,p_revision integer,p_settings_revision integer,p_option_revision integer,p_selection jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE draft public.bf_invoice_drafts%ROWTYPE;chosen public.bf_invoice_shipping_drafts%ROWTYPE;option public.bf_shipping_options%ROWTYPE;selected jsonb;historical jsonb;issued_id uuid;settings jsonb;settings_revision integer;aid uuid;next_revision integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 IF p_draft_revision IS NULL OR p_draft_revision<1 OR p_revision IS NULL OR p_revision<0 OR p_settings_revision IS NULL OR p_settings_revision<0 THEN RAISE EXCEPTION 'Invalid shipping revision' USING ERRCODE='22023';END IF;
 selected:=brand_finance_private.shipping_charge_selection(p_selection);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO draft FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_draft_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO chosen FROM public.bf_invoice_shipping_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
 SELECT document_id INTO issued_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
 IF issued_id IS NOT NULL THEN
  SELECT jsonb_build_object('optionId',snapshot->'optionId','name',snapshot->'name','amount',snapshot->'amount','taxRate',snapshot->'taxRate') INTO historical FROM public.bf_invoice_shipping_charges WHERE cafe_id=p_cafe_id AND document_id=issued_id;
  IF selected IS DISTINCT FROM historical THEN RAISE EXCEPTION 'لا يمكن تغيير شحن فاتورة صادرة' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('revision',coalesce(chosen.revision,0),'selection',historical,'issued',true);
 END IF;
 IF draft.revision<>p_draft_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60622));
 SELECT s.settings,s.revision INTO settings,settings_revision FROM public.bf_shipping_settings s WHERE s.cafe_id=p_cafe_id;
 settings_revision:=coalesce(settings_revision,0);
 IF selected IS NOT NULL AND NOT coalesce((settings->>'enabled')::boolean,false) AND chosen.draft_id IS NOT NULL AND chosen.selection=selected THEN
  UPDATE public.bf_invoice_shipping_drafts SET draft_revision=p_draft_revision,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  RETURN jsonb_build_object('revision',chosen.revision,'selection',selected,'issued',false);
 END IF;
 IF selected IS NOT NULL THEN
  IF NOT coalesce((settings->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'رسوم الشحن غير مفعلة' USING ERRCODE='22023';END IF;
  IF settings_revision<>p_settings_revision THEN RAISE EXCEPTION 'Shipping settings conflict' USING ERRCODE='40001';END IF;
  IF selected->>'optionId' IS NOT NULL THEN
   SELECT * INTO option FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=(selected->>'optionId')::uuid AND active AND deleted_at IS NULL FOR SHARE;
   IF option.id IS NULL THEN RAISE EXCEPTION 'خيار الشحن غير متاح اختر خيارًا نشطًا' USING ERRCODE='22023';END IF;
   IF option.revision IS DISTINCT FROM p_option_revision OR option.name IS DISTINCT FROM selected->>'name' THEN RAISE EXCEPTION 'Shipping option conflict' USING ERRCODE='40001';END IF;
   aid:=option.account_id;
  ELSIF p_option_revision IS NOT NULL THEN RAISE EXCEPTION 'Invalid custom shipping revision' USING ERRCODE='22023';END IF;
  aid:=coalesce(aid,brand_finance_private.account(p_cafe_id,'4000'));
  IF NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=aid AND active AND deleted_at IS NULL AND NOT frozen AND NOT is_group AND kind='revenue') THEN RAISE EXCEPTION 'حساب إيراد الشحن غير متاح' USING ERRCODE='22023';END IF;
 END IF;
 IF chosen.draft_id IS NOT NULL AND chosen.selection IS NOT DISTINCT FROM selected AND chosen.account_id IS NOT DISTINCT FROM aid AND chosen.settings_revision=settings_revision AND chosen.option_revision IS NOT DISTINCT FROM option.revision THEN
  UPDATE public.bf_invoice_shipping_drafts SET draft_revision=p_draft_revision,updated_by=auth.uid(),updated_at=clock_timestamp() WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
  RETURN jsonb_build_object('revision',chosen.revision,'selection',selected,'issued',false);
 END IF;
 IF coalesce(chosen.revision,0)<>p_revision THEN RAISE EXCEPTION 'Shipping selection conflict' USING ERRCODE='40001';END IF;
 next_revision:=coalesce(chosen.revision,0)+1;
 INSERT INTO public.bf_invoice_shipping_drafts(cafe_id,draft_id,selection,revision,draft_revision,settings_revision,option_revision,account_id,updated_by) VALUES(p_cafe_id,p_draft_id,selected,next_revision,p_draft_revision,settings_revision,option.revision,aid,auth.uid())
 ON CONFLICT(draft_id) DO UPDATE SET selection=excluded.selection,revision=excluded.revision,draft_revision=excluded.draft_revision,settings_revision=excluded.settings_revision,option_revision=excluded.option_revision,account_id=excluded.account_id,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 RETURN jsonb_build_object('revision',next_revision,'selection',selected,'issued',false);
END $$;

CREATE FUNCTION public.brand_finance_issued_shipping_charge(p_cafe_id uuid,p_document_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE charge jsonb;
BEGIN
 PERFORM brand_finance_private.shipping_role(p_cafe_id);
 IF NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_document_id AND kind='sale') THEN RAISE EXCEPTION 'Invoice unavailable' USING ERRCODE='42501';END IF;
 SELECT snapshot INTO charge FROM public.bf_invoice_shipping_charges WHERE cafe_id=p_cafe_id AND document_id=p_document_id;
 RETURN jsonb_build_object('recorded',charge IS NOT NULL,'charge',charge);
END $$;

CREATE FUNCTION public.brand_finance_copy_invoice_shipping_charge(p_cafe_id uuid,p_source_document_id uuid,p_draft_id uuid,p_draft_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE historical jsonb;selected jsonb;context jsonb;option public.bf_shipping_options%ROWTYPE;aid uuid;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 historical:=public.brand_finance_issued_shipping_charge(p_cafe_id,p_source_document_id)->'charge';
 context:=public.brand_finance_invoice_shipping_charge_context(p_cafe_id,p_draft_id);
 IF historical IS NOT NULL AND historical<>'null'::jsonb THEN
  selected:=jsonb_build_object('optionId',historical->'optionId','name',historical->'name','amount',historical->'amount','taxRate',historical->'taxRate');
  IF historical->>'optionId' IS NOT NULL THEN
   SELECT * INTO option FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=(historical->>'optionId')::uuid AND active AND deleted_at IS NULL;
   IF option.id IS NULL OR option.name IS DISTINCT FROM historical->>'name' THEN RAISE EXCEPTION 'تغير خيار الشحن الأصلي اختر خيار النسخة يدويًا' USING ERRCODE='22023';END IF;
  END IF;
  aid:=coalesce(option.account_id,brand_finance_private.account(p_cafe_id,'4000'));
  IF aid::text IS DISTINCT FROM historical->>'accountId' THEN RAISE EXCEPTION 'تغير حساب إيراد الشحن اختر خيار النسخة يدويًا' USING ERRCODE='22023';END IF;
 END IF;
 RETURN public.brand_finance_set_invoice_shipping_charge(p_cafe_id,p_draft_id,p_draft_revision,0,(context->>'settingsRevision')::integer,option.revision,selected);
END $$;

CREATE FUNCTION brand_finance_private.shipping_charge_for_issue(p_cafe_id uuid,p_draft_id uuid,p_draft_revision integer) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE chosen public.bf_invoice_shipping_drafts%ROWTYPE;settings jsonb;settings_revision integer;option public.bf_shipping_options%ROWTYPE;selected jsonb;aid uuid;
BEGIN
 SELECT * INTO chosen FROM public.bf_invoice_shipping_drafts WHERE cafe_id=p_cafe_id AND draft_id=p_draft_id;
 IF chosen.draft_id IS NULL THEN RETURN NULL;END IF;
 IF chosen.draft_revision<>p_draft_revision THEN RAISE EXCEPTION 'أعد حفظ رسوم الشحن بعد تحديث المسودة' USING ERRCODE='40001';END IF;
 IF chosen.selection IS NULL THEN RETURN NULL;END IF;
 selected:=brand_finance_private.shipping_charge_selection(chosen.selection);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60622));
 SELECT s.settings,s.revision INTO settings,settings_revision FROM public.bf_shipping_settings s WHERE s.cafe_id=p_cafe_id;
 IF NOT coalesce((settings->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'رسوم الشحن غير مفعلة' USING ERRCODE='22023';END IF;
 IF settings_revision IS DISTINCT FROM chosen.settings_revision THEN RAISE EXCEPTION 'Shipping settings conflict' USING ERRCODE='40001';END IF;
 IF selected->>'optionId' IS NOT NULL THEN
  SELECT * INTO option FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=(selected->>'optionId')::uuid AND active AND deleted_at IS NULL FOR SHARE;
  IF option.id IS NULL THEN RAISE EXCEPTION 'خيار الشحن غير متاح اختر خيارًا نشطًا' USING ERRCODE='22023';END IF;
  IF option.revision IS DISTINCT FROM chosen.option_revision OR option.name IS DISTINCT FROM selected->>'name' THEN RAISE EXCEPTION 'Shipping option conflict' USING ERRCODE='40001';END IF;
 END IF;
 aid:=coalesce(option.account_id,brand_finance_private.account(p_cafe_id,'4000'));
 IF aid IS DISTINCT FROM chosen.account_id OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=aid AND active AND deleted_at IS NULL AND NOT frozen AND NOT is_group AND kind='revenue') THEN RAISE EXCEPTION 'حساب إيراد الشحن غير متاح' USING ERRCODE='22023';END IF;
 RETURN selected||jsonb_build_object('accountId',aid);
END $$;

CREATE TABLE public.bf_invoice_shipping_refunds (
 line_id uuid PRIMARY KEY,cafe_id uuid NOT NULL,document_id uuid NOT NULL,source_document_id uuid NOT NULL,account_id uuid NOT NULL,net numeric(16,2) NOT NULL CHECK(net>=0),tax numeric(16,2) NOT NULL CHECK(tax>=0),
 FOREIGN KEY(cafe_id,line_id) REFERENCES public.bf_document_lines(cafe_id,id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(source_document_id) REFERENCES public.bf_invoice_shipping_charges(document_id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id)
);
CREATE INDEX bf_invoice_shipping_refunds_cafe ON public.bf_invoice_shipping_refunds(cafe_id,document_id);
ALTER TABLE public.bf_invoice_shipping_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_shipping_refunds FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER bf_invoice_shipping_refunds_immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_shipping_refunds FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE FUNCTION brand_finance_private.shipping_refund_revenue(p_cafe uuid,p_refund uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row record;default_account uuid;
BEGIN
 FOR row IN SELECT l.id,l.net,l.tax,s.account_id,s.document_id AS source_id FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id AND d.kind='refund' JOIN public.bf_invoice_shipping_charges s ON s.cafe_id=l.cafe_id AND s.line_id=l.reference_line_id AND s.document_id=d.reference_id WHERE l.cafe_id=p_cafe AND l.document_id=p_refund AND NOT EXISTS(SELECT 1 FROM public.bf_invoice_shipping_refunds r WHERE r.cafe_id=p_cafe AND r.line_id=l.id) LOOP
  default_account:=brand_finance_private.account(p_cafe,'4000');
  IF row.account_id<>default_account THEN
   PERFORM brand_finance_private.invoice_line(p_cafe,p_refund,row.account_id,row.net,0,NULL,'عكس إيراد رسوم الشحن');
   PERFORM brand_finance_private.invoice_line(p_cafe,p_refund,default_account,0,row.net,NULL,'إعادة تصنيف إيراد الشحن المرتجع');
  END IF;
  INSERT INTO public.bf_invoice_shipping_refunds(line_id,cafe_id,document_id,source_document_id,account_id,net,tax) VALUES(row.id,p_cafe,p_refund,row.source_id,row.account_id,row.net,row.tax);
 END LOOP;
END $$;
-- Existing POS/refund issuers stay byte-identical; the accounting extension is a no-op
-- unless a returned line references the dedicated immutable manual shipping record.
DO $refund$ DECLARE original text;derived text; BEGIN
 original:=pg_get_functiondef('brand_finance_private.invoice_refund_adjustments(uuid,uuid)'::regprocedure);
 IF md5(original)<>'65eb81d8990fdf7e7208f0bb073befef' THEN RAISE EXCEPTION 'Unexpected refund adjustment baseline';END IF;
 derived:=replace(original,E'\nEND $function$',E'\n PERFORM brand_finance_private.shipping_refund_revenue(cafe,refund);\nEND $function$');
 IF derived=original THEN RAISE EXCEPTION 'Refund accounting extension point missing';END IF;
 EXECUTE derived;
END $refund$;

REVOKE ALL ON FUNCTION brand_finance_private.shipping_charge_selection(jsonb),brand_finance_private.shipping_charge_for_issue(uuid,uuid,integer),brand_finance_private.shipping_refund_revenue(uuid,uuid),brand_finance_private.issue_manual_invoice_shipping_actor(uuid,boolean,uuid,uuid,integer,numeric,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_shipping_charge_context(uuid,uuid),public.brand_finance_set_invoice_shipping_charge(uuid,uuid,integer,integer,integer,integer,jsonb),public.brand_finance_issued_shipping_charge(uuid,uuid),public.brand_finance_copy_invoice_shipping_charge(uuid,uuid,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_shipping_charge_context(uuid,uuid),public.brand_finance_set_invoice_shipping_charge(uuid,uuid,integer,integer,integer,integer,jsonb),public.brand_finance_issued_shipping_charge(uuid,uuid),public.brand_finance_copy_invoice_shipping_charge(uuid,uuid,uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
