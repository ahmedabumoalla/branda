BEGIN;
CREATE TABLE erp_settings_private.oauth_clients(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),redirect_uris jsonb NOT NULL,registration_hash text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_system_oauth_registration ON erp_settings_private.oauth_clients(registration_hash,created_at);
CREATE TABLE erp_settings_private.oauth_grants(code_hash text PRIMARY KEY CHECK(code_hash~'^[a-f0-9]{64}$'),client_id uuid NOT NULL REFERENCES erp_settings_private.oauth_clients(id),cafe_id uuid NOT NULL REFERENCES public.cafes(id),actor uuid NOT NULL REFERENCES auth.users(id),redirect_uri text NOT NULL,challenge text NOT NULL CHECK(challenge~'^[A-Za-z0-9_-]{43}$'),scopes jsonb NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',used_at timestamptz);
CREATE TABLE erp_settings_private.oauth_refresh(token_hash text PRIMARY KEY CHECK(token_hash~'^[a-f0-9]{64}$'),client_id uuid NOT NULL REFERENCES erp_settings_private.oauth_clients(id),key_id uuid NOT NULL REFERENCES public.erp_system_api_keys(id),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',used_at timestamptz);
ALTER TABLE erp_settings_private.oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_settings_private.oauth_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_settings_private.oauth_refresh ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_settings_private.oauth_clients,erp_settings_private.oauth_grants,erp_settings_private.oauth_refresh FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.erp_system_oauth_register(p_name text,p_redirects jsonb,p_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE c erp_settings_private.oauth_clients;BEGIN
 IF p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_redirects) IS DISTINCT FROM 'array' OR jsonb_array_length(p_redirects) NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_redirects) v WHERE length(v)>2000 OR v!~'^https://[^/@?#]+(/[^#]*)?$' AND v!~'^http://(localhost|127\.0\.0\.1)(:[0-9]+)?(/[^#]*)?$') THEN RAISE EXCEPTION 'invalid_client_metadata' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('erp_oauth_registration',0));
 IF (SELECT count(*) FROM erp_settings_private.oauth_clients WHERE registration_hash=p_hash AND created_at>now()-interval '1 hour')>=10 OR (SELECT count(*) FROM erp_settings_private.oauth_clients WHERE created_at>now()-interval '1 day')>=1000 THEN RETURN jsonb_build_object('error','rate_limited');END IF;
 INSERT INTO erp_settings_private.oauth_clients(name,redirect_uris,registration_hash) VALUES(trim(p_name),p_redirects,p_hash) RETURNING * INTO c;
 RETURN jsonb_build_object('id',c.id,'name',c.name,'redirectUris',c.redirect_uris);
END $$;
CREATE FUNCTION public.erp_system_oauth_client(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT jsonb_build_object('id',id,'name',name,'redirectUris',redirect_uris) FROM erp_settings_private.oauth_clients WHERE id=p_id$$;
CREATE FUNCTION public.erp_system_oauth_consent(p_cafe uuid,p_client uuid,p_redirect text,p_challenge text,p_scopes jsonb,p_code_hash text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);
 IF p_code_hash IS NULL OR p_code_hash!~'^[a-f0-9]{64}$' OR p_challenge IS NULL OR p_challenge!~'^[A-Za-z0-9_-]{43}$' OR jsonb_typeof(p_scopes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scopes) NOT BETWEEN 1 AND 4 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_scopes) v WHERE v NOT IN('customers:read','invoices:read','inventory:read','requests:read')) OR NOT EXISTS(SELECT 1 FROM erp_settings_private.oauth_clients WHERE id=p_client AND redirect_uris ? p_redirect) THEN RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';END IF;
 IF (SELECT count(*) FROM erp_settings_private.oauth_grants WHERE actor=auth.uid() AND expires_at>now() AND used_at IS NULL)>20 THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE='22023';END IF;
 INSERT INTO erp_settings_private.oauth_grants(code_hash,client_id,cafe_id,actor,redirect_uri,challenge,scopes) VALUES(p_code_hash,p_client,p_cafe,auth.uid(),p_redirect,p_challenge,p_scopes);
 INSERT INTO public.erp_system_events(cafe_id,actor,action,target) VALUES(p_cafe,auth.uid(),'oauth_consent',p_client::text);
 RETURN true;
