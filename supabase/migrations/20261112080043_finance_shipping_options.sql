BEGIN;
-- Shipping catalogue/settings only. No invoice, POS, payment or stock function is changed.
CREATE TABLE public.bf_shipping_settings (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),settings jsonb NOT NULL CHECK(jsonb_typeof(settings)='object'),revision integer NOT NULL CHECK(revision>0),
  updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.bf_shipping_options (
  id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),active boolean NOT NULL,
  fee numeric(14,2) NOT NULL CHECK(fee BETWEEN 0 AND 10000000),tax_rate numeric CHECK(tax_rate=15),display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 999999),
  account_id uuid,description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),revision integer NOT NULL CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id),updated_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),deleted_at timestamptz,
  UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,account_id) REFERENCES public.bf_accounts(cafe_id,id)
);
CREATE UNIQUE INDEX bf_shipping_options_name ON public.bf_shipping_options(cafe_id,lower(btrim(name))) WHERE deleted_at IS NULL;
CREATE INDEX bf_shipping_options_list ON public.bf_shipping_options(cafe_id,display_order,name,id) WHERE deleted_at IS NULL;
CREATE TABLE public.bf_shipping_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),option_id uuid,revision integer NOT NULL CHECK(revision>0),
  action text NOT NULL CHECK(action IN('created','updated','deleted')),before_value jsonb,after_value jsonb,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(cafe_id,option_id) REFERENCES public.bf_shipping_options(cafe_id,id)
);
CREATE UNIQUE INDEX bf_shipping_events_option_revision ON public.bf_shipping_events(cafe_id,option_id,revision) WHERE option_id IS NOT NULL;
CREATE UNIQUE INDEX bf_shipping_events_settings_revision ON public.bf_shipping_events(cafe_id,revision) WHERE option_id IS NULL;
CREATE TRIGGER bf_shipping_events_immutable BEFORE UPDATE OR DELETE ON public.bf_shipping_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
ALTER TABLE public.bf_shipping_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_shipping_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bf_shipping_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bf_shipping_settings,public.bf_shipping_options,public.bf_shipping_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION brand_finance_private.shipping_option_json(p_option public.bf_shipping_options) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT jsonb_build_object('id',p_option.id,'name',p_option.name,'active',p_option.active,'fee',p_option.fee,'taxRate',p_option.tax_rate,'displayOrder',p_option.display_order,'accountId',p_option.account_id,'description',p_option.description,'revision',p_option.revision,'createdAt',p_option.created_at,'updatedAt',p_option.updated_at)
$$;
CREATE FUNCTION brand_finance_private.shipping_role(p_cafe_id uuid,p_write boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE role_name text;
BEGIN
  role_name:=brand_finance_private.role_for(p_cafe_id);
  IF auth.uid() IS NULL OR coalesce(role_name,'') NOT IN('owner','manager','accountant','auditor') OR (p_write AND role_name<>'owner') THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION brand_finance_private.shipping_option_json(public.bf_shipping_options),brand_finance_private.shipping_role(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.brand_finance_shipping_settings(p_cafe_id uuid,p_action text DEFAULT 'get',p_settings jsonb DEFAULT NULL,p_revision integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_settings jsonb;current_revision integer;service_id uuid;policies jsonb;services jsonb;accounts jsonb;names jsonb;
BEGIN
  PERFORM brand_finance_private.shipping_role(p_cafe_id,p_action='save');
  IF p_action IS NULL OR p_action NOT IN('get','save') THEN RAISE EXCEPTION 'Invalid shipping settings action' USING ERRCODE='22023';END IF;
  policies:=brand_finance_private.invoice_settings(p_cafe_id)#>'{advanced,productPolicies}';
  IF p_action='save' THEN
    IF p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع إعدادات الشحن' USING ERRCODE='22023';END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_settings))<>2 OR NOT p_settings ?& ARRAY['enabled','codServiceId'] OR jsonb_typeof(p_settings->'enabled') IS DISTINCT FROM 'boolean'
      OR (p_settings->'codServiceId'<>'null'::jsonb AND (jsonb_typeof(p_settings->'codServiceId') IS DISTINCT FROM 'string' OR p_settings->>'codServiceId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    THEN RAISE EXCEPTION 'راجع إعدادات الشحن وخدمة الدفع عند الاستلام' USING ERRCODE='22023';END IF;
    service_id:=(p_settings->>'codServiceId')::uuid;
    IF service_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.menu_products p WHERE p.cafe_id=p_cafe_id AND p.id=service_id AND p.available AND p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(policies) x WHERE x->>'productId'=p.id::text AND x->>'kind'='service')) THEN RAISE EXCEPTION 'اختر منتج خدمة نشطًا من إعدادات الفواتير' USING ERRCODE='22023';END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60622));
  END IF;
  SELECT settings,revision INTO current_settings,current_revision FROM public.bf_shipping_settings WHERE cafe_id=p_cafe_id;
  current_settings:=coalesce(current_settings,'{"enabled":false,"codServiceId":null}'::jsonb);current_revision:=coalesce(current_revision,0);
  IF p_action='save' AND current_settings IS DISTINCT FROM p_settings THEN
    IF current_revision<>p_revision THEN RAISE EXCEPTION 'Shipping settings conflict' USING ERRCODE='40001';END IF;
    INSERT INTO public.bf_shipping_settings(cafe_id,settings,revision,updated_by) VALUES(p_cafe_id,p_settings,current_revision+1,auth.uid()) ON CONFLICT(cafe_id) DO UPDATE SET settings=excluded.settings,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp();
    INSERT INTO public.bf_shipping_events(cafe_id,option_id,revision,action,before_value,after_value,created_by) VALUES(p_cafe_id,NULL,current_revision+1,CASE WHEN current_revision=0 THEN 'created' ELSE 'updated' END,current_settings,p_settings,auth.uid());
    current_settings:=p_settings;current_revision:=current_revision+1;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) ORDER BY p.name,p.id),'[]'::jsonb) INTO services FROM public.menu_products p WHERE p.cafe_id=p_cafe_id AND p.available AND p.deleted_at IS NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(policies) x WHERE x->>'productId'=p.id::text AND x->>'kind'='service');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'code',a.code) ORDER BY a.code,a.id),'[]'::jsonb) INTO accounts FROM (SELECT id,name,code FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND active AND kind='revenue' ORDER BY code,id LIMIT 500) a;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) ORDER BY o.display_order,o.name,o.id),'[]'::jsonb) INTO names FROM public.bf_shipping_options o WHERE o.cafe_id=p_cafe_id AND o.deleted_at IS NULL;
  RETURN jsonb_build_object('settings',current_settings,'revision',current_revision,'services',services,'accounts',accounts,'optionNames',names);
