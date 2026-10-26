BEGIN;

-- Objects live in a PRIVATE Storage API-created bucket: branda-finance-shift-files
-- No client Storage policy: only scoped signed uploads and authenticated downloads
CREATE TABLE public.bf_shift_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 shift_id uuid NOT NULL,
 uploader_id uuid NOT NULL REFERENCES auth.users(id),
 storage_path text NOT NULL UNIQUE,
 original_name text NOT NULL CHECK(length(original_name) BETWEEN 1 AND 255),
 content_type text NOT NULL CHECK(length(content_type) BETWEEN 1 AND 255),
 size_bytes bigint NOT NULL CHECK(size_bytes > 0),
 uploaded boolean NOT NULL DEFAULT false,
 document_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,shift_id) REFERENCES public.bf_shifts(cafe_id,id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_shift_attachments_shift ON public.bf_shift_attachments(cafe_id,shift_id);
CREATE INDEX bf_shift_attachments_document ON public.bf_shift_attachments(cafe_id,document_id) WHERE document_id IS NOT NULL;
ALTER TABLE public.bf_shift_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_shift_attachments FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_prepare_shift_attachment(p_cafe_id uuid,p_shift_id uuid,p_name text,p_mime text,p_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.bf_shift_attachments; aid uuid:=gen_random_uuid();
BEGIN
 PERFORM brand_finance_private.role_for(p_cafe_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 IF NOT EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id AND user_id=auth.uid() AND status='open')
 THEN RAISE EXCEPTION 'Own open shift required' USING ERRCODE='42501'; END IF;
 IF p_size IS NULL OR p_size<=0 OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 255
 OR p_mime IS NULL OR length(p_mime) NOT BETWEEN 1 AND 255 THEN RAISE EXCEPTION 'Invalid attachment'; END IF;
 INSERT INTO public.bf_shift_attachments(id,cafe_id,shift_id,uploader_id,storage_path,original_name,content_type,size_bytes)
 VALUES(aid,p_cafe_id,p_shift_id,auth.uid(),p_cafe_id::text||'/'||p_shift_id::text||'/'||aid::text,trim(p_name),p_mime,p_size) RETURNING * INTO a;
 RETURN to_jsonb(a);
END $$;

CREATE FUNCTION public.brand_finance_shift_attachment(p_cafe_id uuid,p_attachment_id uuid,p_finalize boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.bf_shift_attachments; r text; s public.bf_shifts; m jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF p_finalize THEN PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412)); END IF;
 SELECT * INTO a FROM public.bf_shift_attachments WHERE cafe_id=p_cafe_id AND id=p_attachment_id FOR UPDATE;
 IF a.id IS NULL THEN RAISE EXCEPTION 'Attachment unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=a.shift_id;
 IF a.document_id IS NULL AND (a.uploader_id<>auth.uid() OR s.user_id<>auth.uid() OR s.status<>'open')
 OR a.document_id IS NOT NULL AND r='cashier' AND s.user_id<>auth.uid()
 THEN RAISE EXCEPTION 'Attachment access denied' USING ERRCODE='42501'; END IF;
 IF p_finalize THEN
   IF a.document_id IS NOT NULL OR a.uploader_id<>auth.uid() OR s.user_id<>auth.uid() OR s.status<>'open'
   THEN RAISE EXCEPTION 'Own draft attachment required' USING ERRCODE='42501'; END IF;
   -- Metadata is maintained by the Storage service, never accepted from clients
   SELECT metadata INTO m FROM storage.objects WHERE bucket_id='branda-finance-shift-files' AND name=a.storage_path;
   IF m IS NULL OR (m->>'size')::bigint IS DISTINCT FROM a.size_bytes
   THEN RAISE EXCEPTION 'Uploaded object size mismatch'; END IF;
   UPDATE public.bf_shift_attachments SET uploaded=true WHERE id=a.id RETURNING * INTO a;
 END IF;
 RETURN to_jsonb(a);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_prepare_shift_attachment(uuid,uuid,text,text,bigint) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.brand_finance_shift_attachment(uuid,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_prepare_shift_attachment(uuid,uuid,text,text,bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_shift_attachment(uuid,uuid,boolean) TO authenticated;
COMMIT;
