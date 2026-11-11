BEGIN;
-- Operational metadata never rewrites the immutable tax invoice or reposts stock.
CREATE TABLE public.bf_invoice_management (
  cafe_id uuid NOT NULL, document_id uuid PRIMARY KEY,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=100000),
  FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE TABLE public.bf_invoice_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL, document_id uuid NOT NULL,
  action text NOT NULL CHECK(length(action) BETWEEN 1 AND 200), created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_invoice_activity_document ON public.bf_invoice_activity(cafe_id,document_id,created_at DESC);
CREATE INDEX bf_invoice_activity_actor ON public.bf_invoice_activity(created_by);
ALTER TABLE public.bf_invoice_management ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_invoice_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_invoice_management,public.bf_invoice_activity FROM PUBLIC,anon,authenticated;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_invoice_activity
 FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION brand_finance_private.invoice_detail_document(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (to_jsonb(d)-'cafe_id') || brand_finance_private.document_state(p_cafe_id,d.id)
  || jsonb_build_object('lines',brand_finance_private.refund_lines(p_cafe_id,d.id,true))
 FROM public.bf_documents d WHERE cafe_id=p_cafe_id AND id=p_id
$$;
REVOKE ALL ON FUNCTION brand_finance_private.invoice_detail_document(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_invoice_detail(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source public.bf_documents%ROWTYPE; archived jsonb; meta jsonb;
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id AND kind='sale';
 IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='42501'; END IF;
 SELECT snapshot INTO archived FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=p_id;
 SELECT metadata INTO meta FROM public.bf_invoice_management WHERE cafe_id=p_cafe_id AND document_id=p_id;
 meta:=coalesce(meta,'{}'::jsonb);
 IF NOT(meta ? 'delivery') AND archived->'delivery' IS NOT NULL THEN meta:=meta||jsonb_build_object('delivery',archived->'delivery'); END IF;
 RETURN jsonb_build_object(
 'document',brand_finance_private.invoice_detail_document(p_cafe_id,p_id),
 'customer',(SELECT jsonb_build_object('id',id,'name',name,'phone',phone,'email',email,'tax_number',tax_number,'details',details) FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=source.party_id),
 'warehouse',(SELECT jsonb_build_object('id',id,'name',name) FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=source.warehouse_id),
 'creator',jsonb_build_object('id',source.created_by,'name',coalesce((SELECT nullif(name,'') FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=source.created_by),(SELECT nullif(full_name,'') FROM public.profiles WHERE id=source.created_by),'مستخدم غير مسمى')),
 'invoice',archived,'metadata',meta,
 'related',coalesce((SELECT jsonb_agg(brand_finance_private.invoice_detail_document(p_cafe_id,d.id) ORDER BY d.created_at,d.id) FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.reference_id=p_id),'[]'::jsonb),
 'movements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',i.name,'warehouse',w.name,'quantity',m.quantity,'unit_cost',m.unit_cost,'created_at',m.created_at) ORDER BY m.created_at,m.id) FROM public.bf_movements m JOIN public.bf_items i ON i.cafe_id=m.cafe_id AND i.id=m.item_id JOIN public.bf_warehouses w ON w.cafe_id=m.cafe_id AND w.id=m.warehouse_id WHERE m.cafe_id=p_cafe_id AND m.document_id=p_id),'[]'::jsonb),
 'journal',coalesce((SELECT jsonb_agg(jsonb_build_object('id',j.id,'account',a.name,'debit',j.debit,'credit',j.credit,'memo',j.memo) ORDER BY j.created_at,j.id) FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.document_id=p_id),'[]'::jsonb),
 'activity',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'created_at',a.created_at,'actor',coalesce(nullif(s.name,''),nullif(p.full_name,''),'مستخدم غير مسمى'),'documentId',a.document_id) ORDER BY a.created_at DESC,a.id) FROM (
  SELECT id,action,created_at,created_by,document_id FROM public.bf_invoice_activity WHERE cafe_id=p_cafe_id AND document_id=p_id
  UNION ALL SELECT id,CASE kind WHEN 'sale' THEN 'إنشاء الفاتورة' WHEN 'settlement' THEN 'تسجيل دفعة' WHEN 'refund' THEN 'تسجيل مرتجع' ELSE 'تسجيل مستند مرتبط' END,created_at,created_by,id FROM public.bf_documents WHERE cafe_id=p_cafe_id AND (id=p_id OR reference_id=p_id)
 ) a LEFT JOIN public.bf_staff s ON s.cafe_id=p_cafe_id AND s.user_id=a.created_by LEFT JOIN public.profiles p ON p.id=a.created_by),'[]'::jsonb));
END $$;

