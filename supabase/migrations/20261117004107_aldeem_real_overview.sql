BEGIN;
-- Read-only reporting over authoritative ledgers, no copied sales or demo data.
CREATE OR REPLACE FUNCTION public.aldeem_overview_read(
 p_cafe uuid, p_from date, p_to date, p_branch uuid DEFAULT NULL, p_department text DEFAULT 'all'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE c uuid:=p_cafe; r text; b uuid; scoped uuid; d0 timestamptz; d1 timestamptz;
 result jsonb; part jsonb;
BEGIN
 r:=erp_enterprise_private.role_for(c);
 IF r IS DISTINCT FROM 'owner' OR NOT EXISTS(SELECT 1 FROM public.cafes WHERE id=c AND slug='khayal-aldeem') THEN
  RAISE EXCEPTION 'النظرة الشاملة متاحة لمالك حساب الديم' USING ERRCODE='42501';
 END IF;
 scoped:=erp_enterprise_private.branch_for(c,r);
 IF p_branch IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM public.branches WHERE cafe_id=c AND id=p_branch AND deleted_at IS NULL) OR scoped IS NOT NULL AND scoped<>p_branch) THEN
  RAISE EXCEPTION 'الفرع غير متاح لهذا الحساب' USING ERRCODE='42501';
 END IF;
 b:=coalesce(scoped,p_branch);
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>365 OR p_department IS NULL OR p_department NOT IN('all','sales','lab','manufacturing','loyalty') THEN
  RAISE EXCEPTION 'اختر فترة صحيحة لا تتجاوز سنة';
 END IF;
 d0:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh'; d1:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';
 result:=jsonb_build_object('at',statement_timestamp(),'scopeBranch',scoped,
  'filters',jsonb_build_object('from',p_from,'to',p_to,'branch',b,'department',p_department),
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY sort_order,name) FROM public.branches WHERE cafe_id=c AND deleted_at IS NULL AND (scoped IS NULL OR id=scoped)),'[]'::jsonb),
  'sales',NULL,'lab',NULL,'manufacturing',NULL,'loyalty',NULL);

 IF p_department IN('all','sales') THEN BEGIN
  WITH docs AS MATERIALIZED (
   SELECT d.id,d.number,d.kind,d.total,d.tax,d.paid,d.created_at,bd.branch_id,
    CASE WHEN d.kind='sale' THEN 1 ELSE -1 END AS sign
   FROM public.bf_documents d
   LEFT JOIN public.bf_documents original ON original.cafe_id=c AND original.id=d.reference_id
   LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=c AND bd.document_id=d.id
   WHERE d.cafe_id=c AND d.created_at>=d0 AND d.created_at<d1
    AND (d.kind='sale' OR d.kind='refund' AND original.kind='sale') AND (b IS NULL OR bd.branch_id=b)
  ) SELECT jsonb_build_object(
   'invoices',count(*) FILTER(WHERE kind='sale'),'gross',coalesce(sum(total) FILTER(WHERE kind='sale'),0),
   'refunds',coalesce(sum(total) FILTER(WHERE kind='refund'),0),'refundCount',count(*) FILTER(WHERE kind='refund'),
   'net',coalesce(sum(sign*total),0),'tax',coalesce(sum(sign*tax),0),'paidAtIssue',coalesce(sum(sign*paid),0),
   'byBranch',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT branch_id "branchId",count(*) FILTER(WHERE kind='sale') invoices,coalesce(sum(sign*total),0) sales,coalesce(sum(total) FILTER(WHERE kind='refund'),0) refunds FROM docs GROUP BY branch_id)x),'[]'::jsonb),
   'days',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.day) FROM(SELECT (created_at AT TIME ZONE 'Asia/Riyadh')::date AS day,sum(sign*total) sales,count(*) FILTER(WHERE kind='sale') invoices FROM docs GROUP BY 1)x),'[]'::jsonb),
   'recent',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC,x.id) FROM(SELECT id,number,kind,total,created_at "createdAt",branch_id "branchId" FROM docs ORDER BY created_at DESC,id LIMIT 8)x),'[]'::jsonb)
  ) INTO part FROM docs;
  result:=result||jsonb_build_object('sales',jsonb_build_object('data',part));
 EXCEPTION WHEN OTHERS THEN result:=result||jsonb_build_object('sales',jsonb_build_object('error','تعذر قراءة المبيعات من السجل المالي')); END; END IF;

 IF p_department IN('all','lab') THEN BEGIN
  WITH orders AS MATERIALIZED(SELECT id,number,status,branch_id,created_at,required_at FROM public.erp_lab_orders WHERE cafe_id=c AND created_at>=d0 AND created_at<d1 AND (b IS NULL OR branch_id=b))
  SELECT jsonb_build_object('total',count(*),
   'statuses',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT status,count(*) count FROM orders GROUP BY status)x),'[]'::jsonb),
   'byBranch',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT branch_id "branchId",count(*) count FROM orders GROUP BY branch_id)x),'[]'::jsonb),
   'recent',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC,x.id) FROM(SELECT id,number,status,branch_id "branchId",created_at "createdAt",required_at "requiredAt" FROM orders ORDER BY created_at DESC,id LIMIT 8)x),'[]'::jsonb)) INTO part FROM orders;
  result:=result||jsonb_build_object('lab',jsonb_build_object('data',part));
 EXCEPTION WHEN OTHERS THEN result:=result||jsonb_build_object('lab',jsonb_build_object('error','تعذر قراءة طلبات المعمل')); END; END IF;

 IF p_department IN('all','manufacturing') THEN BEGIN
  WITH orders AS MATERIALIZED(
   SELECT o.id,o.code,o.name,o.status,o.created_at,br.branch_id FROM public.erp_mfg_orders o
   LEFT JOIN public.erp_branch_records br ON br.cafe_id=c AND br.table_name='erp_mfg_orders' AND br.record_id=o.id
   WHERE o.cafe_id=c AND o.created_at>=d0 AND o.created_at<d1 AND (b IS NULL OR br.branch_id=b)
  ) SELECT jsonb_build_object('total',count(*),
   'statuses',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT status,count(*) count FROM orders GROUP BY status)x),'[]'::jsonb),
   'byBranch',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT branch_id "branchId",count(*) count FROM orders GROUP BY branch_id)x),'[]'::jsonb),
   'recent',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC,x.id) FROM(SELECT id,code "number",name,status,branch_id "branchId",created_at "createdAt" FROM orders ORDER BY created_at DESC,id LIMIT 8)x),'[]'::jsonb)) INTO part FROM orders;
  result:=result||jsonb_build_object('manufacturing',jsonb_build_object('data',part));
 EXCEPTION WHEN OTHERS THEN result:=result||jsonb_build_object('manufacturing',jsonb_build_object('error','تعذر قراءة أوامر المصنع')); END; END IF;

 IF p_department IN('all','loyalty') THEN BEGIN
  WITH entries AS MATERIALIZED(SELECT kind,points,amount,phone,branch_id FROM public.erp_points_ledger WHERE cafe_id=c AND created_at>=d0 AND created_at<d1 AND (b IS NULL OR branch_id=b))
  SELECT jsonb_build_object('earned',coalesce(sum(points) FILTER(WHERE kind='earn'),0),'redeemed',coalesce(-sum(points) FILTER(WHERE kind='redeem'),0),
   'redeemedValue',coalesce(sum(amount) FILTER(WHERE kind='redeem'),0),'adjusted',coalesce(sum(points) FILTER(WHERE kind='adjust'),0),'reversed',coalesce(sum(points) FILTER(WHERE kind='reverse'),0),'customers',count(DISTINCT phone),
   'byBranch',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT branch_id "branchId",coalesce(sum(points) FILTER(WHERE kind='earn'),0) earned,coalesce(-sum(points) FILTER(WHERE kind='redeem'),0) redeemed FROM entries GROUP BY branch_id)x),'[]'::jsonb)) INTO part FROM entries;
  result:=result||jsonb_build_object('loyalty',jsonb_build_object('data',part));
 EXCEPTION WHEN OTHERS THEN result:=result||jsonb_build_object('loyalty',jsonb_build_object('error','تعذر قراءة حركة نقاط الولاء')); END; END IF;

 BEGIN
  SELECT jsonb_build_object(
   'points',(SELECT count(*) FROM aldeem_pos_private.points WHERE cafe_id=c AND enabled AND (b IS NULL OR branch_id=b)),
   'openShifts',(SELECT count(DISTINCT s.id) FROM aldeem_pos_private.shifts ps JOIN public.bf_shifts s ON s.cafe_id=c AND s.id=ps.shift_id JOIN aldeem_pos_private.points p ON p.cafe_id=c AND p.id=ps.point_id WHERE ps.cafe_id=c AND s.status='open' AND (b IS NULL OR p.branch_id=b)),
   'labPending',(SELECT count(*) FROM public.erp_lab_orders WHERE cafe_id=c AND status IN('requested','preparing','on_hold','prepared','out_for_delivery') AND (b IS NULL OR branch_id=b)),
   'labHeld',(SELECT count(*) FROM public.erp_lab_orders WHERE cafe_id=c AND status='on_hold' AND (b IS NULL OR branch_id=b)),
   'manufacturingPending',(SELECT count(*) FROM public.erp_mfg_orders o LEFT JOIN public.erp_branch_records br ON br.cafe_id=c AND br.table_name='erp_mfg_orders' AND br.record_id=o.id WHERE o.cafe_id=c AND o.status IN('draft','ready','in_progress') AND (b IS NULL OR br.branch_id=b)),
   'outstandingPoints',CASE WHEN b IS NULL AND p_department IN('all','loyalty') THEN (SELECT coalesce(sum(erp_points_private.balance(c,x.phone)),0) FROM(SELECT DISTINCT phone FROM public.erp_points_ledger WHERE cafe_id=c)x) ELSE NULL END
  ) INTO part;
  result:=result||jsonb_build_object('current',jsonb_build_object('data',part));
 EXCEPTION WHEN OTHERS THEN result:=result||jsonb_build_object('current',jsonb_build_object('error','تعذر قراءة الوضع الحالي للمنصة')); END;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.aldeem_overview_read(uuid,date,date,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.aldeem_overview_read(uuid,date,date,uuid,text) TO authenticated;
COMMIT;
