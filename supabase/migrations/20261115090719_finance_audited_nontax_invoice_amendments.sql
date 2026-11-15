-- Editable current projection for ordinary non-tax sales, with immutable revisions.
-- No existing journal entry, stock movement, tax identity or payment is overwritten.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE public.bf_document_lines ADD COLUMN amendment_description text NOT NULL DEFAULT '' CHECK(length(amendment_description)<=500);
CREATE TABLE brand_finance_private.invoice_amendment_revisions(
 cafe_id uuid NOT NULL,invoice_id uuid NOT NULL,revision integer NOT NULL CHECK(revision>0),request_id uuid NOT NULL,
 actor_id uuid NOT NULL,actor_name text NOT NULL,fingerprint text NOT NULL,before_snapshot jsonb NOT NULL,after_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,invoice_id,revision),UNIQUE(cafe_id,request_id),
 FOREIGN KEY(cafe_id,invoice_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE TABLE brand_finance_private.invoice_amendment_tickets(
 backend_pid integer NOT NULL,transaction_id xid8 NOT NULL,cafe_id uuid NOT NULL,invoice_id uuid NOT NULL,actor_id uuid NOT NULL,
 PRIMARY KEY(backend_pid,transaction_id,cafe_id,invoice_id)
);
ALTER TABLE brand_finance_private.invoice_amendment_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_finance_private.invoice_amendment_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_finance_private.invoice_amendment_revisions,brand_finance_private.invoice_amendment_tickets FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON brand_finance_private.invoice_amendment_revisions FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.invoice_amendment_ticket(p_cafe uuid,p_invoice uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM brand_finance_private.invoice_amendment_tickets
  WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cafe_id=p_cafe AND invoice_id=p_invoice AND actor_id=auth.uid())
$$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_amendment_ticket(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.invoice_amendment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invoice uuid;old_row jsonb:=to_jsonb(OLD);new_row jsonb:=to_jsonb(NEW);
BEGIN
 IF TG_TABLE_NAME='bf_documents' THEN
  invoice:=OLD.id;
  IF TG_OP<>'UPDATE' OR OLD.kind<>'sale' OR old_row-ARRAY['subtotal','discount','tax','total','note'] IS DISTINCT FROM new_row-ARRAY['subtotal','discount','tax','total','note'] OR NEW.tax<>0 THEN
   RAISE EXCEPTION 'Posted finance records are immutable';
  END IF;
 ELSIF TG_TABLE_NAME='bf_document_lines' THEN invoice:=OLD.document_id;
 ELSIF TG_TABLE_NAME='bf_line_components' THEN SELECT document_id INTO invoice FROM public.bf_document_lines WHERE cafe_id=OLD.cafe_id AND id=OLD.line_id;
 ELSE RAISE EXCEPTION 'Posted finance records are immutable';END IF;
 IF NOT brand_finance_private.invoice_amendment_ticket(OLD.cafe_id,invoice) THEN RAISE EXCEPTION 'Posted finance records are immutable';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_amendment_guard() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER immutable ON public.bf_documents;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION brand_finance_private.invoice_amendment_guard();
DROP TRIGGER immutable ON public.bf_document_lines;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_document_lines FOR EACH ROW EXECUTE FUNCTION brand_finance_private.invoice_amendment_guard();
DROP TRIGGER immutable ON public.bf_line_components;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_line_components FOR EACH ROW EXECUTE FUNCTION brand_finance_private.invoice_amendment_guard();

-- The amendment explicitly reconciles its stored recipe components before inserting
-- the current lines. Ordinary issuance continues through the original trigger.
DO $patch$
DECLARE source text;needle text:=$old$BEGIN
 IF erp_sales_requisition_private.handles(NEW)THEN RETURN erp_sales_requisition_private.capture(NEW);END IF;$old$;
BEGIN
 SELECT pg_get_functiondef('brand_finance_private.inventory_line_components()'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Invoice amendment inventory trigger anchor drift';END IF;
 EXECUTE replace(source,needle,$new$BEGIN
 IF brand_finance_private.invoice_amendment_ticket(NEW.cafe_id,NEW.document_id) THEN RETURN NEW;END IF;
 IF erp_sales_requisition_private.handles(NEW)THEN RETURN erp_sales_requisition_private.capture(NEW);END IF;$new$);
END $patch$;

CREATE FUNCTION brand_finance_private.invoice_amendment_snapshot(p_cafe uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT jsonb_build_object('document',to_jsonb(d),
 'lines',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe AND l.document_id=p_invoice),'[]'),
 'components',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.line_id,c.item_id) FROM public.bf_line_components c JOIN public.bf_document_lines l ON l.cafe_id=c.cafe_id AND l.id=c.line_id WHERE l.cafe_id=p_cafe AND l.document_id=p_invoice),'[]'),
 'journal',coalesce((SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM public.bf_journal j WHERE j.cafe_id=p_cafe AND j.document_id=p_invoice),'[]'),
 'movements',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.bf_movements m WHERE m.cafe_id=p_cafe AND m.document_id=p_invoice),'[]'))
 FROM public.bf_documents d WHERE d.cafe_id=p_cafe AND d.id=p_invoice
