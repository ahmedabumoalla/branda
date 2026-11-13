BEGIN;
DO $$DECLARE domains text[];BEGIN
 SELECT array_agg(domain ORDER BY position) INTO domains FROM (SELECT domain,min(position) AS position FROM unnest(erp_access_private.domains()||ARRAY['workflows','time']) WITH ORDINALITY t(domain,position) GROUP BY domain) x;
 EXECUTE format('CREATE OR REPLACE FUNCTION erp_access_private.domains() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path='''' AS $f$SELECT %L::text[]$f$',domains);
 UPDATE public.erp_roles SET permissions=jsonb_build_object('workflows',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false),'time',jsonb_build_object('read',false,'create',false,'update',false,'delete',false,'approve',false,'settings',false,'files',false))||permissions;
END$$;
ALTER FUNCTION erp_access_private.file_domain(text) RENAME TO file_domain_before_workflows;
CREATE FUNCTION erp_access_private.file_domain(p_type text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN p_type IN('workflow_record','workflow_child') THEN 'workflows' ELSE erp_access_private.file_domain_before_workflows(p_type) END$$;
REVOKE ALL ON FUNCTION erp_access_private.file_domain(text),erp_access_private.file_domain_before_workflows(text) FROM PUBLIC,anon,authenticated,service_role;
SELECT erp_access_private.install_guard('erp_workflows_read','workflows','PERFORM erp_access_private.assert_allowed(p_cafe_id,''workflows'',''read'');');
SELECT erp_access_private.install_guard('erp_workflow_targets','workflows','PERFORM erp_access_private.assert_allowed(p_cafe_id,''workflows'',''read'');');
SELECT erp_access_private.install_guard('erp_workflows_write','workflows','PERFORM erp_access_private.assert_allowed(p_cafe_id,''workflows'',CASE WHEN p_action IN(''settings'',''type'',''model'') OR p_action=''delete'' AND p_payload->>''entity'' IN(''type'',''model'') THEN ''settings'' WHEN p_action=''delete'' THEN ''delete'' WHEN p_action IN(''record'',''child'',''activity'') AND coalesce((p_payload->>''revision'')::integer,0)=0 OR p_action=''copy'' THEN ''create'' WHEN p_action IN(''status'',''financial'',''invoice'',''advance'',''debit'') THEN ''approve'' ELSE ''update'' END);');
-- Time tracking is registered denied-by-default now; its own forthcoming migration installs the RPC guards.
NOTIFY pgrst,'reload schema';
COMMIT;
