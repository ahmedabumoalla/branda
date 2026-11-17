BEGIN;
CREATE SCHEMA aldeem_workflow_private;
REVOKE ALL ON SCHEMA aldeem_workflow_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE aldeem_workflow_private.workshop_orders(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 branch_id uuid NOT NULL,status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','preparing','prepared','out_for_delivery','delivered','cancelled')),
 required_at timestamptz NOT NULL,notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id)
);
CREATE INDEX workshop_orders_branch ON aldeem_workflow_private.workshop_orders(cafe_id,branch_id,status,created_at DESC);
CREATE TABLE aldeem_workflow_private.workshop_lines(
 cafe_id uuid NOT NULL,order_id uuid NOT NULL,item_id uuid NOT NULL,quantity numeric(16,3) NOT NULL CHECK(quantity>0 AND quantity<=100000),snapshot jsonb NOT NULL,
 PRIMARY KEY(cafe_id,order_id,item_id),FOREIGN KEY(cafe_id,order_id) REFERENCES aldeem_workflow_private.workshop_orders(cafe_id,id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id)
);
CREATE TABLE aldeem_workflow_private.workshop_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL,note text NOT NULL DEFAULT '',payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,request_id),FOREIGN KEY(cafe_id,order_id) REFERENCES aldeem_workflow_private.workshop_orders(cafe_id,id)
);
CREATE INDEX workshop_events_order ON aldeem_workflow_private.workshop_events(cafe_id,order_id,created_at);
CREATE TABLE aldeem_workflow_private.factory_cases(
 cafe_id uuid NOT NULL,order_id uuid PRIMARY KEY,branch_id uuid NOT NULL,revision integer NOT NULL DEFAULT 0,stages jsonb NOT NULL DEFAULT '{}',
 FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_mfg_orders(cafe_id,id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
 CHECK(jsonb_typeof(stages)='object' AND octet_length(stages::text)<100000),UNIQUE(cafe_id,order_id)
);
CREATE TABLE aldeem_workflow_private.factory_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,order_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,request_id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.erp_mfg_orders(cafe_id,id)
);
CREATE INDEX factory_events_order ON aldeem_workflow_private.factory_events(cafe_id,order_id,created_at DESC);
ALTER TABLE aldeem_workflow_private.workshop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_workflow_private.workshop_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_workflow_private.workshop_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_workflow_private.factory_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_workflow_private.factory_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA aldeem_workflow_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON aldeem_workflow_private.workshop_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON aldeem_workflow_private.workshop_lines FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON aldeem_workflow_private.factory_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION aldeem_workflow_private.branch_allowed(c uuid,b uuid,r text) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND id=b AND active AND deleted_at IS NULL)
 AND (erp_enterprise_private.branch_for(c,r) IS NULL OR erp_enterprise_private.branch_for(c,r)=b)
 AND (r IN('owner','manager','accountant','auditor') OR erp_lab_private.operator(c,r) OR erp_enterprise_private.branch_for(c,r)=b)
$$;
CREATE FUNCTION aldeem_workflow_private.assert_brand(c uuid) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') THEN RAISE EXCEPTION 'الحساب غير متاح' USING ERRCODE='42501';END IF;
 PERFORM erp_branch_private.enter(c);