END $$;

CREATE FUNCTION public.brand_finance_shipping_options(p_cafe_id uuid,p_query jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE search_text text;state text;page_number integer;sort_name text;sort_direction text;total integer;items jsonb;
BEGIN
  PERFORM brand_finance_private.shipping_role(p_cafe_id);
  IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid shipping filters' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_query))<>5 OR NOT p_query ?& ARRAY['query','status','page','sort','direction'] OR jsonb_typeof(p_query->'query') IS DISTINCT FROM 'string' OR length(p_query->>'query')>160 OR coalesce(p_query->>'status','') NOT IN('all','active','inactive') OR coalesce(p_query->>'sort','') NOT IN('displayOrder','name','fee','active') OR coalesce(p_query->>'direction','') NOT IN('asc','desc') OR jsonb_typeof(p_query->'page') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid shipping filters' USING ERRCODE='22023';END IF;
  IF (p_query->>'page')::numeric NOT BETWEEN 1 AND 1000 OR (p_query->>'page')::numeric<>trunc((p_query->>'page')::numeric) THEN RAISE EXCEPTION 'Invalid shipping page' USING ERRCODE='22023';END IF;
  search_text:=btrim(p_query->>'query');state:=p_query->>'status';page_number:=(p_query->>'page')::integer;sort_name:=p_query->>'sort';sort_direction:=p_query->>'direction';
  SELECT count(*) INTO total FROM public.bf_shipping_options o WHERE o.cafe_id=p_cafe_id AND o.deleted_at IS NULL AND strpos(lower(o.name),lower(search_text))>0 AND (state='all' OR o.active=(state='active'));
  page_number:=least(page_number,greatest(1,(total+29)/30));
  SELECT coalesce(jsonb_agg(brand_finance_private.shipping_option_json(o)),'[]'::jsonb) INTO items FROM (
    SELECT s.* FROM public.bf_shipping_options s WHERE s.cafe_id=p_cafe_id AND s.deleted_at IS NULL AND strpos(lower(s.name),lower(search_text))>0 AND (state='all' OR s.active=(state='active'))
    ORDER BY CASE WHEN sort_name='name' AND sort_direction='asc' THEN s.name END ASC,CASE WHEN sort_name='name' AND sort_direction='desc' THEN s.name END DESC,
      CASE WHEN sort_name='fee' AND sort_direction='asc' THEN s.fee END ASC,CASE WHEN sort_name='fee' AND sort_direction='desc' THEN s.fee END DESC,
      CASE WHEN sort_name='active' AND sort_direction='asc' THEN s.active END ASC,CASE WHEN sort_name='active' AND sort_direction='desc' THEN s.active END DESC,
      CASE WHEN sort_name='displayOrder' AND sort_direction='asc' THEN s.display_order END ASC,CASE WHEN sort_name='displayOrder' AND sort_direction='desc' THEN s.display_order END DESC,s.name,s.id
    OFFSET (page_number-1)*30 LIMIT 30
  ) o;
  RETURN jsonb_build_object('items',items,'total',total,'page',page_number,'limit',30);
END $$;

CREATE FUNCTION public.brand_finance_shipping_option(p_cafe_id uuid,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE option public.bf_shipping_options%ROWTYPE;
BEGIN
  PERFORM brand_finance_private.shipping_role(p_cafe_id);
  SELECT * INTO option FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'خيار الشحن غير متاح أو تم حذفه' USING ERRCODE='22023';END IF;
  RETURN brand_finance_private.shipping_option_json(option);
END $$;

CREATE FUNCTION public.brand_finance_save_shipping_option(p_cafe_id uuid,p_id uuid,p_option jsonb,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_option public.bf_shipping_options%ROWTYPE;new_option public.bf_shipping_options%ROWTYPE;before_value jsonb;account_id uuid;is_new boolean;
BEGIN
  PERFORM brand_finance_private.shipping_role(p_cafe_id,true);
  IF p_id IS NULL OR p_revision IS NULL OR p_revision<0 OR jsonb_typeof(p_option) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'راجع بيانات خيار الشحن' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_option))<>7 OR NOT p_option ?& ARRAY['name','active','fee','taxRate','displayOrder','accountId','description']
    OR jsonb_typeof(p_option->'name') IS DISTINCT FROM 'string' OR length(btrim(p_option->>'name')) NOT BETWEEN 1 AND 160 OR p_option->>'name'<>btrim(p_option->>'name')
    OR jsonb_typeof(p_option->'active') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_option->'fee') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_option->'displayOrder') IS DISTINCT FROM 'number' OR jsonb_typeof(p_option->'description') IS DISTINCT FROM 'string' OR length(p_option->>'description')>1000
    OR (p_option->'taxRate'<>'null'::jsonb AND p_option->'taxRate'<>'15'::jsonb)
    OR (p_option->'accountId'<>'null'::jsonb AND (jsonb_typeof(p_option->'accountId') IS DISTINCT FROM 'string' OR p_option->>'accountId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
  THEN RAISE EXCEPTION 'راجع اسم خيار الشحن وحالته وضريبته وحسابه' USING ERRCODE='22023';END IF;
  IF (p_option->>'fee')::numeric NOT BETWEEN 0 AND 10000000 OR (p_option->>'fee')::numeric<>round((p_option->>'fee')::numeric,2) OR (p_option->>'displayOrder')::numeric NOT BETWEEN 0 AND 999999 OR (p_option->>'displayOrder')::numeric<>trunc((p_option->>'displayOrder')::numeric) THEN RAISE EXCEPTION 'راجع رسوم الشحن وترتيب العرض' USING ERRCODE='22023';END IF;
  account_id:=(p_option->>'accountId')::uuid;
  IF account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.id=account_id AND a.active AND a.kind='revenue') THEN RAISE EXCEPTION 'اختر حساب إيراد نشطًا' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60622));
  SELECT * INTO current_option FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=p_id FOR UPDATE;
  is_new:=NOT FOUND;
  IF NOT is_new THEN
    IF current_option.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'خيار الشحن محذوف' USING ERRCODE='22023';END IF;
    before_value:=brand_finance_private.shipping_option_json(current_option)-ARRAY['id','revision','createdAt','updatedAt'];
    IF before_value=p_option THEN RETURN brand_finance_private.shipping_option_json(current_option);END IF;
  END IF;
  IF coalesce(current_option.revision,0)<>p_revision THEN RAISE EXCEPTION 'Shipping option conflict' USING ERRCODE='40001';END IF;
  IF is_new AND (SELECT count(*) FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND deleted_at IS NULL)>=500 THEN RAISE EXCEPTION 'الحد الأقصى ٥٠٠ خيار شحن' USING ERRCODE='22023';END IF;
  INSERT INTO public.bf_shipping_options(id,cafe_id,name,active,fee,tax_rate,display_order,account_id,description,revision,created_by,updated_by)
    VALUES(p_id,p_cafe_id,p_option->>'name',(p_option->>'active')::boolean,(p_option->>'fee')::numeric,(p_option->>'taxRate')::numeric,(p_option->>'displayOrder')::integer,account_id,p_option->>'description',p_revision+1,auth.uid(),auth.uid())
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,fee=excluded.fee,tax_rate=excluded.tax_rate,display_order=excluded.display_order,account_id=excluded.account_id,description=excluded.description,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=clock_timestamp() WHERE public.bf_shipping_options.cafe_id=p_cafe_id RETURNING * INTO new_option;
  IF new_option.id IS NULL THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
  INSERT INTO public.bf_shipping_events(cafe_id,option_id,revision,action,before_value,after_value,created_by) VALUES(p_cafe_id,p_id,new_option.revision,CASE WHEN is_new THEN 'created' ELSE 'updated' END,before_value,p_option,auth.uid());
  RETURN brand_finance_private.shipping_option_json(new_option);
