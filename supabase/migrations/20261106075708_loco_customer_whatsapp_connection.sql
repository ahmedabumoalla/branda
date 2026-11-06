BEGIN;

-- Reuse the private, encrypted brand sender. Existing campaign connections are
-- NOT enrolled for customer messages merely because this migration is applied.
ALTER TABLE public.brand_marketing_connections
 ADD COLUMN transactional_requested_at timestamptz,
 ADD CONSTRAINT brand_marketing_transactional_loco_only CHECK (
  transactional_requested_at IS NULL OR cafe_id='321fd305-1883-48df-ab69-829cf7d1bc48'::uuid
 );

CREATE FUNCTION public.loco_whatsapp_actor_allowed(p_cafe uuid,p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.cafes c JOIN public.profiles actor ON actor.id=p_actor AND actor.status='active'
  WHERE c.id=p_cafe AND c.id='321fd305-1883-48df-ab69-829cf7d1bc48'::uuid
   AND c.deleted_at IS NULL AND c.status IN ('active','published')
   AND (c.owner_user_id=p_actor OR actor.role='platform_admin'
    OR EXISTS(SELECT 1 FROM public.cafe_members m WHERE m.cafe_id=c.id AND m.user_id=p_actor AND m.role='owner'))
 );
$$;

-- Disconnecting immediately disables routing. A later campaign reconnection
-- cannot inherit customer-message consent from an older connection generation.
CREATE FUNCTION public.clear_brand_whatsapp_transactional_opt_in() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.status IN ('disconnecting','disconnected') OR NEW.generation IS DISTINCT FROM OLD.generation THEN
  NEW.transactional_requested_at:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER clear_brand_whatsapp_transactional_opt_in
 BEFORE UPDATE OF status,generation ON public.brand_marketing_connections
 FOR EACH ROW EXECUTE FUNCTION public.clear_brand_whatsapp_transactional_opt_in();

CREATE FUNCTION public.loco_claim_whatsapp_connection(p_cafe uuid,p_actor uuid,p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.brand_marketing_connections; allowed_create boolean; token uuid:=gen_random_uuid();
BEGIN
 IF NOT public.loco_whatsapp_actor_allowed(p_cafe,p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF p_phone IS NULL OR p_phone!~'^9665[0-9]{8}$' THEN RAISE EXCEPTION 'Invalid phone' USING ERRCODE='22023'; END IF;
 INSERT INTO public.brand_marketing_connections(cafe_id,requested_phone,created_by) VALUES(p_cafe,p_phone,p_actor) ON CONFLICT(cafe_id) DO NOTHING;
 SELECT * INTO c FROM public.brand_marketing_connections WHERE cafe_id=p_cafe FOR UPDATE;
 IF c.lease_until>now() OR c.dispatch_lock_until>now() OR c.status IN ('connected','disconnecting') THEN
  RAISE EXCEPTION 'Connection busy' USING ERRCODE='55000';
 END IF;
 IF c.requested_phone<>p_phone AND c.provision_attempted_at IS NOT NULL THEN RAISE EXCEPTION 'Disconnect first' USING ERRCODE='55000'; END IF;
 allowed_create:=c.provision_attempted_at IS NULL;
 UPDATE public.brand_marketing_connections SET requested_phone=p_phone,status='provisioning',lease_token=token,lease_until=now()+interval '2 minutes',
  provision_attempted_at=coalesce(provision_attempted_at,now()),generation=gen_random_uuid(),last_error=NULL,updated_at=now() WHERE cafe_id=p_cafe;
 -- The preceding generation change clears stale opt-in; only this explicit
 -- owner action restores it, atomically under the same row lock.
 UPDATE public.brand_marketing_connections SET transactional_requested_at=clock_timestamp() WHERE cafe_id=p_cafe RETURNING * INTO c;
 RETURN to_jsonb(c)||jsonb_build_object('allow_create',allowed_create);
END $$;

-- Existing verified campaign sender can be opted in without provisioning a
-- second paid instance. The server checks provider state and phone immediately
-- before this call; the transaction rejects a changed generation or identity.
CREATE FUNCTION public.loco_activate_whatsapp_connection(p_cafe uuid,p_actor uuid,p_generation uuid,p_phone text,p_instance text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.brand_marketing_connections;
BEGIN
 IF NOT public.loco_whatsapp_actor_allowed(p_cafe,p_actor) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO c FROM public.brand_marketing_connections WHERE cafe_id=p_cafe FOR UPDATE;
 IF NOT FOUND OR c.generation IS DISTINCT FROM p_generation OR c.status<>'connected'
  OR c.requested_phone IS DISTINCT FROM p_phone OR c.verified_phone IS DISTINCT FROM p_phone
  OR c.instance_id IS DISTINCT FROM p_instance OR c.instance_id IS NULL OR c.encrypted_credentials IS NULL
  OR c.lease_until>now() THEN RAISE EXCEPTION 'Connection changed' USING ERRCODE='55000'; END IF;
 UPDATE public.brand_marketing_connections SET transactional_requested_at=coalesce(transactional_requested_at,clock_timestamp()),updated_at=now() WHERE cafe_id=p_cafe;
 RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.loco_whatsapp_actor_allowed(uuid,uuid),
 public.clear_brand_whatsapp_transactional_opt_in(),
 public.loco_claim_whatsapp_connection(uuid,uuid,text),
 public.loco_activate_whatsapp_connection(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.loco_whatsapp_actor_allowed(uuid,uuid),
 public.loco_claim_whatsapp_connection(uuid,uuid,text),
 public.loco_activate_whatsapp_connection(uuid,uuid,uuid,text,text) TO service_role;

COMMENT ON COLUMN public.brand_marketing_connections.transactional_requested_at IS
 'Explicit LOCO owner opt-in to this connection generation for customer OTP and wallet welcome routing; never a marketing entitlement';
NOTIFY pgrst,'reload schema';
COMMIT;
