BEGIN;

ALTER TABLE public.bf_parties ADD COLUMN details jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 16000);

-- Uses the same tenant authorization, transaction lock and idempotency record as party edits.
CREATE FUNCTION public.brand_finance_save_customer(p_cafe_id uuid,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; r text; detail jsonb; field record; customer_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  r := brand_finance_private.role_for(p_cafe_id);
  IF r NOT IN ('owner','manager') THEN RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501'; END IF;
  IF p_payload->>'kind' IS DISTINCT FROM 'customer' THEN RAISE EXCEPTION 'Customer required'; END IF;
  detail := coalesce(p_payload->'details','{}'::jsonb);
  IF jsonb_typeof(detail) <> 'object' OR octet_length(detail::text) > 16000 THEN RAISE EXCEPTION 'Invalid customer details'; END IF;
  FOR field IN SELECT key,value FROM jsonb_each(detail) LOOP
    IF field.key NOT IN ('legalName','taxRegistration','country','region','city','district','street','buildingNumber','additionalNumber','postalCode','unitNumber','shortAddress','addressNotes','governmentIdType','governmentId','commercialRegistration','unifiedNumber','contactName','notes')
      OR jsonb_typeof(field.value) <> 'string' OR length(field.value #>> '{}') > (CASE WHEN field.key IN ('notes','addressNotes') THEN 2000 ELSE 250 END)
    THEN RAISE EXCEPTION 'Invalid customer detail field'; END IF;
  END LOOP;
  customer_id := nullif(p_payload->>'id','')::uuid;
  IF EXISTS (SELECT 1 FROM public.bf_parties WHERE id=customer_id AND (cafe_id<>p_cafe_id OR kind<>'customer')) THEN RAISE EXCEPTION 'Invalid customer' USING ERRCODE='42501'; END IF;
  result := public.brand_finance_execute(p_cafe_id,'party',p_payload,p_request_id);
  -- A replay must not overwrite details changed by a later successful request.
  IF coalesce((result->>'duplicate')::boolean,false) THEN RETURN result; END IF;
  UPDATE public.bf_parties SET details=detail WHERE id=(result->>'id')::uuid AND cafe_id=p_cafe_id AND kind='customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer not saved'; END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_save_customer(uuid,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_save_customer(uuid,jsonb,uuid) TO authenticated;


-- Government/address details are available only to financial management.
CREATE OR REPLACE FUNCTION public.brand_finance_snapshot(p_cafe_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; managed boolean; answer jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 r:=brand_finance_private.role_for(p_cafe_id); managed:=r IN('owner','manager');
 PERFORM brand_finance_private.seed(p_cafe_id);
 SELECT jsonb_build_object(
  'cafe',(SELECT jsonb_build_object('id',id,'name',name,'slug',slug) FROM public.cafes WHERE id=p_cafe_id),
  'userId',auth.uid(),'role',r,'canManage',managed,'canAdminister',r='owner',
  'settings',(SELECT to_jsonb(s)-'cafe_id' FROM public.bf_settings s WHERE cafe_id=p_cafe_id),
  'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id'||jsonb_build_object('balance',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=a.id),0) ELSE 0 END) ORDER BY a.code) FROM public.bf_accounts a WHERE cafe_id=p_cafe_id AND (managed OR kind IN('cash','bank','pos'))),'[]'::jsonb),
  'parties',coalesce((SELECT jsonb_agg((to_jsonb(p)-'cafe_id'-CASE WHEN managed THEN '__internal_none__' ELSE 'details' END)||jsonb_build_object('balance',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN p.kind='supplier' THEN j.credit-j.debit ELSE j.debit-j.credit END) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.party_id=p.id AND a.kind=CASE p.kind WHEN 'customer' THEN 'receivable' WHEN 'supplier' THEN 'payable' ELSE 'employee' END),0) ELSE 0 END) ORDER BY p.name) FROM public.bf_parties p WHERE cafe_id=p_cafe_id AND (managed OR kind='customer')),'[]'::jsonb),
  'warehouses',coalesce((SELECT jsonb_agg(to_jsonb(w)-'cafe_id' ORDER BY w.name) FROM public.bf_warehouses w WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',p.price,'imageUrl',p.image_url,'imageStoragePath',p.image_storage_path,'category',coalesce(c.name,''),'available',p.available,'stockTracked',i.id IS NOT NULL,'itemId',i.id,'quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0)) ORDER BY p.sort_order,p.name) FROM public.menu_products p LEFT JOIN public.menu_categories c ON c.id=p.category_id AND c.cafe_id=p_cafe_id LEFT JOIN public.bf_items i ON i.menu_product_id=p.id AND i.cafe_id=p_cafe_id AND i.active WHERE p.cafe_id=p_cafe_id AND p.deleted_at IS NULL),'[]'::jsonb),
  'items',coalesce((SELECT jsonb_agg(to_jsonb(i)-'cafe_id'||jsonb_build_object('quantity',coalesce((SELECT sum(quantity) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0),'average_cost',CASE WHEN managed THEN coalesce((SELECT sum(quantity*average_cost)/nullif(sum(quantity),0) FROM public.bf_stock WHERE cafe_id=p_cafe_id AND item_id=i.id),0) ELSE 0 END) ORDER BY i.name) FROM public.bf_items i WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'stock',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'-'value'||CASE WHEN managed THEN '{}'::jsonb ELSE '{"average_cost":0}'::jsonb END) FROM public.bf_stock s WHERE cafe_id=p_cafe_id),'[]'::jsonb),
  'documents',coalesce((SELECT jsonb_agg(to_jsonb(d)-'cafe_id'-'created_by'||jsonb_build_object('outstanding',CASE WHEN EXISTS(SELECT 1 FROM public.bf_documents ref WHERE ref.reference_id=d.id AND ref.kind='refund') THEN 0 ELSE greatest(d.total-d.paid-coalesce((SELECT sum(settle.total) FROM public.bf_documents settle WHERE settle.reference_id=d.id AND settle.kind='settlement'),0),0) END,'refunded',EXISTS(SELECT 1 FROM public.bf_documents f WHERE f.cafe_id=p_cafe_id AND f.reference_id=d.id AND f.kind='refund'),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id'-'document_id'||CASE WHEN managed THEN '{}'::jsonb ELSE '{"cost":0}'::jsonb END) FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe_id AND l.document_id=d.id),'[]'::jsonb)) ORDER BY d.created_at DESC,d.id) FROM (SELECT * FROM public.bf_documents WHERE cafe_id=p_cafe_id AND (managed OR (created_by=auth.uid() AND kind='sale')) ORDER BY created_at DESC,id LIMIT 500) d),'[]'::jsonb),
  'shifts',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id'||jsonb_build_object('expected_cash',CASE WHEN s.status='closed' THEN s.expected_cash ELSE coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.account_id=s.account_id),0) END) ORDER BY opened_at DESC) FROM (SELECT * FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND (managed OR user_id=auth.uid() OR handover_to=auth.uid()) ORDER BY opened_at DESC LIMIT 200) s),'[]'::jsonb),
  'staff',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id') FROM public.bf_staff s WHERE cafe_id=p_cafe_id AND (managed OR active)),'[]'::jsonb)||jsonb_build_array((SELECT jsonb_build_object('user_id',owner_user_id,'name','مالك العلامة','role','manager','active',true) FROM public.cafes WHERE id=p_cafe_id)),
  'journal',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(to_jsonb(j)-'cafe_id'-'party_id' ORDER BY j.created_at DESC,j.id) FROM (SELECT * FROM public.bf_journal WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 2000) j),'[]'::jsonb) ELSE '[]'::jsonb END,
  'movements',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(to_jsonb(m)-'cafe_id' ORDER BY m.created_at DESC,m.id) FROM (SELECT * FROM public.bf_movements WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id LIMIT 1000) m),'[]'::jsonb) ELSE '[]'::jsonb END,
  'trialBalance',CASE WHEN managed THEN coalesce((SELECT jsonb_agg(jsonb_build_object('account_id',a.id,'name',a.name,'kind',a.kind,'debit',coalesce(j.debit,0),'credit',coalesce(j.credit,0),'balance',coalesce(j.debit-j.credit,0)) ORDER BY a.code) FROM public.bf_accounts a LEFT JOIN(SELECT account_id,sum(debit) debit,sum(credit) credit FROM public.bf_journal WHERE cafe_id=p_cafe_id GROUP BY account_id) j ON j.account_id=a.id WHERE a.cafe_id=p_cafe_id),'[]'::jsonb) ELSE '[]'::jsonb END,
  'summary',jsonb_build_object('sales',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='revenue'),0) ELSE 0 END,'purchases',CASE WHEN managed THEN coalesce((SELECT sum(CASE WHEN d.kind='purchase' THEN d.total ELSE -d.total END) FROM public.bf_documents d LEFT JOIN public.bf_documents orig ON orig.id=d.reference_id WHERE d.cafe_id=p_cafe_id AND (d.kind='purchase' OR (d.kind='refund' AND orig.kind='purchase'))),0) ELSE 0 END,'expenses',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='expense'),0) ELSE 0 END,'profit',0,'receivables',CASE WHEN managed THEN coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='receivable'),0) ELSE 0 END,'payables',CASE WHEN managed THEN coalesce((SELECT sum(j.credit-j.debit) FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND a.kind='payable'),0) ELSE 0 END,'inventoryValue',CASE WHEN managed THEN coalesce((SELECT sum(value) FROM public.bf_stock WHERE cafe_id=p_cafe_id),0) ELSE 0 END),
  'truncated',(SELECT count(*)>500 FROM public.bf_documents WHERE cafe_id=p_cafe_id) OR (SELECT count(*)>2000 FROM public.bf_journal WHERE cafe_id=p_cafe_id)
 ) INTO answer;
 answer:=jsonb_set(answer,'{summary,profit}',to_jsonb((answer#>>'{summary,sales}')::numeric-(answer#>>'{summary,expenses}')::numeric));
 RETURN answer;
END $$;
COMMIT;