END $$;

CREATE FUNCTION public.brand_finance_delete_shipping_option(p_cafe_id uuid,p_id uuid,p_revision integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE option public.bf_shipping_options%ROWTYPE;
BEGIN
  PERFORM brand_finance_private.shipping_role(p_cafe_id,true);
  IF p_revision IS NULL OR p_revision<1 THEN RAISE EXCEPTION 'Invalid shipping option revision' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60622));
  SELECT * INTO option FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'خيار الشحن غير متاح' USING ERRCODE='22023';END IF;
  IF option.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('id',option.id,'revision',option.revision,'deleted',true);END IF;
  IF option.revision<>p_revision THEN RAISE EXCEPTION 'Shipping option conflict' USING ERRCODE='40001';END IF;
  UPDATE public.bf_shipping_options SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),updated_by=auth.uid(),revision=revision+1 WHERE cafe_id=p_cafe_id AND id=p_id;
  INSERT INTO public.bf_shipping_events(cafe_id,option_id,revision,action,before_value,after_value,created_by) VALUES(p_cafe_id,p_id,p_revision+1,'deleted',brand_finance_private.shipping_option_json(option)-ARRAY['id','revision','createdAt','updatedAt'],NULL,auth.uid());
  RETURN jsonb_build_object('id',option.id,'revision',p_revision+1,'deleted',true);
