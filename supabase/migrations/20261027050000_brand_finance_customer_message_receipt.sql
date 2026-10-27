-- CLI scaffold 20261027020312 ordered after the published finance control migrations
-- Forward-only additive receipt projection; existing queue leases and outcomes are unchanged
BEGIN;
CREATE FUNCTION brand_finance_private.customer_message_receipt(p_cafe uuid,p_document uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'brandName',c.name,'number',d.number,'createdAt',d.created_at,'localReference',d.local_reference,
  'subtotal',d.subtotal,'discount',d.discount,'tax',d.tax,'total',d.total,'paid',d.paid,
  'vatRate',d.vat_rate,'taxInclusive',d.tax_inclusive,
  'paymentMethod',CASE WHEN a.kind IN('cash','pos','bank') THEN a.kind ELSE '' END,
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,
    'unitPrice',l.unit_price,'net',l.net,'tax',l.tax) ORDER BY l.id)
   FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe AND l.document_id=d.id),'[]'::jsonb))
 FROM public.bf_documents d JOIN public.cafes c ON c.id=d.cafe_id
 LEFT JOIN public.bf_accounts a ON a.cafe_id=d.cafe_id AND a.id=d.account_id
 WHERE d.cafe_id=p_cafe AND d.id=p_document AND d.kind='sale'
$$;
REVOKE ALL ON FUNCTION brand_finance_private.customer_message_receipt(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE source text; needle text:=$anchor$'cardCode',lc.card_code)$anchor$; BEGIN
 SELECT pg_get_functiondef('public.brand_finance_claim_customer_messages(uuid,integer)'::regprocedure) INTO source;
 IF strpos(source,needle)=0 OR strpos(substr(source,strpos(source,needle)+length(needle)),needle)>0 THEN
  RAISE EXCEPTION 'Unexpected customer message claim projection';
 END IF;
 EXECUTE replace(source,needle,$replace$'cardCode',lc.card_code,'receipt',brand_finance_private.customer_message_receipt(j.cafe_id,j.document_id))$replace$);
END $$;
-- No RPC grants, queue rows, financial rows or customer/loyalty records are changed
COMMIT;
