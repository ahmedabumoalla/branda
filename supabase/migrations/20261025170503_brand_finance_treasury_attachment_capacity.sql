BEGIN;

-- Attachment count and size are not product quotas; retain tenant authorization,
-- positive byte counts, exact upload verification and private Storage access.
-- Remove the bucket-specific file_size_limit through Storage API at deployment.
ALTER TABLE public.bf_treasury_attachments DROP CONSTRAINT bf_treasury_attachments_size_bytes_check;
ALTER TABLE public.bf_treasury_attachments ADD CONSTRAINT bf_treasury_attachments_size_bytes_check CHECK(size_bytes > 0);

CREATE OR REPLACE FUNCTION public.brand_finance_treasury_attachment(
 p_cafe_id uuid, p_document_id uuid, p_action text DEFAULT 'list',
 p_id uuid DEFAULT NULL, p_name text DEFAULT NULL, p_size bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.bf_treasury_attachments; obj jsonb; result jsonb; r text;
BEGIN
 r := brand_finance_private.role_for(p_cafe_id);
 IF r NOT IN ('owner','manager') THEN RAISE EXCEPTION 'Treasury management required' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_document_id
   AND kind IN ('receipt','expense','transfer','opening','journal'))
 THEN RAISE EXCEPTION 'Treasury document unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='list' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at),'[]'::jsonb) INTO result
   FROM public.bf_treasury_attachments t WHERE cafe_id=p_cafe_id AND document_id=p_document_id AND uploaded;
   RETURN result;
 END IF;
 IF p_action='stale' THEN
   WITH expired AS (
     UPDATE public.bf_treasury_attachments SET abandoned=true
     WHERE cafe_id=p_cafe_id AND document_id=p_document_id AND NOT uploaded AND expires_at<now()
     RETURNING *
   ) SELECT coalesce(jsonb_agg(to_jsonb(expired)),'[]'::jsonb) INTO result FROM expired;
   RETURN result;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_document_id::text,78021));
 SELECT * INTO a FROM public.bf_treasury_attachments WHERE id=p_id FOR UPDATE;
 IF a.id IS NOT NULL AND (a.cafe_id<>p_cafe_id OR a.document_id<>p_document_id)
 THEN RAISE EXCEPTION 'Attachment unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='prepare' THEN
   IF p_id IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 180
      OR p_name ~ '[[:cntrl:]/\\]' OR p_size IS NULL OR p_size < 1
   THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
   IF a.id IS NOT NULL THEN
     IF a.abandoned OR a.uploader_id<>auth.uid() OR a.original_name<>trim(p_name) OR a.size_bytes<>p_size
     THEN RAISE EXCEPTION 'Attachment request mismatch' USING ERRCODE='42501'; END IF;
     IF NOT a.uploaded THEN UPDATE public.bf_treasury_attachments SET expires_at=now()+interval '3 hours' WHERE id=a.id RETURNING * INTO a; END IF;
     RETURN to_jsonb(a);
   END IF;
   INSERT INTO public.bf_treasury_attachments(id,cafe_id,document_id,uploader_id,storage_path,original_name,size_bytes)
   VALUES(p_id,p_cafe_id,p_document_id,auth.uid(),p_cafe_id::text||'/'||p_document_id::text||'/'||p_id::text,trim(p_name),p_size)
   RETURNING * INTO a;
   RETURN to_jsonb(a);
 END IF;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Attachment unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='get' AND a.uploaded THEN RETURN to_jsonb(a); END IF;
 IF p_action='finalize' THEN
   IF a.abandoned OR a.uploader_id<>auth.uid() THEN RAISE EXCEPTION 'Own attachment required' USING ERRCODE='42501'; END IF;
   IF a.uploaded THEN RETURN to_jsonb(a); END IF;
   SELECT metadata INTO obj FROM storage.objects WHERE bucket_id='branda-finance-treasury-files' AND name=a.storage_path;
   IF obj IS NULL OR (obj->>'size')::bigint IS DISTINCT FROM a.size_bytes
   THEN RAISE EXCEPTION 'Uploaded object size mismatch'; END IF;
   UPDATE public.bf_treasury_attachments SET uploaded=true WHERE id=a.id RETURNING * INTO a;
   RETURN to_jsonb(a);
 END IF;
 IF p_action='purge' AND a.abandoned AND NOT a.uploaded AND a.expires_at<now() THEN
   -- Storage API must delete bytes first; never remove metadata-only storage rows
   IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='branda-finance-treasury-files' AND name=a.storage_path)
   THEN RAISE EXCEPTION 'Storage object still exists'; END IF;
   DELETE FROM public.bf_treasury_attachments WHERE id=a.id;
   RETURN jsonb_build_object('purged',true);
 END IF;
 RAISE EXCEPTION 'Attachment action denied' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_treasury_attachment(uuid,uuid,text,uuid,text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_treasury_attachment(uuid,uuid,text,uuid,text,bigint) TO authenticated;
COMMIT;