END $$;
CREATE FUNCTION aldeem_workflow_private.item_snapshot(c uuid,i uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',b.id,'name',b.name,'sku',b.sku,'barcode',b.barcode,'unit',b.unit,'flavor',coalesce(m.payload->>'flavor',''),'shape',coalesce(m.payload->>'shape',''),'packaging',coalesce(m.payload->>'packaging',''))
 FROM public.bf_items b LEFT JOIN public.erp_inventory_items m ON m.cafe_id=c AND m.item_id=b.id WHERE b.cafe_id=c AND b.id=i
$$;
CREATE FUNCTION public.aldeem_workshop_read(p_cafe uuid,p_branch uuid DEFAULT NULL,p_status text DEFAULT NULL,p_query text DEFAULT '',p_field text DEFAULT 'all',p_offset integer DEFAULT 0,p_legacy_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;answer jsonb;products jsonb;cnt bigint;ids uuid[];
BEGIN
 PERFORM aldeem_workflow_private.assert_brand(c);r:=erp_lab_private.role_for(c);
 IF p_branch IS NOT NULL AND NOT aldeem_workflow_private.branch_allowed(c,p_branch,r) THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='42501';END IF;
 IF p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR p_legacy_offset IS NULL OR p_legacy_offset<0 OR p_legacy_offset>100000 OR p_query IS NULL OR length(p_query)>100 OR p_field IS NULL OR p_field NOT IN('all','name','barcode','sku','flavor','shape','packaging') OR p_status IS NOT NULL AND p_status NOT IN('requested','preparing','prepared','out_for_delivery','delivered','cancelled') THEN RAISE EXCEPTION 'راجع البحث والفلترة' USING ERRCODE='22023';END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO ids FROM public.branches WHERE cafe_id=c AND aldeem_workflow_private.branch_allowed(c,id,r) AND (p_branch IS NULL OR id=p_branch);
 answer:=jsonb_build_object('canCreate',r<>'auditor' AND cardinality(ids)>0,'canPrepare',erp_lab_private.operator(c,r),'canReceive',r<>'auditor' AND cardinality(ids)>0,'offset',p_offset,'pageSize',50,'productLimit',100,
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.branches WHERE cafe_id=c AND aldeem_workflow_private.branch_allowed(c,id,r)),'[]'::jsonb));
 WITH available AS MATERIALIZED(
  SELECT b.id,b.name,aldeem_workflow_private.item_snapshot(c,b.id) payload FROM public.bf_items b LEFT JOIN public.erp_inventory_items m ON m.cafe_id=c AND m.item_id=b.id
  WHERE b.cafe_id=c AND b.active AND (m.item_id IS NULL OR m.kind='product' AND m.status='active')
   AND EXISTS(SELECT 1 FROM unnest(ids)bid WHERE erp_branch_private.allowed_resource(c,bid,'item',b.id))
 ), matched AS MATERIALIZED(SELECT * FROM available WHERE p_query='' OR CASE WHEN p_field='all' THEN concat_ws(' ',payload->>'name',payload->>'sku',payload->>'barcode',payload->>'flavor',payload->>'shape',payload->>'packaging') ELSE payload->>p_field END ILIKE '%'||p_query||'%')
 SELECT coalesce((SELECT jsonb_agg(payload ORDER BY name,id) FROM(SELECT * FROM matched ORDER BY name,id LIMIT 100)x),'[]'::jsonb),(SELECT count(*) FROM matched) INTO products,cnt;
 answer:=answer||jsonb_build_object('products',products,'productCount',cnt,
 'legacyTotal',(SELECT count(*) FROM public.erp_lab_orders WHERE cafe_id=c AND branch_id=ANY(ids)),'legacyOffset',p_legacy_offset,
 'legacyOrders',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT o.id,o.number,o.status,b.name "branchName",customer.name "customerName",o.required_at "requiredAt",o.notes,
  coalesce((SELECT jsonb_agg(jsonb_build_object('name',l->>'name','quantity',(l->>'quantity')::numeric)) FROM jsonb_array_elements(o.lines)l),'[]'::jsonb) lines
  FROM public.erp_lab_orders o JOIN public.branches b ON b.cafe_id=c AND b.id=o.branch_id JOIN public.bf_parties customer ON customer.cafe_id=c AND customer.id=o.customer_id WHERE o.cafe_id=c AND o.branch_id=ANY(ids) ORDER BY o.created_at DESC,o.id LIMIT 50 OFFSET p_legacy_offset)x),'[]'::jsonb));
 SELECT count(*) INTO cnt FROM aldeem_workflow_private.workshop_orders o WHERE o.cafe_id=c AND o.branch_id=ANY(ids) AND (p_status IS NULL OR o.status=p_status);
 RETURN answer||jsonb_build_object('total',cnt,'orders',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC,x.id) FROM(
  SELECT o.id,o.number,o.revision,o.branch_id "branchId",b.name "branchName",o.status,o.required_at "requiredAt",o.notes,o.created_at "createdAt",o.updated_at "updatedAt",erp_enterprise_private.actor_name(c,o.created_by) "createdByName",
   coalesce((SELECT jsonb_agg(l.snapshot||jsonb_build_object('quantity',l.quantity) ORDER BY l.snapshot->>'name',l.item_id) FROM aldeem_workflow_private.workshop_lines l WHERE l.cafe_id=c AND l.order_id=o.id),'[]'::jsonb) lines,
   coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'note',e.note,'at',e.created_at,'actorName',erp_enterprise_private.actor_name(c,e.actor)) ORDER BY e.created_at,e.id) FROM aldeem_workflow_private.workshop_events e WHERE e.cafe_id=c AND e.order_id=o.id),'[]'::jsonb) events
  FROM aldeem_workflow_private.workshop_orders o JOIN public.branches b ON b.cafe_id=c AND b.id=o.branch_id WHERE o.cafe_id=c AND o.branch_id=ANY(ids) AND(p_status IS NULL OR o.status=p_status) ORDER BY o.created_at DESC,o.id LIMIT 50 OFFSET p_offset)x),'[]'::jsonb));
