BEGIN;
CREATE OR REPLACE FUNCTION public.get_admin_operations_access_report(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_from timestamptz; v_to timestamptz; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='platform_admin' AND status='active') THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  IF p_from>p_to THEN RAISE EXCEPTION 'Invalid date range' USING ERRCODE='22023'; END IF;
  v_from:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';
  v_to:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
  WITH events AS (
    SELECT cafe_id,
      count(*) FILTER(WHERE event_type='brand_login') AS dashboard,
      count(*) FILTER(WHERE event_type='app_install_clicked') AS installs,
      count(*) FILTER(WHERE event_type='order_accepted') AS accepted,
      count(*) FILTER(WHERE event_type='order_rejected') AS rejected,
      count(*) FILTER(WHERE event_type='order_completed') AS completed,
      count(*) FILTER(WHERE event_type='order_not_completed') AS not_completed
    FROM public.cafe_operation_events
    WHERE (v_from IS NULL OR created_at>=v_from) AND (v_to IS NULL OR created_at<v_to)
      AND event_type IN ('brand_login','app_install_clicked','order_accepted','order_rejected','order_completed','order_not_completed')
    GROUP BY cafe_id
  ), logins AS (
    SELECT cafe_id,count(*) AS total FROM public.cafe_cashier_activity_logs
    WHERE action_type='login' AND (v_from IS NULL OR created_at>=v_from) AND (v_to IS NULL OR created_at<v_to)
    GROUP BY cafe_id
  )
  SELECT jsonb_build_object('from',p_from,'to',p_to,'brands',coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'metrics',jsonb_build_object(
      'dashboardLogins',coalesce(e.dashboard,0),'cashierLogins',coalesce(l.total,0),
      'appInstallClicks',coalesce(e.installs,0),'ordersAccepted',coalesce(e.accepted,0),
      'ordersRejected',coalesce(e.rejected,0),'ordersCompleted',coalesce(e.completed,0),
      'ordersNotCompleted',coalesce(e.not_completed,0))) ORDER BY c.id),'[]'::jsonb)) INTO v_result
  FROM public.cafes c LEFT JOIN events e ON e.cafe_id=c.id LEFT JOIN logins l ON l.cafe_id=c.id
  WHERE c.deleted_at IS NULL;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_admin_operations_access_report(date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_operations_access_report(date,date) TO authenticated;
COMMIT;
