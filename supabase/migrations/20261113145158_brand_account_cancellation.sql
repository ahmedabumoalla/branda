BEGIN;
CREATE SCHEMA brand_cancellation_private;
REVOKE ALL ON SCHEMA brand_cancellation_private FROM PUBLIC,anon,authenticated;
CREATE TABLE public.brand_account_cancellations(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 actor_name text NOT NULL,
 cancelled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 origin text NOT NULL DEFAULT 'user' CHECK(origin='user'),
 reason text NOT NULL DEFAULT '' CHECK(length(reason)<=1000),
 slug text NOT NULL,
 name text NOT NULL,
 request_id uuid NOT NULL UNIQUE
);
ALTER TABLE public.brand_account_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_account_cancellations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.brand_account_cancellations TO authenticated;
CREATE POLICY cancellation_admin_read ON public.brand_account_cancellations FOR SELECT TO authenticated USING(public.is_platform_admin());
CREATE TABLE public.brand_archive_assets(cafe_id uuid NOT NULL REFERENCES public.brand_account_cancellations(cafe_id),bucket text NOT NULL,path text NOT NULL,PRIMARY KEY(cafe_id,bucket,path));
ALTER TABLE public.brand_archive_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_archive_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.brand_archive_assets TO authenticated;
CREATE POLICY archive_assets_admin_read ON public.brand_archive_assets FOR SELECT TO authenticated USING(public.is_platform_admin());