CREATE FUNCTION public.brand_finance_invoice_management(p_cafe_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; action text:=p_input->>'action'; target uuid; d public.bf_documents%ROWTYPE;
 old_meta jsonb; new_meta jsonb; customer jsonb; value jsonb; changed integer:=0; skipped integer:=0; ids uuid[]; current_delivery boolean;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(r,'') NOT IN ('owner','manager','accountant') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text)>100000 OR action IS NULL OR action NOT IN ('sync','delivery','schedule') OR jsonb_typeof(p_input->'ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid input' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_input->'ids') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid count' USING ERRCODE='22023'; END IF;
 SELECT array_agg(DISTINCT x::uuid ORDER BY x::uuid) INTO ids FROM jsonb_array_elements_text(p_input->'ids') x;
 IF action<>'sync' AND cardinality(ids)<>1 THEN RAISE EXCEPTION 'Invalid count' USING ERRCODE='22023'; END IF;
 FOREACH target IN ARRAY ids LOOP
  SELECT * INTO d FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=target AND kind='sale' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  SELECT metadata INTO old_meta FROM public.bf_invoice_management WHERE cafe_id=p_cafe_id AND document_id=target;
  old_meta:=coalesce(old_meta,'{}'::jsonb); new_meta:=old_meta;
  IF action='sync' THEN
   -- Tax snapshots remain as issued; this refreshes the linked operational customer card.
   SELECT jsonb_build_object('name',name,'phone',phone,'tax_number',tax_number,'details',details) INTO customer FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=d.party_id AND kind='customer';
   IF customer IS NULL THEN skipped:=skipped+1; CONTINUE; END IF;
   new_meta:=jsonb_set(old_meta,'{customer}',customer);
  ELSIF action='delivery' THEN
   IF jsonb_typeof(p_input->'confirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid delivery' USING ERRCODE='22023'; END IF;
   current_delivery:=coalesce((old_meta#>>'{delivery,confirmed}')::boolean,(SELECT (snapshot#>>'{delivery,confirmed}')::boolean FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND document_id=target),false);
   IF current_delivery=(p_input->>'confirmed')::boolean THEN CONTINUE; END IF;
   new_meta:=jsonb_set(old_meta,'{delivery}',jsonb_build_object('confirmed',(p_input->>'confirmed')::boolean,'date',clock_timestamp()));
  ELSE
   value:=p_input->'schedule';
   IF value IS NULL THEN RAISE EXCEPTION 'Invalid schedule' USING ERRCODE='22023'; END IF;
   IF value<>'null'::jsonb THEN
    IF d.party_id IS NULL OR jsonb_typeof(value) IS DISTINCT FROM 'object' OR jsonb_typeof(value->'amount') IS DISTINCT FROM 'number'
     OR (value->>'amount')::numeric<0.01 OR (value->>'amount')::numeric>d.total OR (value->>'amount')::numeric<>round((value->>'amount')::numeric,2) OR ceil(d.total/(value->>'amount')::numeric)>600
     OR coalesce(value->>'frequency','') NOT IN ('weekly','fortnightly','monthly','quarterly','half_yearly','yearly')
     OR coalesce(value->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' OR jsonb_typeof(value->'note') IS DISTINCT FROM 'string' OR length(coalesce(value->>'note',''))>500 THEN RAISE EXCEPTION 'Invalid schedule' USING ERRCODE='22023'; END IF;
    PERFORM (value->>'start')::date;
   END IF;
   new_meta:=jsonb_set(old_meta,'{schedule}',value);
  END IF;
  IF new_meta IS DISTINCT FROM old_meta THEN
   INSERT INTO public.bf_invoice_management(cafe_id,document_id,metadata) VALUES(p_cafe_id,target,new_meta) ON CONFLICT(document_id) DO UPDATE SET metadata=excluded.metadata;
   INSERT INTO public.bf_invoice_activity(cafe_id,document_id,action,created_by) VALUES(p_cafe_id,target,CASE action WHEN 'sync' THEN 'مزامنة بيانات العميل' WHEN 'delivery' THEN CASE WHEN (p_input->>'confirmed')::boolean THEN 'تأكيد التسليم' ELSE 'إلغاء التسليم' END ELSE CASE WHEN value='null'::jsonb THEN 'حذف اتفاقية التقسيط' ELSE 'حفظ اتفاقية التقسيط' END END,auth.uid());
   changed:=changed+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('changed',changed,'skipped',skipped);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_invoice_detail(uuid,uuid),public.brand_finance_invoice_management(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_invoice_detail(uuid,uuid),public.brand_finance_invoice_management(uuid,jsonb) TO authenticated;
COMMIT;