END $$;
CREATE FUNCTION public.aldeem_workshop_execute(p_cafe uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;r text;old aldeem_workflow_private.workshop_orders;prior aldeem_workflow_private.workshop_events;req uuid;i uuid;b uuid;l jsonb;q numeric;answer jsonb;next_status text;
BEGIN
 PERFORM aldeem_workflow_private.assert_brand(c);r:=erp_lab_private.role_for(c);
 IF r='auditor' THEN RAISE EXCEPTION 'صلاحية العرض لا تسمح بتعديل الطلبات' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>40000 OR nullif(p->>'requestId','') IS NULL OR nullif(p->>'id','') IS NULL THEN RAISE EXCEPTION 'بيانات الطلب غير صالحة' USING ERRCODE='22023';END IF;
 req:=(p->>'requestId')::uuid;i:=(p->>'id')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text||req::text,99175));
 SELECT * INTO prior FROM aldeem_workflow_private.workshop_events WHERE cafe_id=c AND request_id=req;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.payload IS DISTINCT FROM p THEN RAISE EXCEPTION 'الطلب المكرر يحمل بيانات مختلفة' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM aldeem_workflow_private.workshop_orders x WHERE x.cafe_id=c AND x.id=prior.order_id AND aldeem_workflow_private.branch_allowed(c,x.branch_id,r)) THEN RAISE EXCEPTION 'الطلب غير متاح' USING ERRCODE='42501';END IF;RETURN prior.result;
 END IF;
 IF p->>'action'='create' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p)k WHERE k<>ALL(ARRAY['action','requestId','id','branchId','requiredAt','notes','lines'])) OR jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines') NOT BETWEEN 1 AND 100 OR nullif(p->>'requiredAt','') IS NULL OR length(coalesce(p->>'notes',''))>2000 THEN RAISE EXCEPTION 'أكمل موعد الطلب والأصناف' USING ERRCODE='22023';END IF;
  b:=(p->>'branchId')::uuid;
  IF b IS NULL OR NOT aldeem_workflow_private.branch_allowed(c,b,r) THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='42501';END IF;
  IF NOT isfinite((p->>'requiredAt')::timestamptz) OR (p->>'requiredAt')::timestamptz<'2000-01-01'::timestamptz OR (p->>'requiredAt')::timestamptz>='2100-01-01'::timestamptz THEN RAISE EXCEPTION 'موعد الطلب خارج النطاق المسموح' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM aldeem_workflow_private.workshop_orders WHERE id=i) THEN RAISE EXCEPTION 'معرف الطلب مستخدم' USING ERRCODE='40001';END IF;
  INSERT INTO aldeem_workflow_private.workshop_orders(id,cafe_id,branch_id,required_at,notes,created_by) VALUES(i,c,b,(p->>'requiredAt')::timestamptz,coalesce(p->>'notes',''),auth.uid());
  FOR l IN SELECT value FROM jsonb_array_elements(p->'lines') LOOP
   IF jsonb_typeof(l) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(l)k WHERE k<>ALL(ARRAY['itemId','quantity'])) OR jsonb_typeof(l->'quantity') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'بيانات الصنف غير صالحة' USING ERRCODE='22023';END IF;
   q:=(l->>'quantity')::numeric;
   IF q IS NULL OR q<=0 OR q>100000 OR q<>round(q,3) OR q::text IN('NaN','Infinity','-Infinity') OR NOT EXISTS(SELECT 1 FROM public.bf_items x LEFT JOIN public.erp_inventory_items m ON m.cafe_id=c AND m.item_id=x.id WHERE x.cafe_id=c AND x.id=(l->>'itemId')::uuid AND x.active AND (m.item_id IS NULL OR m.kind='product' AND m.status='active') AND erp_branch_private.allowed_resource(c,b,'item',x.id)) THEN RAISE EXCEPTION 'الصنف أو كميته غير متاحين' USING ERRCODE='22023';END IF;
   INSERT INTO aldeem_workflow_private.workshop_lines(cafe_id,order_id,item_id,quantity,snapshot) VALUES(c,i,(l->>'itemId')::uuid,q,aldeem_workflow_private.item_snapshot(c,(l->>'itemId')::uuid));
  END LOOP;
  answer:=jsonb_build_object('id',i,'revision',1,'status','requested');next_status:='requested';
 ELSIF p->>'action'='status' THEN
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p)k WHERE k<>ALL(ARRAY['action','requestId','id','revision','status','note'])) OR length(coalesce(p->>'note',''))>2000 THEN RAISE EXCEPTION 'بيانات الحالة غير صالحة' USING ERRCODE='22023';END IF;
  SELECT * INTO old FROM aldeem_workflow_private.workshop_orders WHERE cafe_id=c AND id=i FOR UPDATE;
  IF old.id IS NULL OR NOT aldeem_workflow_private.branch_allowed(c,old.branch_id,r) THEN RAISE EXCEPTION 'الطلب غير متاح' USING ERRCODE='42501';END IF;
  IF old.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير الطلب حدث الصفحة ثم حاول مجددًا' USING ERRCODE='40001';END IF;
  next_status:=p->>'status';
  IF next_status IS NULL OR NOT(old.status='requested' AND next_status='preparing' OR old.status='preparing' AND next_status='prepared' OR old.status='prepared' AND next_status='out_for_delivery' OR old.status='out_for_delivery' AND next_status='delivered' OR old.status IN('requested','preparing','prepared') AND next_status='cancelled') THEN RAISE EXCEPTION 'انتقال الحالة غير متاح' USING ERRCODE='22023';END IF;
  IF next_status IN('preparing','prepared','out_for_delivery') AND NOT erp_lab_private.operator(c,r) OR next_status='cancelled' AND old.created_by<>auth.uid() AND NOT erp_lab_private.operator(c,r) THEN RAISE EXCEPTION 'هذا الإجراء لمسؤول المعمل' USING ERRCODE='42501';END IF;
  IF next_status='cancelled' AND length(btrim(coalesce(p->>'note','')))<3 THEN RAISE EXCEPTION 'اكتب سبب إلغاء الطلب' USING ERRCODE='22023';END IF;
  UPDATE aldeem_workflow_private.workshop_orders SET status=next_status,revision=revision+1,updated_at=clock_timestamp() WHERE id=i RETURNING jsonb_build_object('id',id,'revision',revision,'status',status) INTO answer;
 ELSE RAISE EXCEPTION 'إجراء غير معروف' USING ERRCODE='22023';END IF;
 INSERT INTO aldeem_workflow_private.workshop_events(cafe_id,order_id,request_id,actor,status,note,payload,result) VALUES(c,i,req,auth.uid(),next_status,coalesce(p->>'note',p->>'notes',''),p,answer);
 RETURN answer;