$$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_amendment_snapshot(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Unknown integrations fail closed. This automatically protects future tables
-- referencing these invoices or their lines, instead of silently missing them.
CREATE FUNCTION brand_finance_private.invoice_amendment_linked(p_cafe uuid,p_invoice uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE fk record;join_sql text;linked boolean;
BEGIN
 FOR fk IN SELECT c.*,c.conrelid::regclass AS child,c.confrelid::regclass AS parent FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE c.contype='f' AND c.confrelid IN('public.bf_documents'::regclass,'public.bf_document_lines'::regclass,'public.bf_line_components'::regclass)
   AND n.nspname='public'
   AND c.conrelid NOT IN('public.bf_document_lines'::regclass,'public.bf_line_components'::regclass,'public.bf_journal'::regclass,'public.bf_movements'::regclass)
   AND t.relname<>'erp_branch_documents'
 LOOP
  IF fk.child='public.bf_documents'::regclass THEN
   IF EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe AND reference_id=p_invoice AND kind<>'settlement') THEN RETURN true;END IF;
   CONTINUE;
  END IF;
  SELECT string_agg(format('child.%I=parent.%I',a.attname,b.attname),' AND ' ORDER BY key.ordinality) INTO join_sql
   FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY key(child_key,parent_key,ordinality)
   JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=key.child_key
   JOIN pg_attribute b ON b.attrelid=fk.confrelid AND b.attnum=key.parent_key;
  IF fk.confrelid='public.bf_documents'::regclass THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s child JOIN %s parent ON %s WHERE parent.cafe_id=$1 AND parent.id=$2)',fk.child,fk.parent,join_sql) INTO linked USING p_cafe,p_invoice;
  ELSIF fk.confrelid='public.bf_document_lines'::regclass THEN
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s child JOIN %s parent ON %s WHERE parent.cafe_id=$1 AND parent.document_id=$2)',fk.child,fk.parent,join_sql) INTO linked USING p_cafe,p_invoice;
  ELSE
   EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s child JOIN %s parent ON %s JOIN public.bf_document_lines l ON l.cafe_id=parent.cafe_id AND l.id=parent.line_id WHERE l.cafe_id=$1 AND l.document_id=$2)',fk.child,fk.parent,join_sql) INTO linked USING p_cafe,p_invoice;
  END IF;
  IF linked THEN RETURN true;END IF;
 END LOOP;
 RETURN EXISTS(SELECT 1 FROM public.bf_document_lines l JOIN public.bf_document_lines source ON source.cafe_id=l.cafe_id AND source.id=l.reference_line_id WHERE source.cafe_id=p_cafe AND source.document_id=p_invoice)
  OR EXISTS(SELECT 1 FROM public.bf_line_components c JOIN public.bf_line_components source ON source.id=c.original_component_id JOIN public.bf_document_lines l ON l.cafe_id=source.cafe_id AND l.id=source.line_id WHERE l.cafe_id=p_cafe AND l.document_id=p_invoice);
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_amendment_linked(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.invoice_amendment_block(p_cafe uuid,p_invoice uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE d public.bf_documents%ROWTYPE;closed_date date;line_cost numeric;revenue numeric;inventory numeric;cost_total numeric;debt numeric;
BEGIN
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe AND id=p_invoice;
 IF d.id IS NULL OR d.kind<>'sale' THEN RETURN jsonb_build_object('code','not_sale','message','الفاتورة غير متاحة للتعديل');END IF;
 IF (brand_finance_private.saudi_einvoice_policy(p_cafe)->>'enabled')::boolean THEN RETURN jsonb_build_object('code','einvoice_enabled','message','لا يمكن تعديل الفواتير أثناء تفعيل تطبيق الفوترة الإلكترونية السعودية');END IF;
 IF d.tax<>0 OR coalesce(d.vat_rate,0)<>0 OR nullif(btrim(to_jsonb(d)#>>'{receipt_seller,vatNumber}'),'') IS NOT NULL THEN
  RETURN jsonb_build_object('code','tax_archive','message','الفاتورة ذات بيانات ضريبية مؤرشفة وتبقى محفوظة كما صدرت حتى عند تعطيل التطبيق');
 END IF;
 SELECT closed_through INTO closed_date FROM public.bf_settings WHERE cafe_id=p_cafe;
 IF closed_date IS NOT NULL AND least((coalesce((to_jsonb(d)->>'local_created_at')::timestamptz,d.created_at) AT TIME ZONE 'Asia/Riyadh')::date,(now() AT TIME ZONE 'Asia/Riyadh')::date)<=closed_date THEN RETURN jsonb_build_object('code','closed_period','message','لا يمكن تعديل فاتورة ضمن فترة مالية مقفلة');END IF;
 IF nullif(to_jsonb(d)->>'local_reference','') IS NOT NULL THEN RETURN jsonb_build_object('code','offline_archive','message','الفاتورة مؤرشفة من عملية أوف لاين وتحتاج مسار تصحيح يحافظ على بيانات المزامنة');END IF;
 IF EXISTS(SELECT 1 FROM public.bf_refund_requests WHERE cafe_id=p_cafe AND document_id=p_invoice) OR EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe AND reference_id=p_invoice AND kind='refund') THEN RETURN jsonb_build_object('code','refund_link','message','الفاتورة مرتبطة بمرتجع أو طلب مراجعة مرتجع ولا تقبل تعديل البنود');END IF;
 IF brand_finance_private.invoice_amendment_linked(p_cafe,p_invoice) THEN RETURN jsonb_build_object('code','linked_document','message','الفاتورة مرتبطة بمستند أو خدمة أخرى ويجب تصحيحها من مسارها الأصلي');END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_document_lines WHERE cafe_id=p_cafe AND document_id=p_invoice) OR EXISTS(SELECT 1 FROM public.bf_document_lines l LEFT JOIN public.menu_products p ON p.cafe_id=l.cafe_id AND p.id=l.product_id WHERE l.cafe_id=p_cafe AND l.document_id=p_invoice AND (l.product_id IS NULL OR p.id IS NULL OR l.inventory_item_id IS NOT NULL OR l.tax<>0 OR l.reference_line_id IS NOT NULL)) THEN RETURN jsonb_build_object('code','unsupported_lines','message','تعديل هذه الفاتورة يتطلب بنود منتجات مسجلة دون بنود خاصة أو ضريبية');END IF;
 IF EXISTS(SELECT 1 FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe AND l.document_id=p_invoice AND l.cost IS DISTINCT FROM coalesce((SELECT sum(c.cost) FROM public.bf_line_components c WHERE c.cafe_id=l.cafe_id AND c.line_id=l.id),0)) OR EXISTS(SELECT 1 FROM public.bf_line_components c JOIN public.bf_document_lines l ON l.cafe_id=c.cafe_id AND l.id=c.line_id LEFT JOIN public.bf_stock s ON s.cafe_id=c.cafe_id AND s.item_id=c.item_id AND s.warehouse_id=c.warehouse_id WHERE l.cafe_id=p_cafe AND l.document_id=p_invoice AND (c.cost_status<>'known' OR s.quantity<0 OR s.cost_known IS DISTINCT FROM true)) THEN RETURN jsonb_build_object('code','stock_basis','message','يلزم توثيق تكلفة ومخزون مكونات الفاتورة قبل تعديلها');END IF;
 SELECT coalesce(sum(cost),0) INTO line_cost FROM public.bf_document_lines WHERE cafe_id=p_cafe AND document_id=p_invoice;
 SELECT coalesce(sum(j.credit-j.debit) FILTER(WHERE a.code='4000'),0),coalesce(sum(j.credit-j.debit) FILTER(WHERE a.code='1200'),0),coalesce(sum(j.debit-j.credit) FILTER(WHERE a.code='5000'),0),coalesce(sum(j.debit-j.credit) FILTER(WHERE a.code='1100'),0)
 INTO revenue,inventory,cost_total,debt FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=p_cafe AND j.document_id=p_invoice;
 IF revenue IS DISTINCT FROM d.total OR inventory IS DISTINCT FROM line_cost OR cost_total IS DISTINCT FROM line_cost OR debt IS DISTINCT FROM d.total-d.paid THEN RETURN jsonb_build_object('code','ledger_basis','message','تحتاج قيود الفاتورة إلى مراجعة قبل تعديل البنود');END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_amendment_block(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_invoice_amendment_context(p_cafe_id uuid,p_invoice_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.bf_documents%ROWTYPE;blocked jsonb;policy jsonb;state jsonb;revision integer;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل الفواتير' USING ERRCODE='42501';END IF;
 PERFORM erp_branch_private.enter(p_cafe_id);PERFORM erp_branch_private.assert_input(p_cafe_id,jsonb_build_object('invoiceId',p_invoice_id));
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_invoice_id;
 IF d.id IS NULL THEN RAISE EXCEPTION 'الفاتورة غير متاحة' USING ERRCODE='42501';END IF;
 policy:=brand_finance_private.saudi_einvoice_policy(p_cafe_id);blocked:=brand_finance_private.invoice_amendment_block(p_cafe_id,p_invoice_id);state:=brand_finance_private.document_state(p_cafe_id,p_invoice_id);
 SELECT coalesce(max(r.revision),0) INTO revision FROM brand_finance_private.invoice_amendment_revisions r WHERE r.cafe_id=p_cafe_id AND r.invoice_id=p_invoice_id;
 RETURN jsonb_build_object('available',true,'canAmend',blocked IS NULL,'code',coalesce(blocked->>'code','ready'),'message',coalesce(blocked->>'message',''),'invoiceId',p_invoice_id,'revision',revision,'saudiEinvoice',policy,'note',d.note,'currentTotal',d.total,'currentPaid',greatest(d.paid,d.total-coalesce((state->>'outstanding')::numeric,d.total)),'discount',d.discount,'taxRate',coalesce(d.vat_rate,0),'taxInclusive',coalesce(d.tax_inclusive,false),
 'lines',CASE WHEN blocked IS NOT NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'productId',l.product_id,'name',l.name,'quantity',l.quantity,'price',l.unit_price,'description',l.amendment_description,'unitLabel',coalesce(l.unit_label,'الوحدة الأساسية'),'unitFactor',l.stock_unit_factor) ORDER BY l.id) FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe_id AND l.document_id=p_invoice_id),'[]') END);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_amendment_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_amendment_context(uuid,uuid) TO authenticated;

