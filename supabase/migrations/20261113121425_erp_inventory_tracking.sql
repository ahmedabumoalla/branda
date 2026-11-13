BEGIN;
ALTER TABLE public.erp_inventory_items ADD COLUMN tracking_mode text NOT NULL DEFAULT 'quantity' CHECK(tracking_mode IN('quantity','serial','lot','expiry','lot_expiry'));
CREATE TABLE public.erp_inventory_lots(cafe_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),item_id uuid NOT NULL,serial text NOT NULL DEFAULT '',lot text NOT NULL DEFAULT '',expires_on date,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id),CHECK(length(serial)<=120 AND length(lot)<=120));
CREATE UNIQUE INDEX erp_inventory_lot_identity ON public.erp_inventory_lots(cafe_id,item_id,serial,lot,coalesce(expires_on,'infinity'::date));
CREATE UNIQUE INDEX erp_inventory_serial_identity ON public.erp_inventory_lots(cafe_id,item_id,serial) WHERE serial<>'';
CREATE TABLE public.erp_inventory_lot_stock(cafe_id uuid NOT NULL,lot_id uuid NOT NULL,warehouse_id uuid NOT NULL,quantity numeric(18,3) NOT NULL CHECK(quantity>=0 AND quantity<>'NaN'::numeric),PRIMARY KEY(cafe_id,lot_id,warehouse_id),FOREIGN KEY(cafe_id,lot_id) REFERENCES public.erp_inventory_lots(cafe_id,id),FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id));
CREATE TABLE public.erp_inventory_tracking_movements(cafe_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),movement_id uuid NOT NULL REFERENCES public.bf_movements(id),lot_id uuid NOT NULL,warehouse_id uuid NOT NULL,quantity numeric(18,3) NOT NULL CHECK(quantity<>0 AND quantity<>'NaN'::numeric),original_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,id),FOREIGN KEY(cafe_id,lot_id) REFERENCES public.erp_inventory_lots(cafe_id,id),FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),FOREIGN KEY(cafe_id,original_id) REFERENCES public.erp_inventory_tracking_movements(cafe_id,id));
CREATE INDEX erp_inventory_tracking_movement_lookup ON public.erp_inventory_tracking_movements(cafe_id,movement_id);
CREATE INDEX erp_inventory_tracking_original ON public.erp_inventory_tracking_movements(cafe_id,original_id) WHERE original_id IS NOT NULL;
CREATE TABLE erp_inventory_private.tracking_staging(cafe_id uuid NOT NULL,document_id uuid NOT NULL,item_id uuid NOT NULL,warehouse_id uuid NOT NULL,quantity numeric NOT NULL,allocations jsonb NOT NULL,PRIMARY KEY(cafe_id,document_id,item_id,warehouse_id));
REVOKE ALL ON erp_inventory_private.tracking_staging FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_inventory_lots','erp_inventory_lot_stock','erp_inventory_tracking_movements'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;END $$;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_inventory_tracking_movements FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION erp_inventory_private.tracking_mode_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE mode text;prior_mode text;BEGIN
 IF TG_OP='UPDATE' THEN prior_mode:=OLD.tracking_mode;ELSE SELECT tracking_mode INTO prior_mode FROM public.erp_inventory_items WHERE cafe_id=NEW.cafe_id AND item_id=NEW.item_id;END IF;prior_mode:=coalesce(prior_mode,'quantity');
 mode:=coalesce(NEW.payload->>'trackingMode',prior_mode);
 IF mode NOT IN('quantity','serial','lot','expiry','lot_expiry') OR NEW.kind<>'product' AND mode<>'quantity' THEN RAISE EXCEPTION 'طريقة تتبع الصنف غير صالحة';END IF;
 IF mode IS DISTINCT FROM prior_mode AND EXISTS(SELECT 1 FROM public.bf_movements WHERE cafe_id=NEW.cafe_id AND item_id=NEW.item_id) THEN RAISE EXCEPTION 'لا يمكن تغيير طريقة تتبع صنف له حركات مخزنية';END IF;
 IF mode<>'quantity' AND prior_mode='quantity' AND NOT coalesce((SELECT (payload->>'trackingEnabled')::boolean FROM public.erp_inventory_settings WHERE cafe_id=NEW.cafe_id),false) THEN RAISE EXCEPTION 'فعّل تتبع المنتجات من إعدادات المخزون';END IF;
 NEW.tracking_mode:=mode;RETURN NEW;
