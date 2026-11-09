-- Finance ledger pilot: additive controls, restricted to the user-selected test cafe
-- Adapted from isolated ledger controls with production period and account protections
BEGIN;

CREATE TABLE brand_finance_private.gl_rollout (
 cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
 enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE brand_finance_private.gl_rollout ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON brand_finance_private.gl_rollout FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO brand_finance_private.gl_rollout(cafe_id,enabled)
 SELECT id,true FROM public.cafes WHERE id='2e08901c-5aac-4bec-8c97-a135058e508b' AND slug='test-cafe';

CREATE FUNCTION brand_finance_private.gl_enabled(p_cafe uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT enabled FROM brand_finance_private.gl_rollout WHERE cafe_id=p_cafe),false)
$$;
CREATE FUNCTION brand_finance_private.assert_gl_enabled(p_cafe uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NOT brand_finance_private.gl_enabled(p_cafe) THEN
  RAISE EXCEPTION 'دفتر الأستاذ غير مفعل لهذه المنشأة' USING ERRCODE='42501';
 END IF;
END $$;

ALTER TABLE public.bf_accounts ADD COLUMN parent_id uuid;
ALTER TABLE public.bf_accounts ADD COLUMN is_group boolean NOT NULL DEFAULT false;
ALTER TABLE public.bf_accounts ADD COLUMN frozen boolean NOT NULL DEFAULT false;
ALTER TABLE public.bf_accounts ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE public.bf_accounts ADD CONSTRAINT bf_accounts_parent_fk
  FOREIGN KEY(cafe_id,parent_id) REFERENCES public.bf_accounts(cafe_id,id);
CREATE INDEX bf_accounts_parent ON public.bf_accounts(cafe_id,parent_id);

CREATE TABLE public.bf_gl_settings (
  cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),
  maker_checker boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE public.bf_gl_sequences (
  cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  kind text NOT NULL, period integer NOT NULL,
  last_number bigint NOT NULL CHECK(last_number>0), PRIMARY KEY(cafe_id,kind,period)
);
CREATE TABLE public.bf_gl_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cafe_id uuid NOT NULL REFERENCES public.cafes(id),
  number bigint NOT NULL, fiscal_year integer NOT NULL,
  title text NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
  document_date date NOT NULL, note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
  lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 2 AND 100),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','submitted','approved','posted','cancelled','reversed')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  created_by uuid NOT NULL REFERENCES auth.users(id), last_edited_by uuid NOT NULL REFERENCES auth.users(id), approved_by uuid REFERENCES auth.users(id),
  document_id uuid, reversal_document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cafe_id,id), UNIQUE(cafe_id,fiscal_year,number),
  FOREIGN KEY(cafe_id,document_id) REFERENCES public.bf_documents(cafe_id,id),
  FOREIGN KEY(cafe_id,reversal_document_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX bf_gl_drafts_history ON public.bf_gl_drafts(cafe_id,created_at DESC,id);
CREATE TABLE public.bf_gl_periods (
  cafe_id uuid NOT NULL REFERENCES public.cafes(id), period_start date NOT NULL,
  period_end date NOT NULL CHECK(period_end>=period_start),
  closed boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(cafe_id,period_start)
);
CREATE TABLE public.bf_gl_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id), entity_id uuid,
  action text NOT NULL, details jsonb NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bf_gl_events_entity ON public.bf_gl_events(cafe_id,entity_id,id);
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.bf_gl_events
  FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['bf_gl_settings','bf_gl_sequences','bf_gl_drafts','bf_gl_periods','bf_gl_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  END LOOP;
END $$;

CREATE FUNCTION brand_finance_private.gl_date_open(p_cafe uuid,p_date date)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF p_date IS NULL OR NOT isfinite(p_date) THEN RAISE EXCEPTION 'اختر تاريخ مستند صالح'; END IF;
  IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe AND closed_through>=p_date)
    OR EXISTS(SELECT 1 FROM public.bf_gl_periods WHERE cafe_id=p_cafe AND closed AND p_date BETWEEN period_start AND period_end)
  THEN RAISE EXCEPTION 'الفترة المالية مقفلة لهذا التاريخ'; END IF;
END $$;

-- Shared tenant lock serializes closure against all old and new posting paths
CREATE FUNCTION brand_finance_private.gl_document_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT brand_finance_private.gl_enabled(NEW.cafe_id) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
  PERFORM brand_finance_private.gl_date_open(NEW.cafe_id,(NEW.created_at AT TIME ZONE 'Asia/Riyadh')::date);
  RETURN NEW;
