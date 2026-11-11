-- Auth runs outside the administrator's JWT context. Permit only the contact
-- fields committed by the existing private, administrator-staged owner edit.
-- Keep the shared service guard and all other tables unchanged.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.cafe_settings'::regclass
   AND tgname='package_settings_write' AND tgfoid='platform_access_private.guard_service_write()'::regprocedure)
 THEN RAISE EXCEPTION 'Unexpected settings guard'; END IF;
END $$;

CREATE FUNCTION platform_access_private.guard_settings_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.is_platform_admin() THEN RETURN NEW; END IF;
 IF OLD.cafe_id IS DISTINCT FROM NEW.cafe_id THEN
  RAISE EXCEPTION 'Service tenant cannot change' USING ERRCODE='42501';
 END IF;
 IF platform_access_private.service_enabled(NEW.cafe_id,'settings') THEN RETURN NEW; END IF;

 IF pg_trigger_depth()>1
  AND (to_jsonb(NEW)-ARRAY['owner_name','owner_phone','owner_email','updated_at'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['owner_name','owner_phone','owner_email','updated_at'])
  AND EXISTS (
   SELECT 1 FROM brand_onboarding_private.accounts a
   JOIN public.cafes c ON c.id=a.cafe_id AND c.owner_user_id=a.owner_id
   JOIN public.profiles admin ON admin.id::text=a.pending_edit->>'actor'
     AND admin.role='platform_admin' AND admin.status='active'
   JOIN auth.users u ON u.id=a.owner_id
   WHERE a.cafe_id=NEW.cafe_id AND a.state='ready' AND c.status='active' AND c.deleted_at IS NULL
    AND a.pending_edit->>'id'=u.raw_app_meta_data->>'admin_brand_edit_id'
    AND a.pending_edit->>'proof'=u.raw_app_meta_data->>'admin_brand_edit_proof'
    AND u.raw_app_meta_data->>'admin_brand_edit_attempt' IS NOT NULL
    AND regexp_replace(coalesce(u.phone,''),'[^0-9]','','g')=coalesce(a.pending_edit->'details'->>'phone','')
    AND NEW.owner_name IS NOT DISTINCT FROM (a.pending_edit->'details'->>'ownerName')
    AND NEW.owner_phone IS NOT DISTINCT FROM (a.pending_edit->'details'->>'phone')
    AND NEW.owner_email IS NOT DISTINCT FROM (a.pending_edit->'details'->>'email')
  ) THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Service unavailable for current subscription' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION platform_access_private.guard_settings_write() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE TRIGGER package_settings_write BEFORE UPDATE ON public.cafe_settings
 FOR EACH ROW EXECUTE FUNCTION platform_access_private.guard_settings_write();
