BEGIN;

-- Read-only, explicit-intent lookups. Original purchase writes and ledger remain authoritative.
CREATE FUNCTION public.aldeem_purchases_lookup(
  p_cafe_id uuid, p_mode text, p_kind text DEFAULT 'invoice', p_query text DEFAULT '',
  p_offset integer DEFAULT 0, p_id uuid DEFAULT NULL, p_ids uuid[] DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  c uuid := p_cafe_id; b uuid; q text := btrim(coalesce(p_query,'')); rows jsonb; result jsonb;
  rec jsonb; doc jsonb; supplier jsonb; selected_ids uuid[] := coalesce(p_ids,'{}');
  finance_id uuid; supplier_id uuid; cfg jsonb; permissions jsonb; brand text;
BEGIN
  IF auth.uid() IS NULL OR brand_finance_private.role_for(c) IS DISTINCT FROM 'owner'
    OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501';
  END IF;
  PERFORM erp_purchase_private.authorize(c);
  PERFORM erp_branch_private.enter(c);
  b := erp_branch_private.current_branch(c);
  IF p_mode IS NULL OR p_mode NOT IN('list','record','defaults','suppliers','items','sources')
    OR p_kind IS NULL OR p_kind NOT IN('request','order','invoice','return') OR length(q)>100
    OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 OR cardinality(selected_ids)>100 THEN
    RAISE EXCEPTION 'Invalid lookup';
  END IF;
  SELECT name INTO brand FROM public.cafes WHERE id=c;
  permissions := jsonb_build_object('canCreate',erp_purchase_private.allowed(c,'create'),
    'canUpdate',erp_purchase_private.allowed(c,'update'),'canApprove',erp_purchase_private.allowed(c,'approve'));

  IF p_mode IN('list','sources') THEN
    WITH candidates AS (
      SELECT r.id,r.kind,r.number,r.number AS display_number,coalesce(r.payload->>'date',r.created_at::date::text) AS date,
        r.created_at,r.status,coalesce(s.name,'') AS supplier_name,
        coalesce((r.payload#>>'{postedTotals,total}')::numeric,0) AS total,r.finance_id,
        CASE WHEN r.status<>'posted' THEN r.payload END AS draft
      FROM public.erp_purchase_documents r
      LEFT JOIN public.bf_parties s ON s.cafe_id=c AND s.id=r.supplier_id
      WHERE p_mode='list' AND p_kind<>'return' AND r.cafe_id=c AND r.kind=p_kind
        AND erp_branch_private.row_allowed(c,b,to_jsonb(r),'')
        AND (q='' OR position(lower(q) IN lower(r.number))>0 OR position(lower(q) IN lower(coalesce(s.name,'')))>0
          OR position(q IN coalesce(s.phone,''))>0)
      UNION ALL
      SELECT d.id,CASE WHEN d.kind='purchase' THEN 'invoice' ELSE 'return' END,d.number::text,d.number::text,
        (d.created_at AT TIME ZONE 'Asia/Riyadh')::date::text,d.created_at,'posted',coalesce(s.name,''),d.total,d.id,NULL::jsonb
      FROM public.bf_documents d LEFT JOIN public.bf_parties s ON s.cafe_id=c AND s.id=d.party_id
      WHERE d.cafe_id=c AND erp_branch_private.row_allowed(c,b,to_jsonb(d),'')
        AND NOT EXISTS(SELECT 1 FROM public.erp_purchase_debits x WHERE x.cafe_id=c AND x.document_id=d.id)
        AND ((d.kind='purchase' AND (p_mode='sources' OR (p_mode='list' AND p_kind='invoice'
          AND NOT EXISTS(SELECT 1 FROM public.erp_purchase_documents r WHERE r.cafe_id=c AND r.finance_id=d.id))))
          OR (p_mode='list' AND p_kind='return' AND d.kind='refund'
          AND EXISTS(SELECT 1 FROM public.bf_documents src WHERE src.cafe_id=c AND src.id=d.reference_id AND src.kind='purchase')))
        AND (q='' OR position(q IN d.number::text)>0 OR position(lower(q) IN lower(coalesce(s.name,'')))>0
          OR position(q IN coalesce(s.phone,''))>0)
        AND (p_mode<>'sources' OR (NOT EXISTS(SELECT 1 FROM public.erp_purchase_receipts r WHERE r.cafe_id=c AND r.source_document_id=d.id AND r.status='pending')
          AND EXISTS(SELECT 1 FROM jsonb_array_elements(brand_finance_private.refund_lines(c,d.id,true)) l
            WHERE (l->>'quantity')::numeric>(l->>'returned_quantity')::numeric)))
    ), page AS (SELECT * FROM candidates ORDER BY created_at DESC,id DESC OFFSET p_offset LIMIT 31)
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',id,'kind',kind,'number',number,
      'date',date,'createdAt',created_at,'status',status,'supplierName',supplier_name,'total',total,'draft',draft))
      ||jsonb_build_object('displayNumber',display_number,'financeId',finance_id) ORDER BY created_at DESC,id DESC),'[]') INTO rows FROM page;
    RETURN jsonb_build_object('items',CASE WHEN jsonb_array_length(rows)>30 THEN rows-30 ELSE rows END,'hasMore',jsonb_array_length(rows)>30);
  END IF;

  IF p_mode='defaults' THEN
    RETURN permissions||jsonb_build_object('brand',brand,'branchScope',erp_branch_private.scope(c),
      'branchContext',public.erp_branch_context(c)||jsonb_build_object('slug','khayal-aldeem'),
      'settings',erp_purchase_private.settings(c),
      'financeSettings',coalesce((SELECT to_jsonb(s)-'cafe_id' FROM public.bf_settings s WHERE cafe_id=c),
        jsonb_build_object('vat_rate',0,'tax_inclusive',true,'currency','SAR','closed_through',NULL)),
      'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'active',w.active) ORDER BY w.is_default DESC,w.name)
        FROM public.bf_warehouses w WHERE w.cafe_id=c AND w.active
          AND erp_inventory_private.warehouse_allowed(c,w.id,'write') AND erp_branch_private.row_allowed(c,b,to_jsonb(w),'')),'[]'),
      'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'code',a.code,'kind',a.kind,'active',a.active,
        'balance',coalesce((SELECT sum(j.debit-j.credit) FROM public.bf_journal j WHERE j.cafe_id=c AND j.account_id=a.id
          AND erp_branch_private.row_allowed(c,b,to_jsonb(j),'')),0)) ORDER BY a.is_primary DESC,a.name)
        FROM public.bf_accounts a WHERE a.cafe_id=c AND a.active AND a.kind IN('cash','bank') AND NOT a.is_group
          AND NOT a.frozen AND a.deleted_at IS NULL AND NOT coalesce(a.is_cashier_drawer,false)
          AND erp_branch_private.row_allowed(c,b,to_jsonb(a),'account')),'[]'),
      'costCenters',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) ORDER BY x.name)
        FROM public.erp_cost_centers x WHERE x.cafe_id=c AND x.active AND NOT x.is_group
          AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'cost_center')),'[]'));
  END IF;

  IF p_mode='suppliers' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'phone',s.phone,'taxNumber',s.tax_number,'active',s.active) ORDER BY s.name,s.id),'[]') INTO result
    FROM (SELECT x.* FROM public.bf_parties x WHERE x.cafe_id=c AND x.kind='supplier'
      AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'supplier')
      AND (CASE WHEN cardinality(selected_ids)>0 THEN x.id=ANY(selected_ids) ELSE x.active AND
        (q='' OR position(lower(q) IN lower(x.name))>0 OR position(q IN coalesce(x.phone,''))>0 OR position(q IN coalesce(x.tax_number,''))>0) END)
      ORDER BY x.name,x.id LIMIT CASE WHEN cardinality(selected_ids)>0 THEN 100 ELSE 30 END) s;
    RETURN result;
  END IF;

  IF p_mode='record' THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'Record required'; END IF;
    PERFORM erp_branch_private.assert_input(c,jsonb_build_object('id',p_id));
    SELECT r.payload||jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'financeId',r.finance_id,
      'createdAt',r.created_at,'total',coalesce((r.payload#>>'{postedTotals,total}')::numeric,0)),r.finance_id,r.supplier_id
      INTO rec,finance_id,supplier_id FROM public.erp_purchase_documents r WHERE r.cafe_id=c AND(r.id=p_id OR r.finance_id=p_id)
        AND r.kind IN('request','order','invoice') AND erp_branch_private.row_allowed(c,b,to_jsonb(r),'');
    IF rec IS NOT NULL THEN PERFORM erp_branch_private.assert_input(c,rec); END IF;
    SELECT to_jsonb(d)-'cafe_id'||brand_finance_private.document_state(c,d.id)||jsonb_build_object(
      'lines',CASE WHEN d.kind='purchase' THEN erp_purchase_private.invoice_lines(c,d.id)
        ELSE coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id'-'document_id') FROM public.bf_document_lines l WHERE l.cafe_id=c AND l.document_id=d.id),'[]') END,
      'reference_number',(SELECT src.number FROM public.bf_documents src WHERE src.cafe_id=c AND src.id=d.reference_id)),d.party_id
      INTO doc,supplier_id FROM public.bf_documents d WHERE d.cafe_id=c AND d.id=coalesce(finance_id,p_id)
      AND (d.kind='purchase' OR (d.kind='refund' AND EXISTS(SELECT 1 FROM public.bf_documents src WHERE src.cafe_id=c AND src.id=d.reference_id AND src.kind='purchase')))
      AND NOT EXISTS(SELECT 1 FROM public.erp_purchase_debits x WHERE x.cafe_id=c AND x.document_id=d.id)
      AND erp_branch_private.row_allowed(c,b,to_jsonb(d),'');
    IF rec IS NULL AND doc IS NULL THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
    IF doc IS NOT NULL THEN PERFORM erp_branch_private.assert_input(c,doc); ELSE supplier_id:=nullif(rec->>'supplierId','')::uuid; END IF;
    SELECT jsonb_build_object('id',s.id,'name',s.name,'phone',s.phone,'taxNumber',s.tax_number,'active',s.active) INTO supplier
      FROM public.bf_parties s WHERE s.cafe_id=c AND s.id=supplier_id AND s.kind='supplier' AND erp_branch_private.row_allowed(c,b,to_jsonb(s),'supplier');
    SELECT coalesce(array_agg(DISTINCT id),'{}') INTO selected_ids FROM (
      SELECT nullif(l->>'itemId','')::uuid id FROM jsonb_array_elements(coalesce(rec->'lines','[]')) l
      UNION SELECT nullif(l->>'item_id','')::uuid FROM jsonb_array_elements(coalesce(doc->'lines','[]')) l
    ) ids WHERE id IS NOT NULL;
  END IF;

  cfg:=erp_purchase_private.settings(c);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'sku',i.sku,'unit',i.unit,'active',i.active,
    'buyPrice',coalesce((m.payload->>'buyPrice')::numeric,0),'buyUnitName',coalesce(nullif(m.payload->>'buyUnitName',''),i.unit),
    'tax1',coalesce((m.payload->>'tax1')::numeric,0),'tax2',coalesce((m.payload->>'tax2')::numeric,0),
    'trackingMode',coalesce(m.tracking_mode,'quantity'),'units',jsonb_build_array(jsonb_build_object('name',i.unit,'factor',1))
      ||coalesce((SELECT cat.payload->'units' FROM public.erp_inventory_catalogs cat WHERE cat.cafe_id=c AND cat.id=m.unit_template_id
        AND erp_branch_private.allowed_resource(c,b,'unit_template',cat.id)),'[]')) ORDER BY i.name,i.id),'[]') INTO rows
  FROM (SELECT x.* FROM public.bf_items x WHERE x.cafe_id=c AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'item')
    AND (CASE WHEN p_mode='record' OR cardinality(selected_ids)>0 THEN x.id=ANY(selected_ids)
      ELSE x.active AND NOT erp_purchase_private.item_blocked(c,x.id,cfg)
        AND (q='' OR position(lower(q) IN lower(x.name))>0 OR position(lower(q) IN lower(coalesce(x.sku,'')))>0 OR position(q IN coalesce(x.barcode,''))>0) END)
    ORDER BY x.name,x.id LIMIT CASE WHEN p_mode='record' OR cardinality(selected_ids)>0 THEN 100 ELSE 30 END) i
  LEFT JOIN public.erp_inventory_items m ON m.cafe_id=c AND m.item_id=i.id;
  IF p_mode='items' THEN RETURN rows; END IF;
  RETURN permissions||jsonb_build_object('record',rec,'document',doc,'supplier',supplier,'items',rows,'branchScope',erp_branch_private.scope(c),'brand',brand,
    'receipt',(SELECT jsonb_build_object('source_document_id',r.source_document_id,'receipt_document_id',r.receipt_document_id,'status',r.status,'revision',r.revision)
      FROM public.erp_purchase_receipts r WHERE r.cafe_id=c AND r.source_document_id=(doc->>'id')::uuid AND doc->>'kind'='purchase'
        AND erp_branch_private.row_allowed(c,b,to_jsonb(r),'')));
END;
$$;

REVOKE ALL ON FUNCTION public.aldeem_purchases_lookup(uuid,text,text,text,integer,uuid,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_purchases_lookup(uuid,text,text,text,integer,uuid,uuid[]) TO authenticated;
COMMIT;