END $$;
CREATE TRIGGER bf_gl_document_date BEFORE INSERT ON public.bf_documents
FOR EACH ROW EXECUTE FUNCTION brand_finance_private.gl_document_guard();

CREATE FUNCTION brand_finance_private.gl_line_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.bf_accounts; d timestamptz;
BEGIN
  IF NOT brand_finance_private.gl_enabled(NEW.cafe_id) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.cafe_id::text,60412));
  SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=NEW.cafe_id AND id=NEW.account_id FOR SHARE;
  IF a.id IS NULL OR a.is_group OR a.frozen OR NOT a.active THEN
    RAISE EXCEPTION 'الحساب غير نشط أو مجمد أو تجميعي';
  END IF;
  SELECT created_at INTO d FROM public.bf_documents WHERE cafe_id=NEW.cafe_id AND id=NEW.document_id;
  PERFORM brand_finance_private.gl_date_open(NEW.cafe_id,(d AT TIME ZONE 'Asia/Riyadh')::date);
  -- One accounting date for source document and every journal line
  NEW.created_at:=d;
  RETURN NEW;
END $$;
CREATE TRIGGER bf_gl_line_guard BEFORE INSERT ON public.bf_journal
FOR EACH ROW EXECUTE FUNCTION brand_finance_private.gl_line_guard();

