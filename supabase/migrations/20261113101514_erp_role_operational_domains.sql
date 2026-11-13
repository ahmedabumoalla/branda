BEGIN;
-- Preserve any domain added by a concurrently reviewed migration.
DO $$DECLARE domains text[];definition text;BEGIN
 SELECT array_agg(domain ORDER BY position) INTO domains FROM (SELECT domain,min(position) AS position FROM unnest(erp_access_private.domains()||ARRAY['work_orders','payroll']) WITH ORDINALITY t(domain,position) GROUP BY domain) x;
 EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',domains);
 UPDATE public.erp_roles SET permissions=jsonb_build_object('work_orders',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false),'payroll',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false))||permissions;
 definition:=pg_get_functiondef('public.erp_roles(uuid,text,jsonb,uuid)'::regprocedure);
 IF position('domain NOT IN(''hr'',''organization'',''custody'',''attendance'')' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected employee role restriction; review before extending';END IF;
 EXECUTE replace(definition,'domain NOT IN(''hr'',''organization'',''custody'',''attendance'')','domain NOT IN(''hr'',''organization'',''custody'',''attendance'',''payroll'')');
END $$;
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_operational_extension;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type='work_order' THEN 'work_orders' WHEN p_type='payroll_record' THEN 'payroll' WHEN p_type IN('attendance_leave','attendance_sheet','attendance_session') THEN 'attendance' ELSE erp_access_private.file_domain_before_operational_extension(p_type) END$$;
REVOKE ALL ON FUNCTION erp_access_private.file_domain(text),erp_access_private.file_domain_before_operational_extension(text) FROM PUBLIC,anon,authenticated,service_role;
-- Future module migrations already invoke the same guard; guard any installed version too.
SELECT erp_access_private.install_guard('erp_work_orders_read','work_orders','PERFORM erp_access_private.assert_allowed(p_cafe_id,''work_orders'',''read'');');
SELECT erp_access_private.install_guard('erp_work_order_targets','work_orders','PERFORM erp_access_private.assert_allowed(p_cafe_id,''work_orders'',''read'');');
SELECT erp_access_private.install_guard('erp_work_orders_write','work_orders','PERFORM erp_access_private.assert_allowed(p_cafe_id,''work_orders'',CASE WHEN p_action=''settings'' THEN ''settings'' WHEN p_action=''delete'' THEN ''delete'' WHEN p_action=''save'' AND coalesce((p_payload->>''revision'')::integer,0)=0 OR p_action=''copy'' THEN ''create'' WHEN p_action IN(''status'',''financial'',''invoice'',''advance'',''debit'') THEN ''approve'' ELSE ''update'' END);');
-- Payroll read/write/import retain their existing finance role ceiling and explicit internal action guard.
-- Service-only renew_due is deliberately untouched and receives no authenticated grant.
SELECT erp_access_private.install_guard('erp_payroll_read','payroll','PERFORM erp_access_private.assert_allowed(p_cafe_id,''payroll'',''read'');');
SELECT erp_access_private.install_guard('erp_payroll_import','payroll','PERFORM erp_access_private.assert_allowed(p_cafe_id,''payroll'',''create'');');
NOTIFY pgrst,'reload schema';
COMMIT;