CREATE FUNCTION brand_cancellation_private.cancelled(p_cafe uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.brand_account_cancellations WHERE cafe_id=p_cafe);
$$;
REVOKE ALL ON FUNCTION brand_cancellation_private.cancelled(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Preserve every existing authorization rule, then remove access to this tenant only.
DO $$DECLARE r record;d text;BEGIN
 FOR r IN SELECT * FROM (VALUES('public','is_cafe_owner','uuid'),('public','has_cafe_access','uuid'),('public','has_cafe_permission','uuid,text'),('platform_access_private','service_enabled','uuid,text'))x(s,n,a) LOOP
  d:=pg_get_functiondef(to_regprocedure(format('%I.%I(%s)',r.s,r.n,r.a)));
  IF d IS NULL THEN RAISE EXCEPTION 'Missing cancellation access contract';END IF;
  EXECUTE replace(d,format('FUNCTION %I.%I(',r.s,r.n),format('FUNCTION brand_cancellation_private.%I(',r.n||'_previous'));
  EXECUTE format('REVOKE ALL ON FUNCTION brand_cancellation_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',r.n||'_previous',r.a);
 END LOOP;
END $$;

CREATE FUNCTION brand_cancellation_private.capture_assets(c uuid,s text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record;BEGIN
 INSERT INTO public.brand_archive_assets SELECT c,o.bucket_id,o.name FROM storage.objects o WHERE split_part(o.name,'/',1) IN(c::text,s) OR (split_part(o.name,'/',1) IN('brands','cafes') AND split_part(o.name,'/',2) IN(c::text,s)) ON CONFLICT DO NOTHING;
 -- Exact database references cover assets whose prefix is a record/user id.
 FOR r IN SELECT t.relname,a.attname FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace JOIN pg_attribute a ON a.attrelid=t.oid AND NOT a.attisdropped AND a.attnum>0 WHERE n.nspname='public' AND t.relkind='r' AND t.relname NOT IN('brand_archive_assets','brand_account_cancellations') AND a.atttypid='text'::regtype AND (a.attname LIKE '%storage_path' OR a.attname IN('path','receipt_path','image_path')) AND EXISTS(SELECT 1 FROM pg_attribute ca WHERE ca.attrelid=t.oid AND ca.attname='cafe_id' AND ca.atttypid='uuid'::regtype AND NOT ca.attisdropped) LOOP
  EXECUTE format('INSERT INTO public.brand_archive_assets SELECT $1,o.bucket_id,o.name FROM public.%I t JOIN storage.objects o ON o.name=t.%I WHERE t.cafe_id=$1 ON CONFLICT DO NOTHING',r.relname,r.attname) USING c;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION brand_cancellation_private.capture_assets(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.brand_archive_storage_object(p_bucket text,p_path text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.brand_archive_assets a WHERE a.bucket=p_bucket AND a.path=p_path) OR EXISTS(SELECT 1 FROM public.brand_account_cancellations a WHERE split_part(p_path,'/',1) IN(a.cafe_id::text,a.slug) OR (split_part(p_path,'/',1) IN('brands','cafes') AND split_part(p_path,'/',2) IN(a.cafe_id::text,a.slug)));
$$;
REVOKE ALL ON FUNCTION public.brand_archive_storage_object(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_archive_storage_object(text,text) TO anon,authenticated,service_role;
CREATE FUNCTION brand_cancellation_private.guard_storage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF TG_OP<>'INSERT' AND public.brand_archive_storage_object(OLD.bucket_id,OLD.name) THEN RAISE EXCEPTION 'Archived brand files must be retained' USING ERRCODE='42501';END IF;
 IF TG_OP<>'DELETE' AND public.brand_archive_storage_object(NEW.bucket_id,NEW.name) THEN RAISE EXCEPTION 'Archived brand files are read only' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_cancellation_private.guard_storage() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER brand_archive_storage_guard BEFORE INSERT OR UPDATE OR DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_storage();
CREATE POLICY brand_archive_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(NOT public.brand_archive_storage_object(bucket_id,name));
CREATE POLICY brand_archive_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING(NOT public.brand_archive_storage_object(bucket_id,name)) WITH CHECK(NOT public.brand_archive_storage_object(bucket_id,name));
CREATE POLICY brand_archive_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(NOT public.brand_archive_storage_object(bucket_id,name));
CREATE POLICY brand_archive_admin_download ON storage.objects FOR SELECT TO authenticated USING(public.is_platform_admin() AND public.brand_archive_storage_object(bucket_id,name));
CREATE POLICY brand_archive_read_scope ON storage.objects AS RESTRICTIVE FOR SELECT TO anon,authenticated USING(NOT public.brand_archive_storage_object(bucket_id,name) OR public.is_platform_admin());
CREATE OR REPLACE FUNCTION public.is_cafe_owner(p_cafe_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT brand_cancellation_private.cancelled(p_cafe_id) AND brand_cancellation_private.is_cafe_owner_previous(p_cafe_id);
$$;
CREATE OR REPLACE FUNCTION public.has_cafe_access(p_cafe_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_platform_admin() OR (NOT brand_cancellation_private.cancelled(p_cafe_id) AND brand_cancellation_private.has_cafe_access_previous(p_cafe_id));
$$;
CREATE OR REPLACE FUNCTION public.has_cafe_permission(p_cafe_id uuid,p_permission text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_platform_admin() OR (NOT brand_cancellation_private.cancelled(p_cafe_id) AND brand_cancellation_private.has_cafe_permission_previous(p_cafe_id,p_permission));
$$;
CREATE OR REPLACE FUNCTION platform_access_private.service_enabled(p_cafe_id uuid,p_feature text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT brand_cancellation_private.cancelled(p_cafe_id) AND brand_cancellation_private.service_enabled_previous(p_cafe_id,p_feature);
$$;
REVOKE ALL ON FUNCTION public.is_cafe_owner(uuid),public.has_cafe_access(uuid),public.has_cafe_permission(uuid,text),platform_access_private.service_enabled(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_cafe_owner(uuid),public.has_cafe_access(uuid),public.has_cafe_permission(uuid,text),platform_access_private.service_enabled(uuid,text) TO anon,authenticated,service_role;

CREATE FUNCTION public.brand_account_not_cancelled(p_cafe_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT brand_cancellation_private.cancelled(p_cafe_id);
$$;
REVOKE ALL ON FUNCTION public.brand_account_not_cancelled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.brand_account_not_cancelled(uuid) TO anon,authenticated,service_role;

CREATE FUNCTION brand_cancellation_private.guard_archive() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_cafe uuid;new_cafe uuid;
BEGIN
 IF TG_TABLE_NAME IN('brand_account_cancellations','brand_archive_assets') THEN RAISE EXCEPTION 'Cancellation archive is immutable' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='cafes' THEN
  IF TG_OP='DELETE' AND brand_cancellation_private.cancelled(OLD.id) THEN RAISE EXCEPTION 'Cancelled brand archive must be retained' USING ERRCODE='42501';END IF;
  IF TG_OP='UPDATE' AND brand_cancellation_private.cancelled(OLD.id) AND (NEW.status<>'archived' OR NEW.deleted_at IS NOT NULL OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.id IS DISTINCT FROM OLD.id OR NEW.slug IS DISTINCT FROM OLD.slug) THEN RAISE EXCEPTION 'Cancelled brand archive is locked' USING ERRCODE='42501';END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_cafe:=(to_jsonb(OLD)->>'cafe_id')::uuid;END IF;
  IF TG_OP<>'DELETE' THEN new_cafe:=(to_jsonb(NEW)->>'cafe_id')::uuid;END IF;
  IF brand_cancellation_private.cancelled(old_cafe) OR brand_cancellation_private.cancelled(new_cafe) THEN RAISE EXCEPTION 'Cancelled brand archive is read only' USING ERRCODE='42501';END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION brand_cancellation_private.guard_archive() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancellation_immutable BEFORE UPDATE OR DELETE ON public.brand_account_cancellations FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive();
CREATE TRIGGER archive_assets_immutable BEFORE UPDATE OR DELETE ON public.brand_archive_assets FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive();
CREATE TRIGGER cancellation_brand_guard BEFORE UPDATE OR DELETE ON public.cafes FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive();

-- Preserve archives against deletion, and deny direct tenant RLS access. Existing
-- service-only outcome/webhook contracts remain able to record already-started work.
DO $$DECLARE t record;BEGIN
 FOR t IN SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='cafe_id' AND NOT a.attisdropped WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'brand_account_cancellations' AND a.atttypid='uuid'::regtype LOOP
  EXECUTE format('CREATE TRIGGER cancellation_archive_guard BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION brand_cancellation_private.guard_archive()',t.relname);
  IF t.relrowsecurity THEN EXECUTE format('CREATE POLICY cancellation_archive_scope ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING (public.brand_account_not_cancelled(cafe_id) OR public.is_platform_admin()) WITH CHECK (public.brand_account_not_cancelled(cafe_id))',t.relname);END IF;
 END LOOP;
END $$;

-- Filter before claim/limit, preserving pending evidence and other brands' batches.
DO $$DECLARE r record;d text;patched text;BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('public.brand_finance_claim_customer_messages(uuid,integer)','WHERE state=''dispatching''','WHERE public.brand_account_not_cancelled(cafe_id) AND state=''dispatching'''),
 ('public.brand_finance_claim_customer_messages(uuid,integer)','WHERE state=''pending''','WHERE public.brand_account_not_cancelled(j.cafe_id) AND state=''pending'''),
 ('public.brand_finance_claim_customer_messages(uuid,integer)','WHERE j.state=''pending''','WHERE public.brand_account_not_cancelled(j.cafe_id) AND j.state=''pending'''),
 ('public.claim_wallet_notification_jobs(integer)','WHERE ((status=''pending''','WHERE public.brand_account_not_cancelled(cafe_id) AND ((status=''pending'''),
 ('public.claim_wallet_notification_jobs_for_cards(uuid[],integer)','WHERE card_id=ANY(p_card_ids)','WHERE public.brand_account_not_cancelled(cafe_id) AND card_id=ANY(p_card_ids)'),
 ('public.claim_routed_wallet_welcome(uuid,boolean,boolean)','WHERE w.status=''pending''','WHERE public.brand_account_not_cancelled(w.cafe_id) AND w.status=''pending'''),
 ('public.claim_stamp_card_link(boolean,boolean)','WHERE w.status=''pending''','WHERE public.brand_account_not_cancelled(w.cafe_id) AND w.status=''pending'''),
 ('public.claim_stamp_card_link_v2(boolean,boolean)','WHERE w.status=''pending''','WHERE public.brand_account_not_cancelled(w.cafe_id) AND w.status=''pending'''),
 ('brand_finance_private.template_claim_jobs(uuid,integer)','WHERE (p_cafe IS NULL OR cafe_id=p_cafe)','WHERE public.brand_account_not_cancelled(cafe_id) AND (p_cafe IS NULL OR cafe_id=p_cafe)'),
 ('public.erp_finance_generate_due(integer)','WHERE active AND next_date','WHERE public.brand_account_not_cancelled(cafe_id) AND active AND next_date'),
 ('public.erp_system_oauth_token(uuid,text,text,text,text,text,text,text)','AND p.status=''active''','AND public.brand_account_not_cancelled(c.id) AND p.status=''active''')
 )x(signature,anchor,replacement) LOOP
  d:=pg_get_functiondef(to_regprocedure(r.signature));
  IF d IS NULL THEN RAISE EXCEPTION 'Missing archive queue contract: %',r.signature;END IF;
  patched:=replace(d,r.anchor,r.replacement);
  IF patched=d THEN RAISE EXCEPTION 'Archive queue contract changed: %',r.signature;END IF;
  EXECUTE patched;
 END LOOP;
END $$;

CREATE FUNCTION public.cancel_brand_account(p_cafe_id uuid,p_confirmation text,p_reason text,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cafes%ROWTYPE;receipt public.brand_account_cancellations%ROWTYPE;actor_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_account_active() THEN RAISE EXCEPTION 'Owner authentication required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid() AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Owner authentication required' USING ERRCODE='42501';END IF;
 -- Match canonical ledger lock and acquire it before the parent row/FK lock.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
 SELECT * INTO c FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'Owner authentication required' USING ERRCODE='42501';END IF;
 IF p_confirmation IS DISTINCT FROM c.slug OR p_request_id IS NULL OR p_reason IS NULL OR length(p_reason)>1000 THEN RAISE EXCEPTION 'Cancellation confirmation mismatch' USING ERRCODE='22023';END IF;
 SELECT * INTO receipt FROM public.brand_account_cancellations WHERE cafe_id=c.id;
 IF receipt.cafe_id IS NOT NULL THEN RETURN jsonb_build_object('cafeId',c.id,'slug',receipt.slug,'cancelledAt',receipt.cancelled_at,'alreadyCancelled',true);END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) a WHERE a->>'method'='password' AND (a->>'timestamp')~'^\d{1,12}$' AND (a->>'timestamp')::numeric BETWEEN extract(epoch FROM now()-interval '5 minutes') AND extract(epoch FROM now()+interval '1 minute')) THEN RAISE EXCEPTION 'Recent password authentication required' USING ERRCODE='42501';END IF;
 SELECT coalesce(full_name,'') INTO actor_name FROM public.profiles WHERE id=auth.uid();
 INSERT INTO public.brand_account_cancellations(cafe_id,actor_id,actor_name,reason,slug,name,request_id) VALUES(c.id,auth.uid(),coalesce(actor_name,''),btrim(p_reason),c.slug,c.name,p_request_id) RETURNING * INTO receipt;
 PERFORM brand_cancellation_private.capture_assets(c.id,c.slug);
 UPDATE public.cafes SET status='archived',is_public=false,updated_at=now() WHERE id=c.id;
 RETURN jsonb_build_object('cafeId',c.id,'slug',c.slug,'cancelledAt',receipt.cancelled_at,'alreadyCancelled',false);
END $$;
REVOKE ALL ON FUNCTION public.cancel_brand_account(uuid,text,text,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.cancel_brand_account(uuid,text,text,uuid) TO authenticated;
CREATE FUNCTION public.owner_cancellation_brands() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_account_active() THEN RAISE EXCEPTION 'Owner authentication required' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'slug',c.slug,'name',c.name,'cancelledAt',a.cancelled_at) ORDER BY c.created_at,c.id) FROM public.cafes c LEFT JOIN public.brand_account_cancellations a ON a.cafe_id=c.id WHERE c.owner_user_id=auth.uid() AND c.deleted_at IS NULL),'[]');
END $$;
REVOKE ALL ON FUNCTION public.owner_cancellation_brands() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.owner_cancellation_brands() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