CREATE FUNCTION brand_finance_private.gl_lines(p_cafe uuid,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE x jsonb; a public.bf_accounts; dr numeric; cr numeric; sd numeric:=0; sc numeric:=0; result jsonb:='[]';
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) NOT BETWEEN 2 AND 100 THEN
    RAISE EXCEPTION 'أضف من سطرين إلى مئة سطر للقيد';
  END IF;
  FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO a FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=(x->>'accountId')::uuid;
    IF a.id IS NULL OR NOT a.active OR a.frozen OR a.is_group OR a.kind NOT IN('expense','revenue','equity') THEN
      RAISE EXCEPTION 'اختر حسابًا نشطًا غير تجميعي ولا تستخدم حسابات الرقابة في القيد اليدوي';
    END IF;
    dr:=(x->>'debit')::numeric; cr:=(x->>'credit')::numeric;
    IF dr IS NULL OR cr IS NULL OR dr::text IN('NaN','Infinity','-Infinity') OR cr::text IN('NaN','Infinity','-Infinity')
      OR dr<0 OR cr<0 OR dr>999999999999 OR cr>999999999999 OR dr<>round(dr,2) OR cr<>round(cr,2)
      OR NOT ((dr>0 AND cr=0) OR (cr>0 AND dr=0)) THEN
      RAISE EXCEPTION 'كل سطر يحتاج مبلغًا موجبًا بمنزلتين في جانب واحد';
    END IF;
    IF length(coalesce(x->>'memo',''))>300 THEN RAISE EXCEPTION 'وصف السطر أطول من المسموح'; END IF;
    sd:=sd+dr; sc:=sc+cr;
    result:=result||jsonb_build_array(jsonb_build_object('accountId',a.id,'code',a.code,'name',a.name,
      'debit',dr,'credit',cr,'memo',coalesce(x->>'memo','')));
  END LOOP;
  IF sd<>sc OR sd<=0 THEN RAISE EXCEPTION 'القيد غير متوازن بين المدين والدائن'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.brand_finance_gl_execute(p_cafe_id uuid,p_action text,p_payload jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text; old public.bf_requests; rec public.bf_gl_drafts; acc public.bf_accounts;
  cfg public.bf_gl_settings; period public.bf_gl_periods; x jsonb; normalized jsonb;
  eid uuid; did uuid; pid uuid; dt date; pend date; yr integer; n bigint; answer jsonb; expected integer;
  before_state jsonb; dr numeric; cr numeric; reason text; group_flag boolean;
BEGIN
  r:=brand_finance_private.role_for(p_cafe_id);
  PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);
  IF r NOT IN('owner','manager','accountant') THEN RAISE EXCEPTION 'لا تملك صلاحية تعديل دفتر الأستاذ' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>100000 THEN
    RAISE EXCEPTION 'بيانات الطلب غير صالحة';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe_id::text,60412));
  PERFORM brand_finance_private.seed(p_cafe_id);
  INSERT INTO public.bf_gl_settings(cafe_id) VALUES(p_cafe_id) ON CONFLICT DO NOTHING;
  SELECT * INTO cfg FROM public.bf_gl_settings WHERE cafe_id=p_cafe_id;
  SELECT * INTO old FROM public.bf_requests WHERE cafe_id=p_cafe_id AND request_id=p_request_id;
  IF FOUND THEN
    IF old.operation<>'gl:'||p_action OR old.payload<>p_payload OR old.created_by<>auth.uid() THEN
      RAISE EXCEPTION 'معرف الطلب مستخدم ببيانات مختلفة' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('duplicate',true);
  END IF;
  eid:=nullif(p_payload->>'id','')::uuid;
  expected:=nullif(p_payload->>'revision','')::integer;
  reason:=btrim(coalesce(p_payload->>'reason',''));
  IF p_action='settings' THEN
    IF r<>'owner' THEN RAISE EXCEPTION 'إعداد الاعتماد للمالك فقط' USING ERRCODE='42501'; END IF;
    IF expected IS DISTINCT FROM cfg.revision THEN RAISE EXCEPTION 'تغير الإعداد حدث الصفحة' USING ERRCODE='40001'; END IF;
    IF length(reason) NOT BETWEEN 5 AND 1000 OR jsonb_typeof(p_payload->'makerChecker') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'حدد سياسة الاعتماد وسبب تعديلها'; END IF;
    before_state:=to_jsonb(cfg);
    UPDATE public.bf_gl_settings SET maker_checker=(p_payload->>'makerChecker')::boolean,revision=revision+1 WHERE cafe_id=p_cafe_id RETURNING * INTO cfg;
    eid:=p_cafe_id; answer:=to_jsonb(cfg)-'cafe_id';
  ELSIF p_action='account_save' THEN
    IF coalesce(p_payload->>'kind','') NOT IN('expense','revenue','equity') THEN
      RAISE EXCEPTION 'أضف حسابات النقد والبنوك وأجهزة الدفع من الخزينة وحسابات الرقابة من وحداتها' USING ERRCODE='23514';
    END IF;
    IF r NOT IN('owner','accountant') THEN RAISE EXCEPTION 'تعديل دليل الحسابات للمالك والمحاسب' USING ERRCODE='42501'; END IF;
    IF eid IS NOT NULL THEN
      SELECT * INTO acc FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=eid FOR UPDATE;
      IF acc.id IS NULL THEN RAISE EXCEPTION 'الحساب غير موجود'; END IF;
      IF expected IS DISTINCT FROM acc.revision THEN RAISE EXCEPTION 'تغير الحساب حدث الصفحة' USING ERRCODE='40001'; END IF;
      before_state:=to_jsonb(acc);
    END IF;
    pid:=nullif(p_payload->>'parentId','')::uuid;
    group_flag:=coalesce((p_payload->>'isGroup')::boolean,false);
    IF length(btrim(coalesce(p_payload->>'name',''))) NOT BETWEEN 1 AND 100
      OR coalesce(p_payload->>'code','') !~ '^[A-Za-z0-9-]{1,30}$'
      OR coalesce(p_payload->>'kind','') NOT IN('cash','bank','pos','employee','receivable','payable','inventory','revenue','expense','equity','vat_input','vat_output','fixed_asset','accumulated_depreciation') THEN
      RAISE EXCEPTION 'راجع اسم الحساب ورمزه ونوعه'; END IF;
    IF pid IS NOT NULL THEN
      IF pid=eid OR NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=pid AND is_group AND active AND NOT frozen AND kind=p_payload->>'kind') THEN
        RAISE EXCEPTION 'اختر حسابًا أبًا تجميعيًا نشطًا من النوع نفسه'; END IF;
      IF EXISTS(WITH RECURSIVE ancestors AS (
        SELECT id,parent_id FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=pid
        UNION SELECT a.id,a.parent_id FROM public.bf_accounts a JOIN ancestors b ON a.id=b.parent_id WHERE a.cafe_id=p_cafe_id
      ) SELECT 1 FROM ancestors WHERE id=eid) THEN RAISE EXCEPTION 'لا يمكن إنشاء دورة في دليل الحسابات'; END IF;
    END IF;
    IF acc.id IS NOT NULL THEN
      IF acc.code IS DISTINCT FROM p_payload->>'code' OR acc.kind IS DISTINCT FROM p_payload->>'kind' THEN
        RAISE EXCEPTION 'رمز الحساب ونوعه ثابتان بعد إنشائه'; END IF;
      IF group_flag AND EXISTS(SELECT 1 FROM public.bf_journal WHERE cafe_id=p_cafe_id AND account_id=eid) THEN
        RAISE EXCEPTION 'لا يمكن تحويل حساب عليه قيود إلى حساب تجميعي'; END IF;
      IF NOT group_flag AND EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND parent_id=eid) THEN
        RAISE EXCEPTION 'الحساب الأب يجب أن يبقى تجميعيًا'; END IF;
      IF (group_flag OR coalesce((p_payload->>'frozen')::boolean,false) OR NOT coalesce((p_payload->>'active')::boolean,true))
        AND acc.code IN('1000','1010','1020','1030','1100','1200','1300','2000','2100','3000','4000','5000','5100','5200','5300','ERP-WIP','ASSET-COST','ASSET-ACCUM','ASSET-EXPENSE','ASSET-LOSS','ASSET-GAIN','ASSET-REVALUE') THEN
        RAISE EXCEPTION 'لا يمكن إيقاف حساب رقابي تستخدمه العمليات'; END IF;
      UPDATE public.bf_accounts SET name=btrim(p_payload->>'name'),parent_id=pid,is_group=group_flag,
        frozen=coalesce((p_payload->>'frozen')::boolean,false),active=coalesce((p_payload->>'active')::boolean,true),revision=revision+1
        WHERE cafe_id=p_cafe_id AND id=eid RETURNING * INTO acc;
    ELSE
      INSERT INTO public.bf_accounts(cafe_id,name,code,kind,parent_id,is_group)
        VALUES(p_cafe_id,btrim(p_payload->>'name'),p_payload->>'code',p_payload->>'kind',pid,group_flag) RETURNING * INTO acc;
      eid:=acc.id;
    END IF;
    answer:=to_jsonb(acc)-'cafe_id';
  ELSIF p_action IN('period_close','period_reopen') THEN
    IF r<>'owner' THEN RAISE EXCEPTION 'إدارة الفترات للمالك فقط' USING ERRCODE='42501'; END IF;
    dt:=(p_payload->>'from')::date; pend:=(p_payload->>'to')::date;
    IF dt IS NULL OR pend IS NULL OR NOT isfinite(dt) OR NOT isfinite(pend) OR pend<dt OR pend-dt>366
      OR length(reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'حدد فترة صحيحة لا تتجاوز عامًا وسبب الإجراء'; END IF;
    SELECT * INTO period FROM public.bf_gl_periods WHERE cafe_id=p_cafe_id AND period_start=dt FOR UPDATE;
    before_state:=to_jsonb(period);
    IF period.cafe_id IS NOT NULL AND (expected IS DISTINCT FROM period.revision OR pend<>period.period_end) THEN
      RAISE EXCEPTION 'تغيرت الفترة حدث الصفحة' USING ERRCODE='40001'; END IF;
    IF p_action='period_close' THEN
      IF pend>=(now() AT TIME ZONE 'Asia/Riyadh')::date THEN
        RAISE EXCEPTION 'اختر نهاية يوم مكتمل قبل اليوم الحالي بتوقيت الرياض';
      END IF;
      IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id
        AND status IN('open','handover') AND opened_at<(pend+1)::timestamp AT TIME ZONE 'Asia/Riyadh') THEN
        RAISE EXCEPTION 'أكمل إقفال الورديات وتسليمها ضمن الفترة قبل إقفال الفترة المالية';
      END IF;
      IF EXISTS(SELECT 1 FROM public.bf_cash_handovers h
        JOIN public.bf_shifts s ON s.cafe_id=h.cafe_id AND s.id=h.shift_id
        WHERE h.cafe_id=p_cafe_id AND s.opened_at<(pend+1)::timestamp AT TIME ZONE 'Asia/Riyadh'
        AND NOT EXISTS(SELECT 1 FROM public.bf_cash_handover_receipts receipt WHERE receipt.cafe_id=h.cafe_id AND receipt.handover_id=h.id)) THEN
        RAISE EXCEPTION 'أكد استلام جميع مبالغ تسليم الصناديق المرتبطة بورديات الفترة أولًا';
      END IF;
      IF period.closed OR EXISTS(SELECT 1 FROM public.bf_gl_periods WHERE cafe_id=p_cafe_id AND closed
        AND period_start<>dt AND daterange(period_start,period_end,'[]') && daterange(dt,pend,'[]')) THEN
        RAISE EXCEPTION 'الفترة مقفلة أو تتداخل مع فترة مقفلة'; END IF;
      IF EXISTS(SELECT 1 FROM public.bf_gl_drafts WHERE cafe_id=p_cafe_id AND document_date BETWEEN dt AND pend AND status IN('submitted','approved')) THEN
        RAISE EXCEPTION 'رحل أو ألغ القيود المعلقة قبل الإقفال'; END IF;
      INSERT INTO public.bf_gl_periods(cafe_id,period_start,period_end) VALUES(p_cafe_id,dt,pend)
        ON CONFLICT(cafe_id,period_start) DO UPDATE SET closed=true,revision=public.bf_gl_periods.revision+1 RETURNING * INTO period;
    ELSE
      IF period.cafe_id IS NULL OR NOT period.closed THEN RAISE EXCEPTION 'الفترة ليست مقفلة'; END IF;
      IF EXISTS(SELECT 1 FROM public.bf_settings WHERE cafe_id=p_cafe_id AND closed_through>=dt) THEN
        RAISE EXCEPTION 'الفترة مشمولة بإقفال قديم يحتاج مراجعة مستقلة قبل إعادة فتحه'; END IF;
      UPDATE public.bf_gl_periods SET closed=false,revision=revision+1 WHERE cafe_id=p_cafe_id AND period_start=dt RETURNING * INTO period;
    END IF;
    answer:=to_jsonb(period)-'cafe_id';
  ELSE
    IF eid IS NOT NULL THEN
      SELECT * INTO rec FROM public.bf_gl_drafts WHERE cafe_id=p_cafe_id AND id=eid FOR UPDATE;
      IF rec.id IS NULL THEN RAISE EXCEPTION 'القيد غير موجود'; END IF;
      IF expected IS DISTINCT FROM rec.revision THEN RAISE EXCEPTION 'تغير القيد حدث الصفحة قبل المتابعة' USING ERRCODE='40001'; END IF;
      before_state:=to_jsonb(rec);
    ELSIF p_action<>'save' THEN RAISE EXCEPTION 'اختر القيد'; END IF;
    IF p_action='save' THEN
      IF rec.id IS NOT NULL AND rec.status<>'draft' THEN RAISE EXCEPTION 'التعديل متاح للمسودة فقط'; END IF;
      dt:=(p_payload->>'date')::date; PERFORM brand_finance_private.gl_date_open(p_cafe_id,dt);
      IF length(btrim(coalesce(p_payload->>'title',''))) NOT BETWEEN 1 AND 150 OR length(coalesce(p_payload->>'note',''))>2000 THEN
        RAISE EXCEPTION 'اكتب عنوانًا صالحًا للقيد وملاحظة ضمن الحد'; END IF;
      normalized:=brand_finance_private.gl_lines(p_cafe_id,p_payload->'lines');
      IF rec.id IS NULL THEN
        yr:=extract(year FROM dt);
        INSERT INTO public.bf_gl_sequences(cafe_id,kind,period,last_number) VALUES(p_cafe_id,'journal',yr,1)
          ON CONFLICT ON CONSTRAINT bf_gl_sequences_pkey DO UPDATE SET last_number=public.bf_gl_sequences.last_number+1 RETURNING last_number INTO n;
        INSERT INTO public.bf_gl_drafts(cafe_id,number,fiscal_year,title,document_date,note,lines,created_by,last_edited_by)
          VALUES(p_cafe_id,n,yr,btrim(p_payload->>'title'),dt,coalesce(p_payload->>'note',''),normalized,auth.uid(),auth.uid()) RETURNING * INTO rec;
      ELSE
        IF extract(year FROM dt)<>rec.fiscal_year THEN RAISE EXCEPTION 'أنشئ مسودة جديدة عند تغيير سنة الترقيم'; END IF;
        UPDATE public.bf_gl_drafts SET title=btrim(p_payload->>'title'),document_date=dt,note=coalesce(p_payload->>'note',''),
          lines=normalized,last_edited_by=auth.uid(),revision=revision+1,updated_at=now() WHERE id=rec.id RETURNING * INTO rec;
      END IF;
    ELSIF p_action='submit' THEN
      IF rec.status<>'draft' THEN RAISE EXCEPTION 'الإرسال متاح للمسودة فقط'; END IF;
      PERFORM brand_finance_private.gl_lines(p_cafe_id,rec.lines);
      PERFORM brand_finance_private.gl_date_open(p_cafe_id,rec.document_date);
      UPDATE public.bf_gl_drafts SET status='submitted',revision=revision+1,updated_at=now() WHERE id=rec.id RETURNING * INTO rec;
    ELSIF p_action='approve' THEN
      IF rec.status<>'submitted' THEN RAISE EXCEPTION 'أرسل القيد للمراجعة أولًا'; END IF;
      IF cfg.maker_checker AND auth.uid() IN(rec.created_by,rec.last_edited_by) THEN RAISE EXCEPTION 'اعتماد المستند يتطلب مستخدمًا غير منشئه وآخر من عدل مسودته' USING ERRCODE='42501'; END IF;
      PERFORM brand_finance_private.gl_lines(p_cafe_id,rec.lines);
      UPDATE public.bf_gl_drafts SET status='approved',approved_by=auth.uid(),revision=revision+1,updated_at=now() WHERE id=rec.id RETURNING * INTO rec;
    ELSIF p_action='cancel' THEN
      IF rec.status NOT IN('draft','submitted','approved') OR length(reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'الإلغاء يحتاج قيدًا غير مرحل وسببًا واضحًا'; END IF;
      UPDATE public.bf_gl_drafts SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=rec.id RETURNING * INTO rec;
    ELSIF p_action IN('post','reverse') THEN
      IF p_action='post' AND rec.status<>'approved' THEN RAISE EXCEPTION 'اعتمد القيد قبل الترحيل'; END IF;
      IF p_action='reverse' AND (rec.status<>'posted' OR length(reason) NOT BETWEEN 5 AND 1000) THEN RAISE EXCEPTION 'العكس يحتاج قيدًا مرحلًا وسببًا واضحًا'; END IF;
      dt:=CASE WHEN p_action='post' THEN rec.document_date ELSE (p_payload->>'date')::date END;
      PERFORM brand_finance_private.gl_date_open(p_cafe_id,dt);
      IF p_action='reverse' AND dt<rec.document_date THEN RAISE EXCEPTION 'تاريخ العكس لا يسبق تاريخ الأصل'; END IF;
      normalized:=brand_finance_private.gl_lines(p_cafe_id,rec.lines);
      IF normalized<>rec.lines THEN RAISE EXCEPTION 'تغيرت بيانات حسابات القيد ألغ القيد وأعد اعتماده'; END IF;
      did:=gen_random_uuid();
      INSERT INTO public.bf_documents(id,cafe_id,kind,note,created_by,created_at,reference_id)
        VALUES(did,p_cafe_id,'journal',left(rec.title||' — '||CASE WHEN p_action='reverse' THEN reason ELSE rec.note END,1000),
          auth.uid(),(dt+time '12:00') AT TIME ZONE 'Asia/Riyadh',CASE WHEN p_action='reverse' THEN rec.document_id ELSE NULL END);
      FOR x IN SELECT value FROM jsonb_array_elements(rec.lines) LOOP
        dr:=(x->>'debit')::numeric; cr:=(x->>'credit')::numeric;
        IF p_action='reverse' THEN dr:=(x->>'credit')::numeric; cr:=(x->>'debit')::numeric; END IF;
        IF EXISTS(SELECT 1 FROM public.bf_shifts WHERE cafe_id=p_cafe_id AND account_id=(x->>'accountId')::uuid AND status='handover') THEN
          RAISE EXCEPTION 'الخزينة قيد التسليم انتظر قبول الاستلام'; END IF;
        INSERT INTO public.bf_journal(cafe_id,document_id,account_id,debit,credit,memo)
          VALUES(p_cafe_id,did,(x->>'accountId')::uuid,dr,cr,coalesce(x->>'memo',''));
      END LOOP;
      IF EXISTS(SELECT 1 FROM public.bf_journal j JOIN public.bf_accounts a ON a.id=j.account_id AND a.cafe_id=j.cafe_id
        WHERE j.cafe_id=p_cafe_id AND a.kind IN('cash','employee') GROUP BY a.id HAVING sum(j.debit-j.credit)<0) THEN
        RAISE EXCEPTION 'رصيد النقدية أو العهدة غير كاف'; END IF;
      UPDATE public.bf_gl_drafts SET status=CASE WHEN p_action='post' THEN 'posted' ELSE 'reversed' END,
        document_id=CASE WHEN p_action='post' THEN did ELSE document_id END,
        reversal_document_id=CASE WHEN p_action='reverse' THEN did ELSE reversal_document_id END,
        revision=revision+1,updated_at=now() WHERE id=rec.id RETURNING * INTO rec;
    ELSE RAISE EXCEPTION 'إجراء دفتر الأستاذ غير معروف'; END IF;
    eid:=rec.id; answer:=to_jsonb(rec)-'cafe_id';
  END IF;
  INSERT INTO public.bf_gl_events(cafe_id,entity_id,action,details,created_by)
    VALUES(p_cafe_id,eid,p_action,jsonb_build_object('before',before_state,'after',answer,'reason',reason,'requestId',p_request_id),auth.uid());
  INSERT INTO public.bf_requests(cafe_id,request_id,operation,payload,result,created_by)
    VALUES(p_cafe_id,p_request_id,'gl:'||p_action,p_payload,answer,auth.uid());
  RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_gl_execute(uuid,text,jsonb,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_gl_execute(uuid,text,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.brand_finance_gl_snapshot(p_cafe_id uuid,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;
BEGIN
  r:=brand_finance_private.role_for(p_cafe_id);
  PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);
  IF r NOT IN('owner','manager','accountant','auditor') THEN RAISE EXCEPTION 'لا تملك صلاحية قراءة دفتر الأستاذ' USING ERRCODE='42501'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_offset>1000000 THEN RAISE EXCEPTION 'رقم الصفحة غير صالح'; END IF;
  RETURN jsonb_build_object(
    'settings',coalesce((SELECT to_jsonb(s)-'cafe_id'||jsonb_build_object('initialized',true) FROM public.bf_gl_settings s WHERE cafe_id=p_cafe_id),'{"maker_checker":true,"revision":1,"initialized":false}'::jsonb),
    'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a)-'cafe_id' ORDER BY code) FROM public.bf_accounts a WHERE cafe_id=p_cafe_id),'[]'::jsonb),
    'drafts',coalesce((SELECT jsonb_agg(to_jsonb(d)-'cafe_id' ORDER BY created_at DESC,id) FROM
      (SELECT * FROM public.bf_gl_drafts WHERE cafe_id=p_cafe_id ORDER BY created_at DESC,id OFFSET p_offset LIMIT 100) d),'[]'::jsonb),
    'hasMore',EXISTS(SELECT 1 FROM public.bf_gl_drafts WHERE cafe_id=p_cafe_id OFFSET p_offset+100 LIMIT 1),
    'periods',coalesce((SELECT jsonb_agg(to_jsonb(p)-'cafe_id' ORDER BY period_start DESC) FROM public.bf_gl_periods p WHERE cafe_id=p_cafe_id),'[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_gl_snapshot(uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_gl_snapshot(uuid,integer) TO authenticated;

CREATE FUNCTION public.brand_finance_gl_events(p_cafe_id uuid,p_id uuid,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);
  IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant','auditor') THEN
    RAISE EXCEPTION 'لا تملك صلاحية قراءة سجل القيد' USING ERRCODE='42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(e)-'cafe_id' ORDER BY id DESC) FROM
    (SELECT * FROM public.bf_gl_events WHERE cafe_id=p_cafe_id AND entity_id=p_id AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 100) e),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_gl_events(uuid,uuid,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_gl_events(uuid,uuid,bigint) TO authenticated;
CREATE FUNCTION public.brand_finance_gl_document(p_cafe_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc public.bf_documents;
BEGIN
  PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);
  IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant','auditor') THEN
    RAISE EXCEPTION 'لا تملك صلاحية قراءة المستند' USING ERRCODE='42501'; END IF;
  SELECT * INTO doc FROM public.bf_documents WHERE cafe_id=p_cafe_id AND id=p_id;
  IF doc.id IS NULL THEN RAISE EXCEPTION 'المستند غير موجود'; END IF;
  RETURN jsonb_build_object('document',to_jsonb(doc)-'cafe_id',
    'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)-'cafe_id' ORDER BY l.id) FROM public.bf_document_lines l WHERE cafe_id=p_cafe_id AND document_id=p_id),'[]'),
    'journal',coalesce((SELECT jsonb_agg(to_jsonb(j)-'cafe_id'||jsonb_build_object('accountName',a.name,'accountCode',a.code) ORDER BY j.id)
      FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id WHERE j.cafe_id=p_cafe_id AND j.document_id=p_id),'[]'),
    'partyName',(SELECT name FROM public.bf_parties WHERE cafe_id=p_cafe_id AND id=doc.party_id),
    'warehouseName',(SELECT name FROM public.bf_warehouses WHERE cafe_id=p_cafe_id AND id=doc.warehouse_id));
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_gl_document(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_gl_document(uuid,uuid) TO authenticated;

CREATE FUNCTION public.brand_finance_gl_report(p_cafe_id uuid,p_from date,p_to date,p_account_id uuid DEFAULT NULL,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE start_at timestamptz; end_at timestamptz;
BEGIN
  PERFORM brand_finance_private.assert_gl_enabled(p_cafe_id);
  IF brand_finance_private.role_for(p_cafe_id) NOT IN('owner','manager','accountant','auditor') THEN
    RAISE EXCEPTION 'لا تملك صلاحية قراءة التقرير' USING ERRCODE='42501'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_to<p_from OR p_to-p_from>3660
    OR p_offset IS NULL OR p_offset<0 OR p_offset>1000000 THEN RAISE EXCEPTION 'حدد فترة تقرير صالحة'; END IF;
  IF p_account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe_id AND id=p_account_id) THEN
    RAISE EXCEPTION 'الحساب غير موجود'; END IF;
  start_at:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh'; end_at:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
  RETURN jsonb_build_object('from',p_from,'to',p_to,'accountId',p_account_id,'offset',p_offset,
    'generatedAt',now(),'currency','SAR',
    'balances',coalesce((SELECT jsonb_agg(row_to_json(b) ORDER BY code) FROM (
      SELECT a.id,a.code,a.name,a.kind,a.parent_id,a.is_group,
        coalesce(sum(j.debit-j.credit) FILTER(WHERE j.created_at<start_at),0) opening,
        coalesce(sum(j.debit) FILTER(WHERE j.created_at>=start_at),0) debit,
        coalesce(sum(j.credit) FILTER(WHERE j.created_at>=start_at),0) credit,
        coalesce(sum(j.debit-j.credit),0) closing
      FROM public.bf_accounts a LEFT JOIN public.bf_journal j ON j.account_id=a.id AND j.cafe_id=a.cafe_id AND j.created_at<end_at
      WHERE a.cafe_id=p_cafe_id AND (p_account_id IS NULL OR a.id=p_account_id) GROUP BY a.id
    ) b),'[]'),
    'entries',coalesce((SELECT jsonb_agg(row_to_json(e) ORDER BY created_at,id) FROM (
      SELECT j.id,j.document_id,j.account_id,j.debit,j.credit,j.created_at,j.memo,a.name account_name,a.code,d.number,d.kind,d.reference_id
      FROM public.bf_journal j JOIN public.bf_accounts a ON a.cafe_id=j.cafe_id AND a.id=j.account_id
      JOIN public.bf_documents d ON d.cafe_id=j.cafe_id AND d.id=j.document_id
      WHERE j.cafe_id=p_cafe_id AND j.created_at>=start_at AND j.created_at<end_at AND (p_account_id IS NULL OR j.account_id=p_account_id)
      ORDER BY j.created_at,j.id OFFSET p_offset LIMIT 100
    ) e),'[]'),
    'hasMore',EXISTS(SELECT 1 FROM public.bf_journal j WHERE j.cafe_id=p_cafe_id AND j.created_at>=start_at AND j.created_at<end_at
      AND (p_account_id IS NULL OR j.account_id=p_account_id) OFFSET p_offset+100 LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.brand_finance_gl_report(uuid,date,date,uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.brand_finance_gl_report(uuid,date,date,uuid,integer) TO authenticated;
REVOKE ALL ON FUNCTION
 brand_finance_private.gl_enabled(uuid),
 brand_finance_private.assert_gl_enabled(uuid),
 brand_finance_private.gl_date_open(uuid,date),
 brand_finance_private.gl_document_guard(),
 brand_finance_private.gl_line_guard(),
 brand_finance_private.gl_lines(uuid,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
-- Preserve the established legacy implementation and its retry semantics while
-- requiring the approved journal workflow for new pilot journal requests.
DO $pilot_guard$ DECLARE definition text; anchor text:='ELSIF p_operation=''journal'' THEN'; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO definition;
 IF strpos(definition,anchor)=0 OR strpos(definition,'gl_enabled')>0 THEN
   RAISE EXCEPTION 'Unexpected legacy journal baseline';
 END IF;
 EXECUTE replace(definition,anchor,anchor||E'\n  IF brand_finance_private.gl_enabled(p_cafe_id) THEN RAISE EXCEPTION ''سجل القيد من دفتر الأستاذ لإكمال المراجعة والاعتماد'' USING ERRCODE=''42501''; END IF;');
END $pilot_guard$;
NOTIFY pgrst,'reload schema';
COMMIT;
