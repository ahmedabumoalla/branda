BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE gift_commerce_private.attachments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),product_id uuid NOT NULL REFERENCES public.menu_products(id),
 group_id text NOT NULL CHECK(length(group_id) BETWEEN 1 AND 100),request_id uuid NOT NULL,rate_key text NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),mime text NOT NULL CHECK(mime IN('image/png','image/jpeg','image/webp')),
 bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3145728),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 ready boolean NOT NULL DEFAULT false,order_id uuid,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 UNIQUE(cafe_id,rate_key,request_id),FOREIGN KEY(cafe_id,order_id) REFERENCES public.gift_orders(cafe_id,id)
);
CREATE INDEX gift_attachments_order ON gift_commerce_private.attachments(cafe_id,order_id);
CREATE INDEX gift_attachments_expiry ON gift_commerce_private.attachments(expires_at) WHERE order_id IS NULL;
ALTER TABLE gift_commerce_private.attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON gift_commerce_private.attachments FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('commerce-attachments','commerce-attachments',false,3145728,ARRAY['image/png','image/jpeg','image/webp'])
 ON CONFLICT(id) DO NOTHING;
DO $guard$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='commerce-attachments' AND (public OR file_size_limit IS DISTINCT FROM 3145728 OR allowed_mime_types IS DISTINCT FROM ARRAY['image/png','image/jpeg','image/webp'])) THEN RAISE EXCEPTION 'Attachment bucket configuration differs';END IF;END $guard$;
-- No anonymous/authenticated Storage object policy: upload/download is server-only.
CREATE POLICY commerce_attachments_private_boundary ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
 USING(bucket_id<>'commerce-attachments') WITH CHECK(bucket_id<>'commerce-attachments');

