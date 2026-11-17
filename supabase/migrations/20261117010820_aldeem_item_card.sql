BEGIN;
CREATE FUNCTION aldeem_pos_private.item_warehouse_branch(c uuid,w uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT branch_id FROM public.erp_branch_records WHERE cafe_id=c AND table_name='bf_warehouses' AND record_id=w),
  (SELECT CASE WHEN count(DISTINCT branch_id)=1 THEN (array_agg(DISTINCT branch_id))[1] END FROM aldeem_pos_private.points WHERE cafe_id=c AND warehouse_id=w))
$$;
REVOKE ALL ON FUNCTION aldeem_pos_private.item_warehouse_branch(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.aldeem_item_card_read(p_cafe uuid,p_item uuid,p_from date,p_to date,p_branch uuid DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;i uuid:=p_item;b uuid;scoped uuid;r text;item public.bf_items;meta public.erp_inventory_items;
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Riyadh')::date;
 month_start date:=date_trunc('month',statement_timestamp() AT TIME ZONE 'Asia/Riyadh')::date;
 previous_start date;previous_end date;previous_days integer;current_days integer;warehouse_ids uuid[];
 d0 timestamptz;d1 timestamptz;sale_unit text;sale_factor numeric;default_price numeric;out jsonb;part jsonb;
 stock_quantity numeric;reserved_quantity numeric;expired_quantity numeric;expiry_known_quantity numeric;
 ledger_quantity numeric;first_movement date;average_stock numeric;minimum_stock numeric;minimum_ledger_stock numeric;complete_history boolean;
 incoming numeric:=0;ambiguous_orders boolean:=false;ambiguous_legacy boolean:=false;
BEGIN
 r:=brand_finance_private.role_for(c);
 IF r IS DISTINCT FROM 'owner' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') THEN RAISE EXCEPTION 'بطاقة الصنف متاحة لمالك حساب الديم' USING ERRCODE='42501';END IF;
 scoped:=erp_branch_private.current_branch(c);b:=coalesce(scoped,p_branch);
 IF p_branch IS NOT NULL AND (scoped IS NOT NULL AND scoped<>p_branch OR NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND id=p_branch AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'الفرع غير متاح' USING ERRCODE='42501';END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>365 OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000 THEN RAISE EXCEPTION 'راجع الفترة ورقم الصفحة' USING ERRCODE='22023';END IF;
 SELECT * INTO item FROM public.bf_items WHERE cafe_id=c AND id=i;
 IF item.id IS NULL OR NOT coalesce(erp_branch_private.allowed_resource(c,b,'item',i),false) THEN RAISE EXCEPTION 'الصنف غير متاح' USING ERRCODE='42501';END IF;
 SELECT * INTO meta FROM public.erp_inventory_items WHERE cafe_id=c AND item_id=i;
 sale_unit:=coalesce(nullif(meta.payload->>'saleUnitName',''),item.unit);
 SELECT CASE WHEN sale_unit=item.unit THEN 1 ELSE (SELECT (u->>'factor')::numeric FROM public.erp_inventory_catalogs t CROSS JOIN LATERAL jsonb_array_elements(t.payload->'units')u WHERE t.cafe_id=c AND t.id=meta.unit_template_id AND u->>'name'=sale_unit LIMIT 1) END INTO sale_factor;
 IF sale_factor IS NULL OR sale_factor<=0 THEN RAISE EXCEPTION 'راجع وحدة البيع وقالب وحدات الصنف قبل فتح البطاقة' USING ERRCODE='22023';END IF;
 default_price:=nullif(meta.payload->>'salePrice','')::numeric;
 previous_start:=(month_start-interval '1 month')::date;previous_end:=month_start-1;previous_days:=month_start-previous_start;
 current_days:=((month_start+interval '1 month')::date-month_start);
 d0:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';d1:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
 SELECT coalesce(array_agg(w.id),'{}'::uuid[]) INTO warehouse_ids FROM public.bf_warehouses w
 WHERE w.cafe_id=c AND (b IS NULL OR aldeem_pos_private.item_warehouse_branch(c,w.id)=b);
 out:=jsonb_build_object('asOf',statement_timestamp(),'filters',jsonb_build_object('itemId',i,'from',p_from,'to',p_to,'branchId',b,'offset',p_offset),
  'item',jsonb_build_object('id',i,'name',item.name,'sku',item.sku,'barcode',item.barcode,'barcodeFormat',coalesce(nullif(meta.payload->>'barcodeFormat',''),(SELECT payload->>'barcodeFormat' FROM public.erp_inventory_settings WHERE cafe_id=c),'CODE128'),'unit',item.unit,'saleUnitName',sale_unit,'saleUnitFactor',sale_factor,'defaultPrice',default_price,'minimumPrice',coalesce((meta.payload->>'minimumPrice')::numeric,0),'trackingMode',coalesce(meta.tracking_mode,'quantity')),
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name) FROM public.branches WHERE cafe_id=c AND deleted_at IS NULL AND (scoped IS NULL OR id=scoped)),'[]'::jsonb),'pageSize',50,
  'notes',jsonb_build_array('الكميات والتحليلات بالوحدة الأساسية للصنف والأسعار بوحدة البيع','الحركات والدفعات من السجل الفعلي ولا يستنتج تاريخ صلاحية غير مسجل'));
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'branchId',br.id,'branchName',br.name,'quantity',coalesce(s.quantity,0),'reserved',erp_inventory_private.reserved(c,i,w.id),'available',greatest(0,coalesce(s.quantity,0)-erp_inventory_private.reserved(c,i,w.id))) ORDER BY w.name),'[]'::jsonb)
 INTO part FROM public.bf_warehouses w LEFT JOIN public.bf_stock s ON s.cafe_id=c AND s.item_id=i AND s.warehouse_id=w.id LEFT JOIN public.branches br ON br.cafe_id=c AND br.id=aldeem_pos_private.item_warehouse_branch(c,w.id)
 WHERE w.cafe_id=c AND w.id=ANY(warehouse_ids);
 out:=out||jsonb_build_object('warehouses',part);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'lot',l.lot,'serial',l.serial,'warehouseId',s.warehouse_id,'warehouse',w.name,'quantity',s.quantity,'expiresOn',l.expires_on,'daysRemaining',l.expires_on-today) ORDER BY l.expires_on NULLS LAST,l.lot,w.name),'[]'::jsonb),
  coalesce(sum(s.quantity) FILTER(WHERE l.expires_on<today),0),coalesce(sum(s.quantity) FILTER(WHERE l.expires_on IS NOT NULL),0)
 INTO part,expired_quantity,expiry_known_quantity FROM public.erp_inventory_lots l JOIN public.erp_inventory_lot_stock s ON s.cafe_id=c AND s.lot_id=l.id JOIN public.bf_warehouses w ON w.cafe_id=c AND w.id=s.warehouse_id
 WHERE l.cafe_id=c AND l.item_id=i AND s.quantity>0 AND s.warehouse_id=ANY(warehouse_ids);
 out:=out||jsonb_build_object('lots',part);

 WITH receipts AS (
  SELECT coalesce(src.id,d.id) source_id,coalesce(src.party_id,d.party_id) supplier_id,m.quantity,m.created_at
  FROM public.bf_movements m JOIN public.bf_documents d ON d.cafe_id=c AND d.id=m.document_id LEFT JOIN public.bf_documents src ON src.cafe_id=c AND src.id=d.reference_id AND src.kind='purchase'
  WHERE m.cafe_id=c AND m.item_id=i AND m.quantity>0 AND m.warehouse_id=ANY(warehouse_ids) AND (d.kind='purchase' OR src.id IS NOT NULL)
 ), supplied AS (
  SELECT x.supplier_id,f.id family_id,sum(x.quantity) quantity,max(x.created_at) last_at,false linked FROM receipts x
  LEFT JOIN public.erp_family_consignments fc ON fc.cafe_id=c AND fc.finance_id=x.source_id LEFT JOIN public.erp_families f ON f.cafe_id=c AND f.id=fc.family_id GROUP BY x.supplier_id,f.id
  UNION ALL SELECT f.supplier_id,f.id,0,NULL,true FROM public.erp_family_items fi JOIN public.erp_families f ON f.cafe_id=c AND f.id=fi.family_id WHERE fi.cafe_id=c AND fi.item_id=i AND (b IS NULL OR erp_branch_private.allowed_resource(c,b,'supplier',f.supplier_id))
 ) SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.supplier),'[]'::jsonb) INTO part FROM (
  SELECT s.supplier_id "supplierId",p.name supplier,s.family_id "familyId",CASE WHEN s.family_id IS NOT NULL THEN p.name END family,sum(s.quantity) "receivedQuantity",max(s.last_at) "lastReceivedAt",bool_or(s.linked) linked
  FROM supplied s JOIN public.bf_parties p ON p.cafe_id=c AND p.id=s.supplier_id GROUP BY s.supplier_id,p.name,s.family_id)x;
 out:=out||jsonb_build_object('sources',part);

 SELECT count(*) INTO ledger_quantity FROM public.bf_movements WHERE cafe_id=c AND item_id=i AND warehouse_id=ANY(warehouse_ids) AND created_at>=d0 AND created_at<d1;
 out:=out||jsonb_build_object('movementCount',ledger_quantity);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.at DESC,x.id),'[]'::jsonb) INTO part FROM (
  SELECT m.id,m.created_at at,m.quantity,d.kind,d.id "documentId",d.number "documentNumber",w.id "warehouseId",w.name warehouse,
   coalesce((SELECT jsonb_agg(DISTINCT ow.name) FROM public.bf_movements om JOIN public.bf_warehouses ow ON ow.cafe_id=c AND ow.id=om.warehouse_id WHERE om.cafe_id=c AND om.document_id=m.document_id AND om.item_id=i AND om.warehouse_id<>m.warehouse_id AND (scoped IS NULL OR om.warehouse_id=ANY(warehouse_ids))),'[]'::jsonb) "relatedWarehouses",
   br.id "branchId",br.name branch,p.name party,CASE WHEN fc.id IS NOT NULL THEN p.name END family,d.note,
   coalesce((SELECT jsonb_agg(jsonb_build_object('lot',l.lot,'expiresOn',l.expires_on,'quantity',t.quantity)) FROM public.erp_inventory_tracking_movements t JOIN public.erp_inventory_lots l ON l.cafe_id=c AND l.id=t.lot_id WHERE t.cafe_id=c AND t.movement_id=m.id),'[]'::jsonb) lots
  FROM public.bf_movements m JOIN public.bf_documents d ON d.cafe_id=c AND d.id=m.document_id JOIN public.bf_warehouses w ON w.cafe_id=c AND w.id=m.warehouse_id
  LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=c AND bd.document_id=d.id LEFT JOIN public.branches br ON br.cafe_id=c AND br.id=coalesce(bd.branch_id,aldeem_pos_private.item_warehouse_branch(c,w.id))
  LEFT JOIN public.bf_parties p ON p.cafe_id=c AND p.id=d.party_id LEFT JOIN public.bf_documents source_purchase ON source_purchase.cafe_id=c AND source_purchase.id=d.reference_id AND source_purchase.kind='purchase'
  LEFT JOIN public.erp_family_consignments fc ON fc.cafe_id=c AND fc.finance_id=coalesce(source_purchase.id,d.id)
  WHERE m.cafe_id=c AND m.item_id=i AND m.warehouse_id=ANY(warehouse_ids) AND m.created_at>=d0 AND m.created_at<d1 ORDER BY m.created_at DESC,m.id LIMIT 50 OFFSET p_offset)x;
 out:=out||jsonb_build_object('movements',part);

 SELECT coalesce(jsonb_agg(jsonb_build_object('branchId',br.id,'branch',br.name,'price',CASE WHEN bp.base_unit=item.unit THEN round(bp.price*sale_factor/bp.unit_factor,2) END,
  'effectivePrice',CASE WHEN bp.price IS NOT NULL AND bp.base_unit IS DISTINCT FROM item.unit THEN NULL ELSE coalesce(round(bp.price*sale_factor/bp.unit_factor,2),default_price) END,'revision',coalesce(bp.revision,0),'stale',bp.price IS NOT NULL AND bp.base_unit IS DISTINCT FROM item.unit) ORDER BY br.name),'[]'::jsonb)
 INTO part FROM public.branches br LEFT JOIN aldeem_pos_private.branch_item_prices bp ON bp.cafe_id=c AND bp.branch_id=br.id AND bp.item_id=i
 WHERE br.cafe_id=c AND br.deleted_at IS NULL AND (b IS NULL OR br.id=b);
 out:=out||jsonb_build_object('branchPrices',part);
 SELECT coalesce(jsonb_agg(jsonb_build_object('pointId',p.id,'point',p.name,'branchId',p.branch_id,'branch',b2.name,'price',ip.price) ORDER BY b2.name,p.name),'[]'::jsonb)
 INTO part FROM aldeem_pos_private.item_prices ip JOIN aldeem_pos_private.points p ON p.cafe_id=c AND p.id=ip.point_id JOIN public.branches b2 ON b2.cafe_id=c AND b2.id=p.branch_id WHERE ip.cafe_id=c AND ip.item_id=i AND (b IS NULL OR p.branch_id=b);
 out:=out||jsonb_build_object('pointOverrides',part);

 WITH sales AS MATERIALIZED(
  SELECT d.created_at,(d.created_at AT TIME ZONE 'Asia/Riyadh')::date AS sale_day,coalesce(bd.branch_id,aldeem_pos_private.item_warehouse_branch(c,d.warehouse_id)) branch_id,
   CASE WHEN d.kind='sale' THEN l.quantity*l.stock_unit_factor ELSE 0 END sold,
   CASE WHEN d.kind='refund' THEN l.quantity*coalesce(original.stock_unit_factor,l.stock_unit_factor) ELSE 0 END returned,
   CASE WHEN d.kind='sale' THEN l.net+l.tax ELSE -(l.net+l.tax) END revenue
  FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=c AND d.id=l.document_id
  LEFT JOIN public.bf_document_lines original ON original.cafe_id=c AND original.id=l.reference_line_id LEFT JOIN public.bf_documents od ON od.cafe_id=c AND od.id=original.document_id
  LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=c AND bd.document_id=d.id
  WHERE l.cafe_id=c AND (d.kind='sale' AND (l.inventory_item_id=i OR l.item_id=i AND l.product_id IS NULL)
   OR d.kind='refund' AND od.kind='sale' AND (original.inventory_item_id=i OR original.item_id=i AND original.product_id IS NULL))
   AND (b IS NULL OR coalesce(bd.branch_id,aldeem_pos_private.item_warehouse_branch(c,d.warehouse_id))=b)
 ) SELECT jsonb_build_object('byBranch',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT s.branch_id "branchId",br.name branch,sum(s.sold) sold,sum(s.returned) returned,sum(s.sold-s.returned) "netQuantity",sum(s.revenue) "netRevenue" FROM sales s LEFT JOIN public.branches br ON br.cafe_id=c AND br.id=s.branch_id WHERE s.created_at>=d0 AND s.created_at<d1 GROUP BY s.branch_id,br.name)x),'[]'::jsonb),
  'previous',jsonb_build_object('sold',coalesce(sum(sold) FILTER(WHERE sale_day>=previous_start AND sale_day<month_start),0),'returned',coalesce(sum(returned) FILTER(WHERE sale_day>=previous_start AND sale_day<month_start),0),'netSales',coalesce(sum(sold-returned) FILTER(WHERE sale_day>=previous_start AND sale_day<month_start),0),'activeSalesDays',count(DISTINCT sale_day) FILTER(WHERE sale_day>=previous_start AND sale_day<month_start AND sold>0)),
  'current',jsonb_build_object('sold',coalesce(sum(sold) FILTER(WHERE sale_day>=month_start AND sale_day<=today),0),'returned',coalesce(sum(returned) FILTER(WHERE sale_day>=month_start AND sale_day<=today),0),'netSales',coalesce(sum(sold-returned) FILTER(WHERE sale_day>=month_start AND sale_day<=today),0))) INTO part FROM sales;
 out:=out||jsonb_build_object('salesByBranch',part->'byBranch','analyticsRaw',jsonb_build_object('previousMonth',part->'previous','currentMonth',part->'current'));
 SELECT coalesce(sum(quantity),0) INTO stock_quantity FROM public.bf_stock WHERE cafe_id=c AND item_id=i AND warehouse_id=ANY(warehouse_ids);
 SELECT coalesce(sum(erp_inventory_private.reserved(c,i,w)),0) INTO reserved_quantity FROM unnest(warehouse_ids)w;
 SELECT coalesce(sum(quantity),0),min((created_at AT TIME ZONE 'Asia/Riyadh')::date) INTO ledger_quantity,first_movement FROM public.bf_movements WHERE cafe_id=c AND item_id=i AND warehouse_id=ANY(warehouse_ids);
 SELECT avg(q),min(q) INTO average_stock,minimum_stock FROM(SELECT stock_quantity-coalesce((SELECT sum(m.quantity) FROM public.bf_movements m WHERE m.cafe_id=c AND m.item_id=i AND m.warehouse_id=ANY(warehouse_ids) AND (m.created_at AT TIME ZONE 'Asia/Riyadh')::date>calendar.day_on::date),0) q FROM generate_series(previous_start::timestamp,previous_end::timestamp,interval '1 day')calendar(day_on))x;
 SELECT min(q) INTO minimum_ledger_stock FROM(SELECT sum(quantity) OVER(PARTITION BY warehouse_id ORDER BY created_at RANGE UNBOUNDED PRECEDING) q FROM public.bf_movements WHERE cafe_id=c AND item_id=i AND warehouse_id=ANY(warehouse_ids))x;
 SELECT EXISTS(SELECT 1 FROM public.bf_document_lines l JOIN public.bf_documents d ON d.cafe_id=c AND d.id=l.document_id LEFT JOIN public.bf_document_lines original ON original.cafe_id=c AND original.id=l.reference_line_id LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=c AND bd.document_id=d.id
  WHERE l.cafe_id=c AND (d.created_at AT TIME ZONE 'Asia/Riyadh')::date>=previous_start AND (d.created_at AT TIME ZONE 'Asia/Riyadh')::date<month_start AND (b IS NULL OR coalesce(bd.branch_id,aldeem_pos_private.item_warehouse_branch(c,d.warehouse_id))=b)
  AND (d.kind='sale' AND l.item_id=i AND l.inventory_item_id IS NULL AND l.product_id IS NOT NULL OR d.kind='refund' AND original.item_id=i AND original.inventory_item_id IS NULL AND original.product_id IS NOT NULL)) INTO ambiguous_legacy;
 complete_history:=NOT ambiguous_legacy AND first_movement<=previous_start AND abs(stock_quantity-ledger_quantity)<0.0005 AND minimum_stock>=0 AND minimum_ledger_stock>=0 AND stock_quantity>=0
  AND NOT EXISTS(SELECT 1 FROM unnest(warehouse_ids)w WHERE abs(coalesce((SELECT quantity FROM public.bf_stock WHERE cafe_id=c AND item_id=i AND warehouse_id=w),0)-coalesce((SELECT sum(quantity) FROM public.bf_movements WHERE cafe_id=c AND item_id=i AND warehouse_id=w),0))>=0.0005);
 IF ambiguous_legacy THEN out:=jsonb_set(out,'{notes}',out->'notes'||jsonb_build_array('توجد مبيعات منيو تاريخية لا تثبت هوية الصنف المباع مستقلًا لذلك استبعدت من تقدير الطلب وتبقى حركات المخزون ظاهرة'));END IF;
 complete_history:=coalesce(complete_history,false);
 -- Confirmed orders not yet converted, plus already posted purchases awaiting stock receipt.
 -- A converted order with an unposted child cannot be reliably netted without a line fulfillment ledger.
 BEGIN
 SELECT EXISTS(SELECT 1 FROM public.erp_purchase_documents p WHERE p.cafe_id=c AND p.kind='order' AND p.status='converted' AND (b IS NULL OR nullif(p.payload->>'warehouseId','')::uuid=ANY(warehouse_ids))
  AND coalesce((SELECT sum((l->>'quantity')::numeric*erp_purchase_private.unit_factor(c,i,coalesce(l->>'unit',item.unit))) FROM jsonb_array_elements(p.payload->'lines')l WHERE l->>'itemId'=i::text),0)
   >coalesce((SELECT sum(pl.quantity) FROM public.erp_purchase_documents ch JOIN public.bf_document_lines pl ON pl.cafe_id=c AND pl.document_id=ch.finance_id AND pl.item_id=i WHERE ch.cafe_id=c AND ch.source_id=p.id AND ch.status='posted'),0)) INTO ambiguous_orders;
 SELECT coalesce(sum((l->>'quantity')::numeric*erp_purchase_private.unit_factor(c,i,coalesce(l->>'unit',item.unit))),0) INTO incoming FROM public.erp_purchase_documents p CROSS JOIN LATERAL jsonb_array_elements(p.payload->'lines')l
 WHERE p.cafe_id=c AND p.kind='order' AND p.status='approved' AND l->>'itemId'=i::text AND (b IS NULL OR nullif(p.payload->>'warehouseId','')::uuid=ANY(warehouse_ids)) AND NOT EXISTS(SELECT 1 FROM public.erp_purchase_documents ch WHERE ch.cafe_id=c AND ch.source_id=p.id AND ch.status<>'cancelled');
 SELECT incoming+coalesce(sum(l.quantity),0) INTO incoming FROM public.erp_purchase_receipts r JOIN public.bf_documents d ON d.cafe_id=c AND d.id=r.source_document_id JOIN public.bf_document_lines l ON l.cafe_id=c AND l.document_id=d.id WHERE r.cafe_id=c AND r.status='pending' AND l.item_id=i AND d.warehouse_id=ANY(warehouse_ids);
 EXCEPTION WHEN OTHERS THEN ambiguous_orders:=true; END;
 IF ambiguous_orders THEN incoming:=NULL;out:=jsonb_set(out,'{notes}',out->'notes'||jsonb_build_array('راجع أوامر الشراء المحولة قبل اعتماد الكمية المقترحة لأن كمية التوريد المتبقية غير مؤكدة'));END IF;
 out:=jsonb_set(out,'{analyticsRaw,previousMonth}',out#>'{analyticsRaw,previousMonth}'||jsonb_build_object('from',previous_start,'to',previous_end,'days',previous_days,'averageDailyStock',CASE WHEN complete_history THEN average_stock END,'historyDays',CASE WHEN complete_history THEN previous_days ELSE 0 END,'historyComplete',complete_history));
 out:=jsonb_set(out,'{analyticsRaw,currentMonth}',out#>'{analyticsRaw,currentMonth}'||jsonb_build_object('from',month_start,'to',today,'days',current_days,'elapsedDays',today-month_start+1));
 out:=jsonb_set(out,'{analyticsRaw,stock}',jsonb_build_object('onHand',stock_quantity,'reserved',reserved_quantity,'expired',expired_quantity,'expiryUnknown',greatest(0,stock_quantity-expiry_known_quantity),'usable',greatest(0,stock_quantity-expired_quantity),'onOrder',incoming));
 IF NOT complete_history THEN out:=jsonb_set(out,'{notes}',out->'notes'||jsonb_build_array('لا يتوفر شهر سابق كامل برصيد تاريخي متطابق لحساب دوران موثوق'));END IF;
 RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_item_card_read(uuid,uuid,date,date,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_item_card_read(uuid,uuid,date,date,uuid,integer) TO authenticated;
COMMIT;
