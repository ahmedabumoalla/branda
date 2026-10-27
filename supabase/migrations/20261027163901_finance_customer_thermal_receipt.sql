-- Extend only the private receipt projection with fields already printed on the customer copy
BEGIN;
CREATE OR REPLACE FUNCTION brand_finance_private.customer_message_receipt(p_cafe uuid,p_document uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'brandName',c.name,'cafeId',c.id,'number',d.number,'createdAt',d.created_at,'localReference',d.local_reference,
  'subtotal',d.subtotal,'discount',d.discount,'tax',d.tax,'total',d.total,'paid',d.paid,
  'customerPhone',d.customer_phone,'customerName',p.name,'customerTaxNumber',p.tax_number,
  'note',d.note,'outstanding',state.value->'outstanding','refunded',state.value->'refunded',
  'refundedTotal',state.value->'refunded_total',
  'vatRate',d.vat_rate,'taxInclusive',d.tax_inclusive,
  'paymentMethod',CASE WHEN a.kind IN('cash','pos','bank') THEN a.kind ELSE '' END,
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'quantity',l.quantity,
    'unitPrice',l.unit_price,'net',l.net,'tax',l.tax) ORDER BY l.id)
   FROM public.bf_document_lines l WHERE l.cafe_id=p_cafe AND l.document_id=d.id),'[]'::jsonb))
 FROM public.bf_documents d JOIN public.cafes c ON c.id=d.cafe_id
 CROSS JOIN LATERAL (SELECT brand_finance_private.document_state(d.cafe_id,d.id) AS value) state
 LEFT JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id
 LEFT JOIN public.bf_accounts a ON a.cafe_id=d.cafe_id AND a.id=d.account_id
 WHERE d.cafe_id=p_cafe AND d.id=p_document AND d.kind='sale'
$$;
REVOKE ALL ON FUNCTION brand_finance_private.customer_message_receipt(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
