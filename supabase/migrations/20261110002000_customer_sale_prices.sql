BEGIN;

CREATE INDEX bf_documents_customer_sales ON public.bf_documents(cafe_id,party_id,created_at DESC,number DESC) WHERE kind='sale';

-- Read-only customer history, using posted POS and company sales, never drafts.
CREATE FUNCTION public.brand_finance_customer_sale_prices(p_cafe_id uuid,p_customer_id uuid,p_product_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN ('owner','manager','accountant') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  IF p_product_ids IS NULL OR cardinality(p_product_ids) NOT BETWEEN 1 AND 100 OR array_position(p_product_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid products' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=p_customer_id AND kind='customer') THEN
    RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';
  END IF;
  WITH eligible AS (
    SELECT l.product_id,l.unit_price,d.id,d.created_at,d.number,d.tax_inclusive
    FROM public.bf_documents d JOIN public.bf_document_lines l ON l.cafe_id=d.cafe_id AND l.document_id=d.id
    WHERE d.cafe_id=p_cafe_id AND d.party_id=p_customer_id AND d.kind='sale' AND l.product_id=ANY(p_product_ids)
      -- Fully returned lines and legacy full refunds are not an active sale price.
      AND NOT EXISTS(SELECT 1 FROM public.bf_documents r JOIN public.bf_document_lines rl ON rl.cafe_id=r.cafe_id AND rl.document_id=r.id
        WHERE r.cafe_id=p_cafe_id AND r.reference_id=d.id AND r.kind='refund' AND rl.reference_line_id IS NULL)
      AND l.quantity>coalesce((SELECT sum(rl.quantity) FROM public.bf_document_lines rl JOIN public.bf_documents r ON r.cafe_id=rl.cafe_id AND r.id=rl.document_id
        WHERE rl.cafe_id=p_cafe_id AND rl.reference_line_id=l.id AND r.reference_id=d.id AND r.kind='refund'),0)
  ), latest AS (
    SELECT DISTINCT ON(product_id) product_id,id FROM eligible ORDER BY product_id,created_at DESC,number DESC
  ), prices AS (
    SELECT e.product_id,min(e.unit_price) price,max(e.unit_price) max_price,e.created_at,e.tax_inclusive
    FROM eligible e JOIN latest x ON x.product_id=e.product_id AND x.id=e.id
    GROUP BY e.product_id,e.id,e.created_at,e.tax_inclusive
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('productId',product_id,'price',price,'maxPrice',max_price,'soldAt',created_at,'taxInclusive',tax_inclusive) ORDER BY product_id),'[]'::jsonb) INTO result FROM prices;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_customer_sale_prices(uuid,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.brand_finance_customer_sale_prices(uuid,uuid,uuid[]) TO authenticated;
COMMIT;
