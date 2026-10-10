BEGIN;
-- Preserve the existing signed, service-only read bridge and its legacy gateway receipts
CREATE OR REPLACE FUNCTION public.pixis_baranda_summary(period_from date,period_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' SET statement_timeout='8s' AS $$
DECLARE result jsonb; starts_at timestamptz; ends_at timestamptz;
BEGIN
  IF period_from IS NULL OR period_to IS NULL OR period_from>period_to OR period_from<date '2000-01-01'
    OR period_to>date '2100-12-31' OR period_to-period_from>3660 THEN
    RAISE EXCEPTION 'Invalid reporting period' USING errcode='22023';
  END IF;
  starts_at:=period_from::timestamp AT TIME ZONE 'Asia/Riyadh';
  ends_at:=(period_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
  WITH legacy_confirmed AS (
    SELECT s.id,s.amount_sar,CASE WHEN r.status='approved' THEN r.reviewed_at ELSE s.paid_at END AS confirmed_at
    FROM public.subscriptions s LEFT JOIN public.subscription_payment_requests r
      ON r.id=s.payment_request_id AND r.approved_subscription_id=s.id
    WHERE s.amount_sar>0 AND ((r.status='approved' AND r.reviewed_at IS NOT NULL)
      OR (s.paid_at IS NOT NULL AND ((s.payment_provider='paypal' AND nullif(s.paypal_capture_id,'') IS NOT NULL)
        OR (s.payment_provider='paymob' AND nullif(s.paymob_transaction_id,'') IS NOT NULL))))
      AND COALESCE(s.activation_source,'') NOT IN ('admin_assignment','admin_manual_change','signup_default_plan')
      AND COALESCE(s.payment_provider,'') NOT IN ('admin','internal','pending')
      -- Match across all dates: the voucher's actual collection date owns this receipt
      AND NOT EXISTS(SELECT 1 FROM public.platform_finance_entries f WHERE f.kind='collection'
        AND (f.subscription_id=s.id OR f.subscription_request_id=r.id))
  ), period_finance AS (
    SELECT * FROM public.platform_finance_entries WHERE occurred_on BETWEEN period_from AND period_to
  ), brands AS (
    SELECT c.id,c.name,c.status,c.created_at,latest.plan_name_snapshot AS plan,latest.status::text AS subscription_status,latest.expires_at
    FROM public.cafes c LEFT JOIN LATERAL (
      SELECT s.plan_name_snapshot,s.status,s.expires_at FROM public.subscriptions s WHERE s.cafe_id=c.id
      ORDER BY s.created_at DESC,s.id DESC LIMIT 1
    ) latest ON true WHERE c.deleted_at IS NULL
  )
  SELECT jsonb_build_object(
    'clients',(SELECT count(*) FROM brands),
    'activeSubscriptions',(SELECT count(DISTINCT s.cafe_id) FROM public.subscriptions s JOIN public.cafes c ON c.id=s.cafe_id
      WHERE c.deleted_at IS NULL AND c.status='active' AND s.status::text IN ('active','trialing','paid')
        AND s.started_at<=now() AND (s.expires_at IS NULL OR s.expires_at>now()) AND (s.cancelled_at IS NULL OR s.cancelled_at>now())),
    'billedHalalas',NULL,
    'collectedHalalas',(SELECT COALESCE(sum(round(amount_sar*100)),0) FROM period_finance WHERE kind='collection')
      +(SELECT COALESCE(sum(round(amount_sar*100)),0) FROM legacy_confirmed WHERE confirmed_at>=starts_at AND confirmed_at<ends_at),
    'paidHalalas',(SELECT COALESCE(sum(round(amount_sar*100)),0) FROM period_finance WHERE kind='payment'),
    'financeEntries',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',id,'voucherNumber',voucher_number,'kind',kind,'category',category,'party',party,'description',description,
      'date',occurred_on,'amountHalalas',round(amount_sar*100),'currency',currency,'originalAmount',amount,'exchangeRate',exchange_rate,
      'reference',reference,'subscriptionId',subscription_id,'requestId',subscription_request_id
    ) ORDER BY occurred_on DESC,id),'[]'::jsonb) FROM (SELECT * FROM period_finance ORDER BY occurred_on DESC,id LIMIT 100) limited),
    'financeTruncated',(SELECT count(*)>100 FROM period_finance),
    'paymentCategories',(SELECT COALESCE(jsonb_agg(jsonb_build_object('category',category,'amountHalalas',total)),'[]'::jsonb)
      FROM (SELECT category,sum(round(amount_sar*100)) AS total FROM period_finance WHERE kind='payment' GROUP BY category) grouped),
    'generatedAt',now(),'source','baranda',
    'brands',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'plan',plan,
      'subscriptionStatus',subscription_status,'expiresAt',expires_at) ORDER BY created_at DESC,id),'[]'::jsonb)
      FROM (SELECT * FROM brands ORDER BY created_at DESC,id LIMIT 100) limited),
    'brandsTruncated',(SELECT count(*)>100 FROM brands)
  ) INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.pixis_baranda_summary(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pixis_baranda_summary(date,date) TO service_role;
COMMENT ON FUNCTION public.pixis_baranda_summary(date,date) IS
  'Signed group bridge: authoritative platform collections and payments by actual Riyadh date, deduplicated legacy gateway receipts, bounded ledger and full-period category totals. Private receipt paths and credentials excluded.';
COMMIT;
