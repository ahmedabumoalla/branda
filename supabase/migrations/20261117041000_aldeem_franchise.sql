BEGIN;

-- Franchise metadata only. All invoices, payments and balances remain in the original finance ledger.
CREATE SCHEMA aldeem_franchise_private;
REVOKE ALL ON SCHEMA aldeem_franchise_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE aldeem_franchise_private.records(
 id uuid PRIMARY KEY,cafe_id uuid NOT NULL REFERENCES public.cafes(id),
 kind text NOT NULL CHECK(kind IN('partner','product','agreement')),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 160),
 active boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 partner_id uuid,party_id uuid,product_id uuid REFERENCES public.menu_products(id),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<12000),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(cafe_id,id),FOREIGN KEY(cafe_id,partner_id) REFERENCES aldeem_franchise_private.records(cafe_id,id),
 FOREIGN KEY(cafe_id,party_id) REFERENCES public.bf_parties(cafe_id,id),
 CHECK((kind='partner' AND party_id IS NOT NULL AND partner_id IS NULL AND product_id IS NULL)
 OR (kind='product' AND partner_id IS NOT NULL AND product_id IS NOT NULL AND party_id IS NULL)
 OR (kind='agreement' AND partner_id IS NOT NULL AND party_id IS NULL AND product_id IS NULL))
);
CREATE UNIQUE INDEX franchise_partner_party ON aldeem_franchise_private.records(cafe_id,party_id) WHERE kind='partner';
CREATE UNIQUE INDEX franchise_partner_product ON aldeem_franchise_private.records(cafe_id,partner_id,product_id) WHERE kind='product';
CREATE INDEX franchise_records_list ON aldeem_franchise_private.records(cafe_id,kind,updated_at DESC,id);
CREATE INDEX franchise_records_partner ON aldeem_franchise_private.records(cafe_id,partner_id);
CREATE INDEX franchise_records_product ON aldeem_franchise_private.records(product_id);
CREATE INDEX franchise_records_actor ON aldeem_franchise_private.records(created_by);
CREATE TABLE aldeem_franchise_private.requests(
 cafe_id uuid NOT NULL REFERENCES public.cafes(id),request_id uuid NOT NULL,payload jsonb NOT NULL,result jsonb NOT NULL,
 actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(cafe_id,request_id)
);
CREATE INDEX franchise_requests_actor ON aldeem_franchise_private.requests(actor);
ALTER TABLE aldeem_franchise_private.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE aldeem_franchise_private.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA aldeem_franchise_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON aldeem_franchise_private.requests FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION aldeem_franchise_private.authorize(c uuid) RETURNS void LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR brand_finance_private.role_for(c) IS DISTINCT FROM 'owner'
 OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') THEN
 RAISE EXCEPTION 'لا تملك صلاحية إدارة الفرنشايز' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION public.aldeem_franchise_read(p_cafe uuid,p_mode text,p_query text DEFAULT '',p_offset integer DEFAULT 0,p_partner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;b uuid;q text:=btrim(coalesce(p_query,''));rows jsonb;r aldeem_franchise_private.records;
BEGIN
 PERFORM aldeem_franchise_private.authorize(c);PERFORM erp_branch_private.enter(c);b:=erp_branch_private.current_branch(c);
 IF p_mode IS NULL OR p_mode NOT IN('partner','product','agreement','customers','products','partners','statement') OR length(q)>100 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000 THEN RAISE EXCEPTION 'راجع البحث';END IF;
 IF p_mode='customers' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM(SELECT p.id,p.name,p.phone FROM public.bf_parties p WHERE p.cafe_id=c AND p.kind='customer' AND p.active
   AND erp_branch_private.row_allowed(c,b,to_jsonb(p),'customer') AND(q='' OR position(lower(q) IN lower(p.name))>0 OR position(q IN p.phone)>0) ORDER BY p.name,p.id LIMIT 30)x;RETURN rows;
 ELSIF p_mode='products' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM(SELECT m.id,m.name FROM public.menu_products m WHERE m.cafe_id=c AND m.deleted_at IS NULL
   AND (b IS NULL OR m.branch_id IS NULL OR m.branch_id=b) AND(q='' OR position(lower(q) IN lower(m.name))>0) ORDER BY m.name,m.id LIMIT 30)x;RETURN rows;
 ELSIF p_mode='partners' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM(SELECT f.id,f.name FROM aldeem_franchise_private.records f JOIN public.bf_parties p ON p.cafe_id=c AND p.id=f.party_id
   WHERE f.cafe_id=c AND f.kind='partner' AND f.active AND erp_branch_private.row_allowed(c,b,to_jsonb(p),'customer')
   AND(q='' OR position(lower(q) IN lower(f.name))>0) ORDER BY f.name,f.id LIMIT 30)x;RETURN rows;
 ELSIF p_mode='statement' THEN
  SELECT f.* INTO r FROM aldeem_franchise_private.records f JOIN public.bf_parties p ON p.cafe_id=c AND p.id=f.party_id
   WHERE f.cafe_id=c AND f.id=p_partner AND f.kind='partner' AND erp_branch_private.row_allowed(c,b,to_jsonb(p),'customer');
  IF NOT FOUND THEN RAISE EXCEPTION 'الشريك غير متاح' USING ERRCODE='42501';END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM(
   SELECT d.id,d.number,d.total,(st->>'paid')::numeric AS paid,(st->>'outstanding')::numeric AS outstanding,d.created_at
   FROM public.bf_documents d CROSS JOIN LATERAL brand_finance_private.document_state(c,d.id) st
   WHERE d.cafe_id=c AND d.party_id=r.party_id AND d.kind='sale' AND erp_branch_private.row_allowed(c,b,to_jsonb(d),'')
   ORDER BY d.created_at DESC,d.id DESC OFFSET p_offset LIMIT 31)x;
  RETURN jsonb_build_object('partner',to_jsonb(r),'invoices',CASE WHEN jsonb_array_length(rows)>30 THEN rows-30 ELSE rows END,'hasMore',jsonb_array_length(rows)>30,
   'history',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT d.id,d.number,d.kind,d.total,d.note,d.created_at FROM public.bf_documents d WHERE d.cafe_id=c AND d.party_id=r.party_id AND d.kind IN('settlement','receipt','refund') AND erp_branch_private.row_allowed(c,b,to_jsonb(d),'') ORDER BY d.created_at DESC,d.id DESC LIMIT 50)x),'[]'),
   'accounts',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT a.id,a.name,a.kind FROM public.bf_accounts a WHERE a.cafe_id=c AND a.active AND a.kind IN('bank','cash','pos') AND NOT a.is_cashier_drawer AND erp_branch_private.row_allowed(c,b,to_jsonb(a),'account') ORDER BY a.name)x),'[]'));
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO rows FROM(
  SELECT f.*,partner.name AS partner_name,p.name AS party_name,m.name AS product_name
  FROM aldeem_franchise_private.records f LEFT JOIN aldeem_franchise_private.records partner ON partner.cafe_id=c AND partner.id=f.partner_id
  JOIN public.bf_parties p ON p.cafe_id=c AND p.id=coalesce(f.party_id,partner.party_id)
  LEFT JOIN public.menu_products m ON m.cafe_id=c AND m.id=f.product_id
  WHERE f.cafe_id=c AND f.kind=p_mode AND erp_branch_private.row_allowed(c,b,to_jsonb(p),'customer')
   AND(p_partner IS NULL OR f.partner_id=p_partner) AND(q='' OR position(lower(q) IN lower(f.name))>0 OR position(lower(q) IN lower(coalesce(partner.name,'')))>0)
  ORDER BY f.updated_at DESC,f.id DESC OFFSET p_offset LIMIT 31)x;
 RETURN jsonb_build_object('rows',CASE WHEN jsonb_array_length(rows)>30 THEN rows-30 ELSE rows END,'hasMore',jsonb_array_length(rows)>30);