CREATE FUNCTION public.gift_attachment_admit(p_slug text,p_rate_key text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c uuid;k text;
BEGIN
 IF p_rate_key!~'^[a-f0-9]{64}$' OR p_rate_key IS NULL THEN RAISE EXCEPTION 'طلب غير صالح';END IF;
 SELECT id INTO c FROM public.cafes WHERE slug=p_slug;
 IF c IS NULL OR public.gift_store_config(p_slug) IS NULL OR NOT coalesce((public.gift_store_config(p_slug)->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'الطلبات غير مفعلة حاليًا';END IF;
 k:='attachment:'||c::text||':'||p_rate_key;
 PERFORM pg_advisory_xact_lock(hashtextextended('attachment-rate:'||c::text,0));
 IF (SELECT count(*) FROM gift_commerce_private.rate_limits WHERE key=k AND created_at>now()-interval '15 minutes')>=20
 OR (SELECT count(*) FROM gift_commerce_private.rate_limits WHERE key LIKE 'attachment:'||c::text||':%' AND created_at>now()-interval '1 day')>=2000 THEN RAISE EXCEPTION 'انتظر قليلًا قبل رفع ملف آخر';END IF;
 INSERT INTO gift_commerce_private.rate_limits(key) VALUES(k);
 DELETE FROM gift_commerce_private.rate_limits WHERE created_at<now()-interval '1 day';
END $fn$;

CREATE FUNCTION public.gift_attachment_reserve(p_slug text,p_rate_key text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE c uuid;g jsonb;a gift_commerce_private.attachments%ROWTYPE;
BEGIN
 SELECT id INTO c FROM public.cafes WHERE slug=p_slug;
 IF c IS NULL OR p_rate_key!~'^[a-f0-9]{64}$' OR p_rate_key IS NULL OR NOT coalesce((public.gift_store_config(p_slug)->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'المتجر غير متاح';END IF;
 IF NOT EXISTS(SELECT 1 FROM gift_commerce_private.rate_limits WHERE key='attachment:'||c::text||':'||p_rate_key AND created_at>now()-interval '1 minute') THEN RAISE EXCEPTION 'أعد محاولة رفع الملف';END IF;
 SELECT x INTO g FROM public.menu_products p CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.commerce_details->'optionGroups','[]')) x
 WHERE p.id=(p_input->>'productId')::uuid AND p.cafe_id=c AND p.available AND p.deleted_at IS NULL AND x->>'id'=p_input->>'groupId'
 AND (p.category_id IS NULL OR EXISTS(SELECT 1 FROM public.menu_categories mc WHERE mc.id=p.category_id AND mc.cafe_id=c AND mc.visible AND mc.deleted_at IS NULL))
 AND (p.branch_id IS NULL OR EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p.branch_id AND b.cafe_id=c AND b.active AND b.deleted_at IS NULL))
 AND (x->'showWhen' IS NULL OR x->'showWhen'->'optionIds' ? coalesce(p_input->>'optionId',''));
 IF g IS NULL OR g->>'type' NOT IN('image','file') OR NOT (coalesce(g->'accept','["image/png","image/jpeg","image/webp"]'::jsonb) ? (p_input->>'mime')) THEN RAISE EXCEPTION 'نوع الملف أو اختيار المنتج غير صالح';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('attachment-request:'||c::text||p_rate_key||coalesce(p_input->>'requestId',''),0));
 SELECT * INTO a FROM gift_commerce_private.attachments WHERE cafe_id=c AND rate_key=p_rate_key AND request_id=(p_input->>'requestId')::uuid FOR UPDATE;
 IF FOUND THEN
  IF a.sha256 IS DISTINCT FROM p_input->>'sha256' OR a.mime IS DISTINCT FROM p_input->>'mime' OR a.bytes IS DISTINCT FROM (p_input->>'bytes')::integer OR a.product_id IS DISTINCT FROM (p_input->>'productId')::uuid OR a.group_id IS DISTINCT FROM p_input->>'groupId' OR a.expires_at<=now() OR a.order_id IS NOT NULL THEN RAISE EXCEPTION 'تغير الملف أعد اختياره';END IF;
 ELSE
  INSERT INTO gift_commerce_private.attachments(cafe_id,product_id,group_id,request_id,rate_key,sha256,mime,bytes,name)
  VALUES(c,(p_input->>'productId')::uuid,p_input->>'groupId',(p_input->>'requestId')::uuid,p_rate_key,p_input->>'sha256',p_input->>'mime',(p_input->>'bytes')::integer,p_input->>'name') RETURNING * INTO a;
 END IF;
 RETURN jsonb_build_object('token',a.token,'path',a.cafe_id::text||'/'||a.id::text,'ready',a.ready,'name',a.name);
END $fn$;

CREATE FUNCTION public.gift_attachment_ready(p_token uuid,p_sha256 text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 UPDATE gift_commerce_private.attachments a SET ready=true WHERE token=p_token AND sha256=p_sha256 AND expires_at>now() AND order_id IS NULL
 AND EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='commerce-attachments' AND o.name=a.cafe_id::text||'/'||a.id::text);
 IF NOT FOUND THEN RAISE EXCEPTION 'تعذر تأكيد الملف أعد المحاولة';END IF;
END $fn$;

CREATE FUNCTION public.gift_attachment_owner_read(p_cafe uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a gift_commerce_private.attachments%ROWTYPE;
BEGIN
 IF NOT gift_commerce_private.can_manage(p_cafe) THEN RAISE EXCEPTION 'لا تملك صلاحية تنزيل المرفق' USING ERRCODE='42501';END IF;
 SELECT * INTO a FROM gift_commerce_private.attachments WHERE id=p_id AND cafe_id=p_cafe AND ready AND order_id IS NOT NULL;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('path',a.cafe_id::text||'/'||a.id::text,'name',a.name,'mime',a.mime,'bytes',a.bytes);
END $fn$;

-- Called inside the order transaction while its catalog rows are already locked.
CREATE FUNCTION gift_commerce_private.custom_selection(p_cafe uuid,p_product uuid,p_option text,p_group jsonb,p_selection jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE a gift_commerce_private.attachments%ROWTYPE;v text;d date;
BEGIN
 IF p_group->'showWhen' IS NOT NULL AND NOT (p_group->'showWhen'->'optionIds' ? coalesce(p_option,'')) THEN
  IF p_selection IS NOT NULL THEN RAISE EXCEPTION 'أزل البيانات المخفية بعد تغيير الاختيار';END IF;
  RETURN '[]';
 END IF;
 IF p_group->>'type' IN('text','date') THEN
  v:=btrim(coalesce(p_selection->>'text',''));
  IF length(v)>1000 OR (coalesce((p_group->>'required')::boolean,false) AND v='') THEN RAISE EXCEPTION 'أكمل البيانات المطلوبة للمنتج';END IF;
  IF v='' THEN RETURN '[]';END IF;
  IF p_group->>'type'='date' THEN
   IF v!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'اختر تاريخًا صالحًا';END IF;
   BEGIN d:=v::date;EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'اختر تاريخًا صالحًا';END;
   IF to_char(d,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'اختر تاريخًا صالحًا';END IF;
  END IF;
  RETURN jsonb_build_array(jsonb_build_object('label',p_group->>'label','value',v,'priceDelta',0));
 END IF;
 IF p_group->>'type' IN('file','image') THEN
  IF nullif(p_selection->>'attachmentToken','') IS NULL THEN
   IF coalesce((p_group->>'required')::boolean,false) THEN RAISE EXCEPTION 'أرفق الملف المطلوب';END IF;
   RETURN '[]';
  END IF;
  SELECT * INTO a FROM gift_commerce_private.attachments WHERE token=(p_selection->>'attachmentToken')::uuid AND cafe_id=p_cafe AND product_id=p_product AND group_id=p_group->>'id' AND ready AND order_id IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR NOT (coalesce(p_group->'accept','["image/png","image/jpeg","image/webp"]'::jsonb) ? a.mime) THEN RAISE EXCEPTION 'الملف غير متاح أعد رفعه';END IF;
  RETURN jsonb_build_array(jsonb_build_object('label',p_group->>'label','value',a.name,'priceDelta',0,'attachmentId',a.id));
 END IF;
 RAISE EXCEPTION 'نوع اختيار غير صالح';
END $fn$;

DO $patch$
DECLARE src text;old text;new text;
BEGIN
 src:=replace(pg_get_functiondef('public.gift_order_submit(text,uuid,jsonb,text)'::regprocedure),chr(13),'');
 old:=$old$   IF g->>'type'='text' THEN
    IF length(coalesce(sel->>'text',''))>1000 OR (coalesce((g->>'required')::boolean,false) AND length(btrim(coalesce(sel->>'text','')))=0) THEN RAISE EXCEPTION 'أكمل البيانات المطلوبة للمنتج';END IF;
    IF nullif(btrim(sel->>'text'),'') IS NOT NULL THEN snap:=snap||jsonb_build_array(jsonb_build_object('label',g->>'label','value',btrim(sel->>'text'),'priceDelta',0));END IF;
   ELSE$old$;
 new:=$new$   IF g->'showWhen' IS NOT NULL AND NOT (g->'showWhen'->'optionIds' ? coalesce(entry->>'optionId','')) THEN
    IF sel IS NOT NULL THEN RAISE EXCEPTION 'أزل البيانات المخفية بعد تغيير الاختيار';END IF;
   ELSIF g->>'type' IN('text','date','file','image') THEN
    snap:=snap||gift_commerce_private.custom_selection(c,p.id,entry->>'optionId',g,sel);
   ELSE$new$;
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Order selection validation changed; inspect migration';END IF;
 src:=replace(src,old,new);
 old:=$old$ INSERT INTO public.gift_order_events(cafe_id,order_id,request_id,action) VALUES(c,new_id,p_request,'submitted');$old$;
 new:=$new$ UPDATE gift_commerce_private.attachments a SET order_id=new_id WHERE a.cafe_id=c AND a.order_id IS NULL AND a.id IN(
  SELECT (s->>'attachmentId')::uuid FROM jsonb_array_elements(lines) l CROSS JOIN LATERAL jsonb_array_elements(l->'selections') s WHERE s ? 'attachmentId');
 INSERT INTO public.gift_order_events(cafe_id,order_id,request_id,action) VALUES(c,new_id,p_request,'submitted');$new$;
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Order attachment link anchor changed';END IF;
 EXECUTE replace(src,old,new);
END $patch$;
REVOKE ALL ON FUNCTION public.gift_attachment_admit(text,text),public.gift_attachment_reserve(text,text,jsonb),public.gift_attachment_ready(uuid,text),public.gift_attachment_owner_read(uuid,uuid),gift_commerce_private.custom_selection(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.gift_attachment_admit(text,text),public.gift_attachment_reserve(text,text,jsonb),public.gift_attachment_ready(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_attachment_owner_read(uuid,uuid) TO authenticated;
COMMIT;