END $$;
CREATE TRIGGER erp_inventory_tracking_mode BEFORE INSERT OR UPDATE ON public.erp_inventory_items FOR EACH ROW EXECUTE FUNCTION erp_inventory_private.tracking_mode_guard();

CREATE FUNCTION erp_inventory_private.stage_tracking(c uuid,d uuid,i uuid,w uuid,q numeric,a jsonb DEFAULT '[]') RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE mode text;x jsonb;total numeric:=0;amount numeric;BEGIN
 SELECT tracking_mode INTO mode FROM public.erp_inventory_items WHERE cafe_id=c AND item_id=i;IF coalesce(mode,'quantity')='quantity' THEN RETURN;END IF;
 IF q IS NULL OR q=0 OR abs(q)>1000000 OR q<>round(q,3) OR q::text IN('NaN','Infinity','-Infinity') OR jsonb_typeof(a) IS DISTINCT FROM 'array' OR jsonb_array_length(a)>1000 THEN RAISE EXCEPTION 'بيانات تتبع المخزون غير صالحة';END IF;
 IF jsonb_array_length(a)=0 THEN RETURN;END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(a) LOOP
  IF x ? 'originalId' THEN RAISE EXCEPTION 'مرجع التتبع الأصلي يحدده النظام';END IF;
  amount:=(x->>'quantity')::numeric;IF amount IS NULL OR amount<=0 OR amount<>round(amount,3) OR amount>1000000 OR amount::text='NaN' THEN RAISE EXCEPTION 'كمية التتبع غير صالحة';END IF;
  IF mode='serial' AND (amount<>1 OR nullif(btrim(x->>'serial'),'') IS NULL) OR mode IN('lot','lot_expiry') AND nullif(btrim(x->>'lot'),'') IS NULL OR mode IN('expiry','lot_expiry') AND nullif(x->>'expiresOn','') IS NULL THEN RAISE EXCEPTION 'أكمل الرقم المسلسل أو الشحنة وتاريخ الانتهاء المطلوب';END IF;
  IF length(coalesce(x->>'serial',''))>120 OR length(coalesce(x->>'lot',''))>120 OR nullif(x->>'expiresOn','') IS NOT NULL AND NOT isfinite((x->>'expiresOn')::date) THEN RAISE EXCEPTION 'راجع بيانات التشغيلة';END IF;
  total:=total+amount;
 END LOOP;
 IF total<>abs(q) THEN RAISE EXCEPTION 'مجموع كميات التتبع يجب أن يطابق الكمية بالوحدة الأساسية';END IF;
 INSERT INTO erp_inventory_private.tracking_staging VALUES(c,d,i,w,q,a) ON CONFLICT(cafe_id,document_id,item_id,warehouse_id) DO UPDATE SET quantity=excluded.quantity,allocations=excluded.allocations;
END $$;

