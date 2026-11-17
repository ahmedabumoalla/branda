BEGIN;
-- Keep the original quote calculation, locks, revisions, identity, history and
-- conversion path. Only Aldeem may resolve quote lines from its stock catalogue.
DO $patch$
DECLARE source text; needle text; replacement text;
BEGIN
 source:=pg_get_functiondef('public.brand_finance_save_quote(uuid,uuid,integer,jsonb)'::regprocedure);
 needle:='quote_date date; valid_date date;';
 replacement:='quote_date date; valid_date date; inventory_product jsonb;';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Quote declarations changed; review stock adapter'; END IF;
 source:=replace(source,needle,replacement);
 needle:=$old$   SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND id::text=entry->>'productId' AND deleted_at IS NULL AND (NOT strict_refs OR available);
   IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح للعلامة'; END IF;$old$;
 replacement:=$new$   IF entry->>'catalogSource'='inventory' THEN
    IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem') THEN
     RAISE EXCEPTION 'مصدر الصنف غير متاح لعرض السعر' USING ERRCODE='22023';
    END IF;
    IF NOT erp_branch_private.row_allowed(p_cafe_id,erp_branch_private.current_branch(p_cafe_id),inv) THEN
     RAISE EXCEPTION 'أحد سجلات عرض السعر غير متاح للفرع' USING ERRCODE='42501';
    END IF;
    inventory_product:=erp_inventory_private.sale_item(p_cafe_id,(entry->>'productId')::uuid,coalesce(entry->>'unitName',''));
    IF inventory_product->>'kind'<>'product' OR nullif(entry->>'unitName','') IS NULL
     OR (entry->>'unitFactor')::numeric IS DISTINCT FROM (inventory_product->>'unitFactor')::numeric THEN
     RAISE EXCEPTION 'راجع الصنف ووحدة البيع في عرض السعر' USING ERRCODE='22023';
    END IF;
    product.name:=inventory_product->>'name';
   ELSE
    SELECT * INTO product FROM public.menu_products WHERE cafe_id=p_cafe_id AND id::text=entry->>'productId' AND deleted_at IS NULL AND (NOT strict_refs OR available);
    IF NOT FOUND THEN RAISE EXCEPTION 'أحد المنتجات غير متاح للعلامة'; END IF;
   END IF;$new$;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Quote product lookup changed; review stock adapter'; END IF;
 source:=replace(source,needle,replacement);
 EXECUTE source;
END $patch$;
COMMIT;