END $$;

CREATE FUNCTION public.brand_finance_shipping_activity(p_cafe_id uuid,p_id uuid,p_query jsonb DEFAULT '{"actions":[],"actorIds":[],"from":"","to":"","direction":"desc","page":1}'::jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE items jsonb;actors jsonb;page_number integer;total integer;sort_direction text;from_time timestamptz;until_time timestamptz;
BEGIN
  PERFORM brand_finance_private.shipping_role(p_cafe_id);
  IF NOT EXISTS(SELECT 1 FROM public.bf_shipping_options WHERE cafe_id=p_cafe_id AND id=p_id) THEN RAISE EXCEPTION 'خيار الشحن غير متاح' USING ERRCODE='22023';END IF;
  IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid activity query' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_query))<>6 OR NOT p_query ?& ARRAY['actions','actorIds','from','to','direction','page']
    OR jsonb_typeof(p_query->'actions') IS DISTINCT FROM 'array' OR jsonb_typeof(p_query->'actorIds') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_query->'from') IS DISTINCT FROM 'string' OR jsonb_typeof(p_query->'to') IS DISTINCT FROM 'string'
    OR coalesce(p_query->>'direction','') NOT IN('asc','desc') OR jsonb_typeof(p_query->'page') IS DISTINCT FROM 'number'
  THEN RAISE EXCEPTION 'راجع فلاتر سجل النشاطات' USING ERRCODE='22023';END IF;
  IF jsonb_array_length(p_query->'actions')>3 OR jsonb_array_length(p_query->'actorIds')>50
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_query->'actions') a WHERE jsonb_typeof(a) IS DISTINCT FROM 'string' OR a#>>'{}' NOT IN('created','updated','deleted'))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_query->'actorIds') a WHERE jsonb_typeof(a) IS DISTINCT FROM 'string' OR a#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    OR (p_query->>'page')::numeric NOT BETWEEN 1 AND 1000 OR (p_query->>'page')::numeric<>trunc((p_query->>'page')::numeric)
    OR p_query->>'from' !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$' OR p_query->>'to' !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2})?$'
  THEN RAISE EXCEPTION 'راجع فلاتر سجل النشاطات' USING ERRCODE='22023';END IF;
  IF p_query->>'from'<>'' THEN from_time:=(p_query->>'from')::date::timestamp AT TIME ZONE 'Asia/Riyadh';END IF;
  IF p_query->>'to'<>'' THEN until_time:=((p_query->>'to')::date+1)::timestamp AT TIME ZONE 'Asia/Riyadh';END IF;
  IF from_time IS NOT NULL AND until_time IS NOT NULL AND from_time>=until_time THEN RAISE EXCEPTION 'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية' USING ERRCODE='22023';END IF;
  page_number:=(p_query->>'page')::integer;sort_direction:=p_query->>'direction';
  SELECT count(*) INTO total FROM public.bf_shipping_events e WHERE e.cafe_id=p_cafe_id AND e.option_id=p_id
    AND (jsonb_array_length(p_query->'actions')=0 OR p_query->'actions' ? e.action)
    AND (jsonb_array_length(p_query->'actorIds')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_query->'actorIds') a WHERE a::uuid=e.created_by))
    AND (from_time IS NULL OR e.created_at>=from_time) AND (until_time IS NULL OR e.created_at<until_time);
  page_number:=least(page_number,greatest(1,(total+19)/20));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'revision',e.revision,'action',e.action,'actorId',e.created_by,'actor',coalesce((SELECT nullif(s.name,'') FROM public.bf_staff s WHERE s.cafe_id=p_cafe_id AND s.user_id=e.created_by),(SELECT nullif(p.full_name,'') FROM public.profiles p WHERE p.id=e.created_by),'مستخدم غير مسمى'),'createdAt',e.created_at,'changes',(SELECT coalesce(jsonb_agg(jsonb_build_object('field',f.name,'before',e.before_value->f.name,'after',e.after_value->f.name) ORDER BY f.position),'[]'::jsonb) FROM unnest(ARRAY['name','active','fee','taxRate','displayOrder','accountId','description']) WITH ORDINALITY f(name,position) WHERE e.before_value->f.name IS DISTINCT FROM e.after_value->f.name)) ORDER BY CASE WHEN sort_direction='asc' THEN e.revision END ASC,CASE WHEN sort_direction='desc' THEN e.revision END DESC),'[]'::jsonb) INTO items
    FROM (SELECT * FROM public.bf_shipping_events v WHERE v.cafe_id=p_cafe_id AND v.option_id=p_id
      AND (jsonb_array_length(p_query->'actions')=0 OR p_query->'actions' ? v.action)
      AND (jsonb_array_length(p_query->'actorIds')=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_query->'actorIds') a WHERE a::uuid=v.created_by))
      AND (from_time IS NULL OR v.created_at>=from_time) AND (until_time IS NULL OR v.created_at<until_time)
      ORDER BY CASE WHEN sort_direction='asc' THEN v.revision END ASC,CASE WHEN sort_direction='desc' THEN v.revision END DESC OFFSET (page_number-1)*20 LIMIT 20) e;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.created_by,'name',coalesce((SELECT nullif(s.name,'') FROM public.bf_staff s WHERE s.cafe_id=p_cafe_id AND s.user_id=a.created_by),(SELECT nullif(p.full_name,'') FROM public.profiles p WHERE p.id=a.created_by),'مستخدم غير مسمى')) ORDER BY a.created_by),'[]'::jsonb) INTO actors FROM (SELECT DISTINCT created_by FROM public.bf_shipping_events WHERE cafe_id=p_cafe_id AND option_id=p_id ORDER BY created_by LIMIT 500) a;
  RETURN jsonb_build_object('items',items,'page',page_number,'total',total,'limit',20,'actors',actors);
END $$;

REVOKE ALL ON FUNCTION public.brand_finance_shipping_settings(uuid,text,jsonb,integer),public.brand_finance_shipping_options(uuid,jsonb),public.brand_finance_shipping_option(uuid,uuid),public.brand_finance_save_shipping_option(uuid,uuid,jsonb,integer),public.brand_finance_delete_shipping_option(uuid,uuid,integer),public.brand_finance_shipping_activity(uuid,uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_shipping_settings(uuid,text,jsonb,integer),public.brand_finance_shipping_options(uuid,jsonb),public.brand_finance_shipping_option(uuid,uuid),public.brand_finance_save_shipping_option(uuid,uuid,jsonb,integer),public.brand_finance_delete_shipping_option(uuid,uuid,integer),public.brand_finance_shipping_activity(uuid,uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
