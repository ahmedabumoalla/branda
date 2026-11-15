BEGIN;
-- Enterprise workspace reads (landing overview and search). Read only: nothing here writes to the ledger.
-- Enabled per brand through erp_enterprise_settings; a brand without a row cannot call these reads.
CREATE SCHEMA erp_enterprise_private;
REVOKE ALL ON SCHEMA erp_enterprise_private FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE public.erp_enterprise_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.erp_enterprise_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_enterprise_settings FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_enterprise_private.role_for(c uuid) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r text;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_enterprise_settings WHERE cafe_id=c AND enabled) THEN RAISE EXCEPTION 'هذه الصفحة غير مفعلة لهذه العلامة' USING ERRCODE='42501';END IF;
 r:=brand_finance_private.role_for(c);
 IF coalesce(r,'') NOT IN('owner','manager','accountant','auditor','warehouse','cashier') THEN RAISE EXCEPTION 'لا تملك صلاحية هذه الصفحة' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;
-- The branch the signed-in user is working in: NULL means every branch they are allowed to see.
CREATE FUNCTION erp_enterprise_private.branch_for(c uuid,r text) RETURNS uuid LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE b uuid;BEGIN
 SELECT branch_id INTO b FROM public.erp_branch_scopes WHERE cafe_id=c AND user_id=auth.uid();
 IF b IS NULL AND r NOT IN('owner','manager','accountant','auditor') THEN SELECT branch_id INTO b FROM public.erp_hr_employees WHERE cafe_id=c AND user_id=auth.uid() AND active;END IF;
 RETURN b;
END $$;

