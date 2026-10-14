-- Existing staff and password login functions are deliberately untouched.
ALTER TABLE public.cafe_cashiers
 ADD COLUMN auth_method text NOT NULL DEFAULT 'password' CHECK (auth_method IN ('password','whatsapp_otp')),
 ALTER COLUMN email DROP NOT NULL,
 ALTER COLUMN password_hash DROP NOT NULL,
 ADD CONSTRAINT staff_auth_credentials CHECK (
  (auth_method='password' AND email IS NOT NULL AND password_hash IS NOT NULL) OR
  (auth_method='whatsapp_otp' AND email IS NULL AND password_hash IS NULL AND phone IS NOT NULL AND owner_user_id IS NULL)
 );
CREATE UNIQUE INDEX staff_whatsapp_phone_unique ON public.cafe_cashiers(phone) WHERE auth_method='whatsapp_otp';

CREATE FUNCTION public.create_cafe_staff_whatsapp(p_cafe_id uuid,p_full_name text,p_phone text,p_employee_number text DEFAULT NULL,p_can_use_loyalty boolean DEFAULT true,p_can_use_pager boolean DEFAULT false,p_pager_station text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active')
 OR NOT COALESCE(public.has_cafe_permission(p_cafe_id,'cashier') OR public.has_cafe_permission(p_cafe_id,'loyalty') OR public.has_cafe_permission(p_cafe_id,'pager') OR public.is_platform_admin(),false)
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND deleted_at IS NULL AND status IN ('active','published')) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
 END IF;
 IF p_full_name IS NULL OR char_length(btrim(p_full_name)) NOT BETWEEN 2 AND 80 OR p_full_name ~ '[[:cntrl:]]'
 OR p_phone IS NULL OR p_phone !~ '^\+9665[0-9]{8}$' OR char_length(coalesce(p_employee_number,''))>40 OR coalesce(p_employee_number,'') ~ '[[:cntrl:]]' THEN
  RAISE EXCEPTION 'Invalid staff details';
 END IF;
 IF p_can_use_loyalty IS NULL OR p_can_use_pager IS NULL OR NOT (p_can_use_loyalty OR p_can_use_pager) THEN RAISE EXCEPTION 'Select a staff permission'; END IF;
 IF NOT public.is_platform_admin() AND ((p_can_use_loyalty AND NOT platform_access_private.service_enabled(p_cafe_id,'loyalty')) OR (p_can_use_pager AND NOT platform_access_private.service_enabled(p_cafe_id,'pager'))) THEN
  RAISE EXCEPTION 'Staff service unavailable' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.cafe_cashiers(cafe_id,full_name,phone,email,password_hash,temporary_password,employee_number,created_by,auth_method,can_use_loyalty,can_use_pager,pager_station)
 VALUES(p_cafe_id,btrim(p_full_name),p_phone,NULL,NULL,'',nullif(btrim(p_employee_number),''),auth.uid(),'whatsapp_otp',p_can_use_loyalty,p_can_use_pager,btrim(coalesce(p_pager_station,''))) RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.create_cafe_staff_whatsapp(uuid,text,text,text,boolean,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_cafe_staff_whatsapp(uuid,text,text,text,boolean,boolean,text) TO authenticated;

CREATE TABLE platform_access_private.staff_otp_challenges (
 id uuid PRIMARY KEY,
 cashier_id uuid REFERENCES public.cafe_cashiers(id) ON DELETE CASCADE,
 phone text NOT NULL CHECK (phone ~ '^\+9665[0-9]{8}$'),
 phone_hash text NOT NULL CHECK (phone_hash ~ '^[a-f0-9]{64}$'),
 ip_hash text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
 session_hash text NOT NULL CHECK (session_hash ~ '^[a-f0-9]{64}$'),
 code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 sent_at timestamptz,
 used_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
CREATE INDEX staff_otp_phone_time ON platform_access_private.staff_otp_challenges(phone_hash,created_at DESC);
CREATE INDEX staff_otp_ip_time ON platform_access_private.staff_otp_challenges(ip_hash,created_at DESC);
CREATE INDEX staff_otp_cashier ON platform_access_private.staff_otp_challenges(cashier_id);
ALTER TABLE platform_access_private.staff_otp_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_access_private.staff_otp_challenges FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_staff_otp(p_id uuid,p_phone text,p_phone_hash text,p_ip_hash text,p_session_hash text,p_code_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_staff uuid; v_brand text;
BEGIN
 IF p_phone IS NULL OR p_phone !~ '^\+9665[0-9]{8}$' THEN RETURN jsonb_build_object('ok',false); END IF;
 -- Serialize both counters to keep concurrent requests within the limits.
 PERFORM pg_advisory_xact_lock(hashtextextended('staff-ip:'||p_ip_hash,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('staff-phone:'||p_phone_hash,0));
 IF EXISTS(SELECT 1 FROM platform_access_private.staff_otp_challenges WHERE phone_hash=p_phone_hash AND created_at>now()-interval '60 seconds')
 OR (SELECT count(*) FROM platform_access_private.staff_otp_challenges WHERE phone_hash=p_phone_hash AND created_at>now()-interval '1 hour')>=5
 OR (SELECT count(*) FROM platform_access_private.staff_otp_challenges WHERE ip_hash=p_ip_hash AND created_at>now()-interval '1 hour')>=30 THEN
  RETURN jsonb_build_object('ok',false);
 END IF;
 SELECT c.id,b.name INTO v_staff,v_brand FROM public.cafe_cashiers c JOIN public.cafes b ON b.id=c.cafe_id
 WHERE c.auth_method='whatsapp_otp' AND c.phone=p_phone AND c.active AND c.owner_user_id IS NULL
 AND b.deleted_at IS NULL AND b.status IN ('active','published')
 AND ((c.can_use_loyalty AND platform_access_private.service_enabled(b.id,'loyalty')) OR (c.can_use_pager AND platform_access_private.service_enabled(b.id,'pager')));
 UPDATE platform_access_private.staff_otp_challenges SET used_at=now() WHERE phone_hash=p_phone_hash AND used_at IS NULL;
 INSERT INTO platform_access_private.staff_otp_challenges(id,cashier_id,phone,phone_hash,ip_hash,session_hash,code_hash)
 VALUES(p_id,v_staff,p_phone,p_phone_hash,p_ip_hash,p_session_hash,p_code_hash);
 RETURN jsonb_build_object('ok',true,'brandName',v_brand);
END $$;

CREATE FUNCTION public.mark_staff_otp_sent(p_id uuid,p_session_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE platform_access_private.staff_otp_challenges SET sent_at=now()
 WHERE id=p_id AND session_hash=p_session_hash AND cashier_id IS NOT NULL AND used_at IS NULL AND sent_at IS NULL AND expires_at>now();
 RETURN FOUND;
END $$;

CREATE FUNCTION public.verify_staff_otp(p_id uuid,p_session_hash text,p_code_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_challenge platform_access_private.staff_otp_challenges%ROWTYPE; v_staff public.cafe_cashiers%ROWTYPE; v_token text; v_expires timestamptz;
BEGIN
 SELECT * INTO v_challenge FROM platform_access_private.staff_otp_challenges WHERE id=p_id AND session_hash=p_session_hash FOR UPDATE;
 IF v_challenge.id IS NULL OR v_challenge.used_at IS NOT NULL OR v_challenge.sent_at IS NULL OR v_challenge.expires_at<=now() OR v_challenge.attempts>=5 THEN RETURN jsonb_build_object('ok',false); END IF;
 UPDATE platform_access_private.staff_otp_challenges SET attempts=attempts+1 WHERE id=p_id;
 IF v_challenge.code_hash IS DISTINCT FROM p_code_hash THEN RETURN jsonb_build_object('ok',false); END IF;
 SELECT c.* INTO v_staff FROM public.cafe_cashiers c JOIN public.cafes b ON b.id=c.cafe_id
 WHERE c.id=v_challenge.cashier_id AND c.phone=v_challenge.phone AND c.auth_method='whatsapp_otp' AND c.active AND c.owner_user_id IS NULL
 AND b.deleted_at IS NULL AND b.status IN ('active','published')
 AND ((c.can_use_loyalty AND platform_access_private.service_enabled(b.id,'loyalty')) OR (c.can_use_pager AND platform_access_private.service_enabled(b.id,'pager'))) FOR UPDATE OF c;
 IF v_staff.id IS NULL THEN RETURN jsonb_build_object('ok',false); END IF;
 UPDATE platform_access_private.staff_otp_challenges SET used_at=now() WHERE id=p_id;
 INSERT INTO public.cafe_cashier_sessions(cashier_id,cafe_id,expires_at) VALUES(v_staff.id,v_staff.cafe_id,now()+interval '8 hours')
 RETURNING token,expires_at INTO v_token,v_expires;
 UPDATE public.cafe_cashiers SET last_login_at=now() WHERE id=v_staff.id;
 INSERT INTO public.cafe_cashier_activity_logs(cafe_id,cashier_id,action_type,target_type,details)
 VALUES(v_staff.cafe_id,v_staff.id,'login','cashier_session',jsonb_build_object('cashierName',v_staff.full_name,'source','whatsapp_otp'));
 RETURN jsonb_build_object('ok',true,'token',v_token,'expiresAt',v_expires);
END $$;

REVOKE ALL ON FUNCTION public.begin_staff_otp(uuid,text,text,text,text,text),public.mark_staff_otp_sent(uuid,text),public.verify_staff_otp(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_staff_otp(uuid,text,text,text,text,text),public.mark_staff_otp_sent(uuid,text),public.verify_staff_otp(uuid,text,text) TO service_role;
