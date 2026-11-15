DO $$DECLARE c record; j jsonb; expected jsonb; total integer:=0; blocked integer:=0;BEGIN
 FOR c IN SELECT id FROM public.cafes LOOP
  j:=public.brand_service_access_snapshot(c.id);total:=total+1;
  IF public.brand_account_not_cancelled(c.id) IS DISTINCT FROM true THEN
   IF j<>jsonb_build_object('allowed',false,'subscriptions','[]'::jsonb,'overrides','[]'::jsonb) THEN RAISE EXCEPTION 'Blocked brand contract changed';END IF;
   blocked:=blocked+1;CONTINUE;
  END IF;
  IF j->'allowed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Active brand blocked';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('plan_id',s.plan_id,'status',s.status,'started_at',s.started_at,'expires_at',s.expires_at,'platform_plans',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('name',p.name,'features',p.features,'active',p.active) END) ORDER BY s.created_at DESC),'[]'::jsonb) INTO expected
   FROM public.subscriptions s LEFT JOIN public.platform_plans p ON p.id=s.plan_id WHERE s.cafe_id=c.id AND s.status IN('active','trialing');
  IF j->'subscriptions' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Subscription payload/order changed';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('feature_id',o.feature_id,'enabled',o.enabled)),'[]'::jsonb) INTO expected FROM public.brand_feature_overrides o WHERE o.cafe_id=c.id;
  IF j->'overrides' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Override payload changed';END IF;
 END LOOP;
 IF public.brand_service_access_snapshot('00000000-0000-4000-8000-000000000099')->'allowed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Missing brand must fail closed';END IF;
 IF has_function_privilege('anon','public.brand_service_access_snapshot(uuid)','execute') OR has_function_privilege('authenticated','public.brand_service_access_snapshot(uuid)','execute') OR NOT has_function_privilege('service_role','public.brand_service_access_snapshot(uuid)','execute') THEN RAISE EXCEPTION 'Invalid grants';END IF;
 SET LOCAL ROLE authenticated;
 BEGIN PERFORM public.brand_service_access_snapshot('00000000-0000-4000-8000-000000000099');RAISE EXCEPTION 'Authenticated bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RESET ROLE;
 SET LOCAL ROLE service_role;PERFORM public.brand_service_access_snapshot('00000000-0000-4000-8000-000000000099');RESET ROLE;
 PERFORM set_config('service_access.probe',jsonb_build_object('passed',true,'brands',total,'blockedBrands',blocked,'grants',true,'actualRoleCalls',true,'unknownBrandDenied',true)::text,true);
END$$;
SELECT current_setting('service_access.probe')::jsonb AS result;
