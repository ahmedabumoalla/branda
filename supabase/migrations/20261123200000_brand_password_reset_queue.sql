BEGIN;

CREATE TABLE brand_onboarding_private.password_resets (
  id uuid PRIMARY KEY,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.profiles(id),
  phone text NOT NULL,
  ciphertext text,
  password_hash text,
  original_fingerprint bytea,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','uncertain','cancelled')),
  attempt smallint NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 9),
  claim_token uuid,
  dispatch_authorized boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((status IN ('queued','sending')) = (ciphertext IS NOT NULL)),
  CHECK ((status IN ('queued','sending')) = (password_hash IS NOT NULL)),
  CHECK ((status IN ('queued','sending')) = (original_fingerprint IS NOT NULL)),
  CHECK ((status = 'queued') = (next_attempt_at IS NOT NULL)),
  CHECK ((status = 'sending') = (lease_until IS NOT NULL))
);
ALTER TABLE brand_onboarding_private.password_resets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_onboarding_private.password_resets FROM PUBLIC, anon, authenticated, service_role;
CREATE UNIQUE INDEX brand_password_reset_active_owner ON brand_onboarding_private.password_resets(owner_id) WHERE status IN ('queued','sending');
CREATE INDEX brand_password_reset_due ON brand_onboarding_private.password_resets(next_attempt_at) WHERE status='queued';
CREATE INDEX brand_password_reset_leases ON brand_onboarding_private.password_resets(lease_until) WHERE status='sending';
CREATE INDEX brand_password_reset_latest ON brand_onboarding_private.password_resets(cafe_id,created_at DESC);

CREATE FUNCTION brand_onboarding_private.password_reset_summary(j brand_onboarding_private.password_resets)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path='' AS $$
  SELECT jsonb_build_object('id',j.id,'status',j.status,'attempt',j.attempt,
    'nextAttemptAt',j.next_attempt_at,'createdAt',j.created_at)
$$;

-- Only the confirmed Auth phone of the actual active owner is a credential destination.
-- Lock the affected identities through activation so another reset cannot overwrite a later password.
CREATE FUNCTION brand_onboarding_private.password_reset_identity(p_cafe uuid,p_actor uuid)
RETURNS TABLE(owner_id uuid,phone text,fingerprint bytea,brand_name text)
LANGUAGE sql VOLATILE SET search_path='' AS $$
  SELECT u.id,brand_phone_private.normalize(c.id,u.phone),
    sha256(convert_to(coalesce(u.encrypted_password,''),'UTF8')),c.name
  FROM public.cafes c
  JOIN auth.users u ON u.id=c.owner_user_id
  JOIN public.profiles own ON own.id=u.id AND own.role='cafe_owner' AND own.status='active'
  JOIN public.profiles adm ON adm.id=p_actor AND adm.role='platform_admin' AND adm.status='active'
  WHERE c.id=p_cafe AND c.deleted_at IS NULL AND c.status='active'
    AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND u.phone_confirmed_at IS NOT NULL AND brand_phone_private.normalize(c.id,u.phone) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM brand_onboarding_private.accounts a WHERE a.cafe_id=c.id
      AND (a.state<>'sent' OR a.pending_edit IS NOT NULL))
  FOR SHARE OF c,u,own,adm
$$;

-- Expire conservatively once a worker was allowed to POST. Before that point no provider
-- could have accepted the request. Never resume a possibly accepted attempt on a new lane.
CREATE FUNCTION brand_onboarding_private.expire_password_resets(p_cafe uuid)
RETURNS void LANGUAGE sql SET search_path='' AS $$
  UPDATE brand_onboarding_private.password_resets
     SET status=CASE WHEN status='sending' AND dispatch_authorized THEN 'uncertain' ELSE 'cancelled' END,
         ciphertext=NULL,password_hash=NULL,original_fingerprint=NULL,lease_until=NULL,next_attempt_at=NULL
   WHERE (p_cafe IS NULL OR cafe_id=p_cafe) AND (
     (status='sending' AND lease_until<=clock_timestamp()) OR
     (status='queued' AND created_at<=clock_timestamp()-interval '1 hour'))
$$;

