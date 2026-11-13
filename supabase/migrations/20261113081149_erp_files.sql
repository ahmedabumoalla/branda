BEGIN;
CREATE SCHEMA erp_file_private;
REVOKE ALL ON SCHEMA erp_file_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.erp_files(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),entity_type text NOT NULL,record_id uuid NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),mime text NOT NULL CHECK(mime IN('image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),
 path text NOT NULL UNIQUE,uploaded boolean NOT NULL DEFAULT false,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id)
);
CREATE INDEX erp_files_record ON public.erp_files(cafe_id,entity_type,record_id,created_at);
ALTER TABLE public.erp_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_files FROM PUBLIC,anon,authenticated;

CREATE FUNCTION erp_file_private.assert_record(p_cafe uuid,p_type text,p_record uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE tbl text; found_record boolean; r text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING ERRCODE='42501'; END IF;
 r:=brand_finance_private.role_for(p_cafe);
 IF NOT coalesce(r IN('owner','manager','accountant','auditor') OR (r='warehouse' AND p_type LIKE 'manufacturing_%'),false) OR (p_write AND NOT(r IN('owner','manager') OR (r='accountant' AND (p_type='contracting_document' OR p_type LIKE 'manufacturing_%')) OR (r='warehouse' AND p_type LIKE 'manufacturing_%'))) THEN RAISE EXCEPTION 'لا تملك صلاحية الوصول إلى مرفقات هذا السجل' USING ERRCODE='42501'; END IF;
 tbl:=CASE p_type WHEN 'task' THEN 'erp_tasks' WHEN 'task_flow' THEN 'erp_task_flows' WHEN 'manufacturing_order' THEN 'erp_mfg_orders' WHEN 'manufacturing_plan' THEN 'erp_mfg_plans' WHEN 'manufacturing_bom' THEN 'erp_mfg_boms' WHEN 'manufacturing_workstation' THEN 'erp_mfg_workstations' WHEN 'manufacturing_routing' THEN 'erp_mfg_routings' WHEN 'manufacturing_overhead' THEN 'erp_mfg_overheads' WHEN 'booking' THEN 'erp_bookings' WHEN 'contracting_document' THEN 'erp_contracting_documents' END;
 IF tbl IS NULL OR to_regclass('public.'||tbl) IS NULL OR p_record IS NULL THEN RAISE EXCEPTION 'نوع السجل غير متاح للمرفقات' USING ERRCODE='22023'; END IF;
 -- A concurrent DELETE must wait until prepare/complete/remove has finished.
 -- The deletion guard then sees the committed file link under READ COMMITTED.
 IF p_write THEN
  EXECUTE format('SELECT true FROM public.%I WHERE cafe_id=$1 AND id=$2 FOR KEY SHARE',tbl) INTO found_record USING p_cafe,p_record;
 ELSE
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE cafe_id=$1 AND id=$2)',tbl) INTO found_record USING p_cafe,p_record;
 END IF;
 IF NOT coalesce(found_record,false) THEN RAISE EXCEPTION 'السجل غير موجود في هذه العلامة' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION public.erp_file_access(p_path text,p_write boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.erp_files;
BEGIN
 SELECT * INTO f FROM public.erp_files WHERE path=p_path;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM erp_file_private.assert_record(f.cafe_id,f.entity_type,f.record_id,p_write);
 RETURN CASE WHEN p_write THEN f.created_by=auth.uid() AND NOT f.uploaded ELSE f.uploaded OR f.created_by=auth.uid() END;
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' THEN RETURN false;
END $$;
CREATE FUNCTION public.erp_file(p_cafe_id uuid,p_action text,p_type text,p_record_id uuid,p_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.erp_files; result jsonb; suffix text;
BEGIN
 PERFORM erp_file_private.assert_record(p_cafe_id,p_type,p_record_id,p_action IN('prepare','complete','remove'));
 IF p_action='list' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'cafe_id'-'created_by'-'sha256' ORDER BY created_at) FROM public.erp_files x WHERE cafe_id=p_cafe_id AND entity_type=p_type AND record_id=p_record_id),'[]'); END IF;
 IF p_id IS NULL THEN RAISE EXCEPTION 'معرف الملف مطلوب' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 SELECT * INTO f FROM public.erp_files WHERE id=p_id FOR UPDATE;
 IF FOUND AND (f.cafe_id<>p_cafe_id OR f.entity_type<>p_type OR f.record_id<>p_record_id) THEN RAISE EXCEPTION 'الملف غير متاح' USING ERRCODE='42501'; END IF;
 IF p_action='prepare' THEN
  IF f.id IS NOT NULL THEN
   IF f.sha256 IS DISTINCT FROM p_metadata->>'sha256' OR f.size_bytes IS DISTINCT FROM (p_metadata->>'size')::integer OR f.name IS DISTINCT FROM p_metadata->>'name' OR f.mime IS DISTINCT FROM p_metadata->>'mime' OR f.created_by<>auth.uid() THEN RAISE EXCEPTION 'معرف الملف مستخدم لمحتوى آخر' USING ERRCODE='22023'; END IF;
   RETURN to_jsonb(f)-'cafe_id'-'created_by';
  END IF;
  suffix:=CASE p_metadata->>'mime' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'application/pdf' THEN 'pdf' WHEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' THEN 'docx' END;
  IF suffix IS NULL THEN RAISE EXCEPTION 'نوع الملف غير مسموح' USING ERRCODE='22023'; END IF;
  INSERT INTO public.erp_files(id,cafe_id,entity_type,record_id,name,mime,size_bytes,sha256,path,created_by) VALUES(p_id,p_cafe_id,p_type,p_record_id,p_metadata->>'name',p_metadata->>'mime',(p_metadata->>'size')::integer,p_metadata->>'sha256',p_cafe_id::text||'/'||p_id::text||'.'||suffix,auth.uid()) RETURNING * INTO f;
 ELSIF f.id IS NULL THEN RAISE EXCEPTION 'الملف غير موجود' USING ERRCODE='22023';
 ELSIF p_action='complete' THEN
  IF f.created_by<>auth.uid() THEN RAISE EXCEPTION 'لا تملك صلاحية إكمال هذا الرفع' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='erp-record-files' AND name=f.path AND (metadata->>'size')::bigint=f.size_bytes AND metadata->>'mimetype'=f.mime) THEN RAISE EXCEPTION 'لم يكتمل رفع الملف' USING ERRCODE='22023'; END IF;
  UPDATE public.erp_files SET uploaded=true WHERE id=p_id RETURNING * INTO f;
 ELSIF p_action='remove' THEN
  -- Physical Storage deletion is performed through its API before removing the link.
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='erp-record-files' AND name=f.path) THEN RAISE EXCEPTION 'أكمل حذف الملف من التخزين أولًا' USING ERRCODE='22023'; END IF;
  DELETE FROM public.erp_files WHERE id=p_id;
 ELSIF p_action<>'get' THEN RAISE EXCEPTION 'إجراء ملف غير معروف' USING ERRCODE='22023'; END IF;
 RETURN to_jsonb(f)-'cafe_id'-'created_by';
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('erp-record-files','erp-record-files',false,5242880,ARRAY['image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY erp_files_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='erp-record-files' AND public.erp_file_access(name,true));
CREATE POLICY erp_files_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='erp-record-files' AND public.erp_file_access(name,false));
CREATE FUNCTION public.erp_file_delete_access(p_path text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f public.erp_files;
BEGIN
 SELECT * INTO f FROM public.erp_files WHERE path=p_path;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM erp_file_private.assert_record(f.cafe_id,f.entity_type,f.record_id,true);
 RETURN true;
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE '22023' THEN RETURN false;
END $$;
CREATE POLICY erp_files_delete ON storage.objects FOR DELETE TO authenticated USING(bucket_id='erp-record-files' AND public.erp_file_delete_access(name));
CREATE FUNCTION erp_file_private.prevent_orphans() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_files WHERE cafe_id=OLD.cafe_id AND record_id=OLD.id AND entity_type=TG_ARGV[0]) THEN
  RAISE EXCEPTION 'احذف مرفقات السجل قبل حذفه' USING ERRCODE='23503';
 END IF;
 RETURN OLD;
END $$;
DO $$ DECLARE target record; BEGIN
 FOR target IN SELECT * FROM (VALUES ('erp_tasks','task'),('erp_task_flows','task_flow'),('erp_mfg_orders','manufacturing_order'),('erp_mfg_plans','manufacturing_plan'),('erp_mfg_boms','manufacturing_bom'),('erp_mfg_workstations','manufacturing_workstation'),('erp_mfg_routings','manufacturing_routing'),('erp_mfg_overheads','manufacturing_overhead'),('erp_bookings','booking'),('erp_contracting_documents','contracting_document')) AS t(tbl,kind) LOOP
  IF to_regclass('public.'||target.tbl) IS NOT NULL THEN
   EXECUTE format('CREATE TRIGGER erp_file_orphan_guard BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_file_private.prevent_orphans(%L)',target.tbl,target.kind);
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_file_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.erp_file_access(text,boolean),public.erp_file_delete_access(text),public.erp_file(uuid,text,text,uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.erp_file_access(text,boolean),public.erp_file_delete_access(text),public.erp_file(uuid,text,text,uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
