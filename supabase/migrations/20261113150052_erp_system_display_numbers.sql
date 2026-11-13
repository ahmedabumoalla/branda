BEGIN;
INSERT INTO erp_settings_private.number_contexts VALUES ('booking','حجز','erp_bookings','displayNumber',NULL,NULL),
('rental_reservation','أمر الحجز','erp_rental_reservations','displayNumber',NULL,NULL),
('branch','الفروع','erp_branch_details','code',NULL,NULL),
('task_template','قالب مهمة','erp_task_templates','displayNumber',NULL,NULL),
('manual_journal','قيد يدوي','bf_gl_drafts','displayNumber',NULL,NULL),
('automatic_journal','قيد تلقائي','bf_documents','displayNumber','kind','journal'),
('purchase_return','مرتجع مشتريات','bf_documents','displayNumber','kind','refund'),
('purchase_debit','الإشعارات المدينة للمشتريات','bf_documents','displayNumber','kind','refund'),
('sales_return','فاتورة مرتجعة','bf_documents','displayNumber','kind','refund'),
('invoice_payment','مدفوعات الفواتير','bf_documents','displayNumber','kind','settlement'),
('purchase_payment','دفع فاتورة الشراء','bf_documents','displayNumber','kind','settlement'),
('refund_payment','دفع مبلغ مرتجع','bf_documents','displayNumber','kind','refund'),
('purchase_return_payment','مدفوعات مرتجع المشتريات','bf_documents','displayNumber','kind','refund'),
('custody_settlement','تسوية العهدة','erp_finance_custody_movements','displayNumber','kind','settlement');
CREATE TRIGGER erp_system_number BEFORE INSERT ON public.erp_branch_details FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_number();
CREATE FUNCTION erp_settings_private.assign_display_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE j jsonb:=to_jsonb(NEW);ctx text;reference public.bf_documents;draft uuid;BEGIN
 IF TG_TABLE_NAME='bf_documents' THEN
  SELECT * INTO reference FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_id;
  IF NEW.kind='settlement' THEN
   ctx:=CASE reference.kind WHEN 'sale' THEN 'invoice_payment' WHEN 'purchase' THEN 'purchase_payment' WHEN 'refund' THEN CASE WHEN EXISTS(SELECT 1 FROM public.bf_documents d WHERE d.cafe_id=NEW.cafe_id AND d.id=reference.reference_id AND d.kind='purchase') THEN 'purchase_return_payment' ELSE 'refund_payment' END END;
  ELSIF NEW.kind='refund' THEN
   ctx:=CASE WHEN reference.kind='purchase' THEN CASE WHEN EXISTS(SELECT 1 FROM public.erp_purchase_debits WHERE cafe_id=NEW.cafe_id AND document_id=NEW.id) THEN 'purchase_debit' ELSE 'purchase_return' END WHEN reference.kind='sale' THEN 'sales_return' END;
  ELSIF NEW.kind='journal' THEN
   SELECT id INTO draft FROM public.bf_gl_drafts WHERE cafe_id=NEW.cafe_id AND document_id=NEW.id;
   IF draft IS NOT NULL THEN RETURN NEW;END IF;ctx:='automatic_journal';
  END IF;
 ELSE ctx:=CASE TG_TABLE_NAME WHEN 'erp_bookings' THEN 'booking' WHEN 'erp_rental_reservations' THEN 'rental_reservation' WHEN 'erp_task_templates' THEN 'task_template' WHEN 'bf_gl_drafts' THEN 'manual_journal' WHEN 'erp_finance_custody_movements' THEN CASE WHEN j->>'kind'='settlement' THEN 'custody_settlement' END END;
 END IF;
 IF ctx IS NOT NULL THEN PERFORM erp_settings_private.allocate_number((j->>'cafe_id')::uuid,ctx,(j->>'id')::uuid,coalesce((j->>'created_at')::timestamptz,now()));END IF;
 -- A paid refund is itself the actual cash movement, not a fictitious settlement child
 IF TG_TABLE_NAME='bf_documents' AND j->>'kind'='refund' AND coalesce((j->>'paid')::numeric,0)>0 AND reference.kind IN('sale','purchase') THEN PERFORM erp_settings_private.allocate_number(NEW.cafe_id,CASE reference.kind WHEN 'purchase' THEN 'purchase_return_payment' ELSE 'refund_payment' END,NEW.id,NEW.created_at);END IF;RETURN NEW;
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_bookings','erp_rental_reservations','erp_task_templates','bf_gl_drafts','erp_finance_custody_movements'] LOOP EXECUTE format('CREATE TRIGGER erp_system_display_number AFTER INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_display_number()',t);END LOOP;END $$;
-- Classification waits for linked debit/manual-journal metadata in the same transaction
CREATE CONSTRAINT TRIGGER erp_system_display_number AFTER INSERT ON public.bf_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_display_number();
CREATE INDEX IF NOT EXISTS erp_system_gl_document ON public.bf_gl_drafts(cafe_id,document_id) WHERE document_id IS NOT NULL;
CREATE INDEX erp_system_number_record ON erp_settings_private.numbers(cafe_id,record_id);
CREATE FUNCTION erp_settings_private.display_record(c uuid,j jsonb,contexts text[],record_key text DEFAULT 'id',posted_manual boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE rid uuid;v text;BEGIN
 IF jsonb_typeof(j)<>'object' OR coalesce(j->>record_key,'')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RETURN j;END IF;rid:=(j->>record_key)::uuid;
 SELECT n.value INTO v FROM erp_settings_private.numbers n WHERE n.cafe_id=c AND n.record_id=rid AND n.context=ANY(contexts) ORDER BY array_position(contexts,n.context),n.created_at LIMIT 1;
 IF v IS NULL AND posted_manual THEN SELECT n.value INTO v FROM public.bf_gl_drafts d JOIN erp_settings_private.numbers n ON n.cafe_id=d.cafe_id AND n.record_id=d.id AND n.context='manual_journal' WHERE d.cafe_id=c AND d.document_id=rid LIMIT 1;END IF;
 RETURN CASE WHEN v IS NULL THEN j ELSE j||jsonb_build_object('displayNumber',v) END;
END $$;
CREATE FUNCTION erp_settings_private.display_rows(c uuid,j jsonb,contexts text[],record_key text DEFAULT 'id',posted_manual boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$SELECT CASE WHEN jsonb_typeof(j)='array' THEN coalesce((SELECT jsonb_agg(erp_settings_private.display_record(c,e,contexts,record_key,posted_manual) ORDER BY i) FROM jsonb_array_elements(j) WITH ORDINALITY x(e,i)),'[]') ELSE j END$$;
CREATE FUNCTION erp_settings_private.display_numbers(c uuid,j jsonb,reader text,kind text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE groups text[]:='{}';group_name text;contexts text[]:='{}';record_key text:='id';financial boolean:=false;financial_contexts text[]:=ARRAY['automatic_journal','purchase_return','purchase_debit','sales_return','invoice_payment','purchase_payment','refund_payment','purchase_return_payment'];BEGIN
 -- Each collection is bound to its canonical source; nested/custom objects are never searched
 CASE reader
 WHEN 'erp_bookings_read' THEN groups:=ARRAY['bookings'];contexts:=ARRAY['booking'];
 WHEN 'erp_rentals_read' THEN groups:=ARRAY['reservations'];contexts:=ARRAY['rental_reservation'];
 WHEN 'erp_tasks_read' THEN groups:=ARRAY['templates'];contexts:=ARRAY['task_template'];
 WHEN 'erp_accounting_read' THEN groups:=ARRAY['drafts'];contexts:=ARRAY['manual_journal'];
 WHEN 'erp_accounting_report' THEN groups:=ARRAY['entries'];record_key:='document_id';financial:=true;
 WHEN 'erp_accounting_detail' THEN
  IF kind='document' AND j?'document' THEN RETURN jsonb_set(j,'{document}',erp_settings_private.display_record(c,j->'document',financial_contexts,'id',true));END IF;RETURN j;
 WHEN 'erp_purchases_read' THEN
  FOREACH group_name IN ARRAY ARRAY['invoices','payments','statements'] LOOP IF jsonb_typeof(j->group_name)='array' THEN j:=jsonb_set(j,ARRAY[group_name],erp_settings_private.display_rows(c,j->group_name,financial_contexts,CASE WHEN group_name='statements' THEN 'documentId' ELSE 'id' END,true));END IF;END LOOP;RETURN j;
 WHEN 'erp_finance_detail' THEN
  IF kind='custody' THEN RETURN erp_settings_private.display_rows(c,j,ARRAY['custody_settlement']);ELSIF kind='bank' THEN groups:=ARRAY['journal'];record_key:='document_id';financial:=true;ELSE RETURN j;END IF;
 WHEN 'erp_treasury' THEN
  IF kind='brand_finance_treasury_statement' THEN groups:=ARRAY['rows'];record_key:='document_id';financial:=true;financial_contexts:=ARRAY['invoice_payment','purchase_payment','refund_payment','purchase_return_payment','automatic_journal','sales_return','purchase_return','purchase_debit'];ELSE RETURN j;END IF;
 ELSE RETURN j;
 END CASE;
 IF financial THEN contexts:=financial_contexts;END IF;
 FOREACH group_name IN ARRAY groups LOOP IF jsonb_typeof(j->group_name)='array' THEN j:=jsonb_set(j,ARRAY[group_name],erp_settings_private.display_rows(c,j->group_name,contexts,record_key,financial));END IF;END LOOP;RETURN j;
END $$;
DO $$DECLARE f record;args text;callargs text;old_name text;selector text;BEGIN
 FOR f IN SELECT p.oid,p.proname,p.pronargs,p.proargtypes FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prorettype='jsonb'::regtype AND p.proname IN('erp_bookings_read','erp_rentals_read','erp_tasks_read','erp_accounting_read','erp_accounting_detail','erp_accounting_report','erp_purchases_read','erp_finance_detail','erp_treasury') LOOP
  args:=pg_get_function_arguments(f.oid);SELECT string_agg('$'||i,',') INTO callargs FROM generate_series(1,f.pronargs)i;old_name:=f.proname||'_before_display_numbers';selector:=CASE WHEN f.proname IN('erp_accounting_detail','erp_finance_detail','erp_treasury') THEN '$2' ELSE quote_literal('') END;
  EXECUTE format('ALTER FUNCTION %s RENAME TO %I',f.oid::regprocedure,old_name);EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA erp_settings_private',old_name,oidvectortypes(f.proargtypes));EXECUTE format('REVOKE ALL ON FUNCTION erp_settings_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',old_name,oidvectortypes(f.proargtypes));
  EXECUTE format('CREATE FUNCTION public.%I(%s) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='''' AS %L',f.proname,args,format('SELECT erp_settings_private.display_numbers($1,erp_settings_private.%I(%s),%L,%s)',old_name,callargs,f.proname,selector));
  EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC,anon,service_role',f.proname,oidvectortypes(f.proargtypes));EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',f.proname,oidvectortypes(f.proargtypes));
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_settings_private.assign_display_number(),erp_settings_private.display_numbers(uuid,jsonb,text,text),erp_settings_private.display_record(uuid,jsonb,text[],text,boolean),erp_settings_private.display_rows(uuid,jsonb,text[],text,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
