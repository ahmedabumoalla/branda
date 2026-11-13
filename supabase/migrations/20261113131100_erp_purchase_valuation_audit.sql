BEGIN;
-- Preserve the warehouse distribution at the time of every purchase cost change
CREATE TABLE public.erp_purchase_value_changes(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL,source_document_id uuid NOT NULL,line_id uuid NOT NULL,item_id uuid,
 amount numeric(18,2) NOT NULL,distribution jsonb NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(cafe_id,document_id,line_id),
 FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,source_document_id) REFERENCES public.bf_documents(cafe_id,id),
 CHECK(jsonb_typeof(distribution)='object')
);
CREATE INDEX erp_purchase_value_changes_item ON public.erp_purchase_value_changes(cafe_id,item_id,created_at);
ALTER TABLE public.erp_purchase_value_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_purchase_value_changes FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_purchase_value_changes FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
ALTER FUNCTION erp_purchase_private.value_change(uuid,uuid,uuid,uuid,numeric) RENAME TO value_change_before_audit;
CREATE FUNCTION erp_purchase_private.value_change(c uuid,doc uuid,invoice uuid,line uuid,amount numeric) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$DECLARE result jsonb;BEGIN
 result:=erp_purchase_private.value_change_before_audit(c,doc,invoice,line,amount);
 INSERT INTO public.erp_purchase_value_changes(cafe_id,document_id,source_document_id,line_id,item_id,amount,distribution,actor)
 SELECT c,doc,invoice,line,item_id,amount,result,auth.uid() FROM public.bf_document_lines WHERE cafe_id=c AND document_id=invoice AND id=line;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_purchase_private.value_change(uuid,uuid,uuid,uuid,numeric),erp_purchase_private.value_change_before_audit(uuid,uuid,uuid,uuid,numeric) FROM PUBLIC,anon,authenticated,service_role;
-- Existing allocation payloads retain exact warehouse shares and can be recovered
-- Debit notes predating this audit cannot be reconstructed and stay unknown
INSERT INTO public.erp_purchase_value_changes(cafe_id,document_id,source_document_id,line_id,item_id,amount,distribution,actor,created_at)
SELECT a.cafe_id,a.posting_document_id,a.source_document_id,(x->>'lineId')::uuid,l.item_id,(x->>'amount')::numeric,x,d.created_by,a.created_at
FROM public.erp_purchase_allocations a JOIN public.bf_documents d ON d.cafe_id=a.cafe_id AND d.id=a.posting_document_id
CROSS JOIN LATERAL jsonb_array_elements(a.payload->'lines') x
JOIN public.bf_document_lines l ON l.cafe_id=a.cafe_id AND l.document_id=a.source_document_id AND l.id=(x->>'lineId')::uuid
WHERE a.posting_document_id IS NOT NULL;
COMMIT;
