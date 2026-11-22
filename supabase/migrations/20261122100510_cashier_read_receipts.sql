BEGIN;
SET LOCAL lock_timeout = '5s';

-- Queue rows carry stamp sync state. Scan receipts carry the committed invoice and earned
-- points, including transactions made before the brand last switched programs.
CREATE OR REPLACE FUNCTION public.get_owner_loyalty_reads(p_cafe_id uuid, p_page integer DEFAULT 1, p_status text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
BEGIN
  IF loyalty_audit_private.can_read(p_cafe_id) IS NOT TRUE
    OR platform_access_private.service_enabled(p_cafe_id,'loyalty') IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
    OR (p_status IS NOT NULL AND p_status NOT IN ('pending','processing','succeeded','failed','needs_review','duplicate')) THEN
    RAISE EXCEPTION 'Invalid read filters';
  END IF;

  WITH history AS MATERIALIZED (
    SELECT q.request_id, q.created_at, q.status, q.retryable, 'queue' AS source
    FROM loyalty_read_private.operations q WHERE q.cafe_id = p_cafe_id
    UNION ALL
    SELECT r.request_id, r.created_at,
      CASE WHEN r.result->>'status' = 'recent_scan' THEN 'duplicate' ELSE 'succeeded' END, false, r.operation
    FROM public.loyalty_scan_requests r
    WHERE r.cafe_id = p_cafe_id AND (
      (r.operation = 'points' AND r.result->>'status' = 'points_added') OR
      (r.operation = 'stamp' AND r.cashier_id IS NOT NULL AND r.result->>'status' IN ('stamped','reward_issued','recent_scan')
        AND NOT EXISTS (SELECT 1 FROM loyalty_read_private.operations q
          WHERE q.cafe_id = r.cafe_id AND q.request_id = r.request_id))
    )
  ), filtered AS (SELECT * FROM history WHERE p_status IS NULL OR status = p_status),
  page AS (SELECT * FROM filtered ORDER BY created_at DESC, request_id DESC, source LIMIT 25 OFFSET (p_page-1)*25),
  details AS (
    SELECT p.*, CASE WHEN p.source = 'queue' THEN loyalty_read_private.operation_json(q) || jsonb_build_object('kind','stamp')
      ELSE jsonb_build_object(
        'requestId',p.request_id, 'kind',p.source, 'status',p.status,
        'identifierHint',CASE WHEN length(r.target_code)>4 THEN '***'||right(r.target_code,4) ELSE '***' END,
        'cashierName',coalesce(k.full_name,''), 'customerName',coalesce(r.result->>'customerName',c.customer_name),
        'createdAt',p.created_at, 'completedAt',p.created_at, 'attempts',NULL,
        'errorCode',CASE WHEN p.status='duplicate' THEN 'recent_scan' END,
        'availableRewards',r.result->'availableRewards', 'rewardIssued',coalesce((r.result->>'rewardIssued')::boolean,false),
        'stampsInCycle',r.result->'stampsInCycle', 'purchasesRequired',r.result->'purchasesRequired',
        'invoiceAmountSar',r.result->'amountSar', 'pointsAdded',r.result->'pointsAdded'
      ) END AS item
    FROM page p
    LEFT JOIN loyalty_read_private.operations q ON p.source='queue' AND q.cafe_id=p_cafe_id AND q.request_id=p.request_id
    LEFT JOIN public.loyalty_scan_requests r ON p.source<>'queue' AND r.cafe_id=p_cafe_id AND r.request_id=p.request_id
    LEFT JOIN public.loyalty_cards c ON c.cafe_id=r.cafe_id AND c.card_code=r.target_code
    LEFT JOIN public.cafe_cashiers k ON k.cafe_id=r.cafe_id AND k.id=r.cashier_id
  )
  SELECT jsonb_build_object(
    'operations',coalesce((SELECT jsonb_agg(item ORDER BY created_at DESC,request_id DESC,source) FROM details),'[]'::jsonb),
    'total',(SELECT count(*) FROM filtered), 'page',p_page, 'pageSize',25,
    'summary',(SELECT jsonb_build_object(
      'pending',count(*) FILTER (WHERE status='pending'), 'processing',count(*) FILTER (WHERE status='processing'),
      'succeeded',count(*) FILTER (WHERE status='succeeded'), 'failed',count(*) FILTER (WHERE status='failed'),
      'needs_review',count(*) FILTER (WHERE status='needs_review'), 'duplicate',count(*) FILTER (WHERE status='duplicate'),
      'retryable',count(*) FILTER (WHERE status='failed' AND retryable)
    ) FROM history)
  ) INTO result;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.get_owner_loyalty_reads(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_loyalty_reads(uuid,integer,text) TO authenticated;
COMMIT;
