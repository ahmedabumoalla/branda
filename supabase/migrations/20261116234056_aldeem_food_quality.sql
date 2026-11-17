BEGIN;
-- Additive evidence over the existing released lab orders and stock manufacturing ledger
CREATE TABLE public.erp_aldeem_food_cases (
 cafe_id uuid NOT NULL, order_id uuid PRIMARY KEY, manufacturing_order_id uuid,
 revision integer NOT NULL DEFAULT 0, stages jsonb NOT NULL DEFAULT '{}'::jsonb,
 FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_lab_orders(cafe_id,id),
 FOREIGN KEY(cafe_id,manufacturing_order_id) REFERENCES public.erp_mfg_orders(cafe_id,id),
 CHECK(jsonb_typeof(stages)='object' AND octet_length(stages::text)<100000)
);
CREATE INDEX erp_aldeem_food_cases_cafe ON public.erp_aldeem_food_cases(cafe_id,order_id);
CREATE INDEX erp_aldeem_food_cases_manufacturing ON public.erp_aldeem_food_cases(cafe_id,manufacturing_order_id);
CREATE TABLE public.erp_aldeem_food_programs (
 id uuid PRIMARY KEY, cafe_id uuid NOT NULL, branch_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('license','haccp','water','maintenance','cleaning','pest_control','staff_health','training','calibration')),
 reference text NOT NULL CHECK(length(btrim(reference)) BETWEEN 3 AND 2000), responsible text NOT NULL CHECK(length(btrim(responsible)) BETWEEN 2 AND 200),
 reviewed_on date NOT NULL, valid_until date NOT NULL, revision integer NOT NULL DEFAULT 1,
 FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id), UNIQUE(cafe_id,branch_id,kind), CHECK(valid_until>=reviewed_on)
);
CREATE TABLE public.erp_aldeem_food_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id), order_id uuid,
 action text NOT NULL, payload jsonb NOT NULL, actor uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 request_id uuid NOT NULL, result jsonb NOT NULL, UNIQUE(cafe_id,request_id), FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_lab_orders(cafe_id,id)
);
CREATE INDEX erp_aldeem_food_events_order ON public.erp_aldeem_food_events(cafe_id,order_id,created_at DESC);
CREATE INDEX erp_aldeem_food_events_actor ON public.erp_aldeem_food_events(actor);
ALTER TABLE public.erp_aldeem_food_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_aldeem_food_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_aldeem_food_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_aldeem_food_cases,public.erp_aldeem_food_programs,public.erp_aldeem_food_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_aldeem_food_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION public.erp_aldeem_food_quality_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; BEGIN
 r:=erp_lab_private.role_for(p_cafe);
 PERFORM erp_branch_private.enter(p_cafe);
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND slug='khayal-aldeem') THEN RAISE EXCEPTION 'الحساب غير متاح' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('canWrite',erp_lab_private.operator(p_cafe,r),'canApprove',r IN('owner','manager'),
 'cases',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT q.* FROM public.erp_aldeem_food_cases q JOIN public.erp_lab_orders o ON o.cafe_id=q.cafe_id AND o.id=q.order_id WHERE q.cafe_id=p_cafe AND erp_lab_private.branch_allowed(p_cafe,o.branch_id,r) ORDER BY o.updated_at DESC LIMIT 300) x),'[]'::jsonb),
 'programs',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM public.erp_aldeem_food_programs x WHERE cafe_id=p_cafe AND erp_lab_private.branch_allowed(p_cafe,x.branch_id,r)),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT e.id,e.order_id,e.action,e.created_at,e.payload FROM public.erp_aldeem_food_events e LEFT JOIN public.erp_lab_orders o ON o.cafe_id=e.cafe_id AND o.id=e.order_id WHERE e.cafe_id=p_cafe AND (e.order_id IS NOT NULL AND erp_lab_private.branch_allowed(p_cafe,o.branch_id,r) OR e.order_id IS NULL AND r IN('owner','manager')) ORDER BY e.created_at DESC LIMIT 100) x),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT o.id,o.code,o.name FROM public.erp_mfg_orders o WHERE o.cafe_id=p_cafe AND erp_branch_private.row_allowed(p_cafe,erp_branch_private.current_branch(p_cafe),to_jsonb(o),'') ORDER BY o.updated_at DESC LIMIT 100)x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.erp_aldeem_food_quality_execute(p_cafe uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;r text;o public.erp_lab_orders;q public.erp_aldeem_food_cases;prior public.erp_aldeem_food_events;
 prog public.erp_aldeem_food_programs;stage text;idx integer;i integer;answer jsonb;ev jsonb;newrev integer;record_id uuid;result text;
 stages text[]:=ARRAY['receiving','storage','preparation','processing','cooling','packaging','verification','release','dispatch'];
BEGIN
 r:=erp_lab_private.role_for(c);
 PERFORM erp_branch_private.enter(c);
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') OR NOT erp_lab_private.operator(c,r) THEN RAISE EXCEPTION 'لا تملك صلاحية تسجيل مراحل التصنيع' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>14000 OR nullif(p->>'requestId','') IS NULL THEN RAISE EXCEPTION 'بيانات غير صالحة'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text,99173));
 SELECT * INTO prior FROM public.erp_aldeem_food_events WHERE cafe_id=c AND request_id=(p->>'requestId')::uuid;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.payload->'command' IS DISTINCT FROM p THEN RAISE EXCEPTION 'طلب مكرر ببيانات مختلفة'; END IF; RETURN prior.result; END IF;
 record_id:=(p->>'id')::uuid;
 IF p->>'action'='program' THEN
  IF r NOT IN('owner','manager') OR NOT erp_lab_private.branch_allowed(c,(p->>'branchId')::uuid,r) THEN RAISE EXCEPTION 'اعتماد البرامج للمالك أو المدير' USING ERRCODE='42501'; END IF;
  IF (p->>'reviewedOn')::date>(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date THEN RAISE EXCEPTION 'تاريخ المراجعة لا يكون في المستقبل'; END IF;
  SELECT * INTO prog FROM public.erp_aldeem_food_programs WHERE cafe_id=c AND id=record_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.erp_aldeem_food_programs WHERE id=record_id AND cafe_id<>c) OR prog.id IS NOT NULL AND (prog.branch_id IS DISTINCT FROM (p->>'branchId')::uuid OR prog.kind IS DISTINCT FROM p->>'kind') THEN RAISE EXCEPTION 'هوية البرنامج غير صالحة' USING ERRCODE='42501'; END IF;
  IF nullif(p->>'kind','') IS NULL OR nullif(p->>'reference','') IS NULL OR nullif(p->>'responsible','') IS NULL OR nullif(p->>'reviewedOn','') IS NULL OR nullif(p->>'validUntil','') IS NULL THEN RAISE EXCEPTION 'أكمل بيانات البرنامج'; END IF;
  IF coalesce(prog.revision,0) IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001'; END IF;
  newrev:=coalesce(prog.revision,0)+1;
  INSERT INTO public.erp_aldeem_food_programs(id,cafe_id,branch_id,kind,reference,responsible,reviewed_on,valid_until,revision)
  VALUES(record_id,c,(p->>'branchId')::uuid,p->>'kind',btrim(p->>'reference'),btrim(p->>'responsible'),(p->>'reviewedOn')::date,(p->>'validUntil')::date,newrev)
  ON CONFLICT(id) DO UPDATE SET reference=EXCLUDED.reference,responsible=EXCLUDED.responsible,reviewed_on=EXCLUDED.reviewed_on,valid_until=EXCLUDED.valid_until,revision=EXCLUDED.revision WHERE public.erp_aldeem_food_programs.cafe_id=c;
  ev:=jsonb_build_object('before',to_jsonb(prog),'command',p);
 ELSE
  IF p->>'action' IS DISTINCT FROM 'stage' THEN RAISE EXCEPTION 'إجراء غير معروف'; END IF;
  SELECT * INTO o FROM public.erp_lab_orders WHERE cafe_id=c AND id=record_id FOR UPDATE;
  IF NOT FOUND OR NOT erp_lab_private.branch_allowed(c,o.branch_id,r) THEN RAISE EXCEPTION 'الطلب غير متاح' USING ERRCODE='42501'; END IF;
  IF o.status IN('cancelled','recalled','delivered','out_for_delivery') THEN RAISE EXCEPTION 'استخدم إجراء السحب لمراجعة تشغيلة خرجت للتوزيع'; END IF;
  INSERT INTO public.erp_aldeem_food_cases(cafe_id,order_id) VALUES(c,o.id) ON CONFLICT DO NOTHING;
  SELECT * INTO q FROM public.erp_aldeem_food_cases WHERE order_id=o.id FOR UPDATE;
  IF q.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001'; END IF;
  stage:=p->>'stage';idx:=array_position(stages,stage);result:=p->>'result';
  IF idx IS NULL OR result IS NULL OR result NOT IN('pass','fail','na') OR jsonb_typeof(p->'fields') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'fields')<>3 THEN RAISE EXCEPTION 'أكمل سجل المرحلة'; END IF;
  IF result='na' AND (stage<>'cooling' OR length(btrim(coalesce(p->>'reason','')))<10) THEN RAISE EXCEPTION 'عدم الانطباق متاح للتبريد فقط مع سبب موثق'; END IF;
  IF result='fail' AND length(btrim(coalesce(p->>'reason','')))<10 THEN RAISE EXCEPTION 'وثق الانحراف والإجراء التصحيحي'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'fields') v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string') OR result='pass' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'fields') v WHERE length(btrim(coalesce(v,'')))<3 OR length(v)>2000) THEN RAISE EXCEPTION 'أكمل أدلة المرحلة الثلاثة'; END IF;
  IF result<>'fail' AND idx>1 THEN FOR i IN 1..idx-1 LOOP IF coalesce(q.stages->stages[i]->>'result','') NOT IN('pass','na') THEN RAISE EXCEPTION 'أكمل المراحل السابقة وعالج الانحرافات أولًا'; END IF; END LOOP; END IF;
  IF idx>=8 AND r NOT IN('owner','manager') THEN RAISE EXCEPTION 'الإفراج والتوزيع يحتاجان اعتماد المدير' USING ERRCODE='42501'; END IF;
  IF idx>=8 AND result='pass' AND EXISTS(SELECT 1 FROM unnest(ARRAY['license','haccp','water','maintenance','cleaning','pest_control','staff_health','training','calibration']) k WHERE NOT EXISTS(SELECT 1 FROM public.erp_aldeem_food_programs g WHERE g.cafe_id=c AND g.branch_id=o.branch_id AND g.kind=k AND g.valid_until>=(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date)) THEN RAISE EXCEPTION 'اعتمد برامج المتطلبات الأساسية السارية لهذا الفرع قبل الإفراج'; END IF;
  IF idx>=8 AND EXISTS(SELECT 1 FROM public.erp_food_safety_records f WHERE f.cafe_id=c AND f.branch_id=o.branch_id AND f.deviation AND NOT EXISTS(SELECT 1 FROM public.erp_food_safety_closures cl WHERE cl.record_id=f.id)) THEN RAISE EXCEPTION 'توجد انحرافات سلامة غذاء مفتوحة في الفرع'; END IF;
  IF nullif(p->>'manufacturingOrderId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_mfg_orders m WHERE m.cafe_id=c AND m.id=(p->>'manufacturingOrderId')::uuid AND erp_branch_private.row_allowed(c,o.branch_id,to_jsonb(m),'')) THEN RAISE EXCEPTION 'أمر التصنيع غير متاح لهذا الفرع'; END IF;
  ev:=jsonb_build_object('before',to_jsonb(q),'command',p);newrev:=q.revision+1;
  -- A changed earlier stage invalidates later approval evidence while retaining its audit history
  FOR i IN idx..array_length(stages,1) LOOP q.stages:=q.stages-stages[i]; END LOOP;
  q.stages:=q.stages||jsonb_build_object(stage,jsonb_build_object('result',result,'fields',p->'fields','reason',coalesce(p->>'reason',''),'at',clock_timestamp(),'actor',auth.uid(),'actorName',erp_enterprise_private.actor_name(c,auth.uid())));
  UPDATE public.erp_aldeem_food_cases SET stages=q.stages,revision=newrev,manufacturing_order_id=coalesce(nullif(p->>'manufacturingOrderId','')::uuid,manufacturing_order_id) WHERE order_id=o.id;
  IF result='fail' AND o.status IN('preparing','prepared') OR idx<8 AND o.status='prepared' THEN
   UPDATE public.erp_lab_orders SET status='on_hold',revision=revision+1,updated_at=clock_timestamp() WHERE id=o.id;
   INSERT INTO public.erp_lab_events(cafe_id,order_id,action,note,payload,actor) VALUES(c,o.id,'quality_hold',coalesce(nullif(p->>'reason',''),'مراجعة مرحلة سابقة وإعادة اعتماد الإفراج'),jsonb_build_object('stage',stage),auth.uid());
  END IF;
 END IF;
 answer:=jsonb_build_object('id',record_id,'revision',newrev);
 INSERT INTO public.erp_aldeem_food_events(cafe_id,order_id,action,payload,actor,request_id,result) VALUES(c,CASE WHEN p->>'action'='stage' THEN record_id END,p->>'action',ev,auth.uid(),(p->>'requestId')::uuid,answer);
 RETURN answer;
END $$;

CREATE FUNCTION erp_lab_private.aldeem_quality_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.erp_aldeem_food_cases; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem') THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN INSERT INTO public.erp_aldeem_food_cases(cafe_id,order_id) VALUES(NEW.cafe_id,NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END IF;
 SELECT * INTO q FROM public.erp_aldeem_food_cases WHERE order_id=NEW.id;
 IF FOUND AND NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status='prepared' AND coalesce(q.stages->'release'->>'result','')<>'pass' THEN RAISE EXCEPTION 'أكمل مراحل الجودة واعتماد الإفراج قبل التجهيز'; END IF;
  IF NEW.status IN('out_for_delivery','delivered') AND coalesce(q.stages->'dispatch'->>'result','')<>'pass' THEN RAISE EXCEPTION 'وثق بيانات التوزيع والتتبع قبل التسليم'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER aldeem_quality_case AFTER INSERT ON public.erp_lab_orders FOR EACH ROW EXECUTE FUNCTION erp_lab_private.aldeem_quality_gate();
CREATE TRIGGER aldeem_quality_gate BEFORE UPDATE OF status ON public.erp_lab_orders FOR EACH ROW EXECUTE FUNCTION erp_lab_private.aldeem_quality_gate();
CREATE FUNCTION erp_lab_private.aldeem_manufacturing_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS(SELECT 1 FROM public.erp_aldeem_food_cases q WHERE q.cafe_id=NEW.cafe_id AND q.manufacturing_order_id=NEW.id AND coalesce(q.stages->'release'->>'result','')<>'pass') THEN RAISE EXCEPTION 'لا يمكن ترحيل ناتج تشغيلة مرتبطة قبل الإفراج عن الجودة'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER aldeem_manufacturing_quality_gate BEFORE UPDATE OF status ON public.erp_mfg_orders FOR EACH ROW EXECUTE FUNCTION erp_lab_private.aldeem_manufacturing_gate();
REVOKE ALL ON FUNCTION erp_lab_private.aldeem_quality_gate(),erp_lab_private.aldeem_manufacturing_gate() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.erp_aldeem_food_trace(p_cafe uuid,p_order uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;o public.erp_lab_orders;m uuid; BEGIN
 r:=erp_lab_private.role_for(p_cafe);
 SELECT * INTO o FROM public.erp_lab_orders WHERE cafe_id=p_cafe AND id=p_order;
 IF NOT FOUND OR NOT erp_lab_private.branch_allowed(p_cafe,o.branch_id,r) OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND slug='khayal-aldeem') THEN RAISE EXCEPTION 'الطلب غير متاح' USING ERRCODE='42501'; END IF;
 SELECT manufacturing_order_id INTO m FROM public.erp_aldeem_food_cases WHERE cafe_id=p_cafe AND order_id=p_order;
 RETURN jsonb_build_object(
 'materials',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT i.id,b.name,i.quantity,i.returned,i.document_id,w.name warehouse FROM public.erp_mfg_material_issues i JOIN public.bf_items b ON b.cafe_id=i.cafe_id AND b.id=i.item_id JOIN public.bf_warehouses w ON w.cafe_id=i.cafe_id AND w.id=i.warehouse_id WHERE i.cafe_id=p_cafe AND i.order_id=m ORDER BY i.created_at LIMIT 300)x),'[]'::jsonb),
 'movements',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT t.id,l.lot,l.serial,l.expires_on,t.quantity,b.name,w.name warehouse,v.document_id,t.created_at FROM public.erp_inventory_tracking_movements t JOIN public.erp_inventory_lots l ON l.cafe_id=t.cafe_id AND l.id=t.lot_id JOIN public.bf_movements v ON v.cafe_id=t.cafe_id AND v.id=t.movement_id JOIN public.bf_items b ON b.cafe_id=l.cafe_id AND b.id=l.item_id JOIN public.bf_warehouses w ON w.cafe_id=t.cafe_id AND w.id=t.warehouse_id WHERE t.cafe_id=p_cafe AND (v.document_id=o.invoice_id OR v.document_id IN(SELECT document_id FROM public.erp_mfg_material_issues WHERE cafe_id=p_cafe AND order_id=m) OR v.document_id IN(SELECT output_document_id FROM public.erp_mfg_orders WHERE cafe_id=p_cafe AND id=m)) ORDER BY t.created_at LIMIT 300)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.erp_aldeem_food_trace(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_aldeem_food_trace(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_aldeem_food_quality_read(uuid),public.erp_aldeem_food_quality_execute(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_aldeem_food_quality_read(uuid),public.erp_aldeem_food_quality_execute(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
