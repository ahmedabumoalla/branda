BEGIN;
-- Live stock is identified by tenant, warehouse and item, never display names
-- This enriches the existing authorized read projection only
DO $patch$
DECLARE body text;old text;
BEGIN
 SELECT pg_get_functiondef('public.brand_finance_invoice_detail(uuid,uuid)'::regprocedure) INTO body;
 old:='jsonb_build_object(''id'',m.id,''name'',i.name,''warehouse'',w.name,';
 IF strpos(body,old)=0 OR (length(body)-length(replace(body,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'Unexpected invoice movements baseline';END IF;
 EXECUTE replace(body,old,$replacement$jsonb_build_object('id',m.id,'itemId',i.id,'sku',i.sku,'unit',i.unit,'warehouseId',w.id,'balance',coalesce((SELECT s.quantity FROM public.bf_stock s WHERE s.cafe_id=m.cafe_id AND s.warehouse_id=m.warehouse_id AND s.item_id=m.item_id),0),'name',i.name,'warehouse',w.name,$replacement$);
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
