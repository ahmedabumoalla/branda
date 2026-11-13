BEGIN;

-- Metadata stays in the existing event payload; posting, branch, role and retry
-- checks remain in the existing manufacturing action chain.
CREATE FUNCTION erp_manufacturing_private.note_content_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 note_format text; tags jsonb; attachments jsonb; item jsonb; tag text;
 seen text[]:='{}'; file_id uuid; file_ids uuid[]:='{}'; entity text;
 visible text; occurred timestamptz;
BEGIN
 IF NEW.action<>'note' THEN RETURN NEW; END IF;
 note_format:=CASE WHEN NEW.payload?'format' THEN NEW.payload->>'format' ELSE 'plain' END;
 IF note_format IS NULL OR note_format NOT IN('plain','rich') THEN
  RAISE EXCEPTION 'تنسيق الملاحظة غير صالح' USING ERRCODE='22023';
 END IF;
 IF length(btrim(NEW.note))=0 OR length(NEW.note)>10000 THEN
  RAISE EXCEPTION 'أدخل ملاحظة لا تتجاوز عشرة آلاف حرف' USING ERRCODE='22023';
 END IF;
 IF note_format='rich' THEN
  visible:=regexp_replace(NEW.note,'</?(p|br|b|strong|i|em|u|s|ul|ol|li|blockquote|h2|h3|h4)([[:space:]]*/)?[[:space:]]*>','','gi');
  IF visible~'[<>]' THEN RAISE EXCEPTION 'الملاحظة تقبل تنسيق النص فقط' USING ERRCODE='22023'; END IF;
  visible:=regexp_replace(visible,'&(amp;)?(nbsp|#160|#xA0);','','gi');
  IF length(btrim(visible))=0 THEN RAISE EXCEPTION 'أدخل نص الملاحظة' USING ERRCODE='22023'; END IF;
 END IF;
 tags:=CASE WHEN NEW.payload?'tags' THEN NEW.payload->'tags' ELSE '[]'::jsonb END;
 IF jsonb_typeof(tags) IS DISTINCT FROM 'array' OR jsonb_array_length(tags)>20 THEN
  RAISE EXCEPTION 'اختر عشرين وسمًا كحد أقصى' USING ERRCODE='22023';
 END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(tags) LOOP
  tag:=item#>>'{}';
  IF jsonb_typeof(item)<>'string' OR length(btrim(tag)) NOT BETWEEN 1 AND 80 OR tag<>btrim(tag) OR tag~'[[:cntrl:]]' OR lower(tag)=ANY(seen) THEN
   RAISE EXCEPTION 'الوسوم يجب أن تكون قصيرة ودون تكرار' USING ERRCODE='22023';
  END IF;
  seen:=array_append(seen,lower(tag));
 END LOOP;
 IF NEW.payload?'occurredAt' THEN
  IF jsonb_typeof(NEW.payload->'occurredAt') IS DISTINCT FROM 'string' OR NEW.payload->>'occurredAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$' THEN
   RAISE EXCEPTION 'تاريخ الملاحظة غير صالح' USING ERRCODE='22023';
  END IF;
  occurred:=(NEW.payload->>'occurredAt')::timestamptz;
  IF NOT isfinite(occurred) THEN RAISE EXCEPTION 'تاريخ الملاحظة غير صالح' USING ERRCODE='22023'; END IF;
 END IF;
 attachments:=CASE WHEN NEW.payload?'attachmentIds' THEN NEW.payload->'attachmentIds' ELSE '[]'::jsonb END;
 IF jsonb_typeof(attachments) IS DISTINCT FROM 'array' OR jsonb_array_length(attachments)>20 THEN
  RAISE EXCEPTION 'اختر عشرين مرفقًا كحد أقصى' USING ERRCODE='22023';
 END IF;
 entity:=CASE NEW.kind WHEN 'orders' THEN 'manufacturing_order' WHEN 'plans' THEN 'manufacturing_plan'
  WHEN 'bom' THEN 'manufacturing_bom' WHEN 'workstations' THEN 'manufacturing_workstation'
  WHEN 'routings' THEN 'manufacturing_routing' WHEN 'overheads' THEN 'manufacturing_overhead' END;
 FOR item IN SELECT * FROM jsonb_array_elements(attachments) LOOP
  IF jsonb_typeof(item)<>'string' THEN RAISE EXCEPTION 'المرفق غير صالح' USING ERRCODE='22023'; END IF;
  file_id:=(item#>>'{}')::uuid;
  IF file_id=ANY(file_ids) THEN RAISE EXCEPTION 'المرفق مكرر' USING ERRCODE='22023'; END IF;
  file_ids:=array_append(file_ids,file_id);
  -- Shared row lock makes note creation and file deletion serialize safely.
  PERFORM 1 FROM public.erp_files f WHERE f.id=file_id AND f.cafe_id=NEW.cafe_id
   AND f.entity_type=entity AND f.record_id=NEW.record_id AND f.uploaded FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'المرفق غير متاح لهذا السجل' USING ERRCODE='42501'; END IF;
  -- An upload marker alone is insufficient if object deletion completed before
  -- its separate metadata cleanup request. Read Storage, never alter its rows.
  IF NOT EXISTS(SELECT 1 FROM storage.objects o JOIN public.erp_files f ON f.path=o.name
   WHERE f.id=file_id AND o.bucket_id='erp-record-files') THEN
   RAISE EXCEPTION 'المرفق غير متاح لهذا السجل' USING ERRCODE='42501';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_mfg_note_content_guard BEFORE INSERT OR UPDATE ON public.erp_mfg_events
 FOR EACH ROW EXECUTE FUNCTION erp_manufacturing_private.note_content_guard();

CREATE FUNCTION erp_manufacturing_private.note_file_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.entity_type IN('manufacturing_order','manufacturing_plan','manufacturing_bom','manufacturing_workstation','manufacturing_routing','manufacturing_overhead')
  AND EXISTS(SELECT 1 FROM public.erp_mfg_events e WHERE e.cafe_id=OLD.cafe_id AND e.record_id=OLD.record_id
   AND e.action='note' AND e.payload->'attachmentIds' @> jsonb_build_array(OLD.id::text)) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'المرفق مرتبط بملاحظة محفوظة' USING ERRCODE='23503'; END IF;
  IF (NEW.id,NEW.cafe_id,NEW.entity_type,NEW.record_id,NEW.uploaded,NEW.path,NEW.sha256)
   IS DISTINCT FROM (OLD.id,OLD.cafe_id,OLD.entity_type,OLD.record_id,OLD.uploaded,OLD.path,OLD.sha256) THEN
   RAISE EXCEPTION 'المرفق مرتبط بملاحظة محفوظة' USING ERRCODE='23503';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_mfg_note_file_guard BEFORE DELETE OR UPDATE ON public.erp_files
 FOR EACH ROW EXECUTE FUNCTION erp_manufacturing_private.note_file_guard();

-- Preserve the current function identity (Storage policies depend on its OID)
-- and all prior financial/branch/archive authorization before checking notes.
DO $$DECLARE source text; anchor text:='SELECT * INTO f FROM public.erp_files WHERE path=p_path FOR UPDATE;'; BEGIN
 SELECT pg_get_functiondef('public.erp_file_delete_access(text)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,anchor,'')))/length(anchor)<>1 THEN
  RAISE EXCEPTION 'Review current file deletion authorization before extending notes';
 END IF;
 source:=replace(source,anchor,anchor||'IF f.entity_type IN(''manufacturing_order'',''manufacturing_plan'',''manufacturing_bom'',''manufacturing_workstation'',''manufacturing_routing'',''manufacturing_overhead'') AND EXISTS(SELECT 1 FROM public.erp_mfg_events e WHERE e.cafe_id=f.cafe_id AND e.record_id=f.record_id AND e.action=''note'' AND e.payload->''attachmentIds'' @> jsonb_build_array(f.id::text)) THEN RETURN false;END IF;');
 EXECUTE source;
END $$;
REVOKE ALL ON FUNCTION erp_manufacturing_private.note_content_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_manufacturing_private.note_file_guard() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
