BEGIN;
-- Enterprise tracking reads: the path of one stock item, the trail of every riyal through the treasuries, and a
-- live view of each branch. Read only. Each read answers from the original stock movements, journal lines,
-- documents and shifts, so it can never disagree with the ledger. Enabled per brand in erp_enterprise_settings.
CREATE FUNCTION erp_enterprise_private.document_label(k text,origin text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE k WHEN 'sale' THEN 'فاتورة مبيعات' WHEN 'purchase' THEN 'فاتورة مشتريات' WHEN 'expense' THEN 'مصروف' WHEN 'opening' THEN 'رصيد افتتاحي' WHEN 'journal' THEN 'قيد يومية' WHEN 'shift_variance' THEN 'فرق وردية'
  WHEN 'refund' THEN CASE WHEN origin='purchase' THEN 'مرتجع مشتريات' ELSE 'مرتجع مبيعات' END
  WHEN 'settlement' THEN CASE WHEN origin='purchase' THEN 'دفعة لمورد' ELSE 'تحصيل من عميل' END
  WHEN 'treasury' THEN 'حركة خزينة' WHEN 'transfer' THEN 'تحويل' WHEN 'stock_adjust' THEN 'تسوية مخزون' WHEN 'stock_transfer' THEN 'تحويل مخزني' ELSE 'مستند مالي' END
$$;
CREATE FUNCTION erp_enterprise_private.actor_name(c uuid,u uuid) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT name FROM public.bf_staff WHERE cafe_id=c AND user_id=u),(SELECT nullif(btrim(first_name||' '||last_name),'') FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=u),
  (SELECT CASE WHEN EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND owner_user_id=u) THEN 'مالك الحساب' END),(SELECT full_name FROM public.profiles WHERE id=u),'')
$$;

