BEGIN;
-- Loyalty points for enterprise brands: one balance per customer phone across every branch, with an immutable
-- ledger row for every point saying where it was earned, where it was spent and against which invoice.
-- Earning is automatic from the cashier sale that carries the customer's phone. Spending is a discount on a
-- cashier sale, recorded in the same database transaction as the sale so a point can never be spent twice.
-- Stamp cards and their rewards are not changed. Brands without erp_enterprise_settings are not affected.
CREATE SCHEMA erp_points_private;
REVOKE ALL ON SCHEMA erp_points_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_points_settings(
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4000),updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX erp_points_settings_actor ON public.erp_points_settings(updated_by);
CREATE TABLE public.erp_points_ledger(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),phone text NOT NULL CHECK(phone ~ '^9665[0-9]{8}$'),
 kind text NOT NULL CHECK(kind IN('earn','redeem','reverse','adjust')),points integer NOT NULL CHECK(points<>0),
 branch_id uuid,document_id uuid,amount numeric(14,2) NOT NULL DEFAULT 0,note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 actor uuid REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz,
 UNIQUE(cafe_id,document_id,kind),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
 CHECK(kind<>'earn' OR points>0),CHECK(kind<>'redeem' OR points<0)
);
CREATE INDEX erp_points_ledger_customer ON public.erp_points_ledger(cafe_id,phone,created_at);
CREATE INDEX erp_points_ledger_recent ON public.erp_points_ledger(cafe_id,created_at DESC);
CREATE INDEX erp_points_ledger_branch ON public.erp_points_ledger(branch_id,cafe_id);
CREATE INDEX erp_points_ledger_actor ON public.erp_points_ledger(actor);
ALTER TABLE public.erp_points_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_points_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_points_settings,public.erp_points_ledger FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_points_ledger FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION erp_points_private.defaults() RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',false,'earnPerRiyal',1,'minInvoice',0,'pointValue',0.05,'minRedeemPoints',100,'maxRedeemPercent',50,'expiryDays',365)
$$;
CREATE FUNCTION erp_points_private.settings(c uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_points_private.defaults()||coalesce((SELECT payload FROM public.erp_points_settings WHERE cafe_id=c),'{}'::jsonb)
  ||jsonb_build_object('revision',coalesce((SELECT revision FROM public.erp_points_settings WHERE cafe_id=c),0))
$$;
CREATE FUNCTION erp_points_private.active(c uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.erp_enterprise_settings WHERE cafe_id=c AND enabled) AND coalesce((erp_points_private.settings(c)->>'enabled')::boolean,false)
$$;
-- Points still usable: spending consumes the oldest earned points first, and an earned point that reached its
-- expiry date without being spent is no longer counted.
CREATE FUNCTION erp_points_private.balance(c uuid,p text) RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
 WITH spent AS(SELECT coalesce(-sum(points),0) n FROM public.erp_points_ledger WHERE cafe_id=c AND phone=p AND points<0),
 gained AS(SELECT points,expires_at,sum(points) OVER(ORDER BY created_at,id) total FROM public.erp_points_ledger WHERE cafe_id=c AND phone=p AND points>0)
 SELECT coalesce(sum(g.points-greatest(0,least(g.points,s.n-(g.total-g.points)))) FILTER(WHERE g.expires_at IS NULL OR g.expires_at>now()),0)::integer FROM gained g CROSS JOIN spent s
$$;

-- Earn: fired when the cashier sale records its customer phone
CREATE FUNCTION erp_points_private.earn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg jsonb;d public.bf_documents;pts integer;days integer;key text;BEGIN
 IF NOT erp_points_private.active(NEW.cafe_id) THEN RETURN NEW;END IF;
 key:=public.normalize_customer_phone(NEW.phone);IF key IS NULL THEN RETURN NEW;END IF;
 cfg:=erp_points_private.settings(NEW.cafe_id);
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id AND kind='sale';
 IF NOT FOUND OR d.total<(cfg->>'minInvoice')::numeric THEN RETURN NEW;END IF;
 pts:=floor(d.total*(cfg->>'earnPerRiyal')::numeric);IF pts<=0 THEN RETURN NEW;END IF;
 days:=(cfg->>'expiryDays')::integer;
 INSERT INTO public.erp_points_ledger(cafe_id,phone,kind,points,branch_id,document_id,amount,note,actor,expires_at)
 VALUES(NEW.cafe_id,key,'earn',pts,(SELECT branch_id FROM public.erp_branch_documents WHERE document_id=d.id),d.id,d.total,'نقاط مكتسبة من فاتورة بيع',d.created_by,CASE WHEN days>0 THEN now()+make_interval(days=>days) END)
 ON CONFLICT(cafe_id,document_id,kind) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_points_earn AFTER INSERT ON public.bf_sale_customers FOR EACH ROW EXECUTE FUNCTION erp_points_private.earn();

-- Refund of a sale: takes back the points it earned and returns the points it spent, in proportion to the refund
CREATE FUNCTION erp_points_private.refund() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sale public.bf_documents;e public.erp_points_ledger;share numeric;delta integer;b uuid;BEGIN
 IF NEW.kind<>'refund' OR NEW.reference_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.erp_points_ledger WHERE cafe_id=NEW.cafe_id AND document_id=NEW.reference_id) THEN RETURN NEW;END IF;
 SELECT * INTO sale FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.reference_id AND kind='sale';
 IF NOT FOUND OR sale.total<=0 THEN RETURN NEW;END IF;
 share:=least(1,NEW.total/sale.total);delta:=0;
 SELECT branch_id INTO b FROM public.erp_branch_documents WHERE document_id=sale.id;
 FOR e IN SELECT * FROM public.erp_points_ledger WHERE cafe_id=NEW.cafe_id AND document_id=sale.id AND kind IN('earn','redeem') LOOP
  delta:=delta-round(e.points*share)::integer;
 END LOOP;
 IF delta<>0 THEN
  INSERT INTO public.erp_points_ledger(cafe_id,phone,kind,points,branch_id,document_id,amount,note,actor)
  SELECT NEW.cafe_id,l.phone,'reverse',delta,b,NEW.id,NEW.total,'تسوية نقاط بسبب مرتجع الفاتورة رقم '||sale.number,NEW.created_by FROM public.erp_points_ledger l WHERE l.cafe_id=NEW.cafe_id AND l.document_id=sale.id LIMIT 1
  ON CONFLICT(cafe_id,document_id,kind) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER erp_points_refund AFTER INSERT ON public.bf_documents FOR EACH ROW EXECUTE FUNCTION erp_points_private.refund();