CREATE FUNCTION public.brand_password_reset_enqueue(
  p_actor uuid,p_cafe uuid,p_request uuid,p_ciphertext text,p_password_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  j brand_onboarding_private.password_resets%ROWTYPE;
  identity record;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  IF p_request IS NULL OR p_cafe IS NULL OR length(coalesce(p_ciphertext,'')) NOT BETWEEN 40 AND 2000
     OR coalesce(p_password_hash,'') !~ '^\$2[ab]\$(10|11|12)\$[./A-Za-z0-9]{53}$' THEN
    RAISE EXCEPTION 'INVALID_PASSWORD_REQUEST';
  END IF;
  -- Serialize same-brand clicks, while unrelated owners continue independently.
  PERFORM pg_advisory_xact_lock(hashtextextended('password_reset:'||p_cafe::text,0));
  PERFORM brand_onboarding_private.expire_password_resets(p_cafe);
  SELECT * INTO j FROM brand_onboarding_private.password_resets WHERE id=p_request;
  IF FOUND THEN
    IF j.cafe_id<>p_cafe OR j.actor_id<>p_actor THEN RAISE EXCEPTION 'REQUEST_CHANGED'; END IF;
    RETURN brand_onboarding_private.password_reset_summary(j);
  END IF;
  SELECT * INTO j FROM brand_onboarding_private.password_resets WHERE cafe_id=p_cafe AND status IN ('queued','sending');
  IF FOUND THEN RAISE EXCEPTION 'OWNER_RESET_IN_PROGRESS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cafes WHERE id=p_cafe AND deleted_at IS NULL AND status='active') THEN
    RAISE EXCEPTION 'BRAND_UNAVAILABLE';
  END IF;
  IF EXISTS (SELECT 1 FROM brand_onboarding_private.accounts WHERE cafe_id=p_cafe AND (state<>'sent' OR pending_edit IS NOT NULL)) THEN
    RAISE EXCEPTION 'OWNER_WELCOME_PENDING';
  END IF;
  SELECT * INTO identity FROM brand_onboarding_private.password_reset_identity(p_cafe,p_actor);
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_PHONE_REQUIRED'; END IF;
  INSERT INTO brand_onboarding_private.password_resets
    (id,cafe_id,actor_id,owner_id,phone,original_fingerprint,password_hash,ciphertext,next_attempt_at)
  VALUES (p_request,p_cafe,p_actor,identity.owner_id,identity.phone,identity.fingerprint,p_password_hash,p_ciphertext,clock_timestamp())
  ON CONFLICT (owner_id) WHERE status IN ('queued','sending') DO NOTHING RETURNING * INTO j;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_RESET_IN_PROGRESS'; END IF;
  RETURN brand_onboarding_private.password_reset_summary(j);
END $$;

CREATE FUNCTION public.brand_password_reset_claim(p_request uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  j brand_onboarding_private.password_resets%ROWTYPE;
BEGIN
  PERFORM brand_onboarding_private.expire_password_resets(NULL);
  SELECT * INTO j FROM brand_onboarding_private.password_resets
  WHERE status='queued' AND next_attempt_at<=clock_timestamp() AND (p_request IS NULL OR id=p_request)
  ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE brand_onboarding_private.password_resets SET status='sending',attempt=attempt+1,
    claim_token=gen_random_uuid(),dispatch_authorized=false,lease_until=clock_timestamp()+interval '2 minutes',next_attempt_at=NULL
    WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('id',j.id,'cafeId',j.cafe_id,'phone',j.phone,'ciphertext',j.ciphertext,
    'attempt',j.attempt,'claimToken',j.claim_token,'brandName',(SELECT name FROM public.cafes WHERE id=j.cafe_id));
END $$;

CREATE FUNCTION public.brand_password_reset_can_send(p_request uuid,p_claim uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j brand_onboarding_private.password_resets%ROWTYPE;
BEGIN
  SELECT * INTO j FROM brand_onboarding_private.password_resets WHERE id=p_request AND status='sending'
    AND claim_token=p_claim AND lease_until>clock_timestamp() AND NOT dispatch_authorized FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM brand_onboarding_private.password_reset_identity(j.cafe_id,j.actor_id) i
    WHERE i.owner_id=j.owner_id AND i.phone=j.phone AND i.fingerprint=j.original_fingerprint) THEN RETURN false; END IF;
  UPDATE brand_onboarding_private.password_resets SET dispatch_authorized=true WHERE id=j.id;
  RETURN true;
END $$;

CREATE FUNCTION public.brand_password_reset_finish(p_request uuid,p_claim uuid,p_outcome text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  j brand_onboarding_private.password_resets%ROWTYPE;
  result text;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('accepted','rejected','unknown','abort') THEN RAISE EXCEPTION 'INVALID_PASSWORD_OUTCOME'; END IF;
  SELECT * INTO j FROM brand_onboarding_private.password_resets WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR p_claim IS NULL OR j.claim_token IS DISTINCT FROM p_claim THEN RAISE EXCEPTION 'INVALID_PASSWORD_CLAIM'; END IF;
  IF j.status<>'sending' THEN RETURN brand_onboarding_private.password_reset_summary(j); END IF;

  IF p_outcome='accepted' AND NOT j.dispatch_authorized THEN RAISE EXCEPTION 'DISPATCH_NOT_AUTHORIZED'; END IF;
  IF p_outcome IN ('accepted','rejected') AND NOT EXISTS (
    SELECT 1 FROM brand_onboarding_private.password_reset_identity(j.cafe_id,j.actor_id) i
    WHERE i.owner_id=j.owner_id AND i.phone=j.phone AND i.fingerprint=j.original_fingerprint
  ) THEN
    result:='cancelled';
  ELSIF p_outcome='accepted' THEN
    -- Supabase Auth reads this bcrypt verifier. Password activation, session deletion,
    -- recovery invalidation, and the receipt commit together after provider acceptance.
    UPDATE auth.users SET encrypted_password=j.password_hash,recovery_token='',recovery_sent_at=NULL,updated_at=clock_timestamp()
      WHERE id=j.owner_id;
    DELETE FROM auth.one_time_tokens WHERE user_id=j.owner_id AND token_type='recovery_token';
    DELETE FROM auth.sessions WHERE user_id=j.owner_id;
    result:='sent';
  ELSIF p_outcome='unknown' THEN result:='uncertain';
  ELSIF p_outcome='abort' THEN result:='cancelled';
  ELSIF j.attempt>=9 THEN result:='failed';
  ELSE result:='queued';
  END IF;
  UPDATE brand_onboarding_private.password_resets SET status=result,lease_until=NULL,
    next_attempt_at=CASE WHEN result='queued' THEN clock_timestamp()+interval '1 minute' END,
    ciphertext=CASE WHEN result='queued' THEN ciphertext END,
    password_hash=CASE WHEN result='queued' THEN password_hash END,
    original_fingerprint=CASE WHEN result='queued' THEN original_fingerprint END
    WHERE id=j.id RETURNING * INTO j;
  RETURN brand_onboarding_private.password_reset_summary(j);
END $$;

CREATE FUNCTION public.brand_password_reset_status(p_actor uuid,p_cafe uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j brand_onboarding_private.password_resets%ROWTYPE;
BEGIN
  PERFORM brand_onboarding_private.require_admin(p_actor);
  PERFORM brand_onboarding_private.expire_password_resets(p_cafe);
  SELECT * INTO j FROM brand_onboarding_private.password_resets WHERE cafe_id=p_cafe ORDER BY created_at DESC,id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN brand_onboarding_private.password_reset_summary(j);
END $$;

REVOKE ALL ON FUNCTION brand_onboarding_private.password_reset_summary(brand_onboarding_private.password_resets),
  brand_onboarding_private.password_reset_identity(uuid,uuid),brand_onboarding_private.expire_password_resets(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.brand_password_reset_enqueue(uuid,uuid,uuid,text,text),public.brand_password_reset_claim(uuid),
  public.brand_password_reset_can_send(uuid,uuid),public.brand_password_reset_finish(uuid,uuid,text),public.brand_password_reset_status(uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.brand_password_reset_enqueue(uuid,uuid,uuid,text,text),public.brand_password_reset_claim(uuid),
  public.brand_password_reset_can_send(uuid,uuid),public.brand_password_reset_finish(uuid,uuid,text),public.brand_password_reset_status(uuid,uuid)
  TO service_role;
COMMIT;