END $$;

-- Legacy lab quality evidence remains readable, but new workshop orders use a separate request ledger
DROP TRIGGER aldeem_quality_case ON public.erp_lab_orders;
CREATE OR REPLACE FUNCTION erp_lab_private.aldeem_quality_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.erp_aldeem_food_cases;factory_stages jsonb;BEGIN
 IF TG_OP='INSERT' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem') THEN RETURN NEW;END IF;
 SELECT * INTO q FROM public.erp_aldeem_food_cases WHERE cafe_id=NEW.cafe_id AND order_id=NEW.id AND manufacturing_order_id IS NOT NULL;
 IF FOUND AND NEW.status IS DISTINCT FROM OLD.status THEN
  SELECT stages INTO factory_stages FROM aldeem_workflow_private.factory_cases WHERE cafe_id=NEW.cafe_id AND order_id=q.manufacturing_order_id;
  IF FOUND THEN q.stages:=factory_stages;END IF;
  IF NEW.status='prepared' AND coalesce(q.stages->'release'->>'result','')<>'pass' THEN RAISE EXCEPTION 'أكمل مراحل جودة المصنع واعتماد الإفراج قبل التجهيز';END IF;
  IF NEW.status IN('out_for_delivery','delivered') AND coalesce(q.stages->'dispatch'->>'result','')<>'pass' THEN RAISE EXCEPTION 'وثق توزيع تشغيلة المصنع قبل التسليم';END IF;
 END IF;RETURN NEW;