CREATE FUNCTION public.erp_trace_item(p_cafe uuid,p_query text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;q text:=btrim(translate(coalesce(p_query,''),'٠١٢٣٤٥٦٧٨٩','0123456789'));pattern text;matches jsonb;item public.bf_items;
BEGIN
 r:=erp_enterprise_private.role_for(c);b:=erp_enterprise_private.branch_for(c,r);
 IF length(q) NOT BETWEEN 1 AND 100 THEN RETURN jsonb_build_object('matches','[]'::jsonb,'item',NULL);END IF;
 pattern:='%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%';
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO matches FROM(
  SELECT i.id,i.name,coalesce(i.barcode,i.sku) code FROM public.bf_items i WHERE i.cafe_id=c AND (i.id::text=q OR i.barcode=q OR i.sku=q OR i.name ILIKE pattern)
  ORDER BY (i.barcode=q OR i.sku=q OR i.id::text=q) DESC,i.active DESC,i.name LIMIT 12) x;
 IF jsonb_array_length(matches)=0 THEN RETURN jsonb_build_object('matches',matches,'item',NULL);END IF;
 SELECT * INTO item FROM public.bf_items WHERE cafe_id=c AND id=(matches->0->>'id')::uuid;
 IF jsonb_array_length(matches)>1 AND NOT(item.barcode=q OR item.sku=q OR item.id::text=q OR lower(item.name)=lower(q)) THEN RETURN jsonb_build_object('matches',matches,'item',NULL);END IF;
 RETURN jsonb_build_object('matches',matches,
  'item',(SELECT jsonb_build_object('id',item.id,'name',item.name,'barcode',item.barcode,'sku',item.sku,'unit',item.unit,'active',item.active,'minQuantity',item.min_quantity,
    'flavor',coalesce(e.payload->>'flavor',''),'seller',coalesce(e.payload->>'seller',''),'sellerKind',coalesce(e.payload->>'sellerKind',''),'trackingMode',coalesce(e.tracking_mode,'quantity'),
    'buyPrice',coalesce((e.payload->>'buyPrice')::numeric,0),'salePrice',coalesce((e.payload->>'salePrice')::numeric,0),
    'category',(SELECT name FROM public.erp_inventory_catalogs WHERE cafe_id=c AND id=e.category_id),'brand',(SELECT name FROM public.erp_inventory_catalogs WHERE cafe_id=c AND id=e.brand_id),
    'family',(SELECT p.name FROM public.erp_family_items fi JOIN public.erp_families f ON f.cafe_id=fi.cafe_id AND f.id=fi.family_id JOIN public.bf_parties p ON p.cafe_id=f.cafe_id AND p.id=f.supplier_id WHERE fi.cafe_id=c AND fi.item_id=item.id),
    'soldAs',coalesce((SELECT jsonb_agg(jsonb_build_object('name',mp.name,'price',mp.price,'quantity',l.quantity)) FROM(SELECT product_id,quantity FROM public.bf_item_product_links WHERE cafe_id=c AND item_id=item.id UNION SELECT item.menu_product_id,1 WHERE item.menu_product_id IS NOT NULL) l JOIN public.menu_products mp ON mp.id=l.product_id AND mp.deleted_at IS NULL),'[]'::jsonb))
   FROM (SELECT 1) one LEFT JOIN public.erp_inventory_items e ON e.cafe_id=c AND e.item_id=item.id),
  'stock',coalesce((SELECT jsonb_agg(jsonb_build_object('warehouseId',s.warehouse_id,'warehouse',w.name,'branchId',erp_enterprise_private.warehouse_branch(c,w.id),'quantity',s.quantity,'averageCost',s.average_cost) ORDER BY w.name)
    FROM public.bf_stock s JOIN public.bf_warehouses w ON w.cafe_id=s.cafe_id AND w.id=s.warehouse_id WHERE s.cafe_id=c AND s.item_id=item.id AND s.quantity<>0 AND (b IS NULL OR erp_enterprise_private.warehouse_branch(c,w.id)=b)),'[]'::jsonb),
  'lots',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'lot',l.lot,'serial',l.serial,'expiresOn',l.expires_on,'quantity',coalesce((SELECT sum(ls.quantity) FROM public.erp_inventory_lot_stock ls WHERE ls.cafe_id=c AND ls.lot_id=l.id),0)) ORDER BY l.expires_on NULLS LAST,l.created_at)
    FROM public.erp_inventory_lots l WHERE l.cafe_id=c AND l.item_id=item.id),'[]'::jsonb),
  'totals',(SELECT jsonb_build_object(
    'purchased',coalesce(sum(m.quantity) FILTER(WHERE d.kind='purchase'),0),'returnedToSupplier',coalesce(-sum(m.quantity) FILTER(WHERE d.kind='refund' AND o.kind='purchase'),0),
    'sold',coalesce(-sum(m.quantity) FILTER(WHERE d.kind='sale'),0),'returnedByCustomers',coalesce(sum(m.quantity) FILTER(WHERE d.kind='refund' AND o.kind='sale'),0),
    'otherIn',coalesce(sum(m.quantity) FILTER(WHERE m.quantity>0 AND d.kind NOT IN('purchase','refund')),0),'otherOut',coalesce(-sum(m.quantity) FILTER(WHERE m.quantity<0 AND d.kind NOT IN('sale','refund')),0))
   FROM public.bf_movements m JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id LEFT JOIN public.bf_documents o ON o.cafe_id=d.cafe_id AND o.id=d.reference_id WHERE m.cafe_id=c AND m.item_id=item.id),
  'movements',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.at DESC) FROM(
    SELECT m.id,m.created_at at,m.quantity,m.unit_cost "unitCost",w.name warehouse,coalesce(bd.branch_id,erp_enterprise_private.warehouse_branch(c,w.id)) "branchId",d.id "documentId",d.kind,d.number,
     erp_enterprise_private.document_label(d.kind,o.kind) label,coalesce(p.name,'') party,erp_enterprise_private.actor_name(c,d.created_by) actor,
     (SELECT string_agg(coalesce(nullif(l.lot,''),l.serial),' · ') FROM public.erp_inventory_tracking_movements t JOIN public.erp_inventory_lots l ON l.cafe_id=t.cafe_id AND l.id=t.lot_id WHERE t.cafe_id=c AND t.movement_id=m.id) lots,
     (SELECT iv.code FROM public.erp_inventory_documents iv WHERE iv.cafe_id=c AND iv.finance_document_id=d.id LIMIT 1) voucher
    FROM public.bf_movements m JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id LEFT JOIN public.bf_documents o ON o.cafe_id=d.cafe_id AND o.id=d.reference_id
    JOIN public.bf_warehouses w ON w.cafe_id=m.cafe_id AND w.id=m.warehouse_id LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id LEFT JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id
    WHERE m.cafe_id=c AND m.item_id=item.id AND (b IS NULL OR coalesce(bd.branch_id,erp_enterprise_private.warehouse_branch(c,w.id))=b) ORDER BY m.created_at DESC LIMIT 300) x),'[]'::jsonb),
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)) FROM public.branches x WHERE x.cafe_id=c AND x.deleted_at IS NULL),'[]'::jsonb));
END $$;

