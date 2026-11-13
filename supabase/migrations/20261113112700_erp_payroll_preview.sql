BEGIN;
-- No artificial month length or attendance values are used for contract previews.
-- Real payslips always supply period_days and retain strict attendance validation.
CREATE OR REPLACE FUNCTION erp_payroll_private.calculate(p_cafe uuid,p jsonb,metrics jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c public.erp_salary_components;line jsonb;lines jsonb:='[]';amount numeric;basic numeric:=round((p->>'basic')::numeric,2);gross numeric;deductions numeric:=0;v jsonb;seen uuid[]:='{}';settings jsonb;expr jsonb;condition jsonb;attendance_used boolean:=false;pending text[]:='{}';needed text[];deferred boolean:=false;BEGIN
 SELECT payload INTO settings FROM public.erp_payroll_settings WHERE cafe_id=p_cafe;
 IF basic IS NULL OR basic<0 OR basic>1000000000 OR basic='NaN'::numeric OR jsonb_typeof(p->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'lines')>100 THEN RAISE EXCEPTION 'راجع قيمة الراتب وبنوده';END IF;
 gross:=basic;v:='{"worked":0,"scheduled":0,"late":0,"early":0,"overtime":0,"absent":0,"leave":0,"holiday":0,"days":0,"period_days":0}'::jsonb||metrics||jsonb_build_object('basic',basic,'earnings',gross,'deductions',0);
 IF NOT metrics?'period_days' THEN pending:=ARRAY['worked','scheduled','late','early','overtime','absent','leave','holiday','days','period_days'];END IF;
 FOR line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
  SELECT * INTO c FROM public.erp_salary_components WHERE cafe_id=p_cafe AND id=(line->>'componentId')::uuid AND active;
  IF NOT FOUND OR c.id=ANY(seen) OR v?c.code THEN RAISE EXCEPTION 'بند الراتب غير متاح أو مكرر أو رمزه محجوز';END IF;seen:=array_append(seen,c.id);
  expr:=CASE WHEN nullif(line->>'formula','') IS NOT NULL THEN line->'formulaAst' WHEN c.payload->>'method'='formula' THEN c.payload->'formulaAst' END;
  condition:=CASE WHEN nullif(line->>'condition','') IS NOT NULL THEN line->'conditionAst' ELSE c.payload->'conditionAst' END;
  IF expr='null'::jsonb THEN expr:=NULL;END IF;IF condition='null'::jsonb THEN condition:=NULL;END IF;
  IF (coalesce(expr::text,'')||coalesce(condition::text,''))~'"name": "(worked|scheduled|late|early|overtime|absent|leave|holiday|days)"' THEN attendance_used:=true;IF metrics?'complete' AND NOT coalesce((metrics->>'complete')::boolean,false) THEN RAISE EXCEPTION 'الصيغة تعتمد على حضور غير مكتمل أو غير معتمد';END IF;END IF;
  IF nullif(line->>'condition','') IS NOT NULL AND condition IS NULL THEN RAISE EXCEPTION 'الشرط الحسابي لم يتحقق';END IF;
  IF (nullif(line->>'formula','') IS NOT NULL OR c.payload->>'method'='formula') AND expr IS NULL THEN RAISE EXCEPTION 'الصيغة الحسابية لم تتحقق';END IF;
  SELECT coalesce(array_agg(DISTINCT x#>>'{}'),'{}') INTO needed FROM jsonb_path_query(jsonb_build_array(expr,condition),'$.** ? (@.type == "variable").name')x;
  IF EXISTS(SELECT 1 FROM unnest(needed)n WHERE NOT v?n) THEN RAISE EXCEPTION 'متغير غير محسوب في صيغة الراتب';END IF;
  IF needed&&pending THEN
   deferred:=true;amount:=NULL;pending:=array_append(pending,c.code);
   IF NOT coalesce((c.payload->>'referenceOnly')::boolean,false) THEN pending:=array_append(pending,CASE c.kind WHEN 'earning' THEN 'earnings' ELSE 'deductions' END);END IF;
  ELSE
  amount:=CASE WHEN condition IS NOT NULL AND erp_payroll_private.eval(condition,v)=0 THEN 0 WHEN expr IS NOT NULL THEN erp_payroll_private.eval(expr,v) ELSE coalesce((line->>'amount')::numeric,(c.payload->>'amount')::numeric) END;
  IF amount IS NULL OR amount<0 OR amount>1000000000 OR amount='NaN'::numeric THEN RAISE EXCEPTION 'قيمة بند الراتب غير صالحة';END IF;amount:=round(amount,2);
  END IF;
  v:=v||jsonb_build_object(c.code,amount);
  IF amount IS NOT NULL AND NOT coalesce((c.payload->>'referenceOnly')::boolean,false) THEN IF c.kind='earning' THEN gross:=gross+amount;ELSE deductions:=deductions+amount;END IF;END IF;
  v:=v||jsonb_build_object('earnings',gross,'deductions',deductions);
  lines:=lines||jsonb_build_array(jsonb_build_object('componentId',c.id,'code',c.code,'name',c.name,'kind',c.kind,'amount',amount,'deferred',amount IS NULL,'referenceOnly',coalesce((c.payload->>'referenceOnly')::boolean,false),'accountId',coalesce(c.payload->>'accountId',settings->>'expenseAccountId'),'formula',coalesce(nullif(line->>'formula',''),c.payload->>'formula'),'condition',coalesce(nullif(line->>'condition',''),c.payload->>'condition')));
 END LOOP;
 IF (NOT deferred AND deductions>gross) OR gross>1000000000 THEN RAISE EXCEPTION 'المستقطعات تتجاوز المستحقات أو إجمالي الراتب أكبر من المسموح';END IF;
 RETURN jsonb_build_object('basic',basic,'lines',lines,'gross',gross,'deductions',deductions,'net',greatest(0,gross-deductions),'previewPending',deferred,'metrics',metrics,'attendanceUsed',attendance_used);
END $$;

CREATE OR REPLACE FUNCTION erp_payroll_private.record(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$ SELECT jsonb_build_object('id',id,'revision',revision,'name',name,'code',code,'status',status,'employeeId',employee_id,'payload',payload||jsonb_build_object('calculation',calculation,'runId',run_id,'contractId',contract_id,'documentId',document_id,'paymentId',payment_id),'total',CASE WHEN coalesce((calculation->>'previewPending')::boolean,false) THEN NULL ELSE amount END,'paid',paid,'createdAt',created_at) FROM public.erp_payroll_records WHERE id=p_id $$;
DO $$DECLARE src text;BEGIN SELECT pg_get_functiondef('brand_finance_private.template_context(uuid,text,uuid)'::regprocedure) INTO src;EXECUTE replace(src,'brand_finance_private.template_context(','erp_payroll_private.template_context_before_preview(');END $$;
CREATE OR REPLACE FUNCTION brand_finance_private.template_context(c uuid,e text,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$DECLARE result jsonb;BEGIN
 result:=erp_payroll_private.template_context_before_preview(c,e,i);
 IF e='payroll_contract' AND EXISTS(SELECT 1 FROM public.erp_payroll_records WHERE cafe_id=c AND id=i AND coalesce((calculation->>'previewPending')::boolean,false)) THEN
  result:=result||jsonb_build_object('total',NULL,'outstanding',NULL,'previewPending',true);
  result:=jsonb_set(result,'{values}',(result->'values')||jsonb_build_object('المبلغ','يحسب عند تحديد فترة الراتب','المتبقي','يحسب عند تحديد فترة الراتب'));
 END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_payroll_private.calculate(uuid,jsonb,jsonb),erp_payroll_private.record(uuid),erp_payroll_private.template_context_before_preview(uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
