-- Optional public links on Wallet pass details. No seed data or existing card updates.
BEGIN;
CREATE FUNCTION public.valid_cafe_wallet_links(p_links jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE link jsonb; u text; host text; ids text[]:='{}'; urls text[]:='{}';
BEGIN
 IF jsonb_typeof(p_links) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_links)>10 THEN RETURN false; END IF;
 FOR link IN SELECT value FROM jsonb_array_elements(p_links) LOOP
  IF jsonb_typeof(link) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(link))<>3
   OR jsonb_typeof(link->'id') IS DISTINCT FROM 'string' OR link->>'id' !~ '^[A-Za-z0-9_-]{1,64}$'
   OR jsonb_typeof(link->'label') IS DISTINCT FROM 'string' OR char_length(link->>'label') NOT BETWEEN 1 AND 60
   OR link->>'label' IS DISTINCT FROM btrim(link->>'label') OR link->>'label' ~ '[[:cntrl:]]'
   OR jsonb_typeof(link->'url') IS DISTINCT FROM 'string' OR char_length(link->>'url') NOT BETWEEN 1 AND 2048
  THEN RETURN false; END IF;
  u:=link->>'url';
  IF u ~ '[[:cntrl:][:space:]<>"`\\]' OR u ~* '%(0[0-9a-f]|1[0-9a-f]|7f)|%c2%[89][0-9a-f]' THEN RETURN false; END IF;
  IF u LIKE 'https://%' THEN
   host:=split_part(split_part(split_part(substr(u,9),'/',1),'?',1),'#',1);
   host:=regexp_replace(host,':443$','');
   IF host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
    OR host ~ '(^|\.)(localhost|local|internal|lan|home|invalid|test)$' THEN RETURN false; END IF;
  ELSIF u LIKE 'tel:%' THEN
   IF u !~ '^tel:\+?[0-9]{7,15}$' THEN RETURN false; END IF;
  ELSIF u LIKE 'mailto:%' THEN
   IF u !~ '^mailto:[A-Za-z0-9.!#$%&''*+/=_-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$' THEN RETURN false; END IF;
  ELSE RETURN false;
  END IF;
  IF link->>'id'=ANY(ids) OR u=ANY(urls) THEN RETURN false; END IF;
  ids:=array_append(ids,link->>'id'); urls:=array_append(urls,u);
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.valid_cafe_wallet_links(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.valid_cafe_wallet_links(jsonb) TO authenticated,service_role;

CREATE TABLE public.cafe_wallet_links (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id) ON DELETE CASCADE,
 links jsonb NOT NULL DEFAULT '[]' CHECK (public.valid_cafe_wallet_links(links)),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cafe_wallet_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cafe_wallet_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cafe_wallet_links TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.cafe_wallet_links TO service_role;
CREATE POLICY wallet_links_owner_read ON public.cafe_wallet_links FOR SELECT TO authenticated
 USING ((public.is_cafe_owner(cafe_id) OR public.is_platform_admin())
  AND EXISTS(SELECT 1 FROM public.profiles WHERE id=(SELECT auth.uid()) AND status='active'));

CREATE FUNCTION public.queue_cafe_wallet_links_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.links IS NOT DISTINCT FROM OLD.links THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.links='[]'::jsonb THEN RETURN NEW; END IF;
 IF TG_OP='DELETE' THEN c:=OLD.cafe_id; ELSE c:=NEW.cafe_id; END IF;
 IF public.brand_account_not_cancelled(c) AND platform_access_private.service_enabled(c,'loyalty') THEN
  UPDATE public.wallet_passes SET updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') WHERE cafe_id=c;
  -- Existing durable sync path. The quiet flag suppresses Google change alerts.
  INSERT INTO public.wallet_notification_jobs(cafe_id,card_id,kind,nearby_refresh)
   SELECT DISTINCT c,card_id,'sync',true FROM public.wallet_passes WHERE cafe_id=c ON CONFLICT DO NOTHING;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_cafe_wallet_links_update() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cafe_wallet_links_update AFTER INSERT OR UPDATE OR DELETE ON public.cafe_wallet_links
 FOR EACH ROW EXECUTE FUNCTION public.queue_cafe_wallet_links_update();

CREATE FUNCTION public.save_cafe_wallet_links(p_cafe uuid,p_links jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
  OR NOT (public.is_cafe_owner(p_cafe) OR public.is_platform_admin())
  OR NOT public.brand_account_not_cancelled(p_cafe)
  OR NOT platform_access_private.service_enabled(p_cafe,'loyalty')
 THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF NOT public.valid_cafe_wallet_links(p_links) THEN RAISE EXCEPTION 'Invalid wallet links' USING ERRCODE='22023'; END IF;
 INSERT INTO public.cafe_wallet_links(cafe_id,links) VALUES(p_cafe,p_links)
 ON CONFLICT(cafe_id) DO UPDATE SET links=excluded.links,updated_at=clock_timestamp()
 WHERE cafe_wallet_links.links IS DISTINCT FROM excluded.links;
 RETURN p_links;
END $$;
REVOKE ALL ON FUNCTION public.save_cafe_wallet_links(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_cafe_wallet_links(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
