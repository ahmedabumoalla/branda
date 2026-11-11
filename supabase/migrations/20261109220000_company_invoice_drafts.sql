BEGIN;

-- Drafts are editable documents only: never post stock, journals, payments or messages
CREATE TABLE public.bf_invoice_drafts (
  id uuid PRIMARY KEY,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 100000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bf_invoice_drafts_cafe_updated ON public.bf_invoice_drafts(cafe_id, updated_at DESC, id);
ALTER TABLE public.bf_invoice_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_drafts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.brand_finance_save_invoice_draft(p_cafe_id uuid, p_id uuid, p_revision integer, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r text; existing public.bf_invoice_drafts%ROWTYPE; next_revision integer;
BEGIN
  r := brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(r,'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_revision IS NULL OR p_revision < 0 OR p_payload IS NULL
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000
    OR jsonb_typeof(p_payload->'invoice') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_payload#>'{invoice,lines}') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'Invalid draft' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_payload#>'{invoice,lines}') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid lines' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60413));
  SELECT * INTO existing FROM public.bf_invoice_drafts WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF existing.cafe_id<>p_cafe_id THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
    -- Identical retries after an uncertain network response must not create another draft
    IF existing.payload=p_payload THEN RETURN jsonb_build_object('id',p_id,'revision',existing.revision); END IF;
    IF existing.revision<>p_revision THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
    UPDATE public.bf_invoice_drafts SET payload=p_payload,revision=revision+1,updated_by=auth.uid(),updated_at=clock_timestamp()
      WHERE id=p_id RETURNING revision INTO next_revision;
  ELSE
    IF p_revision<>0 THEN RAISE EXCEPTION 'Draft conflict' USING ERRCODE='40001'; END IF;
    IF (SELECT count(*) FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id)>=500 THEN RAISE EXCEPTION 'Draft limit reached'; END IF;
    INSERT INTO public.bf_invoice_drafts(id,cafe_id,payload,created_by,updated_by) VALUES(p_id,p_cafe_id,p_payload,auth.uid(),auth.uid());
    next_revision:=1;
  END IF;
  RETURN jsonb_build_object('id',p_id,'revision',next_revision);
END $$;

CREATE FUNCTION public.brand_finance_invoice_drafts(p_cafe_id uuid, p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r text; result jsonb;
BEGIN
  r := brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(r,'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT jsonb_build_object('id',id,'revision',revision,'payload',payload) INTO result
      FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id AND id=p_id;
    RETURN result;
  END IF;
  SELECT coalesce(jsonb_agg(summary ORDER BY updated_at DESC,id),'[]'::jsonb) INTO result FROM (
    SELECT id,updated_at,jsonb_build_object('id',id,'revision',revision,'updatedAt',updated_at,
      'partyId',payload#>>'{invoice,partyId}','note',left(payload#>>'{invoice,note}',100)) summary
    FROM public.bf_invoice_drafts WHERE cafe_id=p_cafe_id ORDER BY updated_at DESC,id LIMIT 500
  ) rows;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_save_invoice_draft(uuid,uuid,integer,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_drafts(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_save_invoice_draft(uuid,uuid,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_drafts(uuid,uuid) TO authenticated;
COMMIT;
