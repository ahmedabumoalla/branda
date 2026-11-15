BEGIN;

-- A read-only projection: complete documents AND control-account entries, including
-- fully paid invoices which never created a receivable/payable journal line.
CREATE FUNCTION public.finance_party_account_statement(p_cafe uuid,p_party uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE party public.bf_parties%ROWTYPE; branch uuid; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE='42501'; END IF;
 SELECT * INTO party FROM public.bf_parties WHERE cafe_id=p_cafe AND id=p_party;
 IF party.id IS NULL OR party.kind NOT IN('supplier','customer') THEN
  RAISE EXCEPTION 'الحساب غير متاح' USING ERRCODE='42501';
 END IF;
 IF party.kind='supplier' THEN PERFORM erp_purchase_private.authorize(p_cafe,'read');
 ELSE PERFORM erp_customer_private.authorize(p_cafe,'read'); END IF;
 branch:=erp_branch_private.current_branch(p_cafe);
 PERFORM erp_branch_private.assert_resource(p_cafe,branch,party.kind,p_party);

 WITH ledger AS MATERIALIZED (
  SELECT j.document_id,sum(j.debit) debit,sum(j.credit) credit,
   string_agg(DISTINCT nullif(j.memo,''),' / ') memo
  FROM public.bf_journal j
  JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id
  WHERE j.cafe_id=p_cafe AND j.party_id=p_party AND a.kind IN('receivable','payable')
  GROUP BY j.document_id
 ), ids AS (
  SELECT id FROM public.bf_documents WHERE cafe_id=p_cafe AND party_id=p_party
  UNION SELECT document_id FROM ledger
 ), docs AS MATERIALIZED (
  SELECT d.*,l.debit,l.credit,l.memo ledger_memo
  FROM ids JOIN public.bf_documents raw ON raw.id=ids.id AND raw.cafe_id=p_cafe
  CROSS JOIN LATERAL brand_finance_private.payment_document(raw) d
  LEFT JOIN ledger l ON l.document_id=d.id
  WHERE erp_branch_private.row_allowed(p_cafe,branch,to_jsonb(d))
 ), entries AS (
  SELECT d.id,d.number,d.kind,d.created_at AS date,
   (d.created_at AT TIME ZONE 'Asia/Riyadh')::date AS day,
   d.reference_id AS "referenceId",coalesce(d.ledger_memo,nullif(d.note,''),'') AS memo,
   d.total AS amount,d.paid AS "initialPaid",
   coalesce(d.debit,0) AS debit,coalesce(d.credit,0) AS credit,
   CASE WHEN d.kind IN('sale','purchase') THEN
    greatest(0,d.total-coalesce((st.value->>'refunded_total')::numeric,0)-coalesce((st.value->>'outstanding')::numeric,0))
    ELSE 0 END AS "paidToDate",
   coalesce((st.value->>'outstanding')::numeric,0) AS outstanding,
   coalesce((st.value->>'refunded_total')::numeric,0) AS refunded,
   EXISTS(SELECT 1 FROM public.bf_journal j WHERE j.cafe_id=p_cafe AND j.document_id=d.id) AS "hasJournal"
  FROM docs d LEFT JOIN LATERAL (
   SELECT brand_finance_private.document_state(p_cafe,d.id) value WHERE d.kind IN('sale','purchase')
  ) st ON true
 )
 SELECT jsonb_build_object('party',jsonb_build_object('id',party.id,'name',party.name,'kind',party.kind),
  'branch',erp_branch_private.scope(p_cafe),
  'rows',coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.date,e.number,e.id),'[]'::jsonb),
  'generatedAt',clock_timestamp()) INTO result FROM entries e;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_party_account_statement(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.finance_party_account_statement(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.finance_party_account_statement(uuid,uuid) IS 'Authorized branch-scoped full party documents and actual receivable/payable movements; read-only, no retained test records';
NOTIFY pgrst,'reload schema';
COMMIT;
