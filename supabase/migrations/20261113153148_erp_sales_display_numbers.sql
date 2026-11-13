BEGIN;
-- Depends on the narrowly scoped display-record helper in 20261113150052
DO $$BEGIN IF to_regprocedure('erp_settings_private.display_record(uuid,jsonb,text[],text,boolean)') IS NULL THEN RAISE EXCEPTION 'Apply the system display-number migration first';END IF;END$$;
INSERT INTO erp_settings_private.number_contexts(context,label,table_name,column_path,filter_key,filter_value) VALUES
 ('sales_quote','عروض أسعار المبيعات','bf_quotes','displayNumber',NULL,NULL),
 ('sales_credit_note','الإشعارات الدائنة للمبيعات','bf_credit_notes','displayNumber',NULL,NULL);
CREATE FUNCTION erp_settings_private.assign_sales_display_number() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 PERFORM erp_settings_private.allocate_number(NEW.cafe_id,CASE TG_TABLE_NAME WHEN 'bf_quotes' THEN 'sales_quote' WHEN 'bf_credit_notes' THEN 'sales_credit_note' END,NEW.id,NEW.created_at);
 RETURN NEW;
END$$;
CREATE TRIGGER erp_sales_display_number AFTER INSERT ON public.bf_quotes FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_sales_display_number();
CREATE TRIGGER erp_sales_display_number AFTER INSERT ON public.bf_credit_notes FOR EACH ROW EXECUTE FUNCTION erp_settings_private.assign_sales_display_number();
-- A legacy reader without an ERP branch selection must keep its legacy behavior;
-- only the new number is withheld when the branch context cannot authorize it
CREATE FUNCTION erp_settings_private.sales_number_visible(c uuid,j jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$BEGIN
 RETURN erp_branch_private.row_allowed(c,erp_branch_private.current_branch(c),j,'');
EXCEPTION WHEN SQLSTATE '42501' THEN RETURN false;
END$$;
-- Preserve the original function OIDs and every caller's existing authorization
DO $$DECLARE n text;source text;BEGIN
 FOREACH n IN ARRAY ARRAY['quote_record','credit_note_record'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO STRICT source FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='brand_finance_private' AND p.proname=n;
  EXECUTE replace(source,'FUNCTION brand_finance_private.'||n||'(','FUNCTION brand_finance_private.'||n||'_before_sales_display(');
 END LOOP;
END$$;
CREATE OR REPLACE FUNCTION brand_finance_private.quote_record(q public.bf_quotes) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN erp_settings_private.sales_number_visible(q.cafe_id,to_jsonb(q)) THEN erp_settings_private.display_record(q.cafe_id,brand_finance_private.quote_record_before_sales_display(q),ARRAY['sales_quote']) ELSE brand_finance_private.quote_record_before_sales_display(q) END
$$;
CREATE OR REPLACE FUNCTION brand_finance_private.credit_note_record(n public.bf_credit_notes,detail boolean DEFAULT true) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN erp_settings_private.sales_number_visible(n.cafe_id,to_jsonb(n)) THEN erp_settings_private.display_record(n.cafe_id,brand_finance_private.credit_note_record_before_sales_display(n,detail),ARRAY['sales_credit_note']) ELSE brand_finance_private.credit_note_record_before_sales_display(n,detail) END
$$;
-- Search the exact authorized source context before pagination, without changing numeric identity
DO $$DECLARE source text;needle text:='customer_name||'' ''||number::text||'' ''||coalesce(source_number::text,'''')';replacement text:='customer_name||'' ''||number::text||'' ''||coalesce(source_number::text,'''')||'' ''||coalesce((SELECT value FROM erp_settings_private.numbers sn WHERE sn.cafe_id=p_cafe_id AND sn.context=''sales_credit_note'' AND sn.record_id=bf_credit_notes.id),'''')';BEGIN
 source:=pg_get_functiondef('public.brand_finance_credit_notes(uuid,uuid,jsonb)'::regprocedure);
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>2 THEN RAISE EXCEPTION 'Credit-note source changed; review search adapter';END IF;
 -- The count query names its source n; the paginated inner query names the table directly
 replacement:=replace(replacement,'sn.record_id=bf_credit_notes.id','sn.record_id=bf_credit_notes.id AND erp_settings_private.sales_number_visible(p_cafe_id,to_jsonb(bf_credit_notes))');
 source:=replace(source,needle,replacement);
 source:=replace(source,'FROM public.bf_credit_notes n WHERE cafe_id=p_cafe_id AND status','FROM public.bf_credit_notes WHERE cafe_id=p_cafe_id AND status');
 EXECUTE source;
END$$;
-- Linked workflow/work-order labels use the same exact source context, never arbitrary UUID traversal
DO $$DECLARE source text;BEGIN
 source:=pg_get_functiondef('erp_work_private.target(uuid,text,uuid)'::regprocedure);
 EXECUTE replace(source,'FUNCTION erp_work_private.target(','FUNCTION erp_work_private.target_before_sales_display(');
END$$;
CREATE OR REPLACE FUNCTION erp_work_private.target(c uuid,k text,i uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE r jsonb;v text;row_data jsonb;BEGIN
 r:=erp_work_private.target_before_sales_display(c,k,i);
 IF r IS NULL OR k NOT IN('quotation','credit_note') THEN RETURN r;END IF;
 IF k='quotation' THEN SELECT to_jsonb(q) INTO row_data FROM public.bf_quotes q WHERE q.cafe_id=c AND q.id=i;ELSE SELECT to_jsonb(n) INTO row_data FROM public.bf_credit_notes n WHERE n.cafe_id=c AND n.id=i;END IF;
 IF NOT erp_settings_private.sales_number_visible(c,row_data) THEN RETURN r;END IF;
 v:=erp_settings_private.display_record(c,r,ARRAY[CASE k WHEN 'quotation' THEN 'sales_quote' ELSE 'sales_credit_note' END])->>'displayNumber';
 RETURN CASE WHEN v IS NULL THEN r ELSE r||jsonb_build_object('displayNumber',v,'label',CASE k WHEN 'quotation' THEN 'عرض سعر #' ELSE 'إشعار دائن #' END||v) END;
END$$;
DO $$DECLARE signature text;source text;t text;ctx text;needle text;replacement text;BEGIN
 FOREACH signature IN ARRAY ARRAY['erp_branch_private.erp_workflow_targets_before_scope(uuid,uuid,text,text)','erp_branch_private.erp_work_order_targets_before_scope(uuid,text,text)'] LOOP
  source:=pg_get_functiondef(signature::regprocedure);
  FOREACH t IN ARRAY ARRAY['bf_quotes','bf_credit_notes'] LOOP
   ctx:=CASE t WHEN 'bf_quotes' THEN 'sales_quote' ELSE 'sales_credit_note' END;
   needle:='FROM public.'||t||' WHERE cafe_id=p_cafe_id AND'||CASE t WHEN 'bf_credit_notes' THEN ' status<>''deleted'' AND' ELSE '' END||'(number::text ILIKE';
   IF position(needle IN source)=0 THEN RAISE EXCEPTION 'Linked sales target search changed: %',signature;END IF;
   replacement:='FROM public.'||t||' WHERE cafe_id=p_cafe_id AND'||CASE t WHEN 'bf_credit_notes' THEN ' status<>''deleted'' AND' ELSE '' END||'(EXISTS(SELECT 1 FROM erp_settings_private.numbers sn WHERE sn.cafe_id=p_cafe_id AND sn.context='||quote_literal(ctx)||' AND sn.record_id='||t||'.id AND sn.value ILIKE ''%''||p_query||''%'' AND erp_settings_private.sales_number_visible(p_cafe_id,to_jsonb('||t||'))) OR number::text ILIKE';
   source:=replace(source,needle,replacement);
  END LOOP;
  EXECUTE source;
 END LOOP;
END$$;
REVOKE ALL ON FUNCTION erp_settings_private.assign_sales_display_number(),brand_finance_private.quote_record_before_sales_display(public.bf_quotes),brand_finance_private.credit_note_record_before_sales_display(public.bf_credit_notes,boolean),brand_finance_private.quote_record(public.bf_quotes),brand_finance_private.credit_note_record(public.bf_credit_notes,boolean),erp_work_private.target_before_sales_display(uuid,text,uuid),erp_work_private.target(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_settings_private.sales_number_visible(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
