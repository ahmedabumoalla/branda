BEGIN;
ALTER FUNCTION erp_reports_private.settings_facts(uuid,text,date,date) RENAME TO settings_facts_before_system_usage;
CREATE FUNCTION erp_reports_private.settings_facts(c uuid,s text,f date,t date)
RETURNS SETOF jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RETURN QUERY SELECT * FROM erp_reports_private.settings_facts_before_system_usage(c,s,f,t);
 IF s='ai-usage' THEN
  RETURN QUERY SELECT erp_reports_private.fact('copilot:'||u.id::text,(u.created_at AT TIME ZONE 'Asia/Riyadh')::date,
   jsonb_build_object('employee',coalesce(st.name,'المالك'),'employeeId',k.created_by,
    'type',u.method||' / '||CASE u.resource WHEN 'customers' THEN 'العملاء' WHEN 'invoices' THEN 'الفواتير' WHEN 'inventory' THEN 'المخزون' WHEN 'requests' THEN 'الطلبات' ELSE u.resource END,
    'quantity',1,'status',u.status::text))
  FROM public.erp_system_api_usage u
  JOIN public.erp_system_api_keys k ON k.cafe_id=u.cafe_id AND k.id=u.key_id
  LEFT JOIN public.bf_staff st ON st.cafe_id=k.cafe_id AND st.user_id=k.created_by
  WHERE u.cafe_id=c AND u.purpose='copilot' AND (u.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN f AND t;
 ELSIF s='activity' THEN
  RETURN QUERY SELECT erp_reports_private.fact('erp_system_events:'||e.id::text,(e.created_at AT TIME ZONE 'Asia/Riyadh')::date,
   jsonb_build_object('employee',coalesce(st.name,'المالك'),'employeeId',e.actor,'type','إعدادات النظام','name',e.action,'note',''))
  FROM public.erp_system_events e LEFT JOIN public.bf_staff st ON st.cafe_id=e.cafe_id AND st.user_id=e.actor
  WHERE e.cafe_id=c AND (e.created_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN f AND t;
 END IF;
END $$;
UPDATE erp_reports_private.catalog SET definition=jsonb_set(definition,'{basis}',to_jsonb('الكمية هي عدد طلبات المساعد المسجلة ورمز الحالة هو نتيجة واجهة الربط ولا تمثل رموز النموذج أو خصم عملات أو تكلفة اشتراك خارجي'::text)) WHERE id='ai-consumption';
REVOKE ALL ON FUNCTION erp_reports_private.settings_facts(uuid,text,date,date),erp_reports_private.settings_facts_before_system_usage(uuid,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