CREATE FUNCTION erp_points_private.role_for(c uuid) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN RETURN erp_enterprise_private.role_for(c);END $$;

-- Cashier: balance and redemption limits of one customer
CREATE FUNCTION public.erp_points_balance(p_cafe uuid,p_phone text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg jsonb;key text;bal integer;BEGIN
 PERFORM erp_points_private.role_for(p_cafe);cfg:=erp_points_private.settings(p_cafe);key:=public.normalize_customer_phone(p_phone);
 IF NOT erp_points_private.active(p_cafe) OR key IS NULL THEN RETURN jsonb_build_object('enabled',false,'balance',0);END IF;
 bal:=erp_points_private.balance(p_cafe,key);
 RETURN jsonb_build_object('enabled',true,'phone',key,'balance',bal,'pointValue',cfg->'pointValue','minRedeemPoints',cfg->'minRedeemPoints','maxRedeemPercent',cfg->'maxRedeemPercent','value',round(bal*(cfg->>'pointValue')::numeric,2));
END $$;

-- Cashier sale that spends points. The sale itself is the original sale command; this only checks the points,
-- runs the sale and writes the redemption, all in one transaction.
CREATE FUNCTION public.erp_points_sale(p_cafe uuid,p_payload jsonb,p_request uuid,p_points integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;cfg jsonb;key text;bal integer;value numeric;result jsonb;d public.bf_documents;prior uuid;BEGIN
 PERFORM erp_points_private.role_for(c);
 IF NOT erp_points_private.active(c) THEN RAISE EXCEPTION 'نقاط الولاء غير مفعلة' USING ERRCODE='22023';END IF;
 cfg:=erp_points_private.settings(c);key:=public.normalize_customer_phone(p_payload->>'customerPhone');
 IF key IS NULL THEN RAISE EXCEPTION 'أدخل رقم جوال العميل لاستخدام نقاطه' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text||key,77120));
 -- A repeated request returns the recorded sale without spending again
 SELECT l.document_id INTO prior FROM public.erp_points_ledger l JOIN public.bf_requests q ON q.cafe_id=l.cafe_id AND q.request_id=p_request AND (q.result->>'id')::uuid=l.document_id WHERE l.cafe_id=c AND l.kind='redeem';
 IF prior IS NOT NULL THEN RETURN public.brand_finance_execute(c,'sale',p_payload,p_request);END IF;
 value:=round(p_points*(cfg->>'pointValue')::numeric,2);bal:=erp_points_private.balance(c,key);
 IF p_points IS NULL OR p_points<(cfg->>'minRedeemPoints')::integer OR p_points>bal THEN RAISE EXCEPTION 'عدد النقاط المطلوب أقل من الحد الأدنى للاستبدال أو أكبر من رصيد العميل' USING ERRCODE='22023';END IF;
 IF value<=0 OR coalesce((p_payload->>'discount')::numeric,0)<value THEN RAISE EXCEPTION 'خصم الفاتورة لا يطابق قيمة النقاط المستبدلة' USING ERRCODE='22023';END IF;
 result:=public.brand_finance_execute(c,'sale',p_payload,p_request);
 SELECT * INTO d FROM public.bf_documents WHERE cafe_id=c AND id=(result->>'id')::uuid AND kind='sale';
 IF NOT FOUND THEN RAISE EXCEPTION 'تعذر تأكيد فاتورة البيع' USING ERRCODE='22023';END IF;
 IF value>round(d.subtotal*(cfg->>'maxRedeemPercent')::numeric/100,2) THEN RAISE EXCEPTION 'قيمة النقاط تتجاوز النسبة المسموح دفعها بالنقاط من الفاتورة' USING ERRCODE='22023';END IF;
 INSERT INTO public.erp_points_ledger(cafe_id,phone,kind,points,branch_id,document_id,amount,note,actor)
 VALUES(c,key,'redeem',-p_points,(SELECT branch_id FROM public.erp_branch_documents WHERE document_id=d.id),d.id,value,'استبدال نقاط بخصم على فاتورة بيع',auth.uid());
 RETURN result||jsonb_build_object('pointsRedeemed',p_points,'pointsValue',value);
