BEGIN;
ALTER TABLE public.erp_task_notes ADD COLUMN note_format text NOT NULL DEFAULT 'plain' CHECK(note_format IN('plain','rich')),
 ADD COLUMN tags jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(tags)='array' AND jsonb_array_length(tags)<=20);
CREATE FUNCTION erp_task_private.note_content_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb;seen text[]:='{}';tag text;visible text;BEGIN
 IF NEW.note_format NOT IN('plain','rich') OR NEW.note_format IS NULL THEN RAISE EXCEPTION 'تنسيق الملاحظة غير صالح' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(NEW.tags) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.tags)>20 THEN RAISE EXCEPTION 'اختر عشرين وسمًا كحد أقصى' USING ERRCODE='22023';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(NEW.tags) LOOP
  tag:=item#>>'{}';
  IF jsonb_typeof(item)<>'string' OR length(btrim(tag)) NOT BETWEEN 1 AND 80 OR tag<>btrim(tag) OR tag~'[[:cntrl:]]' OR lower(tag)=ANY(seen) THEN RAISE EXCEPTION 'الوسوم يجب أن تكون قصيرة ودون تكرار' USING ERRCODE='22023';END IF;
  seen:=array_append(seen,lower(tag));
 END LOOP;
 IF NEW.note_format='rich' THEN
  visible:=regexp_replace(NEW.note,'</?(p|br|b|strong|i|em|u|s|ul|ol|li|blockquote|h2|h3|h4)([[:space:]]*/)?[[:space:]]*>','','gi');
  IF visible~'[<>]' THEN RAISE EXCEPTION 'الملاحظة تقبل تنسيق النص فقط' USING ERRCODE='22023';END IF;
  visible:=regexp_replace(visible,'&(amp;)?(nbsp|#160|#xA0);','','gi');
  IF length(btrim(visible))=0 THEN RAISE EXCEPTION 'أدخل نص الملاحظة' USING ERRCODE='22023';END IF;
 END IF;
 IF NOT isfinite(NEW.occurred_at) THEN RAISE EXCEPTION 'تاريخ الملاحظة غير صالح' USING ERRCODE='22023';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_note_content_guard BEFORE INSERT OR UPDATE ON public.erp_task_notes FOR EACH ROW EXECUTE FUNCTION erp_task_private.note_content_guard();
-- Preserve the existing role, branch, task-target and retry guard chain and RPC identity.
DO $$DECLARE src text;anchor text:='INSERT INTO public.erp_task_notes(cafe_id,task_id,note,occurred_at,created_by) VALUES(p_cafe_id,v_id,btrim(p_data->>''note''),coalesce((p_data->>''occurredAt'')::timestamptz,now()),auth.uid());';BEGIN
 SELECT pg_get_functiondef('erp_branch_private.erp_tasks_execute_before_scope(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 IF (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'Review actual task-note insertion before extending';END IF;
 src:=replace(src,anchor,'INSERT INTO public.erp_task_notes(cafe_id,task_id,note,occurred_at,created_by,note_format,tags) VALUES(p_cafe_id,v_id,btrim(p_data->>''note''),coalesce((p_data->>''occurredAt'')::timestamptz,now()),auth.uid(),CASE WHEN p_data?''format'' THEN p_data->>''format'' ELSE ''plain'' END,CASE WHEN p_data?''tags'' THEN p_data->''tags'' ELSE ''[]''::jsonb END);');
 EXECUTE src;
END $$;
-- Refresh the existing branch projection: PostgreSQL expands SELECT * when a view is created.
CREATE OR REPLACE VIEW erp_branch_private.erp_task_notes WITH(security_barrier=true) AS
 SELECT source.* FROM public.erp_task_notes source
 WHERE nullif(current_setting('erp.branch_cafe',true),'') IS DISTINCT FROM cafe_id::text
 OR erp_branch_private.row_allowed(cafe_id,erp_branch_private.current_branch_before_provider_payment(cafe_id),to_jsonb(source),'');
REVOKE ALL ON FUNCTION erp_task_private.note_content_guard() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
