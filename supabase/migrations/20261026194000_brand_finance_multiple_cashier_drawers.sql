-- Multiple physical cashier drawers per brand; one live custodian per drawer remains enforced.
BEGIN;
DROP INDEX public.bf_one_cashier_drawer;
CREATE INDEX bf_cashier_drawers ON public.bf_accounts(cafe_id,id) WHERE is_cashier_drawer;

CREATE OR REPLACE FUNCTION brand_finance_private.cashier_drawer(p_cafe uuid) RETURNS uuid
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_cafe::text,60412));
 SELECT id INTO result FROM public.bf_accounts WHERE cafe_id=p_cafe AND is_cashier_drawer
 ORDER BY (code='1001-CASHIER') DESC,id LIMIT 1;
 IF result IS NULL THEN
  INSERT INTO public.bf_accounts(cafe_id,code,name,kind,is_cashier_drawer,opening_recorded_at,opening_amount)
  VALUES(p_cafe,'1001-CASHIER','صندوق كاشير الفرع','cash',true,now(),0) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

DO $$ DECLARE src text; old text; BEGIN
 SELECT pg_get_functiondef('brand_finance_private.execute_before_treasury(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='IF aid IS DISTINCT FROM brand_finance_private.cashier_drawer(p_cafe_id) THEN RAISE EXCEPTION ''تبدأ الورديات الجديدة من صندوق الكاشير المستقل''; END IF;';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected drawer opening baseline'; END IF;
 EXECUTE replace(src,old,$replacement$IF NOT EXISTS(SELECT 1 FROM public.bf_accounts dr WHERE dr.cafe_id=p_cafe_id AND dr.id=aid AND dr.is_cashier_drawer AND dr.active) THEN RAISE EXCEPTION 'اختر صندوق كاشير نشطا تابعا للعلامة'; END IF;$replacement$);

 SELECT pg_get_functiondef('brand_finance_private.close_cash_handover(uuid,uuid,jsonb)'::regprocedure) INTO src;
 old:='receiving:=brand_finance_private.cashier_drawer(p_cafe);';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected handover drawer baseline'; END IF;
 -- Legacy shifts on ordinary safes still transfer to the original dedicated drawer.
 EXECUTE replace(src,old,$replacement$receiving:=CASE WHEN EXISTS(SELECT 1 FROM public.bf_accounts WHERE cafe_id=p_cafe AND id=sh.account_id AND is_cashier_drawer) THEN sh.account_id ELSE brand_finance_private.cashier_drawer(p_cafe) END;$replacement$);

 SELECT pg_get_functiondef('public.brand_finance_treasury_execute(uuid,text,jsonb,uuid)'::regprocedure) INTO src;
 old:='k:=p_payload->>''kind''; linked:=nullif(p_payload->>''linkedBankId'','''')::uuid;';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected treasury account baseline'; END IF;
 src:=replace(src,old,old||$replacement$
  IF p_payload ? 'cashierDrawer' THEN
   IF jsonb_typeof(p_payload->'cashierDrawer') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'نوع صندوق الكاشير غير صالح'; END IF;
   IF (p_payload->>'cashierDrawer')::boolean AND k<>'cash' THEN RAISE EXCEPTION 'صندوق الكاشير حساب نقدي مستقل'; END IF;
   IF aid IS NOT NULL AND (p_payload->>'cashierDrawer')::boolean IS DISTINCT FROM a.is_cashier_drawer THEN RAISE EXCEPTION 'نوع صندوق الكاشير ثابت'; END IF;
  END IF;
 $replacement$);
 old:='INSERT INTO public.bf_accounts(id,cafe_id,name,code,kind,linked_bank_id,bank_name,iban,terminal_id)';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected treasury insert baseline'; END IF;
 src:=replace(src,old,'INSERT INTO public.bf_accounts(id,cafe_id,name,code,kind,linked_bank_id,bank_name,iban,terminal_id,is_cashier_drawer)');
 old:='coalesce(p_payload->>''terminalId'',''''));';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected treasury insert values'; END IF;
 src:=replace(src,old,'coalesce(p_payload->>''terminalId'',''''),coalesce((p_payload->>''cashierDrawer'')::boolean,false));');
 EXECUTE src;

 SELECT pg_get_functiondef('public.brand_finance_cash_handovers(uuid,integer,integer)'::regprocedure) INTO src;
 old:='''canReceive'',managed,''cashierDrawerId'',drawer,';
 IF strpos(src,old)=0 THEN RAISE EXCEPTION 'Unexpected handover context baseline'; END IF;
 -- Only identity/availability is exposed here, never the opening balance or other employees' amounts.
 EXECUTE replace(src,old,old||$replacement$
 'cashierDrawers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'busy',EXISTS(SELECT 1 FROM public.bf_shifts s WHERE s.cafe_id=p_cafe_id AND s.account_id=a.id AND s.status IN('open','handover'))) ORDER BY (a.code='1001-CASHIER') DESC,a.id) FROM public.bf_accounts a WHERE a.cafe_id=p_cafe_id AND a.is_cashier_drawer AND a.active),'[]'::jsonb),
 $replacement$);
END $$;
-- Existing role_for guards, RLS/revokes, tenant locks, idempotency and one-live-shift indexes remain intact.
COMMIT;