END $$;

CREATE FUNCTION public.erp_points_read(p_cafe uuid,p_phone text DEFAULT NULL,p_query text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;cfg jsonb;key text:=public.normalize_customer_phone(coalesce(p_phone,''));q text:=btrim(translate(coalesce(p_query,''),'٠١٢٣٤٥٦٧٨٩','0123456789'));
BEGIN
 r:=erp_points_private.role_for(c);cfg:=erp_points_private.settings(c);
 IF r NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية إدارة نقاط الولاء' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('role',r,'canManage',r IN('owner','manager'),'settings',cfg,
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.sort_order,b.name) FROM public.branches b WHERE b.cafe_id=c AND b.deleted_at IS NULL),'[]'::jsonb),
  'totals',(SELECT jsonb_build_object('earned',coalesce(sum(points) FILTER(WHERE kind='earn'),0),'redeemed',coalesce(-sum(points) FILTER(WHERE kind='redeem'),0),'redeemedValue',coalesce(sum(amount) FILTER(WHERE kind='redeem'),0),
    'customers',count(DISTINCT phone),'outstanding',coalesce((SELECT sum(erp_points_private.balance(c,x.phone)) FROM(SELECT DISTINCT phone FROM public.erp_points_ledger WHERE cafe_id=c) x),0)) FROM public.erp_points_ledger WHERE cafe_id=c),
  'byBranch',coalesce((SELECT jsonb_agg(jsonb_build_object('branchId',g.branch_id,'earned',g.earned,'redeemed',g.redeemed)) FROM(SELECT branch_id,coalesce(sum(points) FILTER(WHERE kind='earn'),0) earned,coalesce(-sum(points) FILTER(WHERE kind='redeem'),0) redeemed FROM public.erp_points_ledger WHERE cafe_id=c GROUP BY 1) g),'[]'::jsonb),
  'customers',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."lastAt" DESC) FROM(
    SELECT l.phone,coalesce((SELECT p.name FROM public.bf_parties p WHERE p.cafe_id=c AND p.kind='customer' AND public.normalize_customer_phone(p.phone)=l.phone ORDER BY p.active DESC LIMIT 1),'') name,
     erp_points_private.balance(c,l.phone) balance,coalesce(sum(l.points) FILTER(WHERE l.kind='earn'),0) earned,coalesce(-sum(l.points) FILTER(WHERE l.kind='redeem'),0) redeemed,max(l.created_at) "lastAt"
    FROM public.erp_points_ledger l WHERE l.cafe_id=c AND (q='' OR l.phone LIKE '%'||regexp_replace(q,'[^0-9]','','g')||'%' AND regexp_replace(q,'[^0-9]','','g')<>'') GROUP BY l.phone ORDER BY max(l.created_at) DESC LIMIT 100) x),'[]'::jsonb),
  'customer',CASE WHEN key IS NULL THEN NULL ELSE jsonb_build_object('phone',key,'balance',erp_points_private.balance(c,key)) END,
  'ledger',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC) FROM(
    SELECT l.id,l.phone,l.kind,l.points,l.branch_id "branchId",l.amount,l.note,l.created_at "createdAt",l.expires_at "expiresAt",d.number "documentNumber",d.kind "documentKind",l.document_id "documentId",
     coalesce(st.name,pr.full_name,'') actor
    FROM public.erp_points_ledger l LEFT JOIN public.bf_documents d ON d.cafe_id=l.cafe_id AND d.id=l.document_id LEFT JOIN public.bf_staff st ON st.cafe_id=l.cafe_id AND st.user_id=l.actor LEFT JOIN public.profiles pr ON pr.id=l.actor
    WHERE l.cafe_id=c AND (key IS NULL OR l.phone=key) ORDER BY l.created_at DESC LIMIT 200) x),'[]'::jsonb));