END $$;

CREATE FUNCTION public.aldeem_franchise_write(p_cafe uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;v jsonb:=p_payload->'payload';b uuid;r aldeem_franchise_private.records;partner aldeem_franchise_private.records;prior aldeem_franchise_private.requests;rid uuid;req uuid;k text;result jsonb;
BEGIN
 PERFORM aldeem_franchise_private.authorize(c);PERFORM erp_branch_private.enter(c);b:=erp_branch_private.current_branch(c);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>16000 OR jsonb_typeof(v) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'بيانات غير صالحة';END IF;
 rid:=(p->>'id')::uuid;req:=(p->>'requestId')::uuid;k:=p->>'kind';
 IF rid IS NULL OR req IS NULL OR k IS NULL OR k NOT IN('partner','product','agreement') OR length(btrim(coalesce(p->>'name',''))) NOT BETWEEN 2 AND 160 OR (p->>'revision')::integer IS NULL OR (p->>'revision')::integer<0 OR jsonb_typeof(p->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'أكمل بيانات السجل';END IF;
 IF length(coalesce(v->>'reference',''))>100 OR length(coalesce(v->>'territory',''))>300 OR length(coalesce(v->>'note',''))>2000 OR (v->>'price')::numeric IS NULL OR (v->>'price')::numeric NOT BETWEEN 0 AND 1000000 OR (v->>'royalty')::numeric IS NULL OR (v->>'royalty')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'راجع السعر والنسبة والتفاصيل';END IF;
 IF k='agreement' AND(length(btrim(coalesce(v->>'reference','')))<1 OR nullif(v->>'from','')::date IS NULL OR nullif(v->>'to','')::date IS NULL OR (v->>'to')::date<(v->>'from')::date) THEN RAISE EXCEPTION 'أكمل رقم الاتفاقية وتواريخها';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(c::text||req::text,0));
 SELECT * INTO prior FROM aldeem_franchise_private.requests WHERE cafe_id=c AND request_id=req;
 IF FOUND THEN IF prior.payload IS DISTINCT FROM p THEN RAISE EXCEPTION 'معرف الطلب مستخدم لبيانات مختلفة';END IF;RETURN prior.result;END IF;
 SELECT * INTO r FROM aldeem_franchise_private.records WHERE cafe_id=c AND id=rid FOR UPDATE;
 IF FOUND AND(r.revision<>(p->>'revision')::integer OR r.kind<>k OR r.party_id IS DISTINCT FROM nullif(p->>'partyId','')::uuid OR r.partner_id IS DISTINCT FROM nullif(p->>'partnerId','')::uuid) THEN RAISE EXCEPTION 'تغير السجل أو الحساب المرتبط أعد تحميله' USING ERRCODE='40001';END IF;
 IF r.id IS NULL AND (p->>'revision')::integer<>0 THEN RAISE EXCEPTION 'السجل غير موجود' USING ERRCODE='40001';END IF;
 IF k='partner' THEN
  IF NOT EXISTS(SELECT 1 FROM public.bf_parties x WHERE x.cafe_id=c AND x.id=(p->>'partyId')::uuid AND x.kind='customer' AND x.active AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'customer')) THEN RAISE EXCEPTION 'حساب العميل غير متاح' USING ERRCODE='42501';END IF;
 ELSE
  SELECT f.* INTO partner FROM aldeem_franchise_private.records f JOIN public.bf_parties x ON x.cafe_id=c AND x.id=f.party_id WHERE f.cafe_id=c AND f.id=(p->>'partnerId')::uuid AND f.kind='partner' AND f.active AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'customer');
  IF NOT FOUND THEN RAISE EXCEPTION 'الشريك غير متاح' USING ERRCODE='42501';END IF;
  IF k='product' AND NOT EXISTS(SELECT 1 FROM public.menu_products m WHERE m.cafe_id=c AND m.deleted_at IS NULL AND m.id=(p->>'productId')::uuid AND(b IS NULL OR m.branch_id IS NULL OR m.branch_id=b)) THEN RAISE EXCEPTION 'المنتج غير متاح' USING ERRCODE='42501';END IF;
 END IF;
 INSERT INTO aldeem_franchise_private.records(id,cafe_id,kind,name,active,partner_id,party_id,product_id,payload,created_by)
 VALUES(rid,c,k,btrim(p->>'name'),(p->>'active')::boolean,nullif(p->>'partnerId','')::uuid,nullif(p->>'partyId','')::uuid,nullif(p->>'productId','')::uuid,v,auth.uid())
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active,product_id=excluded.product_id,payload=excluded.payload,revision=aldeem_franchise_private.records.revision+1,updated_at=clock_timestamp()
 WHERE aldeem_franchise_private.records.cafe_id=c AND aldeem_franchise_private.records.revision=(p->>'revision')::integer
 RETURNING jsonb_build_object('id',id,'revision',revision) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'تغير السجل أعد تحميله' USING ERRCODE='40001';END IF;
 INSERT INTO aldeem_franchise_private.requests(cafe_id,request_id,payload,result,actor) VALUES(c,req,p,result,auth.uid());RETURN result;