CREATE FUNCTION public.erp_overview_read(p_cafe uuid,p_from date,p_to date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;money boolean;d0 timestamptz;d1 timestamptz;t0 timestamptz;result jsonb;
BEGIN
 r:=erp_enterprise_private.role_for(c);b:=erp_enterprise_private.branch_for(c,r);money:=r IN('owner','manager','accountant','auditor');
 IF p_from IS NULL OR p_to IS NULL OR p_to<p_from OR p_to-p_from>366 THEN RAISE EXCEPTION 'الفترة المطلوبة غير صالحة' USING ERRCODE='22023';END IF;
 d0:=p_from::timestamp AT TIME ZONE 'Asia/Riyadh';d1:=(p_to+1)::timestamp AT TIME ZONE 'Asia/Riyadh';t0:=(now() AT TIME ZONE 'Asia/Riyadh')::date::timestamp AT TIME ZONE 'Asia/Riyadh';
 WITH docs AS(
  SELECT d.*,o.kind origin,bd.branch_id FROM public.bf_documents d LEFT JOIN public.bf_documents o ON o.cafe_id=d.cafe_id AND o.id=d.reference_id
  LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id
  WHERE d.cafe_id=c AND d.created_at>=least(d0,t0) AND (b IS NULL OR bd.branch_id=b)),
 sales AS(SELECT * FROM docs WHERE kind='sale' OR kind='refund' AND origin='sale'),
 lines AS(SELECT s.id,sum(l.net) net,sum(l.cost) cost FROM sales s JOIN public.bf_document_lines l ON l.cafe_id=c AND l.document_id=s.id GROUP BY s.id)
 SELECT jsonb_build_object(
  'role',r,'branchId',b,'showMoney',money,
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) ORDER BY x.sort_order,x.name) FROM public.branches x WHERE x.cafe_id=c AND x.active AND x.deleted_at IS NULL),'[]'::jsonb),
  'today',jsonb_build_object(
    'sales',coalesce((SELECT sum(CASE WHEN kind='sale' THEN total ELSE -total END) FROM sales WHERE created_at>=t0),0),
    'invoices',(SELECT count(*) FROM sales WHERE kind='sale' AND created_at>=t0),
    'openShifts',(SELECT count(*) FROM public.bf_shifts s WHERE s.cafe_id=c AND s.status='open'),
    'labPending',(SELECT count(*) FROM public.erp_lab_orders o WHERE o.cafe_id=c AND o.status IN('requested','preparing','on_hold') AND (b IS NULL OR o.branch_id=b)),
    'byBranch',coalesce((SELECT jsonb_agg(jsonb_build_object('branchId',g.branch_id,'total',g.total,'invoices',g.n) ORDER BY g.total DESC) FROM(SELECT branch_id,sum(CASE WHEN kind='sale' THEN total ELSE -total END) total,count(*) FILTER(WHERE kind='sale') n FROM sales WHERE created_at>=t0 GROUP BY 1) g),'[]'::jsonb)),
  'salesByDay',coalesce((SELECT jsonb_agg(jsonb_build_object('day',g.day,'invoices',g.n,'total',g.total,'refunds',g.refunds,'profit',CASE WHEN money THEN g.profit END) ORDER BY g.day) FROM(
    SELECT (s.created_at AT TIME ZONE 'Asia/Riyadh')::date AS day,count(*) FILTER(WHERE s.kind='sale') n,coalesce(sum(s.total) FILTER(WHERE s.kind='sale'),0) total,coalesce(sum(s.total) FILTER(WHERE s.kind='refund'),0) refunds,
     coalesce(sum(CASE WHEN s.kind='sale' THEN 1 ELSE -1 END*(coalesce(l.net,0)-coalesce(l.cost,0))),0) profit
    FROM sales s LEFT JOIN lines l ON l.id=s.id WHERE s.created_at>=d0 AND s.created_at<d1 GROUP BY 1) g),'[]'::jsonb),
  'paymentsByDay',coalesce((SELECT jsonb_agg(jsonb_build_object('day',g.day,'cash',g.cash,'bank',g.bank,'pos',g.pos) ORDER BY g.day) FROM(
    SELECT (p.created_at AT TIME ZONE 'Asia/Riyadh')::date AS day,coalesce(sum(p.amount) FILTER(WHERE a.kind='cash'),0) cash,coalesce(sum(p.amount) FILTER(WHERE a.kind='bank'),0) bank,coalesce(sum(p.amount) FILTER(WHERE a.kind NOT IN('cash','bank') OR a.kind IS NULL),0) pos
    FROM(SELECT created_at,account_id,CASE WHEN kind='sale' THEN paid WHEN kind='settlement' THEN total ELSE -paid END amount FROM docs WHERE (kind='sale' AND paid>0 OR kind='settlement' AND origin='sale' OR kind='refund' AND origin='sale' AND paid>0) AND created_at>=d0 AND created_at<d1) p
    LEFT JOIN public.bf_accounts a ON a.cafe_id=c AND a.id=p.account_id GROUP BY 1) g),'[]'::jsonb),
  'latestInvoices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'number',s.number,'createdAt',s.created_at,'customer',coalesce(p.name,''),'total',s.total,'outstanding',coalesce((brand_finance_private.document_state(c,s.id)->>'outstanding')::numeric,0),'branchId',s.branch_id) ORDER BY s.created_at DESC)
    FROM(SELECT * FROM docs WHERE kind='sale' ORDER BY created_at DESC LIMIT 8) s LEFT JOIN public.bf_parties p ON p.cafe_id=c AND p.id=s.party_id),'[]'::jsonb),
  'unpaidInvoices',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u."createdAt") FROM(
    SELECT s.id,s.number,s.created_at "createdAt",coalesce(p.name,'') customer,s.total,(brand_finance_private.document_state(c,s.id)->>'outstanding')::numeric outstanding
    FROM(SELECT d.*  FROM public.bf_documents d LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id WHERE d.cafe_id=c AND d.kind='sale' AND d.paid<d.total AND (b IS NULL OR bd.branch_id=b) ORDER BY d.created_at LIMIT 60) s
    LEFT JOIN public.bf_parties p ON p.cafe_id=c AND p.id=s.party_id) u WHERE u.outstanding>0 LIMIT 8),'[]'::jsonb),
  'lowStock',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.quantity) FROM(
    SELECT i.id,i.name,coalesce(i.barcode,i.sku) code,i.unit,i.min_quantity "minQuantity",coalesce((SELECT sum(s.quantity) FROM public.bf_stock s WHERE s.cafe_id=c AND s.item_id=i.id),0) quantity
    FROM public.bf_items i JOIN public.erp_inventory_items e ON e.cafe_id=i.cafe_id AND e.item_id=i.id AND e.kind='product' AND e.status='active' WHERE i.cafe_id=c AND i.active) x
    WHERE x.quantity<0 OR x."minQuantity">0 AND x.quantity<=x."minQuantity" LIMIT 8),'[]'::jsonb),
  'labOrders',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."requiredAt") FROM(
    SELECT o.id,o.number,o.status,o.required_at "requiredAt",coalesce(p.name,'') customer,o.branch_id "branchId",jsonb_array_length(o.lines) items
    FROM public.erp_lab_orders o LEFT JOIN public.bf_parties p ON p.cafe_id=o.cafe_id AND p.id=o.customer_id
    WHERE o.cafe_id=c AND o.status IN('requested','preparing','on_hold','prepared','out_for_delivery') AND (b IS NULL OR o.branch_id=b) ORDER BY o.required_at LIMIT 6) x),'[]'::jsonb),
  'activity',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.at DESC) FROM(
    SELECT d.id,d.kind,d.origin,d.number,d.total,d.created_at at,d.branch_id "branchId",coalesce(st.name,pr.full_name,'') actor,coalesce(p.name,'') party
    FROM(SELECT * FROM docs ORDER BY created_at DESC LIMIT 12) d LEFT JOIN public.bf_staff st ON st.cafe_id=c AND st.user_id=d.created_by
    LEFT JOIN public.profiles pr ON pr.id=d.created_by LEFT JOIN public.bf_parties p ON p.cafe_id=c AND p.id=d.party_id) x),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION public.erp_overview_search(p_cafe uuid,p_kind text,p_query text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c uuid:=p_cafe;r text;b uuid;q text:=btrim(translate(coalesce(p_query,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'));pattern text;
BEGIN
 r:=erp_enterprise_private.role_for(c);b:=erp_enterprise_private.branch_for(c,r);
 IF length(q) NOT BETWEEN 1 AND 80 OR p_kind NOT IN('invoice','customer') THEN RETURN '[]'::jsonb;END IF;
 pattern:='%'||replace(replace(replace(q,'\','\\'),'%','\%'),'_','\_')||'%';
 IF p_kind='invoice' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x."createdAt" DESC) FROM(
   SELECT d.id,d.number,d.created_at "createdAt",coalesce(p.name,'') customer,d.total
   FROM public.bf_documents d LEFT JOIN public.bf_parties p ON p.cafe_id=d.cafe_id AND p.id=d.party_id LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id
   WHERE d.cafe_id=c AND d.kind='sale' AND (b IS NULL OR bd.branch_id=b) AND (d.number::text=q OR p.name ILIKE pattern OR d.customer_phone LIKE pattern OR p.phone LIKE pattern)
   ORDER BY d.created_at DESC LIMIT 8) x),'[]'::jsonb);
 END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM(
  SELECT p.id,p.name,p.phone FROM public.bf_parties p WHERE p.cafe_id=c AND p.kind='customer' AND p.active AND (p.name ILIKE pattern OR p.phone LIKE pattern)
   AND (b IS NULL OR erp_branch_private.allowed_resource(c,b,'customer',p.id)) ORDER BY p.name LIMIT 8) x),'[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.erp_overview_read(uuid,date,date),public.erp_overview_search(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_overview_read(uuid,date,date),public.erp_overview_search(uuid,text,text) TO authenticated;
-- User mandate 2026-11-15: the enterprise workspace is switched on for the Aldeem sweets chain only.
INSERT INTO public.erp_enterprise_settings(cafe_id) SELECT id FROM public.cafes WHERE slug='khayal-aldeem';
COMMIT;