END $$;
-- Guard the old mutation endpoint so legacy lab-case evidence cannot be changed or linked after separation
DO $patch$ DECLARE s text;n text;BEGIN
 s:=pg_get_functiondef('public.erp_aldeem_food_quality_execute(uuid,jsonb)'::regprocedure);
 n:=$old$IF p->>'action' IS DISTINCT FROM 'stage' THEN RAISE EXCEPTION 'إجراء غير معروف'; END IF;$old$;
 IF (length(s)-length(replace(s,n,'')))/length(n)<>1 THEN RAISE EXCEPTION 'Review legacy quality execute baseline';END IF;
 EXECUTE replace(s,n,n||E'\n  RAISE EXCEPTION ''سجلات المعمل السابقة للعرض فقط سجل مراحل التصنيع من المصنع'' USING ERRCODE=''22023'';');
END $patch$;

CREATE FUNCTION public.aldeem_factory_quality_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;BEGIN
 PERFORM aldeem_workflow_private.assert_brand(c);r:=erp_manufacturing_private.authorize(c);
 IF coalesce(r,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية عرض المصنع' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('canWrite',r<>'auditor','canApprove',r IN('owner','manager'),
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.branches WHERE cafe_id=c AND aldeem_workflow_private.branch_allowed(c,id,r)),'[]'::jsonb),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT m.id,m.code,m.name,m.status,coalesce((m.payload->>'quantity')::numeric,0) quantity,coalesce(i.name,'') "itemName",coalesce(i.unit,'') unit,coalesce(q.branch_id,br.branch_id) "branchId",b.name "branchName"
  FROM public.erp_mfg_orders m LEFT JOIN public.bf_items i ON i.cafe_id=c AND i.id=nullif(m.payload->>'productId','')::uuid LEFT JOIN aldeem_workflow_private.factory_cases q ON q.cafe_id=c AND q.order_id=m.id LEFT JOIN public.erp_branch_records br ON br.cafe_id=c AND br.table_name='erp_mfg_orders' AND br.record_id=m.id LEFT JOIN public.branches b ON b.cafe_id=c AND b.id=coalesce(q.branch_id,br.branch_id)
  WHERE m.cafe_id=c AND erp_branch_private.row_allowed(c,erp_enterprise_private.branch_for(c,r),to_jsonb(m),'erp_mfg_orders') AND (q.branch_id IS NULL OR aldeem_workflow_private.branch_allowed(c,q.branch_id,r)) ORDER BY m.updated_at DESC,m.id LIMIT 300)x),'[]'::jsonb),
 'cases',coalesce((SELECT jsonb_agg(to_jsonb(q)||jsonb_build_object('manufacturing_order_id',q.order_id)) FROM aldeem_workflow_private.factory_cases q JOIN public.erp_mfg_orders m ON m.cafe_id=c AND m.id=q.order_id WHERE q.cafe_id=c AND aldeem_workflow_private.branch_allowed(c,q.branch_id,r) AND erp_branch_private.row_allowed(c,erp_enterprise_private.branch_for(c,r),to_jsonb(m),'erp_mfg_orders')),'[]'::jsonb),
 'legacyCases',coalesce((SELECT jsonb_agg(to_jsonb(q)||jsonb_build_object('branch_id',o.branch_id,'legacyLabNumber',o.number)) FROM public.erp_aldeem_food_cases q JOIN public.erp_lab_orders o ON o.cafe_id=c AND o.id=q.order_id WHERE q.cafe_id=c AND aldeem_workflow_private.branch_allowed(c,o.branch_id,r)),'[]'::jsonb),
 'programs',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM public.erp_aldeem_food_programs g WHERE g.cafe_id=c AND aldeem_workflow_private.branch_allowed(c,g.branch_id,r)),'[]'::jsonb),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT e.id,e.order_id,e.action,e.created_at,e.payload FROM aldeem_workflow_private.factory_events e JOIN aldeem_workflow_private.factory_cases q ON q.cafe_id=c AND q.order_id=e.order_id JOIN public.erp_mfg_orders m ON m.cafe_id=c AND m.id=q.order_id WHERE e.cafe_id=c AND aldeem_workflow_private.branch_allowed(c,q.branch_id,r) AND erp_branch_private.row_allowed(c,erp_enterprise_private.branch_for(c,r),to_jsonb(m),'erp_mfg_orders') ORDER BY e.created_at DESC LIMIT 100)x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.aldeem_factory_quality_execute(p_cafe uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;r text;m public.erp_mfg_orders;q aldeem_workflow_private.factory_cases;prior aldeem_workflow_private.factory_events;b uuid;req uuid;stage text;idx integer;k integer;result text;ev jsonb;answer jsonb;
 stages text[]:=ARRAY['receiving','storage','preparation','processing','cooling','packaging','verification','release','dispatch'];
BEGIN
 PERFORM aldeem_workflow_private.assert_brand(c);r:=erp_manufacturing_private.authorize(c,true);
 IF coalesce(r,'') NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل جودة المصنع' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>14000 OR nullif(p->>'requestId','') IS NULL THEN RAISE EXCEPTION 'بيانات غير صالحة' USING ERRCODE='22023';END IF;
 IF p->>'action'='program' THEN
  IF NOT aldeem_workflow_private.branch_allowed(c,(p->>'branchId')::uuid,r) THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='42501';END IF;
  RETURN public.erp_aldeem_food_quality_execute(c,p);
 END IF;
 IF p->>'action' IS DISTINCT FROM 'stage' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p)x WHERE x<>ALL(ARRAY['action','requestId','id','revision','branchId','stage','result','fields','reason'])) THEN RAISE EXCEPTION 'إجراء جودة غير صالح' USING ERRCODE='22023';END IF;
 req:=(p->>'requestId')::uuid;b:=(p->>'branchId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text||req::text,99176));
 SELECT * INTO m FROM public.erp_mfg_orders WHERE cafe_id=c AND id=(p->>'id')::uuid FOR UPDATE;
 IF m.id IS NULL OR b IS NULL OR NOT aldeem_workflow_private.branch_allowed(c,b,r) OR NOT erp_branch_private.row_allowed(c,b,to_jsonb(m),'erp_mfg_orders') THEN RAISE EXCEPTION 'أمر المصنع أو الفرع غير متاح' USING ERRCODE='42501';END IF;
 SELECT * INTO prior FROM aldeem_workflow_private.factory_events WHERE cafe_id=c AND request_id=req;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.payload->'command' IS DISTINCT FROM p THEN RAISE EXCEPTION 'طلب مكرر ببيانات مختلفة' USING ERRCODE='22023';END IF;RETURN prior.result;END IF;
 IF m.status IN('cancelled','completed') AND p->>'stage'<>'dispatch' THEN RAISE EXCEPTION 'تشغيلة المصنع مغلقة استخدم سجل المراجعة والسحب' USING ERRCODE='22023';END IF;
 IF m.status='cancelled' THEN RAISE EXCEPTION 'أمر المصنع ملغى' USING ERRCODE='22023';END IF;
 IF p->>'stage'='dispatch' AND (m.status<>'completed' OR m.output_document_id IS NULL OR m.output_quantity<=0) THEN RAISE EXCEPTION 'رحل ناتج التصنيع إلى المخزون قبل توثيق التسليم' USING ERRCODE='22023';END IF;
 INSERT INTO aldeem_workflow_private.factory_cases(cafe_id,order_id,branch_id) VALUES(c,m.id,b) ON CONFLICT DO NOTHING;
 SELECT * INTO q FROM aldeem_workflow_private.factory_cases WHERE cafe_id=c AND order_id=m.id FOR UPDATE;
 IF q.branch_id<>b THEN RAISE EXCEPTION 'فرع سجل الجودة لا يتغير بعد إنشائه' USING ERRCODE='22023';END IF;
 IF q.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001';END IF;
 stage:=p->>'stage';idx:=array_position(stages,stage);result:=p->>'result';
 IF idx IS NULL OR result IS NULL OR result NOT IN('pass','fail','na') OR jsonb_typeof(p->'fields') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'fields')<>3 OR length(coalesce(p->>'reason',''))>2000 THEN RAISE EXCEPTION 'أكمل سجل المرحلة' USING ERRCODE='22023';END IF;
 IF result='na' AND(stage<>'cooling' OR length(btrim(coalesce(p->>'reason','')))<10) OR result='fail' AND length(btrim(coalesce(p->>'reason','')))<10 THEN RAISE EXCEPTION 'وثق سبب عدم الانطباق أو الانحراف والإجراء التصحيحي' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'fields')v WHERE jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(v#>>'{}')>2000) OR result='pass' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'fields')v WHERE length(btrim(v))<3) THEN RAISE EXCEPTION 'أكمل أدلة المرحلة الثلاثة' USING ERRCODE='22023';END IF;
 IF result<>'fail' AND idx>1 THEN FOR k IN 1..idx-1 LOOP IF coalesce(q.stages->stages[k]->>'result','') NOT IN('pass','na') THEN RAISE EXCEPTION 'أكمل المراحل السابقة وعالج الانحرافات أولًا' USING ERRCODE='22023';END IF;END LOOP;END IF;
 IF idx>=8 AND r NOT IN('owner','manager') THEN RAISE EXCEPTION 'الإفراج والتوزيع يحتاجان اعتماد المدير' USING ERRCODE='42501';END IF;
 IF idx>=8 AND result='pass' AND EXISTS(SELECT 1 FROM unnest(ARRAY['license','haccp','water','maintenance','cleaning','pest_control','staff_health','training','calibration'])t WHERE NOT EXISTS(SELECT 1 FROM public.erp_aldeem_food_programs g WHERE g.cafe_id=c AND g.branch_id=b AND g.kind=t AND g.valid_until>=(clock_timestamp() AT TIME ZONE 'Asia/Riyadh')::date)) THEN RAISE EXCEPTION 'اعتمد برامج المتطلبات الأساسية السارية للمصنع قبل الإفراج' USING ERRCODE='22023';END IF;
 IF idx>=8 AND EXISTS(SELECT 1 FROM public.erp_food_safety_records f WHERE f.cafe_id=c AND f.branch_id=b AND f.deviation AND NOT EXISTS(SELECT 1 FROM public.erp_food_safety_closures cl WHERE cl.record_id=f.id)) THEN RAISE EXCEPTION 'توجد انحرافات سلامة غذاء مفتوحة' USING ERRCODE='22023';END IF;
 ev:=jsonb_build_object('before',to_jsonb(q),'command',p);
 FOR k IN idx..array_length(stages,1) LOOP q.stages:=q.stages-stages[k];END LOOP;
 q.stages:=q.stages||jsonb_build_object(stage,jsonb_build_object('result',result,'fields',p->'fields','reason',coalesce(p->>'reason',''),'at',clock_timestamp(),'actor',auth.uid(),'actorName',erp_enterprise_private.actor_name(c,auth.uid())));
 UPDATE aldeem_workflow_private.factory_cases SET stages=q.stages,revision=revision+1 WHERE order_id=m.id RETURNING jsonb_build_object('id',order_id,'revision',revision) INTO answer;
 INSERT INTO aldeem_workflow_private.factory_events(cafe_id,order_id,request_id,actor,action,payload,result) VALUES(c,m.id,req,auth.uid(),stage,ev,answer);
 RETURN answer;
END $$;

CREATE OR REPLACE FUNCTION erp_lab_private.aldeem_manufacturing_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.status='completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
  IF EXISTS(SELECT 1 FROM public.erp_aldeem_food_cases q WHERE q.cafe_id=NEW.cafe_id AND q.manufacturing_order_id=NEW.id AND coalesce(q.stages->'release'->>'result','')<>'pass') AND NOT EXISTS(SELECT 1 FROM aldeem_workflow_private.factory_cases q WHERE q.cafe_id=NEW.cafe_id AND q.order_id=NEW.id AND q.stages->'release'->>'result'='pass') THEN RAISE EXCEPTION 'لا يمكن ترحيل ناتج تشغيلة مرتبطة قبل الإفراج عن الجودة';END IF;
  IF EXISTS(SELECT 1 FROM public.cafes WHERE id=NEW.cafe_id AND slug='khayal-aldeem') AND (
   EXISTS(SELECT 1 FROM aldeem_workflow_private.factory_cases q WHERE q.cafe_id=NEW.cafe_id AND q.order_id=NEW.id AND coalesce(q.stages->'release'->>'result','')<>'pass') OR
   NOT EXISTS(SELECT 1 FROM aldeem_workflow_private.factory_cases q WHERE q.cafe_id=NEW.cafe_id AND q.order_id=NEW.id AND q.stages->'release'->>'result'='pass') AND NOT EXISTS(SELECT 1 FROM public.erp_aldeem_food_cases q WHERE q.cafe_id=NEW.cafe_id AND q.manufacturing_order_id=NEW.id AND q.stages->'release'->>'result'='pass')) THEN RAISE EXCEPTION 'أكمل مراحل جودة المصنع واعتماد الإفراج قبل ترحيل الإنتاج';END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION public.aldeem_factory_trace(p_cafe uuid,p_order uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;m public.erp_mfg_orders;b uuid;BEGIN
 PERFORM aldeem_workflow_private.assert_brand(c);r:=erp_manufacturing_private.authorize(c);
 IF coalesce(r,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية عرض المصنع' USING ERRCODE='42501';END IF;
 SELECT * INTO m FROM public.erp_mfg_orders WHERE cafe_id=c AND id=p_order;
 SELECT branch_id INTO b FROM aldeem_workflow_private.factory_cases WHERE cafe_id=c AND order_id=p_order;
 IF m.id IS NULL OR NOT erp_branch_private.row_allowed(c,erp_enterprise_private.branch_for(c,r),to_jsonb(m),'erp_mfg_orders') OR b IS NOT NULL AND NOT aldeem_workflow_private.branch_allowed(c,b,r) THEN RAISE EXCEPTION 'أمر المصنع غير متاح' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('materials',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT a.id,i.name,a.quantity,a.returned,a.document_id,w.name warehouse FROM public.erp_mfg_material_issues a JOIN public.bf_items i ON i.cafe_id=c AND i.id=a.item_id JOIN public.bf_warehouses w ON w.cafe_id=c AND w.id=a.warehouse_id WHERE a.cafe_id=c AND a.order_id=p_order ORDER BY a.created_at LIMIT 300)x),'[]'::jsonb),
 'movements',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT t.id,l.lot,l.serial,l.expires_on,t.quantity,i.name,w.name warehouse,v.document_id,t.created_at FROM public.erp_inventory_tracking_movements t JOIN public.erp_inventory_lots l ON l.cafe_id=c AND l.id=t.lot_id JOIN public.bf_movements v ON v.cafe_id=c AND v.id=t.movement_id JOIN public.bf_items i ON i.cafe_id=c AND i.id=l.item_id JOIN public.bf_warehouses w ON w.cafe_id=c AND w.id=t.warehouse_id WHERE t.cafe_id=c AND(v.document_id=m.output_document_id OR v.document_id IN(SELECT document_id FROM public.erp_mfg_material_issues WHERE cafe_id=c AND order_id=p_order)) ORDER BY t.created_at LIMIT 300)x),'[]'::jsonb));
