-- Independent ERP booking domain. Existing salon/POS/menu tables are read-only dependencies.
CREATE TABLE public.erp_booking_settings (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id), revision integer NOT NULL DEFAULT 1,
 assignment_mode text NOT NULL DEFAULT 'booking' CHECK(assignment_mode IN('booking','service','none')),
 service_mode text NOT NULL DEFAULT 'multiple' CHECK(service_mode IN('multiple','single','default')),
 allow_unassigned boolean NOT NULL DEFAULT false, allow_unscheduled boolean NOT NULL DEFAULT false,
 default_service_id uuid, timezone text NOT NULL DEFAULT 'Asia/Riyadh', slot_minutes integer NOT NULL DEFAULT 30 CHECK(slot_minutes IN(5,10,15,20,30,60))
);
CREATE TABLE public.erp_booking_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150), category text NOT NULL DEFAULT '' CHECK(length(category)<=100),
 duration integer NOT NULL CHECK(duration BETWEEN 5 AND 1440), price numeric(14,2) NOT NULL DEFAULT 0 CHECK(price BETWEEN 0 AND 1000000000 AND price<>'NaN'),
 tax_rate numeric(6,3) NOT NULL DEFAULT 0 CHECK(tax_rate BETWEEN 0 AND 100 AND tax_rate<>'NaN'),
 staff_ids uuid[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 image_path text CHECK(image_path IS NULL OR (image_path LIKE cafe_id::text||'/%' AND image_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}[.]webp$')),
 UNIQUE(cafe_id,id)
);
ALTER TABLE public.erp_booking_settings ADD FOREIGN KEY(cafe_id,default_service_id) REFERENCES public.erp_booking_services(cafe_id,id);
CREATE TABLE public.erp_booking_packages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 150),
 service_ids uuid[] NOT NULL CHECK(cardinality(service_ids) BETWEEN 1 AND 30),active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1
);
CREATE TABLE public.erp_booking_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),staff_id uuid NOT NULL REFERENCES auth.users(id),
 branch_id uuid REFERENCES public.branches(id),weekday integer CHECK(weekday BETWEEN 0 AND 6),on_date date,
 starts time NOT NULL DEFAULT '09:00',ends time NOT NULL DEFAULT '17:00',closed boolean NOT NULL DEFAULT false,
 CHECK((weekday IS NULL)<>(on_date IS NULL)),CHECK(closed OR ends>starts),revision integer NOT NULL DEFAULT 1
);
CREATE INDEX erp_booking_availability_lookup ON public.erp_booking_availability(cafe_id,staff_id,on_date,weekday);
CREATE TABLE public.erp_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 customer_id uuid NOT NULL,branch_id uuid REFERENCES public.branches(id),series_id uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN('scheduled','confirmed','arrived','in_progress','completed','cancelled','no_show')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),revision integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),invoice_draft_id uuid,
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,customer_id) REFERENCES public.bf_parties(cafe_id,id)
);
CREATE TABLE public.erp_booking_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,booking_id uuid NOT NULL,service_id uuid NOT NULL,
 service_name text NOT NULL,position integer NOT NULL,staff_id uuid REFERENCES auth.users(id),starts_at timestamptz,ends_at timestamptz,
 duration integer NOT NULL CHECK(duration BETWEEN 5 AND 1440),price numeric(14,2) NOT NULL CHECK(price BETWEEN 0 AND 1000000000 AND price<>'NaN'),tax_rate numeric(6,3) NOT NULL CHECK(tax_rate BETWEEN 0 AND 100),
 CHECK((starts_at IS NULL AND ends_at IS NULL) OR (starts_at IS NOT NULL AND ends_at>starts_at)),
 FOREIGN KEY(cafe_id,booking_id) REFERENCES public.erp_bookings(cafe_id,id),FOREIGN KEY(cafe_id,service_id) REFERENCES public.erp_booking_services(cafe_id,id),UNIQUE(booking_id,position)
);
CREATE INDEX erp_booking_lines_overlap ON public.erp_booking_lines(cafe_id,staff_id,starts_at,ends_at);
CREATE INDEX erp_bookings_customer ON public.erp_bookings(cafe_id,customer_id,created_at DESC);
CREATE TABLE public.erp_booking_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),booking_id uuid,
 actor uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(cafe_id,booking_id) REFERENCES public.erp_bookings(cafe_id,id)
);
CREATE INDEX erp_booking_events_record ON public.erp_booking_events(cafe_id,booking_id,created_at);
CREATE TABLE public.erp_booking_requests (
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,actor uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,PRIMARY KEY(cafe_id,request_id)
);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['settings','services','packages','availability','events','requests','lines'] LOOP
 EXECUTE format('ALTER TABLE public.erp_booking_%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.erp_booking_%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP; END $$;
ALTER TABLE public.erp_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_bookings FROM PUBLIC,anon,authenticated,service_role;
-- RPC-only access deliberately prevents clients bypassing availability/concurrency invariants.
CREATE FUNCTION public.erp_bookings_read(p_cafe_id uuid,p_from date,p_to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; result jsonb;
BEGIN
 r:=brand_finance_private.role_for(p_cafe_id);
 IF auth.uid() IS NULL OR coalesce(r,'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Booking access denied' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>62 THEN RAISE EXCEPTION 'Invalid date window' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('canWrite',r IN('owner','manager'),
 'settings',coalesce((SELECT to_jsonb(s)-'cafe_id' FROM public.erp_booking_settings s WHERE cafe_id=p_cafe_id),jsonb_build_object('revision',0,'assignment_mode','booking','service_mode','multiple','allow_unassigned',false,'allow_unscheduled',false,'default_service_id',null,'timezone','Asia/Riyadh','slot_minutes',30)),
 'services',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id' ORDER BY name) FROM public.erp_booking_services s WHERE cafe_id=p_cafe_id),'[]'),
 'packages',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id' ORDER BY name) FROM public.erp_booking_packages s WHERE cafe_id=p_cafe_id),'[]'),
 'availability',coalesce((SELECT jsonb_agg(to_jsonb(s)-'cafe_id') FROM public.erp_booking_availability s WHERE cafe_id=p_cafe_id),'[]'),
 'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',user_id,'name',name)) FROM public.bf_staff WHERE cafe_id=p_cafe_id AND active),'[]')||jsonb_build_array((SELECT jsonb_build_object('id',owner_user_id,'name','مالك العلامة') FROM public.cafes WHERE id=p_cafe_id)),
 'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.branches WHERE cafe_id=p_cafe_id AND active AND deleted_at IS NULL),'[]'),
 'bookings',coalesce((SELECT jsonb_agg(to_jsonb(b)-'cafe_id'||jsonb_build_object('customer_name',c.name,'invoice_document_id',(SELECT document_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=b.invoice_draft_id),'lines',(SELECT coalesce(jsonb_agg(to_jsonb(l)-'cafe_id' ORDER BY position),'[]') FROM public.erp_booking_lines l WHERE booking_id=b.id),'events',(SELECT coalesce(jsonb_agg(to_jsonb(e)-'cafe_id' ORDER BY created_at),'[]') FROM public.erp_booking_events e WHERE booking_id=b.id)) ORDER BY b.created_at DESC) FROM public.erp_bookings b JOIN public.bf_parties c ON c.id=b.customer_id WHERE b.cafe_id=p_cafe_id AND EXISTS(SELECT 1 FROM public.erp_booking_lines l WHERE l.booking_id=b.id AND (l.starts_at IS NULL OR (l.starts_at<(p_to+1)::timestamptz+interval '1 day' AND l.ends_at>p_from::timestamptz-interval '1 day')))),'[]')) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.erp_booking_customers(p_cafe_id uuid,p_query text DEFAULT '',p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR coalesce(brand_finance_private.role_for(p_cafe_id),'') NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'Denied' USING ERRCODE='42501'; END IF;
 IF p_query IS NULL OR p_offset IS NULL OR length(p_query)>100 OR p_offset<0 THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') FROM (SELECT id,name,phone FROM public.bf_parties WHERE cafe_id=p_cafe_id AND kind='customer' AND active AND (position(lower(p_query) in lower(name))>0 OR position(p_query in phone)>0) ORDER BY name,id OFFSET p_offset LIMIT 50) t);
END $$;
CREATE FUNCTION public.erp_bookings_write(p_cafe_id uuid,p_action text,p_payload jsonb,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_variable
DECLARE role_name text; prev public.erp_booking_requests; settings public.erp_booking_settings; svc public.erp_booking_services;
 old_booking public.erp_bookings; item jsonb; new_id uuid; object_id uuid; staff_id uuid; branch_id uuid; customer_id uuid;
 start_time timestamptz; end_time timestamptz; local_start timestamp; local_end timestamp; day_offset integer; count_repeat integer; interval_days integer;
 service_ids uuid[]; assigned uuid[]; series uuid:=gen_random_uuid(); ids jsonb:='[]'; result jsonb; i integer; j integer;
 old_revision integer; target_status text; current_state text; skip_dates jsonb; service_mode text;
BEGIN
 role_name:=brand_finance_private.role_for(p_cafe_id);
 IF coalesce(role_name,'') NOT IN('owner','manager') OR auth.uid() IS NULL THEN RAISE EXCEPTION 'Booking write denied' USING ERRCODE='42501'; END IF;
 IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 -- All domain writes share this tenant lock, including configuration and recurrence batches.
 PERFORM pg_advisory_xact_lock(hashtextextended('erp-bookings:'||p_cafe_id::text,0));
 SELECT * INTO prev FROM public.erp_booking_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
 IF FOUND THEN IF prev.actor<>auth.uid() OR prev.action<>p_action OR prev.payload<>p_payload THEN RAISE EXCEPTION 'Request conflict' USING ERRCODE='40001'; END IF; RETURN prev.result; END IF;
 object_id:=nullif(p_payload->>'id','')::uuid;
 SELECT * INTO settings FROM public.erp_booking_settings WHERE cafe_id=p_cafe_id;
 IF NOT FOUND THEN INSERT INTO public.erp_booking_settings(cafe_id) VALUES(p_cafe_id) RETURNING * INTO settings; END IF;
 IF p_action='settings' THEN
  IF coalesce((p_payload->>'revision')::integer,0) NOT IN(settings.revision,CASE WHEN settings.revision=1 THEN 0 ELSE -1 END) THEN RAISE EXCEPTION 'Stale settings' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_payload->>'timezone') THEN RAISE EXCEPTION 'Invalid timezone' USING ERRCODE='22023'; END IF;
  IF p_payload->>'service_mode'='default' AND NOT EXISTS(SELECT 1 FROM public.erp_booking_services WHERE cafe_id=p_cafe_id AND id=(p_payload->>'default_service_id')::uuid AND active) THEN RAISE EXCEPTION 'اختر الخدمة الافتراضية النشطة' USING ERRCODE='22023'; END IF;
  UPDATE public.erp_booking_settings SET assignment_mode=p_payload->>'assignment_mode',service_mode=p_payload->>'service_mode',allow_unassigned=(p_payload->>'allow_unassigned')::boolean,allow_unscheduled=(p_payload->>'allow_unscheduled')::boolean,default_service_id=nullif(p_payload->>'default_service_id','')::uuid,timezone=p_payload->>'timezone',slot_minutes=(p_payload->>'slot_minutes')::integer,revision=revision+1 WHERE cafe_id=p_cafe_id;
  result:=jsonb_build_object('id',p_cafe_id);
 ELSIF p_action IN('service','package','availability','availability_delete') THEN
  new_id:=coalesce(object_id,gen_random_uuid());
  IF p_action='service' THEN
   assigned:=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'staff_ids','[]'))::uuid);
   IF EXISTS(SELECT 1 FROM unnest(assigned) u WHERE NOT EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=u AND active) AND NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=u)) THEN RAISE EXCEPTION 'Invalid staff' USING ERRCODE='22023'; END IF;
   IF object_id IS NOT NULL THEN
    IF (p_payload->>'active')::boolean=false AND settings.service_mode='default' AND settings.default_service_id=object_id THEN RAISE EXCEPTION 'غيّر الخدمة الافتراضية قبل تعطيلها' USING ERRCODE='22023'; END IF;
    UPDATE public.erp_booking_services SET name=btrim(p_payload->>'name'),category=coalesce(p_payload->>'category',''),duration=(p_payload->>'duration')::integer,price=(p_payload->>'price')::numeric,tax_rate=(p_payload->>'tax_rate')::numeric,staff_ids=assigned,active=(p_payload->>'active')::boolean,image_path=nullif(p_payload->>'image_path',''),revision=revision+1 WHERE cafe_id=p_cafe_id AND id=object_id AND revision=(p_payload->>'revision')::integer;
    IF NOT FOUND THEN RAISE EXCEPTION 'Stale service' USING ERRCODE='40001'; END IF;
   ELSE INSERT INTO public.erp_booking_services(id,cafe_id,name,category,duration,price,tax_rate,staff_ids,active,image_path) VALUES(new_id,p_cafe_id,btrim(p_payload->>'name'),coalesce(p_payload->>'category',''),(p_payload->>'duration')::integer,(p_payload->>'price')::numeric,(p_payload->>'tax_rate')::numeric,assigned,(p_payload->>'active')::boolean,nullif(p_payload->>'image_path','')); END IF;
  ELSIF p_action='package' THEN
   service_ids:=ARRAY(SELECT jsonb_array_elements_text(p_payload->'service_ids')::uuid);
   IF EXISTS(SELECT 1 FROM unnest(service_ids) u WHERE NOT EXISTS(SELECT 1 FROM public.erp_booking_services WHERE cafe_id=p_cafe_id AND id=u AND active)) THEN RAISE EXCEPTION 'Invalid service' USING ERRCODE='22023'; END IF;
   IF object_id IS NULL THEN INSERT INTO public.erp_booking_packages(id,cafe_id,name,service_ids,active) VALUES(new_id,p_cafe_id,btrim(p_payload->>'name'),service_ids,(p_payload->>'active')::boolean);
   ELSE UPDATE public.erp_booking_packages SET name=btrim(p_payload->>'name'),service_ids=service_ids,active=(p_payload->>'active')::boolean,revision=revision+1 WHERE cafe_id=p_cafe_id AND id=object_id AND revision=(p_payload->>'revision')::integer; IF NOT FOUND THEN RAISE EXCEPTION 'Stale package' USING ERRCODE='40001'; END IF; END IF;
  ELSE
   staff_id:=(p_payload->>'staff_id')::uuid; branch_id:=nullif(p_payload->>'branch_id','')::uuid;
   IF NOT(EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=staff_id AND active) OR EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=staff_id)) THEN RAISE EXCEPTION 'Invalid staff' USING ERRCODE='22023'; END IF;
   IF branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=branch_id AND cafe_id=p_cafe_id AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid branch' USING ERRCODE='22023'; END IF;
   IF object_id IS NOT NULL THEN DELETE FROM public.erp_booking_availability WHERE cafe_id=p_cafe_id AND id=object_id AND revision=(p_payload->>'revision')::integer; IF NOT FOUND THEN RAISE EXCEPTION 'Stale availability' USING ERRCODE='40001'; END IF; END IF;
   IF p_action<>'availability_delete' THEN INSERT INTO public.erp_booking_availability(id,cafe_id,staff_id,branch_id,weekday,on_date,starts,ends,closed,revision) VALUES(new_id,p_cafe_id,staff_id,branch_id,nullif(p_payload->>'weekday','')::integer,nullif(p_payload->>'on_date','')::date,(p_payload->>'starts')::time,(p_payload->>'ends')::time,(p_payload->>'closed')::boolean,coalesce((p_payload->>'revision')::integer,0)+1); END IF;
  END IF;
  result:=jsonb_build_object('id',new_id);
 ELSIF p_action IN('save','status','invoice') THEN
  IF object_id IS NOT NULL THEN SELECT * INTO old_booking FROM public.erp_bookings WHERE cafe_id=p_cafe_id AND id=object_id FOR UPDATE; IF NOT FOUND OR old_booking.revision IS DISTINCT FROM (p_payload->>'revision')::integer THEN RAISE EXCEPTION 'Stale booking' USING ERRCODE='40001'; END IF; END IF;
  IF p_action='invoice' THEN
   IF object_id IS NULL OR old_booking.status IN('cancelled','no_show') THEN RAISE EXCEPTION 'لا يمكن فوترة هذا الحجز' USING ERRCODE='22023'; END IF;
   IF old_booking.invoice_draft_id IS NOT NULL THEN result:=jsonb_build_object('id',old_booking.invoice_draft_id,'documentId',(SELECT document_id FROM public.bf_company_invoices WHERE cafe_id=p_cafe_id AND draft_id=old_booking.invoice_draft_id));
   ELSE
    new_id:=gen_random_uuid();
    PERFORM public.brand_finance_save_invoice_draft(p_cafe_id,new_id,0,jsonb_build_object('template','standard','deliveryMethod','print','shipping','none','attachments','[]'::jsonb,'extraFields','[]'::jsonb,'deposit',jsonb_build_object('kind','amount','value',0,'paid',false),'delivery',jsonb_build_object('confirmed',false,'date',''),'invoice',jsonb_build_object('partyId',old_booking.customer_id,'warehouseId','','accountId','','paymentKind','credit','discountValue',0,'discountKind','amount','taxInclusive',false,'currency','SAR','note','حجز #'||old_booking.number,'lines',(SELECT jsonb_agg(jsonb_build_object('key',l.position,'productId','','name',l.service_name,'description',l.service_name,'kind','service','quantity',1,'price',l.price,'vatRate',l.tax_rate,'taxCategory',CASE WHEN l.tax_rate>0 THEN 'S' ELSE 'Z' END) ORDER BY l.position) FROM public.erp_booking_lines l JOIN public.erp_booking_services s ON s.id=l.service_id WHERE l.booking_id=object_id))));
    UPDATE public.erp_bookings SET invoice_draft_id=new_id,revision=revision+1,updated_at=now() WHERE id=object_id;
    INSERT INTO public.erp_booking_events(cafe_id,booking_id,actor,action,details) VALUES(p_cafe_id,object_id,auth.uid(),'invoice_draft',jsonb_build_object('draft',new_id));
    result:=jsonb_build_object('id',new_id);
   END IF;
  ELSIF p_action='status' THEN
   IF object_id IS NULL THEN RAISE EXCEPTION 'Missing booking' USING ERRCODE='22023'; END IF;
   target_status:=p_payload->>'status'; current_state:=old_booking.status;
   IF NOT ((current_state='scheduled' AND target_status IN('confirmed','arrived','cancelled','no_show')) OR (current_state='confirmed' AND target_status IN('arrived','cancelled','no_show')) OR (current_state='arrived' AND target_status IN('in_progress','cancelled')) OR (current_state='in_progress' AND target_status='completed')) THEN RAISE EXCEPTION 'انتقال حالة الحجز غير مسموح' USING ERRCODE='22023'; END IF;
   IF target_status IN('arrived','in_progress','completed') AND EXISTS(SELECT 1 FROM public.erp_booking_lines WHERE booking_id=object_id AND starts_at IS NULL) THEN RAISE EXCEPTION 'حدد موعد الخدمات قبل تنفيذ الحجز' USING ERRCODE='22023'; END IF;
   UPDATE public.erp_bookings SET status=target_status,revision=revision+1,updated_at=now() WHERE id=object_id;
   INSERT INTO public.erp_booking_events(cafe_id,booking_id,actor,action,details) VALUES(p_cafe_id,object_id,auth.uid(),'status',jsonb_build_object('from',current_state,'to',target_status,'reason',left(coalesce(p_payload->>'reason',''),1000)));
   result:=jsonb_build_object('id',object_id);
  ELSE
   IF object_id IS NOT NULL AND (old_booking.status NOT IN('scheduled','confirmed') OR old_booking.invoice_draft_id IS NOT NULL) THEN RAISE EXCEPTION 'لا يمكن تعديل حجز بدأ تنفيذه أو ارتبط بفاتورة' USING ERRCODE='22023'; END IF;
   customer_id:=(p_payload->>'customer_id')::uuid; branch_id:=nullif(p_payload->>'branch_id','')::uuid;
   IF NOT EXISTS(SELECT 1 FROM public.bf_parties WHERE id=customer_id AND cafe_id=p_cafe_id AND kind='customer' AND active) THEN RAISE EXCEPTION 'Invalid customer' USING ERRCODE='22023'; END IF;
   IF branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=branch_id AND cafe_id=p_cafe_id AND active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Invalid branch' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 30 OR (settings.service_mode IN('single','default') AND jsonb_array_length(p_payload->'lines')<>1) THEN RAISE EXCEPTION 'راجع عدد الخدمات المسموح للحجز' USING ERRCODE='22023'; END IF;
   count_repeat:=coalesce((p_payload->>'repeat_count')::integer,1); interval_days:=coalesce((p_payload->>'repeat_days')::integer,7); skip_dates:=coalesce(p_payload->'skip_dates','[]');
   IF count_repeat NOT BETWEEN 1 AND 52 OR interval_days NOT BETWEEN 1 AND 365 OR (object_id IS NOT NULL AND count_repeat<>1) OR jsonb_typeof(skip_dates)<>'array' THEN RAISE EXCEPTION 'Invalid recurrence' USING ERRCODE='22023'; END IF;
   FOR i IN 0..count_repeat-1 LOOP
    day_offset:=i*interval_days;
    IF p_payload->'lines'->0->>'starts_at' IS NOT NULL AND skip_dates ? (((p_payload->'lines'->0->>'starts_at')::timestamptz AT TIME ZONE settings.timezone + make_interval(days=>day_offset))::date::text) THEN CONTINUE; END IF;
    new_id:=coalesce(object_id,gen_random_uuid());
    IF object_id IS NULL THEN INSERT INTO public.erp_bookings(id,cafe_id,customer_id,branch_id,series_id,note,created_by) VALUES(new_id,p_cafe_id,customer_id,branch_id,series,coalesce(p_payload->>'note',''),auth.uid());
    ELSE UPDATE public.erp_bookings SET customer_id=customer_id,branch_id=branch_id,note=coalesce(p_payload->>'note',''),revision=revision+1,updated_at=now() WHERE id=object_id; DELETE FROM public.erp_booking_lines WHERE booking_id=object_id; END IF;
    j:=0;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
     j:=j+1; SELECT * INTO svc FROM public.erp_booking_services WHERE cafe_id=p_cafe_id AND id=(item->>'service_id')::uuid AND active;
     IF NOT FOUND OR (settings.service_mode='default' AND svc.id IS DISTINCT FROM settings.default_service_id) THEN RAISE EXCEPTION 'اختر خدمة نشطة ومسموحة' USING ERRCODE='22023'; END IF;
     staff_id:=nullif(item->>'staff_id','')::uuid;
     IF settings.assignment_mode='none' THEN staff_id:=NULL;
     ELSIF settings.assignment_mode='booking' AND j>1 AND staff_id IS DISTINCT FROM nullif(p_payload->'lines'->0->>'staff_id','')::uuid THEN RAISE EXCEPTION 'يجب تعيين موظف واحد لجميع الخدمات' USING ERRCODE='22023'; END IF;
     IF staff_id IS NULL AND settings.assignment_mode<>'none' AND NOT settings.allow_unassigned THEN RAISE EXCEPTION 'حدد الموظف المسؤول عن الحجز' USING ERRCODE='22023'; END IF;
     IF staff_id IS NOT NULL AND (NOT(staff_id=ANY(svc.staff_ids)) OR NOT(EXISTS(SELECT 1 FROM public.bf_staff WHERE cafe_id=p_cafe_id AND user_id=staff_id AND active) OR EXISTS(SELECT 1 FROM public.cafes WHERE id=p_cafe_id AND owner_user_id=staff_id))) THEN RAISE EXCEPTION 'الموظف غير مخصص لهذه الخدمة' USING ERRCODE='22023'; END IF;
     start_time:=CASE WHEN nullif(item->>'starts_at','') IS NULL THEN NULL ELSE (((item->>'starts_at')::timestamptz AT TIME ZONE settings.timezone)+make_interval(days=>day_offset)) AT TIME ZONE settings.timezone END;
     end_time:=start_time+make_interval(mins=>svc.duration);
     IF start_time IS NULL AND (NOT settings.allow_unscheduled OR count_repeat>1) THEN RAISE EXCEPTION 'حدد وقت بدء الخدمة' USING ERRCODE='22023'; END IF;
     IF start_time IS NOT NULL AND NOT isfinite(start_time) THEN RAISE EXCEPTION 'Invalid time' USING ERRCODE='22023'; END IF;
     IF start_time IS NOT NULL AND staff_id IS NOT NULL THEN
      local_start:=start_time AT TIME ZONE settings.timezone; local_end:=end_time AT TIME ZONE settings.timezone;
      IF local_start::date<>local_end::date OR EXISTS(SELECT 1 FROM public.erp_booking_availability a WHERE a.cafe_id=p_cafe_id AND a.staff_id=staff_id AND (a.branch_id IS NULL OR a.branch_id=branch_id) AND a.on_date=local_start::date AND a.closed) OR NOT EXISTS(SELECT 1 FROM public.erp_booking_availability a WHERE a.cafe_id=p_cafe_id AND a.staff_id=staff_id AND (a.branch_id IS NULL OR a.branch_id=branch_id) AND NOT a.closed AND a.starts<=local_start::time AND a.ends>=local_end::time AND (a.on_date=local_start::date OR (a.weekday=extract(dow FROM local_start) AND NOT EXISTS(SELECT 1 FROM public.erp_booking_availability e WHERE e.cafe_id=p_cafe_id AND e.staff_id=staff_id AND (e.branch_id IS NULL OR e.branch_id=branch_id) AND e.on_date=local_start::date)))) THEN RAISE EXCEPTION 'الموعد خارج أوقات توفر الموظف' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM public.erp_booking_lines l JOIN public.erp_bookings b ON b.id=l.booking_id WHERE l.cafe_id=p_cafe_id AND l.staff_id=staff_id AND b.status NOT IN('cancelled','no_show') AND l.starts_at<end_time AND l.ends_at>start_time) THEN RAISE EXCEPTION 'يتداخل الموعد مع حجز آخر للموظف' USING ERRCODE='23P01'; END IF;
     END IF;
     INSERT INTO public.erp_booking_lines(cafe_id,booking_id,service_id,service_name,position,staff_id,starts_at,ends_at,duration,price,tax_rate) VALUES(p_cafe_id,new_id,svc.id,svc.name,j,staff_id,start_time,end_time,svc.duration,svc.price,svc.tax_rate);
    END LOOP;
    INSERT INTO public.erp_booking_events(cafe_id,booking_id,actor,action,details) VALUES(p_cafe_id,new_id,auth.uid(),CASE WHEN object_id IS NULL THEN 'created' ELSE 'updated' END,jsonb_build_object('lineCount',j,'series',series));
    ids:=ids||jsonb_build_array(new_id);
   END LOOP;
   IF jsonb_array_length(ids)=0 THEN RAISE EXCEPTION 'جميع المواعيد مستثناة من التكرار' USING ERRCODE='22023'; END IF;
   result:=jsonb_build_object('id',ids->0,'ids',ids);
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported booking action' USING ERRCODE='22023'; END IF;
 IF p_action NOT IN('save','status','invoice') THEN INSERT INTO public.erp_booking_events(cafe_id,actor,action,details) VALUES(p_cafe_id,auth.uid(),p_action,jsonb_build_object('id',result->'id')); END IF;
 INSERT INTO public.erp_booking_requests(cafe_id,request_id,actor,action,payload,result) VALUES(p_cafe_id,p_request_id,auth.uid(),p_action,p_payload,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.erp_bookings_read(uuid,date,date),public.erp_booking_customers(uuid,text,integer),public.erp_bookings_write(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.erp_bookings_read(uuid,date,date),public.erp_booking_customers(uuid,text,integer),public.erp_bookings_write(uuid,text,jsonb,uuid) TO authenticated;
-- Images use server-validated uploads; no public or authenticated object mutation policy.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('erp-booking-images','erp-booking-images',false,5242880,ARRAY['image/webp']) ON CONFLICT(id) DO NOTHING;
