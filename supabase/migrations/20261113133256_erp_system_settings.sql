BEGIN;
CREATE SCHEMA erp_settings_private;
REVOKE ALL ON SCHEMA erp_settings_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_system_settings(cafe_id uuid NOT NULL REFERENCES public.cafes(id),kind text NOT NULL CHECK(kind IN('general','brand','apps')),payload jsonb NOT NULL DEFAULT '{}',revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,kind),CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<262144));
CREATE TABLE public.erp_system_integrations(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),channel text NOT NULL CHECK(channel IN('smtp','sms','payment')),provider text NOT NULL,name text NOT NULL,config jsonb NOT NULL,secret_fields jsonb NOT NULL DEFAULT '[]',enabled boolean NOT NULL DEFAULT false,verified_at timestamptz,verification text NOT NULL DEFAULT 'unverified' CHECK(verification IN('unverified','verified','failed')),verification_message text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(cafe_id,id));
CREATE UNIQUE INDEX erp_system_integration_enabled ON public.erp_system_integrations(cafe_id,channel) WHERE enabled AND channel IN('smtp','sms');
CREATE TABLE erp_settings_private.secrets(cafe_id uuid NOT NULL,id uuid PRIMARY KEY,ciphertext text NOT NULL CHECK(length(ciphertext) BETWEEN 10 AND 64000),FOREIGN KEY(cafe_id,id) REFERENCES public.erp_system_integrations(cafe_id,id) ON DELETE CASCADE);
CREATE TABLE public.erp_system_api_keys(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),created_by uuid NOT NULL REFERENCES auth.users(id),name text NOT NULL,prefix text NOT NULL,scopes jsonb NOT NULL,purpose text NOT NULL CHECK(purpose IN('api','copilot')),expires_at timestamptz,active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz,UNIQUE(cafe_id,id));
CREATE TABLE erp_settings_private.api_hashes(id uuid PRIMARY KEY REFERENCES public.erp_system_api_keys(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE CHECK(token_hash~'^[a-f0-9]{64}$'),window_started timestamptz NOT NULL DEFAULT now(),window_count integer NOT NULL DEFAULT 0);
CREATE TABLE public.erp_system_api_usage(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),key_id uuid NOT NULL REFERENCES public.erp_system_api_keys(id),resource text NOT NULL,method text NOT NULL,status integer NOT NULL,purpose text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_system_usage_date ON public.erp_system_api_usage(cafe_id,created_at DESC);
CREATE INDEX erp_system_usage_key ON public.erp_system_api_usage(key_id,created_at DESC);
CREATE TABLE public.erp_system_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),actor uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,target text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX erp_system_event_date ON public.erp_system_events(cafe_id,created_at DESC);
CREATE TABLE erp_settings_private.requests(cafe_id uuid NOT NULL,request_id uuid NOT NULL,actor uuid NOT NULL,action text NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id));
CREATE TRIGGER erp_system_events_immutable BEFORE UPDATE OR DELETE ON public.erp_system_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER erp_system_usage_immutable BEFORE UPDATE OR DELETE ON public.erp_system_api_usage FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE TRIGGER erp_system_requests_immutable BEFORE UPDATE OR DELETE ON erp_settings_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
CREATE FUNCTION erp_settings_private.authorize(c uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN IF auth.uid() IS NULL OR brand_finance_private.role_for(c) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'إعدادات النظام متاحة لمالك العلامة فقط' USING ERRCODE='42501';END IF;END $$;
CREATE FUNCTION public.erp_system_appearance(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe) IS NULL THEN RAISE EXCEPTION 'لا تملك صلاحية هذه العلامة' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('appearance',coalesce((SELECT payload FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='brand'),'{}'),'general',coalesce((SELECT payload-'businessName'-'firstName'-'lastName'-'taxNumber'-'identifier'-'phone'-'mobile' FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='general'),'{}'),'apps',coalesce((SELECT payload FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='apps'),'{}'));
END $$;
ALTER FUNCTION erp_access_private.allowed(uuid,text,text) RENAME TO allowed_before_system_settings;
CREATE FUNCTION erp_access_private.allowed(c uuid,d text,a text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT erp_access_private.allowed_before_system_settings(c,d,a) AND NOT EXISTS(SELECT 1 FROM public.erp_system_settings WHERE cafe_id=c AND kind='apps' AND payload->d='false'::jsonb)$$;
CREATE FUNCTION public.erp_system_settings_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE account jsonb;BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);
 SELECT jsonb_build_object('id',c.id,'email',coalesce(u.email,''),'createdAt',c.created_at,'plan',coalesce(to_jsonb(c)->>'plan',''),'expiresAt',coalesce(to_jsonb(c)->>'subscription_expires_at',to_jsonb(c)->>'trial_ends_at'),'status',coalesce(to_jsonb(c)->>'status',''),'counts',jsonb_build_object('customers',(SELECT count(*) FROM public.bf_parties WHERE cafe_id=p_cafe AND kind='customer'),'employees',(SELECT count(*) FROM public.erp_hr_employees WHERE cafe_id=p_cafe),'invoices',(SELECT count(*) FROM public.bf_company_invoices WHERE cafe_id=p_cafe),'warehouses',(SELECT count(*) FROM public.bf_warehouses WHERE cafe_id=p_cafe),'branches',(SELECT count(*) FROM public.branches WHERE cafe_id=p_cafe))) INTO account FROM public.cafes c JOIN auth.users u ON u.id=c.owner_user_id WHERE c.id=p_cafe;
 RETURN jsonb_build_object('paymentInvoices',coalesce((SELECT jsonb_agg(x) FROM(SELECT i.document_id id,coalesce(e.display_number,d.number::text) number,p.name customer,d.total,(brand_finance_private.document_state(d.cafe_id,d.id)->>'outstanding')::numeric outstanding FROM public.bf_company_invoices i JOIN public.bf_documents d ON d.cafe_id=i.cafe_id AND d.id=i.document_id LEFT JOIN public.bf_invoice_extensions e ON e.cafe_id=d.cafe_id AND e.document_id=d.id LEFT JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id WHERE i.cafe_id=p_cafe ORDER BY d.created_at DESC LIMIT 100)x),'[]'),'account',account,'general',coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='general'),'{"revision":0}'),'appearance',coalesce((SELECT payload||jsonb_build_object('revision',revision) FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='brand'),'{"revision":0}'),'apps',coalesce((SELECT payload FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='apps'),'{}'),'appsRevision',coalesce((SELECT revision FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind='apps'),0),
 'integrations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'revision',revision,'channel',channel,'provider',provider,'name',name,'config',config,'secretFields',secret_fields,'enabled',enabled,'verifiedAt',verified_at,'verification',verification,'verificationMessage',verification_message,'createdAt',created_at) ORDER BY created_at) FROM public.erp_system_integrations WHERE cafe_id=p_cafe),'[]'),
 'keys',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'revision',k.revision,'name',k.name,'prefix',k.prefix,'scopes',k.scopes,'purpose',k.purpose,'expiresAt',k.expires_at,'active',k.active,'createdAt',k.created_at,'lastUsedAt',k.last_used_at,'requests',(SELECT count(*) FROM public.erp_system_api_usage WHERE key_id=k.id)) ORDER BY k.created_at DESC) FROM public.erp_system_api_keys k WHERE cafe_id=p_cafe),'[]'),
 'usage',coalesce((SELECT jsonb_agg(x ORDER BY "createdAt" DESC) FROM(SELECT u.id,k.name "keyName",u.resource,u.method,u.status,u.purpose,u.created_at "createdAt" FROM public.erp_system_api_usage u JOIN public.erp_system_api_keys k ON k.id=u.key_id WHERE u.cafe_id=p_cafe ORDER BY u.created_at DESC LIMIT 100)x),'[]'),
 'events',coalesce((SELECT jsonb_agg(x ORDER BY "createdAt" DESC) FROM(SELECT id,action,target,actor,created_at "createdAt" FROM public.erp_system_events WHERE cafe_id=p_cafe ORDER BY created_at DESC LIMIT 100)x),'[]'));