END $$;
DO $overview$ DECLARE s text;n text;BEGIN
 s:=pg_get_functiondef('public.aldeem_overview_read(uuid,date,date,uuid,text)'::regprocedure);
 n:='WITH orders AS MATERIALIZED(SELECT id,number,status,branch_id,created_at,required_at FROM public.erp_lab_orders WHERE cafe_id=c AND created_at>=d0 AND created_at<d1 AND (b IS NULL OR branch_id=b))';
 IF (length(s)-length(replace(s,n,'')))/length(n)<>1 THEN RAISE EXCEPTION 'Review overview workshop period baseline';END IF;
 s:=replace(s,n,'WITH orders AS MATERIALIZED(SELECT id,number,status,branch_id,created_at,required_at FROM public.erp_lab_orders WHERE cafe_id=c AND created_at>=d0 AND created_at<d1 AND (b IS NULL OR branch_id=b) UNION ALL SELECT id,number,status,branch_id,created_at,required_at FROM aldeem_workflow_private.workshop_orders WHERE cafe_id=c AND created_at>=d0 AND created_at<d1 AND (b IS NULL OR branch_id=b))');
 n:=$old$'labPending',(SELECT count(*) FROM public.erp_lab_orders WHERE cafe_id=c AND status IN('requested','preparing','on_hold','prepared','out_for_delivery') AND (b IS NULL OR branch_id=b))$old$;
 IF (length(s)-length(replace(s,n,'')))/length(n)<>1 THEN RAISE EXCEPTION 'Review overview workshop current baseline';END IF;
 s:=replace(s,n,n||$new$+(SELECT count(*) FROM aldeem_workflow_private.workshop_orders WHERE cafe_id=c AND status IN('requested','preparing','prepared','out_for_delivery') AND (b IS NULL OR branch_id=b))$new$);
 EXECUTE s;
END $overview$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA aldeem_workflow_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.aldeem_workshop_read(uuid,uuid,text,text,text,integer,integer),public.aldeem_workshop_execute(uuid,jsonb),public.aldeem_factory_quality_read(uuid),public.aldeem_factory_quality_execute(uuid,jsonb),public.aldeem_factory_trace(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_workshop_read(uuid,uuid,text,text,text,integer,integer),public.aldeem_workshop_execute(uuid,jsonb),public.aldeem_factory_quality_read(uuid),public.aldeem_factory_quality_execute(uuid,jsonb),public.aldeem_factory_trace(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
