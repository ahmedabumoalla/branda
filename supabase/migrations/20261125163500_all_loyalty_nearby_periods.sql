BEGIN;

-- Eligibility belongs to the owner save and refresh checks. Keep saved schedules when entitlements change.
ALTER TABLE public.loyalty_nearby_schedules DROP CONSTRAINT loyalty_nearby_schedules_cafe_id_check;

CREATE OR REPLACE FUNCTION public.save_loyalty_nearby_schedule(p_cafe uuid,p_enabled boolean,p_periods jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.loyalty_nearby_schedules;
BEGIN
 IF auth.uid() IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
  OR NOT (public.is_cafe_owner(p_cafe) OR public.is_platform_admin())
  OR NOT public.brand_account_not_cancelled(p_cafe)
  OR NOT platform_access_private.service_enabled(p_cafe,'loyalty')
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL OR p_revision IS NULL OR p_revision<0 OR NOT public.valid_loyalty_nearby_periods(p_periods)
  OR (p_enabled AND jsonb_array_length(p_periods)=0)
 THEN RAISE EXCEPTION 'Invalid nearby periods' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('nearby-schedule:'||p_cafe::text,0));
 SELECT * INTO r FROM public.loyalty_nearby_schedules WHERE cafe_id=p_cafe FOR UPDATE;
 IF coalesce(r.revision,0)<>p_revision THEN RAISE EXCEPTION 'Schedule changed' USING ERRCODE='40001'; END IF;
 INSERT INTO public.loyalty_nearby_schedules(cafe_id,enabled,periods,revision)
 VALUES(p_cafe,p_enabled,p_periods,1)
 ON CONFLICT(cafe_id) DO UPDATE SET enabled=excluded.enabled,periods=excluded.periods,
  revision=loyalty_nearby_schedules.revision+1,updated_at=clock_timestamp()
 RETURNING * INTO r;
 PERFORM public.refresh_loyalty_nearby_schedules();
 RETURN jsonb_build_object('enabled',r.enabled,'periods',r.periods,'revision',r.revision);
END $$;

DROP FUNCTION platform_access_private.supports_nearby_schedule(uuid);

COMMIT;