END $$;

CREATE FUNCTION public.erp_points_execute(p_cafe uuid,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;r text;rev integer;key text;pts integer;k text;BEGIN
 r:=erp_points_private.role_for(c);
 IF r NOT IN('owner','manager') THEN RAISE EXCEPTION 'إدارة نقاط الولاء للمالك أو المدير فقط' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>4000 THEN RAISE EXCEPTION 'بيانات العملية غير صالحة' USING ERRCODE='22023';END IF;
 IF p_action='settings' THEN
  SELECT revision INTO rev FROM public.erp_points_settings WHERE cafe_id=c FOR UPDATE;
  IF coalesce(rev,0) IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت إعدادات النقاط أعد تحميل الصفحة' USING ERRCODE='40001';END IF;
  FOREACH k IN ARRAY ARRAY['earnPerRiyal','minInvoice','pointValue','minRedeemPoints','maxRedeemPercent','expiryDays'] LOOP IF jsonb_typeof(p->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'أكمل كل حقول إعدادات النقاط بأرقام صحيحة' USING ERRCODE='22023';END IF;END LOOP;
  IF jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR (p->>'earnPerRiyal')::numeric NOT BETWEEN 0.01 AND 100 OR (p->>'minInvoice')::numeric NOT BETWEEN 0 AND 100000 OR (p->>'pointValue')::numeric NOT BETWEEN 0.001 AND 100
   OR (p->>'minRedeemPoints')::numeric NOT BETWEEN 1 AND 1000000 OR (p->>'minRedeemPoints')::numeric<>trunc((p->>'minRedeemPoints')::numeric) OR (p->>'maxRedeemPercent')::numeric NOT BETWEEN 1 AND 95
   OR (p->>'expiryDays')::numeric NOT BETWEEN 0 AND 3650 OR (p->>'expiryDays')::numeric<>trunc((p->>'expiryDays')::numeric) THEN RAISE EXCEPTION 'راجع حدود إعدادات النقاط' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_points_settings(cafe_id,payload,updated_by) VALUES(c,p-'revision',auth.uid())
  ON CONFLICT(cafe_id) DO UPDATE SET payload=excluded.payload,revision=erp_points_settings.revision+1,updated_by=excluded.updated_by,updated_at=clock_timestamp();
  RETURN erp_points_private.settings(c);
 END IF;
 IF p_action='adjust' THEN
  key:=public.normalize_customer_phone(p->>'phone');pts:=(p->>'points')::integer;
  IF key IS NULL OR pts IS NULL OR pts=0 OR abs(pts)>1000000 OR length(btrim(coalesce(p->>'note',''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'أدخل رقم جوال سعوديًا وعدد نقاط وسببًا واضحًا للتعديل' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(c::text||key,77120));
  IF pts<0 AND -pts>erp_points_private.balance(c,key) THEN RAISE EXCEPTION 'الخصم أكبر من رصيد العميل' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_points_ledger(cafe_id,phone,kind,points,branch_id,note,actor) VALUES(c,key,'adjust',pts,nullif(p->>'branchId','')::uuid,btrim(p->>'note'),auth.uid());
  RETURN jsonb_build_object('phone',key,'balance',erp_points_private.balance(c,key));
 END IF;
 RAISE EXCEPTION 'عملية غير معروفة' USING ERRCODE='22023';
END $$;

REVOKE ALL ON FUNCTION public.erp_points_balance(uuid,text),public.erp_points_sale(uuid,jsonb,uuid,integer),public.erp_points_read(uuid,text,text),public.erp_points_execute(uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_points_balance(uuid,text),public.erp_points_sale(uuid,jsonb,uuid,integer),public.erp_points_read(uuid,text,text),public.erp_points_execute(uuid,text,jsonb) TO authenticated;
COMMIT;