END $$;

CREATE FUNCTION public.aldeem_franchise_settle(p_cafe uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;p jsonb:=p_payload;b uuid;r aldeem_franchise_private.records;d public.bf_documents;result jsonb;
BEGIN
 PERFORM aldeem_franchise_private.authorize(c);PERFORM erp_branch_private.enter(c);b:=erp_branch_private.current_branch(c);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>4000 OR (p->>'requestId')::uuid IS NULL OR (p->>'amount')::numeric IS NULL OR (p->>'amount')::numeric<=0 OR (p->>'amount')::numeric>100000000 OR (p->>'amount')::numeric<>round((p->>'amount')::numeric,2) OR length(coalesce(p->>'note',''))>800 THEN RAISE EXCEPTION 'راجع بيانات الدفعة';END IF;
 SELECT f.* INTO r FROM aldeem_franchise_private.records f JOIN public.bf_parties x ON x.cafe_id=c AND x.id=f.party_id WHERE f.cafe_id=c AND f.id=(p->>'partnerId')::uuid AND f.kind='partner' AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'customer');
 IF NOT FOUND THEN RAISE EXCEPTION 'الشريك غير متاح' USING ERRCODE='42501';END IF;
 SELECT * INTO d FROM public.bf_documents x WHERE x.cafe_id=c AND x.id=(p->>'documentId')::uuid AND x.party_id=r.party_id AND x.kind='sale' AND erp_branch_private.row_allowed(c,b,to_jsonb(x),'');
 IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة لا تخص الشريك أو غير متاحة' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.bf_accounts a WHERE a.cafe_id=c AND a.id=(p->>'accountId')::uuid AND a.active AND a.kind IN('bank','cash','pos') AND NOT a.is_cashier_drawer AND erp_branch_private.row_allowed(c,b,to_jsonb(a),'account')) THEN RAISE EXCEPTION 'اختر خزينة أو حسابًا بنكيًا متاحًا' USING ERRCODE='42501';END IF;
 result:=public.brand_finance_execute(c,'settlement',jsonb_build_object('documentId',d.id,'accountId',p->>'accountId','amount',(p->>'amount')::numeric,'note','دفعة فرنشايز / '||r.name||CASE WHEN coalesce(p->>'note','')='' THEN '' ELSE ' / '||(p->>'note') END),(p->>'requestId')::uuid);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION aldeem_franchise_private.authorize(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.aldeem_franchise_read(uuid,text,text,integer,uuid),public.aldeem_franchise_write(uuid,jsonb),public.aldeem_franchise_settle(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_franchise_read(uuid,text,text,integer,uuid),public.aldeem_franchise_write(uuid,jsonb),public.aldeem_franchise_settle(uuid,jsonb) TO authenticated;
COMMIT;
