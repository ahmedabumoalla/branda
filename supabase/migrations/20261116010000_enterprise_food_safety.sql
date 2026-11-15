BEGIN;
-- Food safety register for enterprise food brands: the daily records an inspection asks for (temperature
-- readings, cleaning and sanitation, pest control, staff health, receiving inspection, training, calibration)
-- and the product recall register. A record is never edited or deleted; a deviation is closed by a separate
-- closing entry that says what was done and who verified it. Enabled per brand in erp_enterprise_settings.
CREATE TABLE public.erp_food_safety_records(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,branch_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('temperature','cleaning','pest_control','staff_health','receiving','training','calibration','recall')),
 deviation boolean NOT NULL DEFAULT false,recorded_at timestamptz NOT NULL,subject text NOT NULL CHECK(length(btrim(subject)) BETWEEN 2 AND 200),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=6000),
 corrective text NOT NULL DEFAULT '' CHECK(length(corrective)<=2000),created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),CHECK(NOT deviation OR length(btrim(corrective))>=5)
);
CREATE INDEX erp_food_safety_records_time ON public.erp_food_safety_records(cafe_id,recorded_at DESC);
CREATE INDEX erp_food_safety_records_branch ON public.erp_food_safety_records(branch_id,cafe_id);
CREATE INDEX erp_food_safety_records_actor ON public.erp_food_safety_records(created_by);
CREATE TABLE public.erp_food_safety_closures(
 cafe_id uuid NOT NULL,record_id uuid NOT NULL,note text NOT NULL CHECK(length(btrim(note)) BETWEEN 5 AND 2000),closed_by uuid NOT NULL REFERENCES auth.users(id),closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(record_id),FOREIGN KEY(cafe_id,record_id) REFERENCES public.erp_food_safety_records(cafe_id,id)
);
CREATE INDEX erp_food_safety_closures_cafe ON public.erp_food_safety_closures(cafe_id,record_id);
CREATE INDEX erp_food_safety_closures_actor ON public.erp_food_safety_closures(closed_by);
ALTER TABLE public.erp_food_safety_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_food_safety_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_food_safety_records,public.erp_food_safety_closures FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_food_safety_records FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_food_safety_closures FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION public.erp_food_safety_read(p_cafe uuid,p_from date,p_to date,p_kind text DEFAULT '',p_branch uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;d0 timestamptz;d1 timestamptz;
BEGIN
 r:=erp_enterprise_private.role_for(c);b:=coalesce(erp_enterprise_private.branch_for(c,r),p_branch);
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'الفترة المطلوبة غير صالحة' USING ERRCODE='22023';END IF;
 d0:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';d1:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
 RETURN jsonb_build_object('role',r,'branchId',erp_enterprise_private.branch_for(c,r),'canClose',r IN('owner','manager'),
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) ORDER BY x.sort_order,x.name) FROM public.branches x WHERE x.cafe_id=c AND x.active AND x.deleted_at IS NULL AND (erp_enterprise_private.branch_for(c,r) IS NULL OR x.id=erp_enterprise_private.branch_for(c,r))),'[]'::jsonb),
  'openDeviations',(SELECT count(*) FROM public.erp_food_safety_records f WHERE f.cafe_id=c AND f.deviation AND (b IS NULL OR f.branch_id=b) AND NOT EXISTS(SELECT 1 FROM public.erp_food_safety_closures k WHERE k.record_id=f.id)),
  'counts',coalesce((SELECT jsonb_object_agg(g.kind,g.n) FROM(SELECT kind,count(*) n FROM public.erp_food_safety_records f WHERE f.cafe_id=c AND f.recorded_at>=d0 AND f.recorded_at<d1 AND (b IS NULL OR f.branch_id=b) GROUP BY 1) g),'{}'::jsonb),
  'records',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."recordedAt" DESC) FROM(
    SELECT f.id,f.number,f.branch_id "branchId",f.kind,f.deviation,f.recorded_at "recordedAt",f.subject,f.payload,f.corrective,erp_enterprise_private.actor_name(c,f.created_by) actor,
     k.note "closedNote",k.closed_at "closedAt",erp_enterprise_private.actor_name(c,k.closed_by) "closedBy"
    FROM public.erp_food_safety_records f LEFT JOIN public.erp_food_safety_closures k ON k.record_id=f.id
    WHERE f.cafe_id=c AND (b IS NULL OR f.branch_id=b) AND (coalesce(p_kind,'')='' OR f.kind=p_kind)
     AND (f.recorded_at>=d0 AND f.recorded_at<d1 OR f.deviation AND k.record_id IS NULL)
    ORDER BY f.recorded_at DESC LIMIT 400) x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.erp_food_safety_execute(p_cafe uuid,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;r text;b uuid;k text;details jsonb;off boolean;reading numeric;low numeric;high numeric;at timestamptz;rec public.erp_food_safety_records;
BEGIN
 r:=erp_enterprise_private.role_for(c);
 IF r='auditor' THEN RAISE EXCEPTION 'المدقق يطلع على السجلات ولا يضيف إليها' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>10000 THEN RAISE EXCEPTION 'بيانات السجل غير صالحة' USING ERRCODE='22023';END IF;
 IF p_action='close' THEN
  IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'إغلاق الانحراف للمالك أو المدير بعد التحقق' USING ERRCODE='42501';END IF;
  SELECT * INTO rec FROM public.erp_food_safety_records WHERE cafe_id=c AND id=(p->>'id')::uuid;
  IF NOT FOUND OR NOT rec.deviation THEN RAISE EXCEPTION 'السجل غير موجود أو ليس انحرافًا' USING ERRCODE='22023';END IF;
  IF length(btrim(coalesce(p->>'note',''))) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'اكتب ما تم التحقق منه لإغلاق الانحراف' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_food_safety_closures(cafe_id,record_id,note,closed_by) VALUES(c,rec.id,btrim(p->>'note'),auth.uid()) ON CONFLICT(record_id) DO NOTHING;
  RETURN jsonb_build_object('id',rec.id);
 END IF;
 IF p_action<>'record' THEN RAISE EXCEPTION 'عملية غير معروفة' USING ERRCODE='22023';END IF;
 k:=p->>'kind';b:=(p->>'branchId')::uuid;details:=coalesce(p->'details','{}'::jsonb);
 IF coalesce(k,'') NOT IN('temperature','cleaning','pest_control','staff_health','receiving','training','calibration','recall') OR jsonb_typeof(details)<>'object'
  OR length(btrim(coalesce(p->>'subject',''))) NOT BETWEEN 2 AND 200 OR length(coalesce(p->>'corrective',''))>2000 THEN RAISE EXCEPTION 'أكمل نوع السجل وموضوعه' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches x WHERE x.cafe_id=c AND x.id=b AND x.active AND x.deleted_at IS NULL) OR coalesce(erp_enterprise_private.branch_for(c,r),b)<>b THEN RAISE EXCEPTION 'اختر فرعًا مسموحًا لك' USING ERRCODE='42501';END IF;
 at:=coalesce(nullif(p->>'recordedAt','')::timestamptz,now());
 IF at>now()+interval '5 minutes' OR at<now()-interval '7 days' THEN RAISE EXCEPTION 'وقت السجل يجب أن يكون خلال آخر سبعة أيام' USING ERRCODE='22023';END IF;
 off:=coalesce((p->>'deviation')::boolean,false);
 IF k='temperature' THEN
  IF jsonb_typeof(details->'reading') IS DISTINCT FROM 'number' OR jsonb_typeof(details->'min') IS DISTINCT FROM 'number' OR jsonb_typeof(details->'max') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'أدخل القراءة والحدين الأدنى والأعلى بالأرقام' USING ERRCODE='22023';END IF;
  reading:=(details->>'reading')::numeric;low:=(details->>'min')::numeric;high:=(details->>'max')::numeric;
  IF low>high OR reading NOT BETWEEN -100 AND 400 THEN RAISE EXCEPTION 'راجع حدود الحرارة والقراءة' USING ERRCODE='22023';END IF;
  -- A reading outside its limits is a deviation whatever the form says
  off:=off OR reading<low OR reading>high;
 END IF;
 IF k='recall' THEN off:=true;END IF;
 IF off AND length(btrim(coalesce(p->>'corrective','')))<5 THEN RAISE EXCEPTION 'اكتب الإجراء التصحيحي المتخذ لهذا الانحراف' USING ERRCODE='22023';END IF;
 INSERT INTO public.erp_food_safety_records(cafe_id,branch_id,kind,deviation,recorded_at,subject,payload,corrective,created_by)
 VALUES(c,b,k,off,at,btrim(p->>'subject'),details,btrim(coalesce(p->>'corrective','')),auth.uid()) RETURNING * INTO rec;
 RETURN jsonb_build_object('id',rec.id,'number',rec.number,'deviation',rec.deviation);
END $$;

REVOKE ALL ON FUNCTION public.erp_food_safety_read(uuid,date,date,text,uuid),public.erp_food_safety_execute(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_food_safety_read(uuid,date,date,text,uuid),public.erp_food_safety_execute(uuid,text,jsonb) TO authenticated;
COMMIT;
