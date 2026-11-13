BEGIN;
CREATE FUNCTION public.erp_system_backup(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE t record;rows jsonb;tables jsonb:='{}';total bigint:=0;BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);
 FOR t IN SELECT c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN('r','p') AND(c.relname LIKE 'erp\_%' ESCAPE '\' OR c.relname LIKE 'bf\_%' ESCAPE '\' OR c.relname='branches') AND c.relname NOT IN('erp_system_integrations','erp_system_api_keys','erp_system_api_usage') AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='cafe_id' AND NOT a.attisdropped) ORDER BY c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) FROM(SELECT * FROM public.%I WHERE cafe_id=$1 LIMIT 50001)x',t.relname) INTO rows USING p_cafe;
  IF jsonb_array_length(rows)>50000 THEN RAISE EXCEPTION 'حجم أحد سجلات النظام يتطلب نسخة مجدولة من الدعم';END IF;
  total:=total+octet_length(rows::text);IF total>80000000 THEN RAISE EXCEPTION 'حجم البيانات يتطلب نسخة مجدولة من الدعم';END IF;
  tables:=tables||jsonb_build_object(t.relname,rows);
 END LOOP;
 RETURN jsonb_build_object('format','branda-erp-backup-v1','createdAt',now(),'cafeId',p_cafe,'tables',tables,'exclusions',jsonb_build_array('Authentication and login credentials','API access keys and provider credentials','POS/menu/loyalty tables outside ERP','Storage buckets outside erp-record-files and erp-store-media'),'files',coalesce((SELECT jsonb_agg(jsonb_build_object('bucket',bucket_id,'path',name,'size',coalesce((metadata->>'size')::bigint,0))) FROM storage.objects WHERE bucket_id IN('erp-record-files','erp-store-media') AND split_part(name,'/',1)=p_cafe::text),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.erp_system_backup(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_backup(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
