BEGIN;
-- Read-only, tenant-authorized report across the full ledger, never snapshot-limited.
CREATE INDEX bf_documents_shift_sales ON public.bf_documents(cafe_id,shift_id,created_at,id) WHERE kind='sale';
CREATE FUNCTION public.brand_finance_shift_analytics(p_cafe_id uuid,p_shift_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE sh public.bf_shifts%ROWTYPE; result jsonb;
BEGIN
 IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager') THEN
  RAISE EXCEPTION 'Finance manager required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO sh FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND id=p_shift_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shift unavailable' USING ERRCODE='42501'; END IF;
 WITH sales AS MATERIALIZED (
  SELECT d.* FROM public.bf_documents d WHERE d.cafe_id=p_cafe_id AND d.shift_id=p_shift_id AND d.kind='sale'
 ), returns AS MATERIALIZED (
  SELECT d.* FROM public.bf_documents d JOIN sales s ON s.id=d.reference_id
  WHERE d.cafe_id=p_cafe_id AND d.kind='refund'
 ), settlements AS MATERIALIZED (
  SELECT d.* FROM public.bf_documents d JOIN sales s ON s.id=d.reference_id
  WHERE d.cafe_id=p_cafe_id AND d.kind='settlement'
 ), documents AS (
  SELECT id,created_at,1 AS direction FROM sales UNION ALL SELECT id,created_at,-1 FROM returns
 ), lines AS MATERIALIZED (
  SELECT l.*,d.direction,d.created_at,
   coalesce('p:'||l.product_id::text,'i:'||l.item_id::text,'l:'||coalesce(l.reference_line_id,l.id)::text) AS product_key,
   (l.cost_status IN('known','estimated') OR (l.cost_status='legacy' AND l.item_id IS NOT NULL AND l.cost>0)) AS cost_available
  FROM documents d JOIN public.bf_document_lines l ON l.document_id=d.id AND l.cafe_id=p_cafe_id
 ), product_totals AS (
  SELECT product_key,(array_agg(product_id ORDER BY created_at DESC,id DESC) FILTER(WHERE product_id IS NOT NULL))[1] AS product_id,
   (array_agg(item_id ORDER BY created_at DESC,id DESC) FILTER(WHERE item_id IS NOT NULL))[1] AS item_id,
   (array_agg(name ORDER BY (direction=1) DESC,created_at DESC,id DESC))[1] AS name,
   coalesce(sum(quantity) FILTER(WHERE direction=1),0) AS sold_quantity,
   coalesce(sum(quantity) FILTER(WHERE direction=-1),0) AS returned_quantity,
   sum(quantity*direction) AS net_quantity,count(DISTINCT document_id) FILTER(WHERE direction=1) AS sales_count,
   sum(net*direction) AS revenue,sum(cost*direction) AS cost,
   coalesce(sum((net-cost)*direction) FILTER(WHERE cost_status='known'),0) AS known_profit,
   CASE WHEN bool_and(cost_available) THEN sum((net-cost)*direction) END AS profit,
   count(*) FILTER(WHERE NOT cost_available) AS unknown_count,
   count(*) FILTER(WHERE cost_status='estimated') AS estimated_count,
   count(*) FILTER(WHERE cost_status='legacy') AS legacy_count
  FROM lines GROUP BY product_key
 ), product_stock AS (
  SELECT DISTINCT l.product_key,l.item_id,s.warehouse_id,w.name AS warehouse_name,s.quantity,i.unit,i.min_quantity
  FROM lines l JOIN public.bf_items i ON i.cafe_id=p_cafe_id AND i.id=l.item_id
  JOIN public.bf_stock s ON s.cafe_id=p_cafe_id AND s.item_id=i.id
  JOIN public.bf_warehouses w ON w.cafe_id=p_cafe_id AND w.id=s.warehouse_id
 ), hours AS (
  SELECT extract(hour FROM s.created_at AT TIME ZONE 'Asia/Riyadh')::integer AS hour,
   count(*) AS sales_count,sum(s.total) AS sales_total,
   sum((SELECT coalesce(sum(l.quantity),0) FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe_id AND l.document_id=s.id)) AS quantity
  FROM sales s GROUP BY 1
 ), payment_events AS (
  SELECT id AS sale_id,account_id,paid,0::numeric AS returned_paid FROM sales WHERE paid>0
  UNION ALL SELECT reference_id,account_id,total,0 FROM settlements
  UNION ALL SELECT reference_id,account_id,0,paid FROM returns WHERE paid>0
 ), payments AS (
  SELECT a.id,a.kind,a.name,count(DISTINCT e.sale_id) AS sales_count,sum(e.paid) AS paid,sum(e.returned_paid) AS returned_paid
  FROM payment_events e JOIN public.bf_accounts a ON a.id=e.account_id AND a.cafe_id=p_cafe_id GROUP BY a.id,a.kind,a.name
 ), line_totals AS (
  SELECT coalesce(sum(net*direction),0) AS revenue,coalesce(sum(cost*direction),0) AS cost,
   coalesce(sum((net-cost)*direction) FILTER(WHERE cost_status='known'),0) AS known_profit,
   CASE WHEN coalesce(bool_and(cost_available),true) THEN coalesce(sum((net-cost)*direction),0) END AS profit,
   count(*) FILTER(WHERE NOT cost_available) AS unknown_count,
   count(*) FILTER(WHERE cost_status='estimated') AS estimated_count,count(*) FILTER(WHERE cost_status='legacy') AS legacy_count,
   CASE WHEN count(*)=0 THEN 100 ELSE round(100.0*count(*) FILTER(WHERE cost_available)/count(*),2) END AS coverage,
   coalesce(sum(quantity) FILTER(WHERE direction=1),0) AS sold_quantity,
   coalesce(sum(quantity) FILTER(WHERE direction=-1),0) AS returned_quantity,
   coalesce(sum(quantity*direction),0) AS net_quantity FROM lines
 )
 SELECT jsonb_build_object(
  'generatedAt',now(),'shiftId',sh.id,'openedAt',sh.opened_at,'closedAt',sh.closed_at,
  'durationSeconds',greatest(0,extract(epoch FROM coalesce(sh.closed_at,now())-sh.opened_at)),
  'totals',jsonb_build_object(
   'salesCount',(SELECT count(*) FROM sales),'refundCount',(SELECT count(*) FROM returns),
   'grossSales',(SELECT coalesce(sum(total),0) FROM sales),'returnedTotal',(SELECT coalesce(sum(total),0) FROM returns),
   'netSales',(SELECT coalesce(sum(total),0) FROM sales)-(SELECT coalesce(sum(total),0) FROM returns),
   'netRevenue',lt.revenue,'tax',(SELECT coalesce(sum(tax),0) FROM sales)-(SELECT coalesce(sum(tax),0) FROM returns),
   'discount',(SELECT coalesce(sum(discount),0) FROM sales)-(SELECT coalesce(sum(discount),0) FROM returns),
   'cost',lt.cost,'knownProfit',lt.known_profit,'profit',lt.profit,'unknownCostLineCount',lt.unknown_count,
   'estimatedCostLineCount',lt.estimated_count,'legacyCostLineCount',lt.legacy_count,'costCoveragePercent',lt.coverage,
   'soldQuantity',lt.sold_quantity,'returnedQuantity',lt.returned_quantity,'netQuantity',lt.net_quantity,
   'averageBasket',(SELECT coalesce(round(avg(total),2),0) FROM sales),
   'offlineSalesCount',(SELECT count(*) FROM sales s WHERE to_jsonb(s)->>'local_created_at' IS NOT NULL),
   'initialCredit',(SELECT coalesce(sum(total-paid),0) FROM sales),
   'settlementPaid',(SELECT coalesce(sum(total),0) FROM settlements)
  ),
  'products',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'key',p.product_key,'productId',p.product_id,'itemId',p.item_id,'name',p.name,
   'soldQuantity',p.sold_quantity,'returnedQuantity',p.returned_quantity,'netQuantity',p.net_quantity,'salesCount',p.sales_count,
   'revenue',p.revenue,'cost',p.cost,'knownProfit',p.known_profit,'profit',p.profit,
   'unknownCostLineCount',p.unknown_count,'estimatedCostLineCount',p.estimated_count,'legacyCostLineCount',p.legacy_count,
   'tracked',p.item_id IS NOT NULL,'stock',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'itemId',s.item_id,'warehouseId',s.warehouse_id,'warehouseName',s.warehouse_name,'quantity',s.quantity,'unit',s.unit,'minQuantity',s.min_quantity
   ) ORDER BY s.warehouse_name,s.warehouse_id,s.item_id) FROM product_stock s WHERE s.product_key=p.product_key),'[]'::jsonb)
  ) ORDER BY p.sold_quantity DESC,p.revenue DESC,p.product_key) FROM product_totals p),'[]'::jsonb),
  'hourly',(SELECT jsonb_agg(jsonb_build_object('hour',h,'salesCount',coalesce(t.sales_count,0),'quantity',coalesce(t.quantity,0),'salesTotal',coalesce(t.sales_total,0)) ORDER BY h) FROM generate_series(0,23) h LEFT JOIN hours t ON t.hour=h),
  'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('accountId',id,'kind',kind,'accountName',name,'salesCount',sales_count,'paid',paid,'returnedPaid',returned_paid,'netPaid',paid-returned_paid) ORDER BY paid DESC,id) FROM payments),'[]'::jsonb),
  'notes',jsonb_build_object('timeBasis','server_posted_riyadh','stockBasis','current','refundBasis','linked_sales_as_of_report','paymentBasis','linked_sales_as_of_report')
 ) INTO result FROM line_totals lt;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_shift_analytics(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_shift_analytics(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.brand_finance_shift_analytics(uuid,uuid) IS 'Manager-only shift sales report including later linked refunds and settlements; current stock and server posting hour; gross profit excludes overhead and flags unavailable or estimated cost';
NOTIFY pgrst,'reload schema';
COMMIT;
