BEGIN;

CREATE FUNCTION public.admin_brand_contact_report()
RETURNS TABLE (brand_id uuid, brand_name text, owner_phone text, joined_at timestamptz, account_status text,
  handoff_status text, trial_state text, trial_started_at timestamptz, trial_days integer, last_activity text, last_activity_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $report$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='platform_admin' AND p.status='active') THEN
    RAISE EXCEPTION 'Admin access denied' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
-- REPORT SELECT BEGIN
WITH brands AS (
  SELECT c.id,c.name,c.status,c.created_at,c.owner_user_id FROM public.cafes c WHERE c.deleted_at IS NULL
), members AS (
  SELECT c.id AS cafe_id,c.owner_user_id AS user_id FROM brands c
  UNION SELECT m.cafe_id,m.user_id FROM public.cafe_members m JOIN brands c ON c.id=m.cafe_id
), people AS (
  SELECT m.cafe_id,m.user_id FROM members m JOIN public.profiles p ON p.id=m.user_id WHERE p.role<>'platform_admin'
), cashiers AS (
  SELECT k.cafe_id,k.id FROM public.cafe_cashiers k JOIN brands c ON c.id=k.cafe_id
  LEFT JOIN public.profiles p ON p.id=k.owner_user_id LEFT JOIN public.profiles f ON f.id=k.finance_user_id
  WHERE p.role IS DISTINCT FROM 'platform_admin' AND f.role IS DISTINCT FROM 'platform_admin'
), member_events(cafe_id,user_id,at,label) AS (
  SELECT e.cafe_id,e.actor_id,e.created_at,CASE e.event_type
    WHEN 'brand_login' THEN 'دخول لوحة العلامة' WHEN 'order_accepted' THEN 'قبول طلب' WHEN 'order_rejected' THEN 'رفض طلب'
    WHEN 'order_completed' THEN 'إكمال طلب' WHEN 'order_not_completed' THEN 'تسجيل عدم إكمال طلب'
    WHEN 'app_install_clicked' THEN 'طلب تثبيت التطبيق' ELSE 'عملية من لوحة العلامة' END
  FROM public.cafe_operation_events e WHERE e.actor_type='brand_user'
  UNION ALL SELECT e.cafe_id,e.actor_id,e.created_at,CASE e.action
    WHEN 'create_bank_subscription_request' THEN 'طلب اشتراك بحوالة بنكية'
    WHEN 'respond_to_pickup_order' THEN 'الرد على طلب استلام' WHEN 'respond_to_reservation' THEN 'الرد على حجز'
    ELSE 'عملية مسجلة في سجل التدقيق' END FROM public.audit_logs e
  UNION ALL SELECT e.cafe_id,e.created_by,e.created_at,'تسجيل عملية على فاتورة' FROM public.bf_invoice_activity e
  UNION ALL SELECT e.cafe_id,e.actor_id,e.created_at,'تسجيل عملية خزينة' FROM public.bf_treasury_audit e
  UNION ALL SELECT e.cafe_id,e.actor,e.created_at,'تسجيل عملية شيكات' FROM public.erp_cheque_audit e
  UNION ALL SELECT e.cafe_id,e.created_by,e.created_at,'إضافة صنف إلى الكتالوج' FROM public.menu_products e
  UNION ALL SELECT e.cafe_id,e.actor_id,e.cancelled_at,'طلب إلغاء الحساب' FROM public.brand_account_cancellations e
), cashier_events(cafe_id,cashier_id,at,label) AS (
  SELECT e.cafe_id,e.actor_id,e.created_at,CASE e.event_type
    WHEN 'cashier_login' THEN 'دخول الكاشير' WHEN 'order_accepted' THEN 'قبول طلب من الكاشير'
    WHEN 'order_rejected' THEN 'رفض طلب من الكاشير' WHEN 'order_completed' THEN 'إكمال طلب من الكاشير'
    WHEN 'order_not_completed' THEN 'تسجيل عدم إكمال طلب من الكاشير' ELSE 'عملية من الكاشير' END
  FROM public.cafe_operation_events e WHERE e.actor_type='cashier'
  UNION ALL SELECT e.cafe_id,e.cashier_id,e.created_at,CASE e.action_type
    WHEN 'login' THEN 'دخول الكاشير' WHEN 'logout' THEN 'خروج الكاشير' WHEN 'order_received' THEN 'استلام طلب من الكاشير'
    WHEN 'reservation_received' THEN 'استلام حجز من الكاشير' WHEN 'loyalty_stamp' THEN 'تسجيل ختم ولاء'
    WHEN 'loyalty_redeem' THEN 'صرف مكافأة ولاء' WHEN 'scan_failed' THEN 'محاولة قراءة بطاقة ولاء' ELSE 'عملية كاشير مسجلة' END
  FROM public.cafe_cashier_activity_logs e WHERE coalesce(e.details->>'actorType','') NOT IN ('platform_admin','system')
  UNION ALL SELECT e.cafe_id,e.cashier_id,e.occurred_at,CASE
    WHEN e.outcome<>'success' THEN 'محاولة قراءة بطاقة ولاء' WHEN e.kind='stamp' THEN 'تسجيل ختم ولاء'
    WHEN e.kind='redeem' THEN 'صرف مكافأة ولاء' ELSE 'قراءة بطاقة ولاء' END
  FROM public.loyalty_activity_events e WHERE e.actor_type IN ('cashier','owner')
), events AS (
  SELECT e.cafe_id,e.at,e.label FROM member_events e JOIN people p USING (cafe_id,user_id)
  UNION ALL SELECT e.cafe_id,e.at,e.label FROM cashier_events e JOIN cashiers k ON k.cafe_id=e.cafe_id AND k.id=e.cashier_id
  UNION ALL SELECT c.id,u.last_sign_in_at,'دخول صاحب الحساب' FROM brands c
    JOIN people p ON p.cafe_id=c.id AND p.user_id=c.owner_user_id JOIN auth.users u ON u.id=c.owner_user_id
    WHERE u.last_sign_in_at>=c.created_at AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id=u.id AND m.cafe_id<>c.id)
), latest AS (
  SELECT DISTINCT ON (e.cafe_id) e.cafe_id,e.at,e.label FROM events e WHERE e.at IS NOT NULL ORDER BY e.cafe_id,e.at DESC,e.label
), trials AS (
  -- Original trial, including recorded historical trials subsequently cancelled. Same start:
  -- use the longest recorded initial package term, never add parallel package durations.
  SELECT DISTINCT ON (s.cafe_id) s.cafe_id,s.started_at,calc.days
  FROM public.subscriptions s
  CROSS JOIN LATERAL (SELECT CASE
    WHEN s.duration_unit='day' AND s.duration_count>0 THEN s.duration_count::integer
    WHEN s.expires_at>s.started_at THEN ceil(extract(epoch FROM s.expires_at-s.started_at)/86400)::integer END AS days) calc
  WHERE s.started_at IS NOT NULL AND s.activation_source IS DISTINCT FROM 'admin_prepared_trial'
    AND (s.status='trialing' OR s.activation_source IN ('admin_whatsapp_trial','verified_owner_signup','signup_default_plan','owner_authorized_finance_trial_7d'))
  ORDER BY s.cafe_id,s.started_at,calc.days DESC NULLS LAST,s.id
), pending AS (
  -- A prepared row may still contain the original seven-day placeholder. The v2
  -- handoff (migration 20261118000100) determines the actual term when accepted.
  SELECT s.cafe_id,max(coalesce((h.welcome_trial_policy->>s.plan_id)::integer,
    CASE WHEN s.plan_id IN ('-','starter','pro','plan-b523d348') THEN 30 ELSE 7 END)) AS planned_days
  FROM public.subscriptions s JOIN public.platform_plans pp ON pp.id=s.plan_id AND pp.active
  JOIN brand_onboarding_private.accounts h ON h.cafe_id=s.cafe_id AND h.state IN ('ready','sending','uncertain')
  WHERE s.activation_source='admin_prepared_trial' AND s.status='trialing'
    AND coalesce(s.amount_sar,0)=0 AND s.paid_at IS NULL
    AND (s.started_at IS NULL OR s.started_at<=now()) AND (s.expires_at IS NULL OR s.expires_at>now())
    AND NOT EXISTS (SELECT 1 FROM public.subscriptions a JOIN public.platform_plans ap ON ap.id=a.plan_id AND ap.active
      WHERE a.cafe_id=s.cafe_id AND (a.status='active' OR (a.status='trialing' AND a.activation_source IS DISTINCT FROM 'admin_prepared_trial'))
        AND (a.started_at IS NULL OR a.started_at<=now()) AND (a.expires_at IS NULL OR a.expires_at>now()))
  GROUP BY s.cafe_id
)
SELECT c.id AS brand_id,c.name::text AS brand_name,
  coalesce(nullif(btrim(cs.owner_phone),''),nullif(btrim(p.phone),''),nullif(btrim(u.phone),'')) AS owner_phone,
  c.created_at AS joined_at,CASE WHEN cancel.cafe_id IS NOT NULL THEN 'ملغى بطلب المستخدم' WHEN c.status IN ('active','published') THEN 'نشط'
    WHEN c.status='suspended' THEN 'موقوف' WHEN c.status='archived' THEN 'مؤرشف' ELSE c.status::text END AS account_status,
  CASE WHEN hand.state='sent' THEN 'أرسلت بيانات الدخول' WHEN hand.state='sending' THEN 'إرسال بيانات الدخول قيد التنفيذ'
    WHEN hand.state='uncertain' THEN 'نتيجة إرسال بيانات الدخول غير مؤكدة' WHEN hand.cafe_id IS NOT NULL THEN 'بانتظار إرسال بيانات الدخول'
    WHEN EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.cafe_id=c.id AND s.activation_source='verified_owner_signup') THEN 'تسجيل ذاتي موثّق'
    ELSE 'لا يوجد سجل تسليم' END AS handoff_status,
  CASE WHEN t.cafe_id IS NOT NULL THEN 'بدأت التجربة' WHEN pending.cafe_id IS NOT NULL THEN 'بانتظار بدء التجربة' ELSE 'لا توجد تجربة مسجلة' END AS trial_state,
  t.started_at AS trial_started_at,CASE WHEN t.cafe_id IS NOT NULL THEN t.days ELSE pending.planned_days END AS trial_days,
  latest.label AS last_activity,latest.at AS last_activity_at
FROM brands c LEFT JOIN public.cafe_settings cs ON cs.cafe_id=c.id LEFT JOIN public.profiles p ON p.id=c.owner_user_id
LEFT JOIN auth.users u ON u.id=c.owner_user_id LEFT JOIN public.brand_account_cancellations cancel ON cancel.cafe_id=c.id
LEFT JOIN brand_onboarding_private.accounts hand ON hand.cafe_id=c.id LEFT JOIN trials t ON t.cafe_id=c.id
LEFT JOIN pending ON pending.cafe_id=c.id LEFT JOIN latest ON latest.cafe_id=c.id
-- REPORT SELECT END
  ;
END $report$;
REVOKE ALL ON FUNCTION public.admin_brand_contact_report() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.admin_brand_contact_report() TO authenticated;

COMMIT;