CREATE FUNCTION public.brand_finance_amend_invoice(p_cafe_id uuid,p_input jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<amend>>
DECLARE invoice uuid:=(p_input->>'invoiceId')::uuid;expected_revision integer:=(p_input->>'expectedRevision')::integer;
 d public.bf_documents%ROWTYPE;old_line public.bf_document_lines%ROWTYPE;current_line public.bf_document_lines%ROWTYPE;product public.menu_products%ROWTYPE;
 prior brand_finance_private.invoice_amendment_revisions%ROWTYPE;blocked jsonb;before_data jsonb;prepared jsonb:='[]';desired jsonb:='[]';entry jsonb;row_data jsonb;component jsonb;old_component record;link record;
 id uuid;product_id uuid;qty numeric;price numeric;gross numeric;subtotal numeric:=0;total numeric;paid numeric;remaining_discount numeric;remaining_gross numeric;allocated_discount numeric;revision integer;
 target_qty numeric;delta_qty numeric;movement_cost numeric;old_cost numeric:=0;new_cost numeric:=0;new_components jsonb:='[]';component_cost numeric;divisor integer;actor_name text;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل الفواتير' USING ERRCODE='42501';END IF;
 IF p_request_id IS NULL OR invoice IS NULL OR expected_revision IS NULL OR expected_revision<0 OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>150000 OR jsonb_typeof(p_input->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'lines') NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_input->'note') IS DISTINCT FROM 'string' OR length(p_input->>'note')>1000 THEN RAISE EXCEPTION 'راجع بيانات تعديل الفاتورة' USING ERRCODE='22023';END IF;
 PERFORM erp_branch_private.enter(p_cafe_id);PERFORM erp_branch_private.assert_input(p_cafe_id,p_input);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text||':system-settings',0));
 SELECT * INTO prior FROM brand_finance_private.invoice_amendment_revisions WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.invoice_id IS DISTINCT FROM invoice OR prior.fingerprint IS DISTINCT FROM md5(p_input::text) THEN RAISE EXCEPTION 'معرف العملية مستخدم لتعديل مختلف' USING ERRCODE='22023';END IF;
  RETURN jsonb_build_object('invoiceId',invoice,'revision',prior.revision);
 END IF;
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe_id AND bf_documents.id=invoice FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير متاحة' USING ERRCODE='42501';END IF;
 SELECT coalesce(max(r.revision),0) INTO revision FROM brand_finance_private.invoice_amendment_revisions r WHERE r.cafe_id=p_cafe_id AND r.invoice_id=invoice;
 IF revision<>expected_revision THEN RAISE EXCEPTION 'تغيرت الفاتورة أعد فتحها قبل التعديل' USING ERRCODE='40001';END IF;
 blocked:=brand_finance_private.invoice_amendment_block(p_cafe_id,invoice);
 IF blocked IS NOT NULL THEN RAISE EXCEPTION '%',blocked->>'message' USING ERRCODE='22023';END IF;
 before_data:=brand_finance_private.invoice_amendment_snapshot(p_cafe_id,invoice);
 SELECT coalesce(sum(cost),0) INTO old_cost FROM public.bf_document_lines WHERE cafe_id=p_cafe_id AND document_id=invoice;
 paid:=greatest(d.paid,d.total-coalesce((brand_finance_private.document_state(p_cafe_id,invoice)->>'outstanding')::numeric,d.total));
 IF (SELECT count(*) FROM jsonb_array_elements(p_input->'lines') e WHERE e->>'id' IS NOT NULL)<>(SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(p_input->'lines') e WHERE e->>'id' IS NOT NULL) THEN RAISE EXCEPTION 'لا تكرر بند الفاتورة';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_input->'lines') LOOP
  id:=nullif(entry->>'id','')::uuid;product_id:=(entry->>'productId')::uuid;qty:=(entry->>'quantity')::numeric;price:=(entry->>'price')::numeric;
  IF qty IS NULL OR qty<=0 OR qty>9999 OR qty<>round(qty,3) OR price IS NULL OR price<0 OR price>10000000 OR price<>round(price,6) OR qty::text IN('NaN','Infinity','-Infinity') OR price::text IN('NaN','Infinity','-Infinity') OR jsonb_typeof(entry->'description') IS DISTINCT FROM 'string' OR length(entry->>'description')>500 THEN RAISE EXCEPTION 'راجع كميات وأسعار وتفاصيل البنود' USING ERRCODE='22023';END IF;
  old_line:=NULL;
  IF id IS NOT NULL THEN SELECT * INTO old_line FROM public.bf_document_lines WHERE cafe_id=p_cafe_id AND document_id=invoice AND bf_document_lines.id=amend.id;IF NOT FOUND THEN RAISE EXCEPTION 'أحد البنود لا ينتمي إلى الفاتورة' USING ERRCODE='42501';END IF;END IF;
  SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND menu_products.id=amend.product_id AND deleted_at IS NULL AND available FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح حدّث الفاتورة';END IF;
  id:=coalesce(id,gen_random_uuid());gross:=round(qty*price,2);subtotal:=subtotal+gross;
  row_data:=CASE WHEN old_line.id IS NOT NULL AND old_line.product_id=product_id THEN to_jsonb(old_line) ELSE jsonb_build_object('id',id,'cafe_id',p_cafe_id,'document_id',invoice,'product_id',product_id,'name',product.name,'activity_kind','product','vat_rate',0,'tax_category','O','exemption_reason','','stock_unit_factor',1,'unit_id',NULL,'unit_label',NULL,'inventory_item_id',NULL,'reference_line_id',NULL) END;
  row_data:=row_data||jsonb_build_object('id',id,'quantity',qty,'unit_price',price,'amendment_description',entry->>'description','gross',gross,'tax',0,'cost',0,'allocated_cost',0,'cost_status','untracked','item_id',NULL);
  prepared:=prepared||jsonb_build_array(row_data);
  IF old_line.id IS NOT NULL AND old_line.product_id=product_id THEN
   FOR old_component IN SELECT * FROM public.bf_line_components WHERE cafe_id=p_cafe_id AND line_id=old_line.id ORDER BY item_id LOOP
    target_qty:=round(old_component.quantity*qty/old_line.quantity,3);
    IF target_qty<=0 THEN RAISE EXCEPTION 'كمية أحد المكونات أصغر من دقة المخزون';END IF;
    desired:=desired||jsonb_build_array(to_jsonb(old_component)||jsonb_build_object('quantity',target_qty));
   END LOOP;
  ELSE
   FOR link IN SELECT l.item_id,l.quantity,i.cost_mode,(SELECT count(*) FROM public.bf_item_product_links x JOIN public.menu_products p ON p.cafe_id=x.cafe_id AND p.id=x.product_id AND p.deleted_at IS NULL WHERE x.cafe_id=l.cafe_id AND x.item_id=l.item_id) linked_count
    FROM public.bf_item_product_links l JOIN public.bf_items i ON i.cafe_id=l.cafe_id AND i.id=l.item_id AND i.active WHERE l.cafe_id=p_cafe_id AND l.product_id=amend.product_id ORDER BY l.item_id LOOP
    target_qty:=round(link.quantity*qty,3);divisor:=CASE WHEN link.cost_mode='equal_split' THEN greatest(link.linked_count,1) ELSE 1 END;
    IF target_qty<=0 THEN RAISE EXCEPTION 'كمية أحد المكونات أصغر من دقة المخزون';END IF;
    desired:=desired||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'cafe_id',p_cafe_id,'line_id',id,'item_id',link.item_id,'warehouse_id',d.warehouse_id,'quantity',target_qty,'cost',0,'allocated_cost',0,'cost_mode',link.cost_mode,'allocation_divisor',divisor,'cost_status','known','original_component_id',NULL));
   END LOOP;
  END IF;
 END LOOP;
 IF subtotal<d.discount THEN RAISE EXCEPTION 'إجمالي البنود أقل من خصم الفاتورة';END IF;
 total:=subtotal-d.discount;
 IF total<paid THEN RAISE EXCEPTION 'إجمالي الفاتورة بعد التعديل أقل من المبلغ المحصل راجع المدفوعات أولًا';END IF;
 IF d.party_id IS NULL AND total<>paid THEN RAISE EXCEPTION 'الفاتورة غير مرتبطة بعميل ولا يمكن إضافة مبلغ آجل إليها';END IF;
 IF jsonb_array_length(desired)>1000 THEN RAISE EXCEPTION 'عدد المكونات يتجاوز حد التعديل';END IF;
 PERFORM 1 FROM public.bf_stock s WHERE s.cafe_id=p_cafe_id AND EXISTS(SELECT 1 FROM jsonb_array_elements(desired||(before_data->'components')) x WHERE (x->>'item_id')::uuid=s.item_id AND (x->>'warehouse_id')::uuid=s.warehouse_id) ORDER BY s.warehouse_id,s.item_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(desired||(before_data->'components')) x LEFT JOIN public.bf_stock s ON s.cafe_id=p_cafe_id AND s.item_id=(x->>'item_id')::uuid AND s.warehouse_id=(x->>'warehouse_id')::uuid WHERE s.item_id IS NULL OR s.cost_known IS DISTINCT FROM true OR s.quantity<0) THEN RAISE EXCEPTION 'يلزم مخزون بتكلفة موثقة قبل تعديل مكونات الفاتورة';END IF;
 INSERT INTO brand_finance_private.invoice_amendment_tickets VALUES(pg_backend_pid(),pg_current_xact_id(),p_cafe_id,invoice,auth.uid());
 -- Release only the reduction in each historical component; unchanged quantities
 -- retain their historical cost, including when the recipe has since changed.
 FOR old_component IN SELECT * FROM public.bf_line_components WHERE cafe_id=p_cafe_id AND line_id IN(SELECT l.id FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe_id AND l.document_id=invoice) ORDER BY warehouse_id,item_id,line_id LOOP
  SELECT x INTO component FROM jsonb_array_elements(desired) x WHERE x->>'id'=old_component.id::text;
  target_qty:=coalesce((component->>'quantity')::numeric,0);delta_qty:=old_component.quantity-target_qty;
  IF delta_qty>0 THEN
   movement_cost:=brand_finance_private.stock_move(p_cafe_id,invoice,old_component.item_id,old_component.warehouse_id,delta_qty,old_component.cost/old_component.quantity);
   component_cost:=greatest(0,old_component.cost-movement_cost);
  ELSE component_cost:=old_component.cost;END IF;
  IF component IS NOT NULL THEN new_components:=new_components||jsonb_build_array(component||jsonb_build_object('cost',component_cost));END IF;
 END LOOP;
 FOR component IN SELECT value FROM jsonb_array_elements(desired) LOOP
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(new_components) x WHERE x->>'id'=component->>'id') THEN new_components:=new_components||jsonb_build_array(component);END IF;
 END LOOP;
 desired:='[]';
 FOR component IN SELECT value FROM jsonb_array_elements(new_components) ORDER BY value->>'warehouse_id',value->>'item_id',value->>'line_id' LOOP
  SELECT * INTO old_component FROM public.bf_line_components WHERE cafe_id=p_cafe_id AND bf_line_components.id=(component->>'id')::uuid;
  delta_qty:=(component->>'quantity')::numeric-coalesce(old_component.quantity,0);component_cost:=(component->>'cost')::numeric;
  IF delta_qty>0 THEN
   IF coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=(component->>'item_id')::uuid AND warehouse_id=(component->>'warehouse_id')::uuid),0)<delta_qty THEN RAISE EXCEPTION 'المخزون لا يكفي لكمية أحد مكونات الفاتورة';END IF;
   component_cost:=component_cost+brand_finance_private.stock_move(p_cafe_id,invoice,(component->>'item_id')::uuid,(component->>'warehouse_id')::uuid,-delta_qty,0);
  END IF;
  desired:=desired||jsonb_build_array(component||jsonb_build_object('cost',component_cost,'allocated_cost',round(component_cost/(component->>'allocation_divisor')::integer,2)));
 END LOOP;
 DELETE FROM public.bf_line_components WHERE cafe_id=p_cafe_id AND line_id IN(SELECT l.id FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe_id AND l.document_id=invoice);
 DELETE FROM public.bf_document_lines WHERE cafe_id=p_cafe_id AND document_id=invoice;
 remaining_discount:=d.discount;remaining_gross:=subtotal;
 FOR row_data IN SELECT value FROM jsonb_array_elements(prepared) LOOP
  gross:=(row_data->>'gross')::numeric;allocated_discount:=CASE WHEN remaining_gross=0 THEN 0 ELSE least(gross,remaining_discount,round(remaining_discount*gross/remaining_gross,2)) END;
  remaining_discount:=remaining_discount-allocated_discount;remaining_gross:=remaining_gross-gross;
  SELECT coalesce(sum((x->>'cost')::numeric),0),coalesce(sum((x->>'allocated_cost')::numeric),0) INTO component_cost,movement_cost FROM jsonb_array_elements(desired) x WHERE x->>'line_id'=row_data->>'id';
  row_data:=row_data||jsonb_build_object('net',gross-allocated_discount,'cost',component_cost,'allocated_cost',movement_cost,'cost_status',CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(desired) x WHERE x->>'line_id'=row_data->>'id') THEN 'known' ELSE 'untracked' END,'item_id',(SELECT x->>'item_id' FROM jsonb_array_elements(desired) x WHERE x->>'line_id'=row_data->>'id' ORDER BY x->>'item_id' LIMIT 1));
  current_line:=jsonb_populate_record(NULL::public.bf_document_lines,row_data);
  INSERT INTO public.bf_document_lines SELECT current_line.*;
  new_cost:=new_cost+component_cost;
 END LOOP;
 INSERT INTO public.bf_line_components SELECT x.* FROM jsonb_populate_recordset(NULL::public.bf_line_components,desired) x;
 UPDATE public.bf_documents SET subtotal=amend.subtotal,total=amend.total,note=p_input->>'note' WHERE cafe_id=p_cafe_id AND bf_documents.id=invoice;
 PERFORM brand_finance_private.line(p_cafe_id,invoice,brand_finance_private.account(p_cafe_id,'1100'),greatest(total-d.total,0),greatest(d.total-total,0),d.party_id);
 PERFORM brand_finance_private.line(p_cafe_id,invoice,brand_finance_private.account(p_cafe_id,'4000'),greatest(d.total-total,0),greatest(total-d.total,0));
 PERFORM brand_finance_private.line(p_cafe_id,invoice,brand_finance_private.account(p_cafe_id,'5000'),greatest(new_cost-old_cost,0),greatest(old_cost-new_cost,0));
 PERFORM brand_finance_private.line(p_cafe_id,invoice,brand_finance_private.account(p_cafe_id,'1200'),greatest(old_cost-new_cost,0),greatest(new_cost-old_cost,0));
 SELECT coalesce(nullif(to_jsonb(p)->>'full_name',''),nullif(to_jsonb(p)->>'name',''),auth.uid()::text) INTO actor_name FROM public.profiles p WHERE p.id=auth.uid();
 INSERT INTO brand_finance_private.invoice_amendment_revisions(cafe_id,invoice_id,revision,request_id,actor_id,actor_name,fingerprint,before_snapshot,after_snapshot)
 VALUES(p_cafe_id,invoice,revision+1,p_request_id,auth.uid(),coalesce(actor_name,auth.uid()::text),md5(p_input::text),before_data,brand_finance_private.invoice_amendment_snapshot(p_cafe_id,invoice));
 DELETE FROM brand_finance_private.invoice_amendment_tickets WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id() AND cafe_id=p_cafe_id AND invoice_id=invoice;
 RETURN jsonb_build_object('invoiceId',invoice,'revision',revision+1);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_amend_invoice(uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_amend_invoice(uuid,jsonb,uuid) TO authenticated;

-- Preserve original read authorization and add revision events/descriptions inside
-- the existing detail request, without another client request or cache.
DO $copy$
DECLARE source text;needle text:='public.brand_finance_invoice_detail(';
BEGIN
 SELECT pg_get_functiondef('public.brand_finance_invoice_detail(uuid,uuid)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Invoice amendment detail reader anchor drift';END IF;
 EXECUTE replace(source,needle,'brand_finance_private.invoice_detail_before_amendment(');
END $copy$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_detail_before_amendment(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.brand_finance_invoice_detail(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;lines jsonb;events jsonb;
BEGIN
 result:=brand_finance_private.invoice_detail_before_amendment(p_cafe_id,p_id);
 IF result IS NULL OR result#>>'{document,id}' IS NULL THEN RETURN result;END IF;
 SELECT coalesce(jsonb_agg(x.value||jsonb_build_object('description',coalesce(l.amendment_description,'')) ORDER BY x.ordinality),'[]') INTO lines FROM jsonb_array_elements(result#>'{document,lines}') WITH ORDINALITY x(value,ordinality) LEFT JOIN public.bf_document_lines l ON l.cafe_id=p_cafe_id AND l.document_id=p_id AND l.id::text=x.value->>'id';
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.request_id,'action','تعديل بنود الفاتورة','actor',r.actor_name,'created_at',r.created_at,'documentId',p_id) ORDER BY r.revision DESC),'[]') INTO events FROM brand_finance_private.invoice_amendment_revisions r WHERE r.cafe_id=p_cafe_id AND r.invoice_id=p_id;
 RETURN jsonb_set(jsonb_set(result,'{document,lines}',lines),'{activity}',coalesce(result->'activity','[]')||events);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_detail(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_detail(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