CREATE FUNCTION public.erp_trace_cash(p_cafe uuid,p_from date,p_to date,p_account uuid DEFAULT NULL,p_branch uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;d0 timestamptz;d1 timestamptz;
BEGIN
 r:=erp_enterprise_private.role_for(c);
 IF r NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'تتبع النقد متاح للمالك والمدير والمحاسب والمدقق' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'الفترة المطلوبة غير صالحة' USING ERRCODE='22023';END IF;
 b:=coalesce(erp_enterprise_private.branch_for(c,r),p_branch);
 d0:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';d1:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
 RETURN(WITH acc AS(SELECT a.id,a.name,a.kind,a.is_cashier_drawer FROM public.bf_accounts a WHERE a.cafe_id=c AND a.kind IN('cash','bank','pos') AND NOT a.is_group AND a.deleted_at IS NULL),
  rows AS(
   SELECT j.id,j.account_id,j.debit,j.credit,j.memo,d.created_at at,d.id document_id,d.kind,d.number,d.note,d.shift_id,d.created_by,o.kind origin,o.number origin_number,bd.branch_id,coalesce(pj.name,pd.name,'') party
   FROM public.bf_journal j JOIN acc ON acc.id=j.account_id JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id LEFT JOIN public.bf_documents o ON o.cafe_id=d.cafe_id AND o.id=d.reference_id
   LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id LEFT JOIN public.bf_parties pj ON pj.cafe_id=j.cafe_id AND pj.id=j.party_id LEFT JOIN public.bf_parties pd ON pd.cafe_id=d.cafe_id AND pd.id=d.party_id
   WHERE j.cafe_id=c AND d.created_at>=d0 AND d.created_at<d1 AND (p_account IS NULL OR j.account_id=p_account) AND (b IS NULL OR bd.branch_id=b))
  SELECT jsonb_build_object('branchId',b,
   'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind,'drawer',a.is_cashier_drawer,'balance',(SELECT coalesce(sum(j.debit-j.credit),0) FROM public.bf_journal j WHERE j.cafe_id=c AND j.account_id=a.id),
      'in',coalesce((SELECT sum(debit) FROM rows WHERE account_id=a.id),0),'out',coalesce((SELECT sum(credit) FROM rows WHERE account_id=a.id),0)) ORDER BY a.kind,a.name) FROM acc a),'[]'::jsonb),
   'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) ORDER BY x.sort_order,x.name) FROM public.branches x WHERE x.cafe_id=c AND x.deleted_at IS NULL),'[]'::jsonb),
   'totals',(SELECT jsonb_build_object('in',coalesce(sum(debit),0),'out',coalesce(sum(credit),0),'count',count(*)) FROM rows),
   'rows',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.at DESC) FROM(
     SELECT r.id,r.at,r.account_id "accountId",r.debit "in",r.credit "out",r.document_id "documentId",r.kind,r.number,erp_enterprise_private.document_label(r.kind,r.origin) label,r.origin_number "originNumber",
      coalesce(nullif(r.memo,''),r.note) note,r.party,r.branch_id "branchId",erp_enterprise_private.actor_name(c,r.created_by) actor,
      (SELECT erp_enterprise_private.actor_name(c,s.user_id) FROM public.bf_shifts s WHERE s.cafe_id=c AND s.id=r.shift_id) cashier,(SELECT s.shift_number FROM public.bf_shifts s WHERE s.cafe_id=c AND s.id=r.shift_id) "shiftNumber"
     FROM rows r ORDER BY r.at DESC LIMIT 400) x),'[]'::jsonb)));
END $$;