CREATE FUNCTION erp_inventory_private.stage_tracking_return(c uuid,d uuid,i uuid,w uuid,q numeric,source_doc uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE mode text;r record;remaining numeric:=q;take numeric;a jsonb:='[]';clean jsonb;BEGIN
 SELECT tracking_mode INTO mode FROM public.erp_inventory_items WHERE cafe_id=c AND item_id=i;IF coalesce(mode,'quantity')='quantity' THEN RETURN;END IF;
 FOR r IN SELECT t.serial,t.lot,t.expires_on,a.id,abs(a.quantity)-coalesce((SELECT sum(b.quantity) FROM public.erp_inventory_tracking_movements b WHERE b.cafe_id=a.cafe_id AND b.original_id=a.id AND b.quantity>0),0) available FROM public.erp_inventory_tracking_movements a JOIN public.bf_movements m ON m.cafe_id=a.cafe_id AND m.id=a.movement_id JOIN public.erp_inventory_lots t ON t.cafe_id=a.cafe_id AND t.id=a.lot_id WHERE m.cafe_id=c AND m.document_id=source_doc AND m.item_id=i AND m.warehouse_id=w AND a.quantity<0 ORDER BY a.created_at,a.id LOOP
  take:=least(remaining,r.available);IF take<=0 THEN CONTINUE;END IF;a:=a||jsonb_build_array(jsonb_build_object('serial',r.serial,'lot',r.lot,'expiresOn',coalesce(r.expires_on::text,''),'quantity',take,'originalId',r.id));remaining:=remaining-take;EXIT WHEN remaining=0;
 END LOOP;
 IF remaining<>0 THEN RAISE EXCEPTION 'تتبع الكميات الأصلية لا يكفي لإرجاع الخامات';END IF;
 SELECT jsonb_agg(x-'originalId') INTO clean FROM jsonb_array_elements(a) x;PERFORM erp_inventory_private.stage_tracking(c,d,i,w,q,clean);
 UPDATE erp_inventory_private.tracking_staging SET allocations=a WHERE cafe_id=c AND document_id=d AND item_id=i AND warehouse_id=w;
END $$;

CREATE FUNCTION erp_inventory_private.allocate_tracking(c uuid,m uuid,l uuid,w uuid,q numeric,origin uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE serial text;BEGIN
 SELECT x.serial INTO STRICT serial FROM public.erp_inventory_lots x WHERE x.cafe_id=c AND x.id=l FOR SHARE;
 INSERT INTO public.erp_inventory_lot_stock(cafe_id,lot_id,warehouse_id,quantity) VALUES(c,l,w,0) ON CONFLICT DO NOTHING;
 UPDATE public.erp_inventory_lot_stock SET quantity=quantity+q WHERE cafe_id=c AND lot_id=l AND warehouse_id=w;
 IF serial<>'' AND (abs(q)<>1 OR (SELECT sum(quantity) FROM public.erp_inventory_lot_stock WHERE cafe_id=c AND lot_id=l)>1) THEN RAISE EXCEPTION 'الرقم المسلسل موجود في المخزون أو كميته لا تساوي واحدًا';END IF;
 INSERT INTO public.erp_inventory_tracking_movements(cafe_id,movement_id,lot_id,warehouse_id,quantity,original_id) VALUES(c,m,l,w,q,origin);
END $$;

CREATE FUNCTION erp_inventory_private.track_movement() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE mode text;d public.bf_documents%ROWTYPE;st erp_inventory_private.tracking_staging%ROWTYPE;x jsonb;l uuid;r record;remaining numeric;take numeric;expiry date;tracking_serial text;tracking_lot text;source uuid;BEGIN
 SELECT tracking_mode INTO mode FROM public.erp_inventory_items WHERE cafe_id=NEW.cafe_id AND item_id=NEW.item_id;IF coalesce(mode,'quantity')='quantity' THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
 SELECT * INTO STRICT d FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
 IF mode='serial' AND NEW.quantity<>trunc(NEW.quantity) THEN RAISE EXCEPTION 'الأصناف المتتبعة بالمسلسل لا تقبل كمية كسرية';END IF;
 DELETE FROM erp_inventory_private.tracking_staging WHERE cafe_id=NEW.cafe_id AND document_id=NEW.document_id AND item_id=NEW.item_id AND warehouse_id=NEW.warehouse_id RETURNING * INTO st;
 IF st.document_id IS NOT NULL AND st.quantity IS DISTINCT FROM NEW.quantity THEN RAISE EXCEPTION 'تغيرت كمية حركة التتبع';END IF;
 remaining:=abs(NEW.quantity);
 IF st.document_id IS NOT NULL THEN
  FOR x IN SELECT value FROM jsonb_array_elements(st.allocations) LOOP
   tracking_serial:=coalesce(btrim(x->>'serial'),'');tracking_lot:=coalesce(btrim(x->>'lot'),'');expiry:=nullif(x->>'expiresOn','')::date;take:=(x->>'quantity')::numeric;
   SELECT id INTO l FROM public.erp_inventory_lots t WHERE t.cafe_id=NEW.cafe_id AND t.item_id=NEW.item_id AND t.serial=tracking_serial AND t.lot=tracking_lot AND t.expires_on IS NOT DISTINCT FROM expiry;
   IF NEW.quantity>0 AND expiry IS NOT NULL AND expiry<(d.created_at AT TIME ZONE 'Asia/Riyadh')::date AND d.kind<>'refund' THEN RAISE EXCEPTION 'لا يمكن استلام تشغيلة منتهية الصلاحية';END IF;
   IF NEW.quantity>0 AND l IS NULL THEN
    IF expiry IS NOT NULL AND expiry<(d.created_at AT TIME ZONE 'Asia/Riyadh')::date AND d.kind<>'refund' THEN RAISE EXCEPTION 'لا يمكن استلام تشغيلة منتهية الصلاحية';END IF;
    INSERT INTO public.erp_inventory_lots(cafe_id,item_id,serial,lot,expires_on) VALUES(NEW.cafe_id,NEW.item_id,tracking_serial,tracking_lot,expiry) RETURNING id INTO l;
   END IF;
   IF l IS NULL OR NEW.quantity<0 AND expiry IS NOT NULL AND expiry<(d.created_at AT TIME ZONE 'Asia/Riyadh')::date AND d.kind<>'refund' THEN RAISE EXCEPTION 'التشغيلة غير متاحة أو منتهية الصلاحية';END IF;
   source:=nullif(x->>'originalId','')::uuid;
   IF source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_inventory_tracking_movements a WHERE a.cafe_id=NEW.cafe_id AND a.id=source AND a.lot_id=l AND a.quantity<0 AND abs(a.quantity)-coalesce((SELECT sum(b.quantity) FROM public.erp_inventory_tracking_movements b WHERE b.cafe_id=a.cafe_id AND b.original_id=a.id AND b.quantity>0),0)>=take) THEN RAISE EXCEPTION 'مرجع التتبع الأصلي غير متاح';END IF;
   PERFORM erp_inventory_private.allocate_tracking(NEW.cafe_id,NEW.id,l,NEW.warehouse_id,take*sign(NEW.quantity),source);remaining:=remaining-take;
  END LOOP;
 ELSIF NEW.quantity>0 AND (d.kind IN('refund','stock_transfer') OR d.reference_id IS NOT NULL) THEN
  source:=CASE WHEN d.kind='stock_transfer' THEN d.id ELSE d.reference_id END;
  -- Transfers and documented reversals restore their original serials/batches instead of generating new identities.
  FOR r IN SELECT a.*,abs(a.quantity)-coalesce((SELECT sum(abs(b.quantity)) FROM public.erp_inventory_tracking_movements b WHERE b.cafe_id=a.cafe_id AND b.original_id=a.id AND b.quantity>0),0) available FROM public.erp_inventory_tracking_movements a JOIN public.bf_movements m ON m.cafe_id=a.cafe_id AND m.id=a.movement_id WHERE m.cafe_id=NEW.cafe_id AND m.document_id=source AND m.item_id=NEW.item_id AND a.quantity<0 ORDER BY a.created_at,a.id LOOP
   take:=least(remaining,r.available);IF take<=0 THEN CONTINUE;END IF;PERFORM erp_inventory_private.allocate_tracking(NEW.cafe_id,NEW.id,r.lot_id,NEW.warehouse_id,take,r.id);remaining:=remaining-take;EXIT WHEN remaining=0;
  END LOOP;
 ELSIF NEW.quantity<0 AND d.reference_id IS NOT NULL THEN
  FOR r IN SELECT a.*,a.quantity-coalesce((SELECT sum(abs(b.quantity)) FROM public.erp_inventory_tracking_movements b WHERE b.cafe_id=a.cafe_id AND b.original_id=a.id AND b.quantity<0),0) available FROM public.erp_inventory_tracking_movements a JOIN public.bf_movements m ON m.cafe_id=a.cafe_id AND m.id=a.movement_id JOIN public.bf_documents source_doc ON source_doc.cafe_id=m.cafe_id AND source_doc.id=m.document_id WHERE m.cafe_id=NEW.cafe_id AND (m.document_id=d.reference_id OR source_doc.reference_id=d.reference_id AND source_doc.kind='stock_adjust') AND m.item_id=NEW.item_id AND a.quantity>0 ORDER BY a.created_at,a.id LOOP
   take:=least(remaining,r.available,coalesce((SELECT quantity FROM public.erp_inventory_lot_stock WHERE cafe_id=NEW.cafe_id AND lot_id=r.lot_id AND warehouse_id=NEW.warehouse_id),0));IF take<=0 THEN CONTINUE;END IF;
   PERFORM erp_inventory_private.allocate_tracking(NEW.cafe_id,NEW.id,r.lot_id,NEW.warehouse_id,-take,r.id);remaining:=remaining-take;EXIT WHEN remaining=0;
  END LOOP;
 ELSIF NEW.quantity<0 THEN
  -- FEFO is deterministic; serialized stock can never become negative even when quantity-only items may.
  FOR r IN SELECT b.lot_id,b.quantity FROM public.erp_inventory_lot_stock b JOIN public.erp_inventory_lots t ON t.cafe_id=b.cafe_id AND t.id=b.lot_id WHERE b.cafe_id=NEW.cafe_id AND b.warehouse_id=NEW.warehouse_id AND t.item_id=NEW.item_id AND b.quantity>0 AND (t.expires_on IS NULL OR t.expires_on>=(d.created_at AT TIME ZONE 'Asia/Riyadh')::date OR d.kind='refund') ORDER BY t.expires_on NULLS LAST,t.created_at,t.id FOR UPDATE OF b LOOP
   take:=least(remaining,r.quantity);PERFORM erp_inventory_private.allocate_tracking(NEW.cafe_id,NEW.id,r.lot_id,NEW.warehouse_id,-take);remaining:=remaining-take;EXIT WHEN remaining=0;
  END LOOP;
 ELSE RAISE EXCEPTION 'أدخل بيانات تتبع الصنف قبل استلام المخزون';END IF;
 IF remaining<>0 THEN RAISE EXCEPTION 'كميات التشغيلة أو الأرقام المسلسلة المتاحة لا تكفي للحركة';END IF;
 IF (SELECT coalesce(sum(b.quantity),0) FROM public.erp_inventory_lot_stock b JOIN public.erp_inventory_lots t ON t.cafe_id=b.cafe_id AND t.id=b.lot_id WHERE b.cafe_id=NEW.cafe_id AND b.warehouse_id=NEW.warehouse_id AND t.item_id=NEW.item_id) IS DISTINCT FROM (SELECT quantity FROM public.bf_stock WHERE cafe_id=NEW.cafe_id AND warehouse_id=NEW.warehouse_id AND item_id=NEW.item_id) THEN RAISE EXCEPTION 'رصيد التتبع لا يطابق رصيد المخزون';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_inventory_tracking AFTER INSERT ON public.bf_movements FOR EACH ROW EXECUTE FUNCTION erp_inventory_private.track_movement();

-- Standard inventory receipts/issues/count corrections accept validated base-unit tracking rows.
DO $$DECLARE source text;needle text:='IF delta<>0 THEN cost:=brand_finance_private.stock_move';BEGIN
 SELECT pg_get_functiondef('erp_inventory_private.post(uuid,uuid)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Tracking inventory post baseline mismatch';END IF;
 EXECUTE replace(source,needle,'IF delta<>0 THEN PERFORM erp_inventory_private.stage_tracking(p_cafe,fid,l.item_id,d.warehouse_id,delta,coalesce(l.payload->''tracking'',''[]''));cost:=brand_finance_private.stock_move');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_inventory_private FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE source text;BEGIN SELECT pg_get_functiondef('public.erp_inventory_read(uuid,jsonb)'::regprocedure) INTO source;EXECUTE replace(source,'public.erp_inventory_read(','erp_inventory_private.read_before_tracking(');END $$;
CREATE OR REPLACE FUNCTION public.erp_inventory_read(p_cafe uuid,p_query jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;BEGIN
 result:=erp_inventory_private.read_before_tracking(p_cafe,p_query);
 RETURN result||jsonb_build_object('lots',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.id,t.item_id,t.serial,t.lot,t.expires_on,b.warehouse_id,b.quantity FROM public.erp_inventory_lots t JOIN public.erp_inventory_lot_stock b ON b.cafe_id=t.cafe_id AND b.lot_id=t.id WHERE t.cafe_id=p_cafe AND erp_inventory_private.warehouse_allowed(p_cafe,b.warehouse_id,'read') ORDER BY t.expires_on NULLS LAST,t.created_at,t.id LIMIT 3000) x),'[]'::jsonb),'trackingMovements',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT a.id,a.lot_id,a.quantity,a.original_id,a.created_at,m.document_id,m.item_id,m.warehouse_id FROM public.erp_inventory_tracking_movements a JOIN public.bf_movements m ON m.cafe_id=a.cafe_id AND m.id=a.movement_id WHERE a.cafe_id=p_cafe AND erp_inventory_private.warehouse_allowed(p_cafe,m.warehouse_id,'read') ORDER BY a.created_at DESC,a.id DESC LIMIT 3000) x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION erp_inventory_private.read_before_tracking(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

DO $$DECLARE source text;needle text;BEGIN
 SELECT pg_get_functiondef('public.erp_manufacturing_act(uuid,jsonb)'::regprocedure) INTO source;
 needle:='need:=least(q,issue.quantity-issue.returned);actual:=brand_finance_private.stock_move';IF position(needle IN source)=0 THEN RAISE EXCEPTION 'Manufacturing tracked return baseline mismatch';END IF;
 source:=replace(source,needle,'need:=least(q,issue.quantity-issue.returned);PERFORM erp_inventory_private.stage_tracking_return(p_cafe_id,document,item,wid,need,issue.document_id);actual:=brand_finance_private.stock_move');
 needle:='FOR x IN SELECT value FROM jsonb_array_elements(body->''scrap'') LOOP PERFORM brand_finance_private.stock_move';IF position(needle IN source)=0 THEN RAISE EXCEPTION 'Manufacturing tracked scrap baseline mismatch';END IF;
 source:=replace(source,needle,'FOR x IN SELECT value FROM jsonb_array_elements(body->''scrap'') LOOP PERFORM erp_inventory_private.stage_tracking(p_cafe_id,document,(x->>''itemId'')::uuid,wid,(x->>''quantity'')::numeric,coalesce(p_command#>ARRAY[''value'',''tracking'',x->>''itemId''],''[]''));PERFORM brand_finance_private.stock_move');
 needle:='PERFORM brand_finance_private.stock_move(p_cafe_id,document,(body->>''productId'')::uuid,wid,q,(total-salvage)/q);';IF position(needle IN source)=0 THEN RAISE EXCEPTION 'Manufacturing tracked output baseline mismatch';END IF;
 source:=replace(source,needle,'PERFORM erp_inventory_private.stage_tracking(p_cafe_id,document,(body->>''productId'')::uuid,wid,q,coalesce(p_command#>ARRAY[''value'',''tracking'',body->>''productId''],''[]''));'||needle);EXECUTE source;
 SELECT pg_get_functiondef('public.erp_manufacturing_read(uuid,text,uuid,text,text,integer,jsonb)'::regprocedure) INTO source;EXECUTE replace(source,'public.erp_manufacturing_read(','erp_inventory_private.manufacturing_read_before_tracking(');
END $$;
CREATE OR REPLACE FUNCTION public.erp_manufacturing_read(p_cafe_id uuid,p_kind text DEFAULT 'orders',p_id uuid DEFAULT NULL,p_query text DEFAULT '',p_status text DEFAULT '',p_page integer DEFAULT 1,p_filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE result jsonb;items jsonb;BEGIN
 result:=erp_inventory_private.manufacturing_read_before_tracking(p_cafe_id,p_kind,p_id,p_query,p_status,p_page,p_filters);
 SELECT coalesce(jsonb_agg(x||jsonb_build_object('trackingMode',coalesce((SELECT tracking_mode FROM public.erp_inventory_items WHERE cafe_id=p_cafe_id AND item_id=(x->>'id')::uuid),'quantity'))),'[]') INTO items FROM jsonb_array_elements(result#>'{lookups,items}') x;
 RETURN jsonb_set(result,'{lookups,items}',items);
END $$;
REVOKE ALL ON FUNCTION erp_inventory_private.stage_tracking_return(uuid,uuid,uuid,uuid,numeric,uuid),erp_inventory_private.manufacturing_read_before_tracking(uuid,text,uuid,text,text,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
