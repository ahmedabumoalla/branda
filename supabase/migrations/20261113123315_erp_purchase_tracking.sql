BEGIN;
-- Additive integration: receipt identities are metadata, never a second stock ledger
ALTER TABLE public.erp_purchase_receipts ADD COLUMN tracking jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(tracking)='object');
CREATE FUNCTION erp_inventory_private.purchase_tracking(c uuid,invoice uuid,line_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT tracking->line_id::text FROM public.erp_purchase_receipts WHERE cafe_id=c AND source_document_id=invoice),(SELECT l->'tracking' FROM public.erp_purchase_documents d CROSS JOIN LATERAL jsonb_array_elements(d.payload->'lines') l WHERE d.cafe_id=c AND d.finance_id=invoice AND l->>'id'=line_id::text),'[]'::jsonb)
$$;
CREATE FUNCTION erp_inventory_private.set_purchase_tracking(c uuid,invoice uuid,rev integer,input jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$DECLARE r public.erp_purchase_receipts%ROWTYPE;k text;BEGIN
 SELECT * INTO r FROM public.erp_purchase_receipts WHERE cafe_id=c AND source_document_id=invoice FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR rev IS NULL OR r.revision<>rev THEN RAISE EXCEPTION 'تغير إذن الاستلام أو سبق اعتماده';END IF;
 IF input IS NULL THEN RETURN;END IF;
 IF jsonb_typeof(input)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(input))>100 THEN RAISE EXCEPTION 'بيانات تتبع الاستلام غير صالحة';END IF;
 FOR k IN SELECT jsonb_object_keys(input) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.bf_document_lines l JOIN public.erp_inventory_items i ON i.cafe_id=l.cafe_id AND i.item_id=l.item_id WHERE l.cafe_id=c AND l.document_id=invoice AND l.id::text=k AND i.tracking_mode<>'quantity') OR jsonb_typeof(input->k)<>'array' THEN RAISE EXCEPTION 'بيانات التتبع لا تخص سطرًا مخزنيًا في هذه الفاتورة';END IF;
 END LOOP;
 UPDATE public.erp_purchase_receipts SET tracking=tracking||input WHERE cafe_id=c AND source_document_id=invoice;
END $$;
DO $$DECLARE source text;needle text;BEGIN
 SELECT pg_get_functiondef('erp_purchase_private.post(uuid,public.erp_purchase_documents,numeric)'::regprocedure) INTO source;
 needle:='IF received AND stocked THEN PERFORM brand_finance_private.stock_move';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Purchase tracked posting baseline mismatch';END IF;
 source:=replace(source,needle,'IF received AND stocked THEN PERFORM erp_inventory_private.stage_tracking(c,doc,(l->>''itemId'')::uuid,(p->>''warehouseId'')::uuid,(l->>''baseQuantity'')::numeric,coalesce((SELECT x->''tracking'' FROM jsonb_array_elements(p->''lines'') x WHERE x->>''id''=l->>''id''),''[]''));PERFORM brand_finance_private.stock_move');EXECUTE source;
 SELECT pg_get_functiondef('erp_purchase_private.receive(uuid,uuid,integer)'::regprocedure) INTO source;
 needle:='PERFORM brand_finance_private.stock_move(c,doc,l.item_id,d.warehouse_id,l.quantity,cost/l.quantity);';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Purchase tracked receipt baseline mismatch';END IF;
 EXECUTE replace(source,needle,'PERFORM erp_inventory_private.stage_tracking(c,doc,l.item_id,d.warehouse_id,l.quantity,erp_inventory_private.purchase_tracking(c,invoice,l.id));'||needle);
 SELECT pg_get_functiondef('public.erp_purchases_write(uuid,text,jsonb,uuid)'::regprocedure) INTO source;
 needle:='ELSIF p_action=''receive'' THEN rid:=erp_purchase_private.receive';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Purchase tracked command baseline mismatch';END IF;
 EXECUTE replace(source,needle,'ELSIF p_action=''receive'' THEN PERFORM erp_inventory_private.set_purchase_tracking(c,(p->>''id'')::uuid,(p->>''revision'')::integer,p->''tracking'');rid:=erp_purchase_private.receive');
 SELECT pg_get_functiondef('public.erp_purchases_read(uuid)'::regprocedure) INTO source;EXECUTE replace(source,'public.erp_purchases_read(','erp_inventory_private.purchase_read_before_tracking(');
END $$;
CREATE OR REPLACE FUNCTION public.erp_purchases_read(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;defaults jsonb;BEGIN
 result:=erp_inventory_private.purchase_read_before_tracking(p_cafe_id);
 SELECT coalesce(jsonb_object_agg(i.id::text,coalesce(result#>ARRAY['itemDefaults',i.id::text],'{}')||jsonb_build_object('trackingMode',coalesce(m.tracking_mode,'quantity'))),'{}') INTO defaults FROM public.bf_items i LEFT JOIN public.erp_inventory_items m ON m.cafe_id=i.cafe_id AND m.item_id=i.id WHERE i.cafe_id=p_cafe_id;
 RETURN result||jsonb_build_object('itemDefaults',defaults);
END $$;
REVOKE ALL ON FUNCTION erp_inventory_private.purchase_tracking(uuid,uuid,uuid),erp_inventory_private.set_purchase_tracking(uuid,uuid,integer,jsonb),erp_inventory_private.purchase_read_before_tracking(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