END $$;

CREATE FUNCTION erp_settings_private.safe_provider_template(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$DECLARE e record;BEGIN
 IF jsonb_typeof(v)='object' THEN FOR e IN SELECT * FROM jsonb_each(v) LOOP IF e.key~*'password|token|secret|api[_-]?key|authorization' AND (jsonb_typeof(e.value)<>'string' OR (e.value#>>'{}')!~'^\{\{secret\.[A-Za-z0-9_]+\}\}$') THEN RETURN false;END IF;IF NOT erp_settings_private.safe_provider_template(e.value) THEN RETURN false;END IF;END LOOP;
 ELSIF jsonb_typeof(v)='array' THEN FOR e IN SELECT value FROM jsonb_array_elements(v) LOOP IF NOT erp_settings_private.safe_provider_template(e.value) THEN RETURN false;END IF;END LOOP;END IF;RETURN true;
END $$;
CREATE FUNCTION public.erp_system_settings_write(p_cafe uuid,p_action text,p_data jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<system_write>>
DECLARE rev integer:=(p_data->>'revision')::integer;id uuid:=(p_data->>'id')::uuid;current_revision integer;result jsonb;prior erp_settings_private.requests;v jsonb;key text;cfg jsonb;integration public.erp_system_integrations;k public.erp_system_api_keys;target text:=p_action;
BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);
 IF p_request IS NULL OR rev IS NULL OR rev<0 OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>524288 OR p_action NOT IN('general','brand','apps','integration','integration_toggle','integration_delete','key','key_revoke') THEN RAISE EXCEPTION 'بيانات الإعدادات غير صالحة';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text||':system-settings',0));
 SELECT * INTO prior FROM erp_settings_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.action<>p_action OR prior.fingerprint<>md5(p_data::text) THEN RAISE EXCEPTION 'معرف العملية مستخدم لبيانات مختلفة';END IF;RETURN prior.result;END IF;
 IF p_action IN('general','brand','apps') THEN
  SELECT revision INTO current_revision FROM public.erp_system_settings WHERE cafe_id=p_cafe AND kind=p_action FOR UPDATE;
  IF coalesce(current_revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغيرت الإعدادات أعد تحميلها' USING ERRCODE='40001';END IF;
  cfg:=p_data-'revision';
  IF p_action='general' THEN
   IF length(btrim(coalesce(cfg->>'businessName',''))) NOT BETWEEN 1 AND 160 OR coalesce(cfg->>'country','')<>'SA' OR coalesce(cfg->>'currency','')<>'SAR' OR coalesce(cfg->>'language','')<>'ar' OR coalesce(cfg->>'negativeFormat','') NOT IN('minus','parentheses') OR coalesce(cfg->>'dateFormat','') NOT IN('dd/MM/yyyy','MM/dd/yyyy','yyyy-MM-dd') OR coalesce(cfg->>'timezone','') NOT IN('Asia/Riyadh','Asia/Dubai','Asia/Kuwait','Asia/Qatar','Africa/Cairo','UTC') OR coalesce(cfg->>'documentView','') NOT IN('browser','pdf') OR (cfg->>'weekStart')::integer NOT BETWEEN 0 AND 6 OR cfg->>'weekStart' IS NULL THEN RAISE EXCEPTION 'راجع بيانات النشاط وتهيئة النظام';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(cfg) e WHERE e.key NOT IN('businessName','phone','mobile','building','street','secondary','district','city','postal','shortAddress','country','taxNumber','identifierType','identifier','currency','negativeFormat','language','weekStart','dateFormat','timezone','documentView','firstName','lastName','defaultPriceListId') OR length(e.value::text)>400) THEN RAISE EXCEPTION 'حقل إعدادات غير صالح';END IF;
   IF cfg->>'defaultPriceListId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(brand_finance_private.invoice_settings(p_cafe)#>'{advanced,priceLists}') x WHERE x->>'id'=cfg->>'defaultPriceListId' AND (x->>'active')::boolean) THEN RAISE EXCEPTION 'قائمة الأسعار غير متاحة';END IF;
   PERFORM public.save_owner_cafe_settings(p_cafe,jsonb_build_object('cafe_name',cfg->>'businessName','owner_name',btrim(coalesce(cfg->>'firstName','')||' '||coalesce(cfg->>'lastName','')),'owner_phone',cfg->>'mobile','tax_number',cfg->>'taxNumber','commercial_register',cfg->>'identifier'));
  ELSIF p_action='brand' THEN
   FOREACH key IN ARRAY ARRAY['primary','ink','background'] LOOP IF coalesce(cfg->>key,'')!~'^#[0-9a-fA-F]{6}$' THEN RAISE EXCEPTION 'اختر ألوانًا صالحة';END IF;END LOOP;
   IF length(coalesce(cfg->>'logo',''))>150000 OR coalesce(cfg->>'logo','')<>'' AND cfg->>'logo'!~'^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$' OR EXISTS(SELECT 1 FROM jsonb_object_keys(cfg) property(field_name) WHERE property.field_name NOT IN('primary','ink','background','logo')) THEN RAISE EXCEPTION 'الشعار غير صالح';END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM jsonb_each(cfg) e WHERE NOT e.key=ANY(erp_access_private.domains()) OR e.key IN('store','templates') OR jsonb_typeof(e.value)<>'boolean') THEN RAISE EXCEPTION 'اختر تطبيقًا متاحًا في النظام';END IF;
  END IF;
  INSERT INTO public.erp_system_settings(cafe_id,kind,payload) VALUES(p_cafe,p_action,cfg) ON CONFLICT(cafe_id,kind) DO UPDATE SET payload=excluded.payload,revision=erp_system_settings.revision+1,updated_at=now();
 ELSIF p_action LIKE 'integration%' THEN
  IF id IS NULL THEN RAISE EXCEPTION 'معرف الاتصال مطلوب';END IF;target:=id::text;
  SELECT * INTO integration FROM public.erp_system_integrations WHERE cafe_id=p_cafe AND erp_system_integrations.id=system_write.id FOR UPDATE;
  IF coalesce(integration.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغير الاتصال أعد تحميله' USING ERRCODE='40001';END IF;
  IF p_action='integration_delete' THEN DELETE FROM public.erp_system_integrations WHERE cafe_id=p_cafe AND erp_system_integrations.id=system_write.id;
  ELSIF p_action='integration_toggle' THEN
   IF integration.id IS NULL OR jsonb_typeof(p_data->'enabled') IS DISTINCT FROM 'boolean' OR (p_data->>'enabled')::boolean AND (integration.verification<>'verified' OR integration.verified_at<now()-interval '30 days') THEN RAISE EXCEPTION 'تحقق من الاتصال قبل تفعيله';END IF;
   UPDATE public.erp_system_integrations SET enabled=(p_data->>'enabled')::boolean,revision=revision+1 WHERE cafe_id=p_cafe AND erp_system_integrations.id=system_write.id;
  ELSE
   cfg:=p_data->'config';
   IF coalesce(p_data->>'channel','') NOT IN('smtp','sms','payment') OR length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 100 OR jsonb_typeof(cfg) IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'secretFields') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'secretFields')>10 OR length(coalesce(p_data->>'ciphertext','')) NOT BETWEEN 10 AND 64000 OR p_data->>'ciphertext'!~'^v1[.]' THEN RAISE EXCEPTION 'راجع الاتصال وبياناته المحمية';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_each(cfg) e WHERE e.key NOT IN('fromName','fromEmail','host','port','secure','username','accountSid','authId','from','sender_name','phone_number_id','whatsapp_business_account_id','message_template','message_template_locale','sandbox_to_number','sandbox','accountId','publicKey','clientId','genericVerifyUrl','genericVerifyMethod','genericVerifyBody','genericSendUrl','genericFormat','genericBody','genericVerifyPath','genericVerifyValue','genericSuccessPath','genericSuccessValue','genericIdPath','genericAuthHeader','genericAuthSecret','genericAuthPrefix') OR length(e.value::text)>2100) THEN RAISE EXCEPTION 'حقل اتصال غير صالح أو غير محمي';END IF;
   IF cfg ? 'genericSendUrl' AND (NOT erp_settings_private.safe_provider_template((cfg->>'genericBody')::jsonb) OR cfg->>'genericVerifyMethod'='POST' AND NOT erp_settings_private.safe_provider_template((cfg->>'genericVerifyBody')::jsonb)) THEN RAISE EXCEPTION 'استخدم متغيرات الأسرار المحمية داخل قالب المزود';END IF;
   IF p_data->>'channel'='smtp' AND (p_data->>'provider'<>'smtp' OR cfg->>'host'!~'^[a-zA-Z0-9.-]{3,253}$' OR (cfg->>'port')::integer NOT IN(465,587) OR jsonb_typeof(cfg->'secure') IS DISTINCT FROM 'boolean' OR cfg->>'fromEmail'!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN RAISE EXCEPTION 'راجع إعدادات خادم البريد';END IF;
   IF p_data->>'channel'='sms' AND p_data->>'provider' NOT IN('twilio','plivo','jawaly','taqnyat','msegat','alghaddm','hawa','hisms','mobilenet','mobilyws','malath','jawalb','morasa','whatsapp') OR p_data->>'channel'='payment' AND p_data->>'provider' NOT IN('stripe','moyasar','tap','paypal','manual') THEN RAISE EXCEPTION 'مزود الاتصال غير صالح';END IF;
   IF cfg->>'accountId' IS NOT NULL AND cfg->>'accountId'<>'' AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND bf_accounts.id=(cfg->>'accountId')::uuid AND kind IN('cash','bank','pos') AND active AND NOT coalesce(frozen,false) AND deleted_at IS NULL) THEN RAISE EXCEPTION 'حساب التحصيل غير متاح';END IF;
   INSERT INTO public.erp_system_integrations(id,cafe_id,channel,provider,name,config,secret_fields) VALUES(id,p_cafe,p_data->>'channel',p_data->>'provider',p_data->>'name',cfg,p_data->'secretFields') ON CONFLICT ON CONSTRAINT erp_system_integrations_cafe_id_id_key DO UPDATE SET channel=excluded.channel,provider=excluded.provider,name=excluded.name,config=excluded.config,secret_fields=excluded.secret_fields,enabled=false,verified_at=NULL,verification='unverified',verification_message='',revision=erp_system_integrations.revision+1;
   INSERT INTO erp_settings_private.secrets VALUES(p_cafe,id,p_data->>'ciphertext') ON CONFLICT ON CONSTRAINT secrets_pkey DO UPDATE SET ciphertext=excluded.ciphertext;
  END IF;
 ELSIF p_action='key' THEN
  IF id IS NULL THEN RAISE EXCEPTION 'معرف المفتاح مطلوب';END IF;target:=id::text;SELECT * INTO k FROM public.erp_system_api_keys WHERE cafe_id=p_cafe AND erp_system_api_keys.id=system_write.id FOR UPDATE;
  IF coalesce(k.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغير المفتاح أعد تحميله' USING ERRCODE='40001';END IF;
  IF length(btrim(coalesce(p_data->>'name',''))) NOT BETWEEN 1 AND 100 OR coalesce(p_data->>'purpose','') NOT IN('api','copilot') OR jsonb_typeof(p_data->'scopes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'scopes') NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_data->'scopes') s WHERE s NOT IN('customers:read','invoices:read','inventory:read','requests:read','requests:write')) OR (coalesce(k.purpose,p_data->>'purpose')='copilot' AND (p_data->'scopes') ? 'requests:write') OR (k.id IS NOT NULL AND k.purpose IS DISTINCT FROM p_data->>'purpose') OR (p_data->>'expiresAt')::timestamptz<=now() THEN RAISE EXCEPTION 'راجع صلاحيات المفتاح وتاريخ انتهائه';END IF;
  IF rev=0 THEN
   IF coalesce(p_data->>'hash','')!~'^[a-f0-9]{64}$' OR coalesce(p_data->>'prefix','')!~'^branda_[A-Za-z0-9_-]{6,16}$' THEN RAISE EXCEPTION 'بصمة المفتاح غير صالحة';END IF;
   INSERT INTO public.erp_system_api_keys(id,cafe_id,created_by,name,prefix,scopes,purpose,expires_at) VALUES(id,p_cafe,auth.uid(),p_data->>'name',p_data->>'prefix',p_data->'scopes',p_data->>'purpose',(p_data->>'expiresAt')::timestamptz);
   INSERT INTO erp_settings_private.api_hashes(id,token_hash) VALUES(id,p_data->>'hash');
  ELSE UPDATE public.erp_system_api_keys SET name=p_data->>'name',scopes=p_data->'scopes',expires_at=(p_data->>'expiresAt')::timestamptz,revision=revision+1 WHERE cafe_id=p_cafe AND erp_system_api_keys.id=system_write.id;END IF;
 ELSIF p_action='key_revoke' THEN
  UPDATE public.erp_system_api_keys SET active=false,revision=revision+1 WHERE cafe_id=p_cafe AND erp_system_api_keys.id=system_write.id AND revision=rev;
  IF NOT FOUND THEN RAISE EXCEPTION 'تغير المفتاح أعد تحميله' USING ERRCODE='40001';END IF;target:=id::text;
 END IF;
 result:=jsonb_build_object('id',id,'revision',rev+1);
 INSERT INTO public.erp_system_events(cafe_id,actor,action,target) VALUES(p_cafe,auth.uid(),p_action,target);
 INSERT INTO erp_settings_private.requests VALUES(p_cafe,p_request,auth.uid(),p_action,md5(p_data::text),result);RETURN result;
END $$;
CREATE FUNCTION public.erp_system_integration_secret(p_cafe uuid,p_id uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT jsonb_build_object('id',i.id,'revision',i.revision,'channel',i.channel,'provider',i.provider,'enabled',i.enabled,'verification',i.verification,'config',i.config,'ciphertext',s.ciphertext) FROM public.erp_system_integrations i JOIN erp_settings_private.secrets s ON s.id=i.id AND s.cafe_id=i.cafe_id WHERE i.cafe_id=p_cafe AND i.id=p_id$$;
CREATE FUNCTION public.erp_system_integration_verified(p_cafe uuid,p_id uuid,p_revision integer,p_actor uuid,p_ok boolean,p_message text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe AND owner_user_id=p_actor AND deleted_at IS NULL) THEN RAISE EXCEPTION 'غير مصرح';END IF;
 UPDATE public.erp_system_integrations SET verification=CASE WHEN p_ok THEN 'verified' ELSE 'failed' END,verified_at=CASE WHEN p_ok THEN now() ELSE NULL END,verification_message=left(p_message,300),enabled=false,revision=revision+1 WHERE cafe_id=p_cafe AND id=p_id AND revision=p_revision;
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO public.erp_system_events(cafe_id,actor,action,target) VALUES(p_cafe,p_actor,'integration_verify',p_id::text);RETURN true;
END $$;

CREATE FUNCTION public.erp_system_api(p_hash text,p_resource text,p_method text DEFAULT 'GET',p_input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.erp_system_api_keys;h erp_settings_private.api_hashes;c public.cafes;rows jsonb;answer jsonb;v_status integer:=200;offset_value integer:=coalesce((p_input->>'offset')::integer,0);requested uuid:=(p_input->>'id')::uuid;prior_claim text;domain text;
BEGIN
 IF p_hash!~'^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status',401,'error','invalid_key');END IF;
 SELECT * INTO h FROM erp_settings_private.api_hashes WHERE token_hash=p_hash FOR UPDATE;
 SELECT * INTO k FROM public.erp_system_api_keys WHERE id=h.id AND active AND (expires_at IS NULL OR expires_at>now());
 IF k.id IS NULL THEN RETURN jsonb_build_object('status',401,'error','invalid_key');END IF;
 SELECT * INTO c FROM public.cafes WHERE id=k.cafe_id AND deleted_at IS NULL;
 IF c.id IS NULL OR c.status<>'active' OR k.created_by IS DISTINCT FROM c.owner_user_id OR NOT platform_access_private.service_enabled(c.id,'finance') OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=c.owner_user_id AND status='active') THEN RETURN jsonb_build_object('status',403,'error','unavailable');END IF;
 IF h.window_started<now()-interval '1 minute' THEN UPDATE erp_settings_private.api_hashes SET window_started=now(),window_count=1 WHERE id=k.id;ELSIF h.window_count>=60 THEN RETURN jsonb_build_object('status',429,'error','rate_limit');ELSE UPDATE erp_settings_private.api_hashes SET window_count=window_count+1 WHERE id=k.id;END IF;
 IF p_resource='capabilities' AND p_method='GET' THEN RETURN jsonb_build_object('status',200,'data',jsonb_build_object('scopes',k.scopes,'purpose',k.purpose,'brand',c.name));END IF;
 domain:=CASE p_resource WHEN 'invoices' THEN 'finance' ELSE p_resource END;
 IF p_resource NOT IN('customers','invoices','inventory','requests') OR p_method NOT IN('GET','POST') OR p_method='POST' AND p_resource<>'requests' THEN v_status:=404;
 ELSIF NOT k.scopes ? (p_resource||CASE WHEN p_method='GET' THEN ':read' ELSE ':write' END) OR EXISTS(SELECT 1 FROM public.erp_system_settings WHERE cafe_id=k.cafe_id AND kind='apps' AND payload->domain='false'::jsonb) THEN v_status:=403;
 ELSIF offset_value NOT BETWEEN 0 AND 1000000 OR octet_length(p_input::text)>524288 THEN v_status:=400;
 ELSE
  IF p_method='POST' THEN
   prior_claim:=current_setting('request.jwt.claim.sub',true);PERFORM set_config('request.jwt.claim.sub',c.owner_user_id::text,true);
   BEGIN answer:=public.erp_requests_write(k.cafe_id,'record',p_input->'data',(p_input->>'requestId')::uuid);EXCEPTION WHEN OTHERS THEN v_status:=400;answer:=jsonb_build_object('error','invalid_request');END;
   PERFORM set_config('request.jwt.claim.sub',coalesce(prior_claim,''),true);
  ELSIF p_resource='customers' THEN
   SELECT coalesce(jsonb_agg(x),'[]') INTO rows FROM(SELECT id,name,phone,email,tax_number,active FROM public.bf_parties WHERE cafe_id=k.cafe_id AND kind='customer' AND (requested IS NULL OR id=requested) ORDER BY id LIMIT 100 OFFSET offset_value)x;answer:=jsonb_build_object('rows',rows,'offset',offset_value,'limit',100);
  ELSIF p_resource='invoices' THEN
   SELECT coalesce(jsonb_agg(x),'[]') INTO rows FROM(SELECT i.document_id id,d.number,d.party_id,d.created_at,d.total,(brand_finance_private.document_state(d.cafe_id,d.id)->>'outstanding')::numeric outstanding,i.snapshot->>'currency' currency FROM public.bf_company_invoices i JOIN public.bf_documents d ON d.cafe_id=i.cafe_id AND d.id=i.document_id WHERE i.cafe_id=k.cafe_id AND (requested IS NULL OR i.document_id=requested) ORDER BY d.created_at DESC,d.id LIMIT 100 OFFSET offset_value)x;answer:=jsonb_build_object('rows',rows,'offset',offset_value,'limit',100);
  ELSIF p_resource='inventory' THEN
   SELECT coalesce(jsonb_agg(x),'[]') INTO rows FROM(SELECT id,name,sku,barcode,active FROM public.bf_items WHERE cafe_id=k.cafe_id AND (requested IS NULL OR id=requested) ORDER BY id LIMIT 100 OFFSET offset_value)x;answer:=jsonb_build_object('rows',rows,'offset',offset_value,'limit',100);
  ELSE
   SELECT coalesce(jsonb_agg(x),'[]') INTO rows FROM(SELECT id,number,type_id,status,closed,employee_id,user_id,payload,created_at,revision FROM public.erp_staff_requests WHERE cafe_id=k.cafe_id AND NOT deleted AND (requested IS NULL OR id=requested) ORDER BY created_at DESC,id LIMIT 100 OFFSET offset_value)x;answer:=jsonb_build_object('rows',rows,'offset',offset_value,'limit',100);
  END IF;
 END IF;
 INSERT INTO public.erp_system_api_usage(cafe_id,key_id,resource,method,status,purpose) VALUES(k.cafe_id,k.id,left(p_resource,80),left(p_method,10),v_status,k.purpose);
 UPDATE public.erp_system_api_keys SET last_used_at=now() WHERE id=k.id;
 RETURN jsonb_build_object('status',v_status,'data',CASE WHEN v_status=200 THEN answer ELSE NULL END,'error',CASE WHEN v_status=200 THEN NULL ELSE 'not_allowed' END);
END $$;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['erp_system_settings','erp_system_integrations','erp_system_api_keys','erp_system_api_usage','erp_system_events'] LOOP EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);END LOOP;FOREACH t IN ARRAY ARRAY['secrets','api_hashes','requests'] LOOP EXECUTE format('ALTER TABLE erp_settings_private.%I ENABLE ROW LEVEL SECURITY',t);END LOOP;END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA erp_settings_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL TABLES IN SCHEMA erp_settings_private FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_access_private.allowed(uuid,text,text),erp_access_private.allowed_before_system_settings(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.erp_system_settings_read(uuid),public.erp_system_settings_write(uuid,text,jsonb,uuid),public.erp_system_appearance(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_settings_read(uuid),public.erp_system_settings_write(uuid,text,jsonb,uuid),public.erp_system_appearance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.erp_system_integration_secret(uuid,uuid),public.erp_system_integration_verified(uuid,uuid,integer,uuid,boolean,text),public.erp_system_api(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_integration_secret(uuid,uuid),public.erp_system_integration_verified(uuid,uuid,integer,uuid,boolean,text),public.erp_system_api(text,text,text,jsonb) TO service_role;
CREATE FUNCTION public.erp_system_delivery_connection(p_cafe uuid,p_channel text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$SELECT public.erp_system_integration_secret(p_cafe,id) FROM public.erp_system_integrations WHERE cafe_id=p_cafe AND channel=CASE WHEN p_channel='email' THEN 'smtp' ELSE 'sms' END ORDER BY enabled DESC,created_at DESC LIMIT 1$$;
REVOKE ALL ON FUNCTION public.erp_system_delivery_connection(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_delivery_connection(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