CREATE FUNCTION public.erp_branch_monitor(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;t0 timestamptz:=(now() AT TIME ZONE 'Asia/Riyadh')::date::timestamp AT TIME ZONE 'Asia/Riyadh';
BEGIN
 r:=erp_enterprise_private.role_for(c);b:=erp_enterprise_private.branch_for(c,r);
 IF r NOT IN('owner','manager','accountant','auditor') AND b IS NULL THEN RAISE EXCEPTION 'متابعة الفروع تحتاج ربط حسابك بفرع' USING ERRCODE='42501';END IF;
 RETURN(WITH docs AS(
   SELECT d.id,d.kind,d.total,d.paid,d.number,d.created_at,d.created_by,d.shift_id,d.account_id,o.kind origin,bd.branch_id FROM public.bf_documents d LEFT JOIN public.bf_documents o ON o.cafe_id=d.cafe_id AND o.id=d.reference_id
   LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id WHERE d.cafe_id=c AND d.created_at>=t0),
  shifts AS(
   SELECT s.id,s.user_id,s.account_id,s.opened_at,s.shift_number,s.supervisor_paused,
    coalesce((SELECT bd.branch_id FROM public.bf_documents d JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id WHERE d.cafe_id=c AND d.shift_id=s.id ORDER BY d.created_at DESC LIMIT 1),
     (SELECT e.branch_id FROM public.erp_hr_employees e WHERE e.cafe_id=c AND e.user_id=s.user_id AND e.active)) branch_id,
    (SELECT coalesce(sum(j.debit-j.credit),0) FROM public.bf_journal j WHERE j.cafe_id=c AND j.account_id=s.account_id) drawer,
    (SELECT count(*) FROM public.bf_documents d WHERE d.cafe_id=c AND d.shift_id=s.id AND d.kind='sale') sales,
    (SELECT coalesce(sum(d.total),0) FROM public.bf_documents d WHERE d.cafe_id=c AND d.shift_id=s.id AND d.kind='sale') sales_total
   FROM public.bf_shifts s WHERE s.cafe_id=c AND s.status='open')
  SELECT jsonb_build_object('at',now(),'branchId',b,
   'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'city',x.city,'active',x.active,
      'sales',coalesce((SELECT sum(total) FROM docs WHERE branch_id=x.id AND kind='sale'),0),'invoices',(SELECT count(*) FROM docs WHERE branch_id=x.id AND kind='sale'),
      'refunds',coalesce((SELECT sum(total) FROM docs WHERE branch_id=x.id AND kind='refund' AND origin='sale'),0),
      'purchases',coalesce((SELECT sum(total) FROM docs WHERE branch_id=x.id AND kind='purchase'),0),'expenses',coalesce((SELECT sum(total) FROM docs WHERE branch_id=x.id AND kind='expense'),0),
      'lastSaleAt',(SELECT max(created_at) FROM docs WHERE branch_id=x.id AND kind='sale'),
      'openShifts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'number',s.shift_number,'cashier',erp_enterprise_private.actor_name(c,s.user_id),'openedAt',s.opened_at,'drawer',s.drawer,'sales',s.sales,'salesTotal',s.sales_total,'paused',s.supervisor_paused)) FROM shifts s WHERE s.branch_id=x.id),'[]'::jsonb),
      'employees',(SELECT count(*) FROM public.erp_hr_employees e WHERE e.cafe_id=c AND e.branch_id=x.id AND e.active),
      'stockValue',coalesce((SELECT sum(st.value) FROM public.bf_stock st JOIN public.bf_warehouses w ON w.cafe_id=st.cafe_id AND w.id=st.warehouse_id WHERE st.cafe_id=c AND erp_enterprise_private.warehouse_branch(c,w.id)=x.id),0),
      'lowStock',(SELECT count(*) FROM public.bf_stock st JOIN public.bf_warehouses w ON w.cafe_id=st.cafe_id AND w.id=st.warehouse_id JOIN public.bf_items i ON i.cafe_id=st.cafe_id AND i.id=st.item_id WHERE st.cafe_id=c AND erp_enterprise_private.warehouse_branch(c,w.id)=x.id AND i.active AND (st.quantity<0 OR i.min_quantity>0 AND st.quantity<=i.min_quantity)),
      'labPending',(SELECT count(*) FROM public.erp_lab_orders o WHERE o.cafe_id=c AND o.branch_id=x.id AND o.status IN('requested','preparing','on_hold'))) ORDER BY x.sort_order,x.name)
     FROM public.branches x WHERE x.cafe_id=c AND x.deleted_at IS NULL AND (b IS NULL OR x.id=b)),'[]'::jsonb),
   'unassignedShifts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'number',s.shift_number,'cashier',erp_enterprise_private.actor_name(c,s.user_id),'openedAt',s.opened_at,'drawer',s.drawer,'sales',s.sales,'salesTotal',s.sales_total,'paused',s.supervisor_paused)) FROM shifts s WHERE s.branch_id IS NULL AND b IS NULL),'[]'::jsonb),
   'feed',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.at DESC) FROM(
     SELECT d.id,d.created_at at,d.kind,d.number,d.total,d.branch_id "branchId",erp_enterprise_private.document_label(d.kind,d.origin) label,erp_enterprise_private.actor_name(c,d.created_by) actor
     FROM docs d WHERE (b IS NULL OR d.branch_id=b) ORDER BY d.created_at DESC LIMIT 25) x),'[]'::jsonb)));
END $$;

REVOKE ALL ON FUNCTION public.erp_trace_item(uuid,text),public.erp_trace_cash(uuid,date,date,uuid,uuid),public.erp_branch_monitor(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_trace_item(uuid,text),public.erp_trace_cash(uuid,date,date,uuid,uuid),public.erp_branch_monitor(uuid) TO authenticated;
COMMIT;
