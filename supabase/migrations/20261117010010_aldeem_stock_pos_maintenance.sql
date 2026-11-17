BEGIN;
-- Respect the existing audited maintenance authority without changing any
-- general inventory permission, actor identity, session or historical record.
DO $patch$
DECLARE source text;needle text;replacement text;
BEGIN
 source:=pg_get_functiondef('aldeem_pos_private.stock_product(uuid,uuid,uuid)'::regprocedure);
 needle:=$old$  OR NOT erp_inventory_private.sale_warehouse_allowed(c,p.warehouse_id,auth.uid()) THEN$old$;
 replacement:=$new$  OR NOT EXISTS(SELECT 1 FROM public.bf_warehouses w WHERE w.cafe_id=c AND w.id=p.warehouse_id AND w.active
   AND erp_branch_private.row_allowed(c,p.branch_id,to_jsonb(w)))
  OR NOT (coalesce(erp_inventory_private.sale_warehouse_allowed(c,p.warehouse_id,auth.uid()),false)
   OR coalesce(brand_finance_private.invoice_settings_maintenance(c),false)) THEN$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Review Aldeem stock warehouse authorization baseline';END IF;
 EXECUTE replace(source,needle,replacement);
END $patch$;
COMMIT;