END $$;
CREATE FUNCTION public.erp_system_oauth_token(p_client uuid,p_grant text,p_hash text,p_redirect text,p_challenge text,p_access_hash text,p_prefix text,p_refresh_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE g erp_settings_private.oauth_grants;r erp_settings_private.oauth_refresh;k public.erp_system_api_keys;actor_id uuid;BEGIN
 IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' OR p_access_hash IS NULL OR p_access_hash!~'^[a-f0-9]{64}$' OR p_refresh_hash IS NULL OR p_refresh_hash!~'^[a-f0-9]{64}$' OR p_prefix IS NULL OR length(p_prefix) NOT BETWEEN 7 AND 20 THEN RETURN jsonb_build_object('error','invalid_request');END IF;
 IF p_grant='authorization_code' THEN
  SELECT * INTO g FROM erp_settings_private.oauth_grants WHERE code_hash=p_hash FOR UPDATE;
  IF g.code_hash IS NULL OR g.client_id IS DISTINCT FROM p_client OR g.used_at IS NOT NULL OR g.expires_at<=now() OR g.redirect_uri IS DISTINCT FROM p_redirect OR g.challenge IS DISTINCT FROM p_challenge THEN RETURN jsonb_build_object('error','invalid_grant');END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id WHERE c.id=g.cafe_id AND c.owner_user_id=g.actor AND p.status='active') THEN RETURN jsonb_build_object('error','invalid_grant');END IF;
  actor_id:=g.actor;
  INSERT INTO public.erp_system_api_keys(id,cafe_id,created_by,name,prefix,scopes,purpose,expires_at) SELECT gen_random_uuid(),g.cafe_id,g.actor,'OAuth · '||name,p_prefix,g.scopes,'copilot',now()+interval '1 hour' FROM erp_settings_private.oauth_clients WHERE id=p_client RETURNING * INTO k;
  INSERT INTO erp_settings_private.api_hashes(id,token_hash) VALUES(k.id,p_access_hash);
  UPDATE erp_settings_private.oauth_grants SET used_at=now() WHERE code_hash=p_hash;
 ELSIF p_grant='refresh_token' THEN
  SELECT * INTO r FROM erp_settings_private.oauth_refresh WHERE token_hash=p_hash FOR UPDATE;
  IF r.token_hash IS NULL OR r.client_id IS DISTINCT FROM p_client OR r.expires_at<=now() THEN RETURN jsonb_build_object('error','invalid_grant');END IF;IF r.used_at IS NOT NULL THEN UPDATE public.erp_system_api_keys SET active=false,revision=revision+1 WHERE id=r.key_id AND active;RETURN jsonb_build_object('error','invalid_grant');END IF;
  SELECT * INTO k FROM public.erp_system_api_keys WHERE id=r.key_id FOR UPDATE;
  IF k.id IS NULL OR NOT k.active OR k.purpose<>'copilot' THEN RETURN jsonb_build_object('error','invalid_grant');END IF;
  SELECT c.owner_user_id INTO actor_id FROM public.cafes c JOIN public.profiles p ON p.id=c.owner_user_id WHERE c.id=k.cafe_id AND c.owner_user_id=k.created_by AND p.status='active';
  IF actor_id IS NULL THEN RETURN jsonb_build_object('error','invalid_grant');END IF;
  UPDATE public.erp_system_api_keys SET expires_at=now()+interval '1 hour',prefix=p_prefix,revision=revision+1 WHERE id=k.id;
  UPDATE erp_settings_private.api_hashes SET token_hash=p_access_hash WHERE id=k.id;
  UPDATE erp_settings_private.oauth_refresh SET used_at=now() WHERE token_hash=p_hash;
 ELSE RETURN jsonb_build_object('error','unsupported_grant_type');END IF;
 INSERT INTO erp_settings_private.oauth_refresh(token_hash,client_id,key_id) VALUES(p_refresh_hash,p_client,k.id);
 INSERT INTO public.erp_system_events(cafe_id,actor,action,target) VALUES(k.cafe_id,actor_id,'oauth_token',k.id::text);
 RETURN jsonb_build_object('scope',(SELECT string_agg(v,' ') FROM jsonb_array_elements_text(k.scopes) v),'expires_in',3600);
END $$;
CREATE FUNCTION public.erp_system_oauth_revoke(p_client uuid,p_hash text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE kid uuid;BEGIN
 SELECT r.key_id INTO kid FROM erp_settings_private.oauth_refresh r WHERE r.client_id=p_client AND(r.token_hash=p_hash OR EXISTS(SELECT 1 FROM erp_settings_private.api_hashes h WHERE h.id=r.key_id AND h.token_hash=p_hash)) LIMIT 1;
 IF kid IS NOT NULL THEN UPDATE public.erp_system_api_keys SET active=false,revision=revision+1 WHERE id=kid AND active;END IF;
END $$;
REVOKE ALL ON FUNCTION public.erp_system_oauth_register(text,jsonb,text),public.erp_system_oauth_client(uuid),public.erp_system_oauth_consent(uuid,uuid,text,text,jsonb,text),public.erp_system_oauth_token(uuid,text,text,text,text,text,text,text),public.erp_system_oauth_revoke(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_oauth_consent(uuid,uuid,text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_system_oauth_register(text,jsonb,text),public.erp_system_oauth_client(uuid),public.erp_system_oauth_token(uuid,text,text,text,text,text,text,text),public.erp_system_oauth_revoke(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
