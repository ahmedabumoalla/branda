// Derive a follow-up from the immutable applied calculator; preserve posting code.
const fs=require('node:fs');const original=fs.readFileSync('supabase/migrations/20261113095500_erp_payroll.sql','utf8');
if(fs.existsSync('output/erp-database/20261113112700_erp_payroll_preview.sql.result.json'))throw new Error('Applied migration is immutable; use a new follow-up migration');
let calculate=original.slice(original.indexOf('CREATE FUNCTION erp_payroll_private.calculate('),original.indexOf('CREATE FUNCTION erp_payroll_private.metrics('));
calculate=calculate.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
calculate=calculate.replace('attendance_used boolean:=false;BEGIN',"attendance_used boolean:=false;pending text[]:='{}';needed text[];deferred boolean:=false;BEGIN");
calculate=calculate.replace(" FOR line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP", " IF NOT metrics?'period_days' THEN pending:=ARRAY['worked','scheduled','late','early','overtime','absent','leave','holiday','days','period_days'];END IF;\n FOR line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP");
const from=calculate.indexOf('  amount:=CASE WHEN condition'),to=calculate.indexOf('  v:=v||jsonb_build_object(c.code,amount);',from),old=calculate.slice(from,to);
calculate=calculate.slice(0,from)+`  SELECT coalesce(array_agg(DISTINCT x#>>'{}'),'{}') INTO needed FROM jsonb_path_query(jsonb_build_array(expr,condition),'$.** ? (@.type == "variable").name')x;
  IF EXISTS(SELECT 1 FROM unnest(needed)n WHERE NOT v?n) THEN RAISE EXCEPTION 'متغير غير محسوب في صيغة الراتب';END IF;
  IF needed&&pending THEN
   deferred:=true;amount:=NULL;pending:=array_append(pending,c.code);
   IF NOT coalesce((c.payload->>'referenceOnly')::boolean,false) THEN pending:=array_append(pending,CASE c.kind WHEN 'earning' THEN 'earnings' ELSE 'deductions' END);END IF;
  ELSE
`+old+`  END IF;
`+calculate.slice(to);
calculate=calculate.replace("  IF NOT coalesce((c.payload->>'referenceOnly')::boolean,false) THEN IF c.kind=", "  IF amount IS NOT NULL AND NOT coalesce((c.payload->>'referenceOnly')::boolean,false) THEN IF c.kind=");
calculate=calculate.replace("'amount',amount,'referenceOnly'","'amount',amount,'deferred',amount IS NULL,'referenceOnly'");
calculate=calculate.replace('IF deductions>gross OR gross>1000000000 THEN','IF (NOT deferred AND deductions>gross) OR gross>1000000000 THEN');
calculate=calculate.replace("'net',gross-deductions,'metrics'","'net',greatest(0,gross-deductions),'previewPending',deferred,'metrics'");
let record=original.slice(original.indexOf('CREATE FUNCTION erp_payroll_private.record('),original.indexOf('\n',original.indexOf('CREATE FUNCTION erp_payroll_private.record(')));
record=record.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION').replace("'total',amount,","'total',CASE WHEN coalesce((calculation->>'previewPending')::boolean,false) THEN NULL ELSE amount END,");
const sql=`BEGIN;
-- No artificial month length or attendance values are used for contract previews.
-- Real payslips always supply period_days and retain strict attendance validation.
${calculate}
${record}
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
`;
fs.writeFileSync('supabase/migrations/20261113112700_erp_payroll_preview.sql',sql);
