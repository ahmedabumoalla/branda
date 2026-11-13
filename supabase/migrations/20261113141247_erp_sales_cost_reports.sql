BEGIN;
-- Preserve immutable invoice lines and derive delivered costs at the report end date
ALTER FUNCTION erp_reports_private.financial_facts(uuid,text,date,date) RENAME TO financial_facts_before_deferred_cost;
CREATE FUNCTION erp_reports_private.financial_facts(c uuid,s text,f date,t date) RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path='' AS $$BEGIN
 IF s<>'sales-lines' THEN RETURN QUERY SELECT * FROM erp_reports_private.financial_facts_before_deferred_cost(c,s,f,t);RETURN;END IF;
 RETURN QUERY
 WITH base AS MATERIALIZED(SELECT original.value FROM erp_reports_private.financial_facts_before_deferred_cost(c,s,f,t) AS original(value)),
 line_costs AS MATERIALIZED(SELECT actual.value FROM erp_sales_requisition_private.line_costs(c,t) AS actual(value)),
 receipts AS(SELECT lines.return_id,sum(receipt.quantity) quantity,sum(receipt.cost) cost FROM public.erp_sales_requisition_return_lines lines JOIN public.erp_sales_requisition_receipts receipt ON receipt.cafe_id=c AND receipt.return_line_id=lines.id WHERE lines.cafe_id=c AND receipt.effective_on<=t GROUP BY lines.return_id),
 valued AS(
  SELECT b.value,
   sale.id IS NOT NULL OR ret.id IS NOT NULL AS deferred,
   CASE WHEN sale.id IS NOT NULL THEN CASE WHEN (costs.value->>'pendingQuantity')::numeric=0 THEN(costs.value->>'deliveredCost')::numeric END
    WHEN ret.id IS NOT NULL THEN CASE WHEN erp_sales_requisition_private.can_read(c,ret.request_id) AND coalesce(receipts.quantity,0)=ret.financial_quantity-ret.cancelled_quantity THEN-coalesce(receipts.cost,0) END
   END AS actual_cost
  FROM base b
  LEFT JOIN public.erp_sales_requisition_lines sale ON sale.cafe_id=c AND sale.id::text=b.value->>'id'
  LEFT JOIN line_costs costs ON costs.value->>'sourceLineId'=sale.id::text
  LEFT JOIN public.erp_sales_requisition_returns ret ON ret.cafe_id=c AND ret.refund_line_id::text=b.value->>'id'
  LEFT JOIN receipts ON receipts.return_id=ret.id
 )
 SELECT CASE WHEN deferred THEN value||jsonb_build_object('cost',actual_cost,'profit',CASE WHEN actual_cost IS NOT NULL THEN(value->>'net')::numeric-actual_cost END) ELSE value END FROM valued;
END $$;
REVOKE ALL ON FUNCTION erp_reports_private.financial_facts(uuid,text,date,date),erp_reports_private.financial_facts_before_deferred_cost(uuid,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
UPDATE erp_reports_private.catalog SET definition=jsonb_set(definition,'{basis}',to_jsonb('للمبيعات المؤجلة تحسب تكلفة التسليم والاستلام حتى نهاية الفترة وتبقى التكلفة والربح غير مكتملين للبنود التي لم يكتمل صرفها أو استلام مرتجعها'::text)) WHERE source='sales-lines';
COMMIT;
