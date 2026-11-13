BEGIN;
CREATE TABLE public.erp_system_taxes(id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),rate numeric NOT NULL CHECK(rate IN(0,15)),active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,UNIQUE(cafe_id,id));
CREATE UNIQUE INDEX erp_system_tax_name ON public.erp_system_taxes(cafe_id,lower(name)) WHERE active;
CREATE TABLE public.erp_system_product_defaults(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),tax1_id uuid,tax2_id uuid,sold_item_type text NOT NULL DEFAULT 'product' CHECK(sold_item_type IN('product','service','work')),revision integer NOT NULL DEFAULT 1,FOREIGN KEY(cafe_id,tax1_id) REFERENCES public.erp_system_taxes(cafe_id,id),FOREIGN KEY(cafe_id,tax2_id) REFERENCES public.erp_system_taxes(cafe_id,id));
CREATE FUNCTION public.erp_system_product_configuration(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$DECLARE d public.erp_system_product_defaults;t1 numeric;t2 numeric;BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(p_cafe) IS NULL THEN RAISE EXCEPTION 'لا تملك صلاحية هذه العلامة' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.erp_system_product_defaults WHERE cafe_id=p_cafe;
 SELECT rate INTO t1 FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND id=d.tax1_id AND active;SELECT rate INTO t2 FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND id=d.tax2_id AND active;
 RETURN jsonb_build_object('revision',coalesce(d.revision,0),'tax1Id',d.tax1_id,'tax2Id',d.tax2_id,'tax1',CASE WHEN d.cafe_id IS NULL THEN 15 ELSE coalesce(t1,0) END,'tax2',coalesce(t2,0),'soldItemType',coalesce(d.sold_item_type,'product'),'taxes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'rate',rate,'active',active,'revision',revision) ORDER BY name) FROM public.erp_system_taxes WHERE cafe_id=p_cafe),'[]'));
END $$;
CREATE FUNCTION public.erp_system_product_configuration_save(p_cafe uuid,p_action text,p_input jsonb,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$DECLARE id uuid:=(p_input->>'id')::uuid;rev integer:=(p_input->>'revision')::integer;d public.erp_system_product_defaults;t public.erp_system_taxes;t1 uuid:=(p_input->>'tax1Id')::uuid;t2 uuid:=(p_input->>'tax2Id')::uuid;total numeric;result jsonb;prior erp_settings_private.requests;BEGIN
 PERFORM erp_settings_private.authorize(p_cafe);IF p_request IS NULL OR rev IS NULL OR p_action NOT IN('tax','defaults') THEN RAISE EXCEPTION 'راجع إعدادات الضرائب';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text||':system-settings',0));SELECT * INTO prior FROM erp_settings_private.requests WHERE cafe_id=p_cafe AND request_id=p_request;
 IF FOUND THEN IF prior.actor<>auth.uid() OR prior.action<>'products_'||p_action OR prior.fingerprint<>md5(p_input::text) THEN RAISE EXCEPTION 'معرف العملية مستخدم لبيانات أخرى';END IF;RETURN prior.result;END IF;
 IF p_action='tax' THEN
  SELECT * INTO t FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND erp_system_taxes.id=(p_input->>'id')::uuid FOR UPDATE;
  IF coalesce(t.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغيرت الضريبة أعد تحميلها' USING ERRCODE='40001';END IF;
  IF id IS NULL OR length(trim(coalesce(p_input->>'name',''))) NOT BETWEEN 1 AND 100 OR coalesce(p_input->>'rate','') NOT IN('0','15') OR jsonb_typeof(p_input->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع اسم الضريبة ونسبتها';END IF;
  IF t.id IS NOT NULL AND(t.rate<>(p_input->>'rate')::numeric OR NOT(p_input->>'active')::boolean) AND EXISTS(SELECT 1 FROM public.erp_system_product_defaults WHERE cafe_id=p_cafe AND(tax1_id=t.id OR tax2_id=t.id)) THEN RAISE EXCEPTION 'غيّر الضريبة الافتراضية أولًا قبل تعديل نسبة ضريبة مستخدمة أو إيقافها';END IF;
  INSERT INTO public.erp_system_taxes(id,cafe_id,name,rate,active) VALUES(id,p_cafe,trim(p_input->>'name'),(p_input->>'rate')::numeric,(p_input->>'active')::boolean) ON CONFLICT ON CONSTRAINT erp_system_taxes_pkey DO UPDATE SET name=excluded.name,rate=excluded.rate,active=excluded.active,revision=erp_system_taxes.revision+1 WHERE erp_system_taxes.cafe_id=p_cafe;
 ELSE
  SELECT * INTO d FROM public.erp_system_product_defaults WHERE cafe_id=p_cafe FOR UPDATE;IF coalesce(d.revision,0) IS DISTINCT FROM rev THEN RAISE EXCEPTION 'تغيرت افتراضيات المنتجات أعد تحميلها' USING ERRCODE='40001';END IF;
  IF coalesce(p_input->>'soldItemType','') NOT IN('product','service','work') OR t1 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND erp_system_taxes.id=t1 AND active) OR t2 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND erp_system_taxes.id=t2 AND active) THEN RAISE EXCEPTION 'اختر ضرائب نشطة ونوع بند صالحًا';END IF;
  SELECT coalesce((SELECT rate FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND erp_system_taxes.id=t1),0)+coalesce((SELECT rate FROM public.erp_system_taxes WHERE cafe_id=p_cafe AND erp_system_taxes.id=t2),0) INTO total;
  IF total NOT IN(0,15) THEN RAISE EXCEPTION 'مجموع الضريبتين يجب أن يطابق نسب الفاتورة المدعومة صفر أو 15 بالمئة';END IF;
  INSERT INTO public.erp_system_product_defaults(cafe_id,tax1_id,tax2_id,sold_item_type) VALUES(p_cafe,t1,t2,p_input->>'soldItemType') ON CONFLICT ON CONSTRAINT erp_system_product_defaults_pkey DO UPDATE SET tax1_id=excluded.tax1_id,tax2_id=excluded.tax2_id,sold_item_type=excluded.sold_item_type,revision=erp_system_product_defaults.revision+1;
 END IF;
 result:=public.erp_system_product_configuration(p_cafe);INSERT INTO erp_settings_private.requests VALUES(p_cafe,p_request,auth.uid(),'products_'||p_action,md5(p_input::text),result);INSERT INTO public.erp_system_events(cafe_id,actor,action,target) VALUES(p_cafe,auth.uid(),'products_'||p_action,coalesce(id::text,'defaults'));RETURN result;
END $$;
CREATE FUNCTION erp_settings_private.product_defaults() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE d public.erp_system_product_defaults;tax numeric;BEGIN
 IF EXISTS(SELECT 1 FROM public.erp_inventory_items WHERE cafe_id=NEW.cafe_id AND item_id=NEW.item_id) THEN RETURN NEW;END IF;
 SELECT * INTO d FROM public.erp_system_product_defaults WHERE cafe_id=NEW.cafe_id;IF NOT FOUND THEN RETURN NEW;END IF;
 IF NOT(NEW.payload ? 'tax1') THEN SELECT rate INTO tax FROM public.erp_system_taxes WHERE cafe_id=NEW.cafe_id AND id=d.tax1_id AND active;NEW.payload:=NEW.payload||jsonb_build_object('tax1',coalesce(tax,0),'defaultTax1Id',d.tax1_id);END IF;
 IF NOT(NEW.payload ? 'tax2') THEN SELECT rate INTO tax FROM public.erp_system_taxes WHERE cafe_id=NEW.cafe_id AND id=d.tax2_id AND active;NEW.payload:=NEW.payload||jsonb_build_object('tax2',coalesce(tax,0),'defaultTax2Id',d.tax2_id);END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_system_product_defaults BEFORE INSERT ON public.erp_inventory_items FOR EACH ROW EXECUTE FUNCTION erp_settings_private.product_defaults();
CREATE FUNCTION erp_settings_private.inventory_boolean_settings() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$DECLARE k text;BEGIN FOREACH k IN ARRAY ARRAY['salesRequisitions','trackingEnabled','bundlesEnabled','showAvailableStock','countByDate'] LOOP IF NEW.payload ? k AND jsonb_typeof(NEW.payload->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع خيارات المخزون يجب اختيار قيمة تشغيل أو إيقاف صالحة';END IF;END LOOP;RETURN NEW;END $$;
CREATE TRIGGER erp_system_inventory_boolean_settings BEFORE INSERT OR UPDATE OF payload ON public.erp_inventory_settings FOR EACH ROW EXECUTE FUNCTION erp_settings_private.inventory_boolean_settings();
REVOKE ALL ON FUNCTION erp_settings_private.inventory_boolean_settings() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.erp_system_taxes ENABLE ROW LEVEL SECURITY;ALTER TABLE public.erp_system_product_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_system_taxes,public.erp_system_product_defaults FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_settings_private.product_defaults(),public.erp_system_product_configuration(uuid),public.erp_system_product_configuration_save(uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_system_product_configuration(uuid),public.erp_system_product_configuration_save(uuid,text,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
