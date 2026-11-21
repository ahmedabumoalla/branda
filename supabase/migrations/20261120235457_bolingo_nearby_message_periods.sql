-- Daily proximity copy for Bolingo only. No seed messages and no customer writes.
CREATE FUNCTION public.valid_loyalty_nearby_periods(p_periods jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE p jsonb; previous jsonb; s integer; e integer; ps integer; pe integer; n integer:=0; seen jsonb:='[]';
BEGIN
 IF jsonb_typeof(p_periods) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_periods)>48 THEN RETURN false; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(p_periods) LOOP
  IF jsonb_typeof(p) IS DISTINCT FROM 'object'
   OR jsonb_typeof(p->'id') IS DISTINCT FROM 'string'
   OR (p->>'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR jsonb_typeof(p->'start') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'end') IS DISTINCT FROM 'string'
   OR (p->>'start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' OR (p->>'end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   OR jsonb_typeof(p->'message') IS DISTINCT FROM 'string' OR char_length(btrim(p->>'message')) NOT BETWEEN 2 AND 240
   OR p->>'message' IS DISTINCT FROM btrim(p->>'message')
   OR (SELECT count(*) FROM jsonb_object_keys(p))<>4
  THEN RETURN false; END IF;
  s:=split_part(p->>'start',':',1)::integer*60+split_part(p->>'start',':',2)::integer;
  e:=split_part(p->>'end',':',1)::integer*60+split_part(p->>'end',':',2)::integer;
  IF s=e THEN RETURN false; END IF;
  FOR previous IN SELECT value FROM jsonb_array_elements(seen) LOOP
   IF previous->>'id'=p->>'id' THEN RETURN false; END IF;
   ps:=split_part(previous->>'start',':',1)::integer*60+split_part(previous->>'start',':',2)::integer;
   pe:=split_part(previous->>'end',':',1)::integer*60+split_part(previous->>'end',':',2)::integer;
   IF (CASE WHEN ps<pe THEN s>=ps AND s<pe ELSE s>=ps OR s<pe END)
     OR (CASE WHEN s<e THEN ps>=s AND ps<e ELSE ps>=s OR ps<e END) THEN RETURN false; END IF;
  END LOOP;
  seen:=seen||jsonb_build_array(p); n:=n+1;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_loyalty_nearby_periods(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_loyalty_nearby_periods(jsonb) TO authenticated,service_role;

CREATE TABLE public.loyalty_nearby_schedules (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 periods jsonb NOT NULL DEFAULT '[]',
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 last_message_token text NOT NULL DEFAULT 'default',
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (cafe_id='dbe942ba-dfa4-422b-a9f6-9527c3b27cc9'::uuid),
 CHECK (public.valid_loyalty_nearby_periods(periods)),
 CHECK (NOT enabled OR jsonb_array_length(periods)>0)
);
ALTER TABLE public.loyalty_nearby_schedules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.loyalty_nearby_schedules FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.loyalty_nearby_schedules TO authenticated;
GRANT ALL ON public.loyalty_nearby_schedules TO service_role;
CREATE POLICY nearby_schedule_owner_read ON public.loyalty_nearby_schedules FOR SELECT TO authenticated
 USING (public.is_cafe_owner(cafe_id) OR public.is_platform_admin());

-- Reuse the durable sync queue. Nearby-only refreshes must not request a Google alert.
ALTER TABLE public.wallet_notification_jobs ADD COLUMN nearby_refresh boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.loyalty_nearby_message_at(p_enabled boolean,p_periods jsonb,p_now timestamptz)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT p->>'message' FROM jsonb_array_elements(p_periods) p
 WHERE p_enabled AND CASE WHEN p->>'start'<p->>'end'
  THEN to_char(p_now AT TIME ZONE 'Asia/Riyadh','HH24:MI')>=p->>'start' AND to_char(p_now AT TIME ZONE 'Asia/Riyadh','HH24:MI')<p->>'end'
  ELSE to_char(p_now AT TIME ZONE 'Asia/Riyadh','HH24:MI')>=p->>'start' OR to_char(p_now AT TIME ZONE 'Asia/Riyadh','HH24:MI')<p->>'end' END
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.loyalty_nearby_message_at(boolean,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.loyalty_nearby_message_at(boolean,jsonb,timestamptz) TO service_role;

CREATE FUNCTION public.refresh_loyalty_nearby_schedules()
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.loyalty_nearby_schedules; msg text; token text; changed integer:=0;
BEGIN
 FOR r IN SELECT * FROM public.loyalty_nearby_schedules ORDER BY cafe_id FOR UPDATE SKIP LOCKED LOOP
  IF NOT public.brand_account_not_cancelled(r.cafe_id) OR NOT platform_access_private.service_enabled(r.cafe_id,'loyalty') THEN CONTINUE; END IF;
  msg:=public.loyalty_nearby_message_at(r.enabled,r.periods,statement_timestamp());
  token:=CASE WHEN msg IS NULL THEN 'default' ELSE 'period:'||msg END;
  IF token=r.last_message_token THEN CONTINUE; END IF;
  UPDATE public.wallet_passes SET updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') WHERE cafe_id=r.cafe_id;
  INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind,nearby_refresh)
   SELECT DISTINCT r.cafe_id,wp.card_id,'sync',true FROM public.wallet_passes wp
   JOIN public.loyalty_cards lc ON lc.id=wp.card_id AND lc.cafe_id=wp.cafe_id AND lc.status='active'
   WHERE wp.cafe_id=r.cafe_id ON CONFLICT DO NOTHING;
  UPDATE public.loyalty_nearby_schedules SET last_message_token=token WHERE cafe_id=r.cafe_id;
  changed:=changed+1;
 END LOOP;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.refresh_loyalty_nearby_schedules() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_loyalty_nearby_schedules() TO service_role;

CREATE FUNCTION public.save_loyalty_nearby_schedule(p_cafe uuid,p_enabled boolean,p_periods jsonb,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.loyalty_nearby_schedules;
BEGIN
 IF auth.uid() IS NULL OR p_cafe IS DISTINCT FROM 'dbe942ba-dfa4-422b-a9f6-9527c3b27cc9'::uuid
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
REVOKE ALL ON FUNCTION public.save_loyalty_nearby_schedule(uuid,boolean,jsonb,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_loyalty_nearby_schedule(uuid,boolean,jsonb,integer) TO authenticated;
