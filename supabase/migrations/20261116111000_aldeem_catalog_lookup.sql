BEGIN;
CREATE FUNCTION public.aldeem_invoice_catalog_lookup(p_cafe_id uuid,p_query text DEFAULT '',p_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE term text; menu jsonb; items jsonb; metas jsonb; catalogs jsonb; categories jsonb;
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe_id) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND slug='khayal-aldeem')
 THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF length(coalesce(p_query,''))>100 OR coalesce(cardinality(p_ids),0)>100 THEN RAISE EXCEPTION 'Invalid lookup'; END IF;
 term:='%'||replace(replace(replace(btrim(coalesce(p_query,'')),E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO menu FROM (
  SELECT id,name,price,available,image_storage_path,category_id FROM public.menu_products
  WHERE cafe_id=p_cafe_id AND deleted_at IS NULL AND CASE WHEN cardinality(p_ids)>0 THEN id=ANY(p_ids)
  ELSE available AND (name ILIKE term OR description ILIKE term OR commerce_details->>'attributes' ILIKE term OR id::text=btrim(p_query)) END
  ORDER BY name,id LIMIT CASE WHEN cardinality(p_ids)>0 THEN cardinality(p_ids) ELSE 20 END
 ) r;
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO items FROM (
  SELECT i.id,i.name,i.sku,i.barcode,i.unit FROM public.bf_items i
  LEFT JOIN public.erp_inventory_items m ON m.cafe_id=i.cafe_id AND m.item_id=i.id
  WHERE i.cafe_id=p_cafe_id AND i.active AND CASE WHEN cardinality(p_ids)>0 THEN i.id=ANY(p_ids)
  ELSE i.name ILIKE term OR i.sku ILIKE term OR i.barcode ILIKE term OR i.unit ILIKE term OR i.id::text=btrim(p_query)
   OR m.payload->>'flavor' ILIKE term OR m.payload->>'weight' ILIKE term OR m.payload->>'description' ILIKE term OR m.payload->>'tags' ILIKE term OR m.payload->>'secondaryName' ILIKE term END
  ORDER BY i.name,i.id LIMIT CASE WHEN cardinality(p_ids)>0 THEN cardinality(p_ids) ELSE 20 END
 ) r;
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO metas FROM (
  SELECT item_id,kind,payload,category_id,unit_template_id FROM public.erp_inventory_items
  WHERE cafe_id=p_cafe_id AND status='active' AND item_id IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(items) x)
 ) r;
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO catalogs FROM (
  SELECT id,name,payload,active FROM public.erp_inventory_catalogs WHERE cafe_id=p_cafe_id AND id IN (
   SELECT (x->>'category_id')::uuid FROM jsonb_array_elements(metas) x UNION SELECT (x->>'unit_template_id')::uuid FROM jsonb_array_elements(metas) x)
 ) r;
 SELECT coalesce(jsonb_agg(r),'[]'::jsonb) INTO categories FROM (
  SELECT id,name FROM public.menu_categories WHERE cafe_id=p_cafe_id AND id IN(SELECT (x->>'category_id')::uuid FROM jsonb_array_elements(menu) x)
 ) r;
 RETURN jsonb_build_object('menu',menu,'items',items,'metas',metas,'catalogs',catalogs,'categories',categories);
END $$;
REVOKE ALL ON FUNCTION public.aldeem_invoice_catalog_lookup(uuid,text,uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_invoice_catalog_lookup(uuid,text,uuid[]) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
