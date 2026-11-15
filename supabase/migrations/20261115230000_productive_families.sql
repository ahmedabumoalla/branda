BEGIN;
-- Productive families (consignment suppliers). The purchase ledger stays authoritative: a family is a supplier,
-- a receipt is a posted purchase invoice, a return is a purchase return and a payout is a supplier payment.
-- This layer only records which supplier is a family, which stock items are theirs, and the receipt terms,
-- then reads quantities and money back from the original documents and stock movements.
-- Enabled per brand through erp_family_settings; a brand without a row cannot read or write anything here.
CREATE SCHEMA erp_family_private;
REVOKE ALL ON SCHEMA erp_family_private FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE public.erp_family_settings(cafe_id uuid PRIMARY KEY REFERENCES public.cafes(id),enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE public.erp_families(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 supplier_id uuid NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),active boolean NOT NULL DEFAULT true,
 payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8000),phone_key text,
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,supplier_id),FOREIGN KEY(cafe_id,supplier_id) REFERENCES public.bf_parties(cafe_id,id)
);
CREATE UNIQUE INDEX erp_families_phone ON public.erp_families(cafe_id,phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX erp_families_actor ON public.erp_families(created_by);
CREATE TABLE public.erp_family_items(
 cafe_id uuid NOT NULL,item_id uuid NOT NULL,family_id uuid NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(cafe_id,item_id),FOREIGN KEY(cafe_id,item_id) REFERENCES public.bf_items(cafe_id,id),FOREIGN KEY(cafe_id,family_id) REFERENCES public.erp_families(cafe_id,id)
);
CREATE INDEX erp_family_items_family ON public.erp_family_items(cafe_id,family_id);
CREATE INDEX erp_family_items_actor ON public.erp_family_items(created_by);
CREATE TABLE public.erp_family_consignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL REFERENCES public.cafes(id),number bigint GENERATED ALWAYS AS IDENTITY,
 family_id uuid NOT NULL,branch_id uuid NOT NULL,warehouse_id uuid NOT NULL,mode text NOT NULL CHECK(mode IN('cash','after_sale')),
 purchase_id uuid NOT NULL,finance_id uuid NOT NULL,return_by date,note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(cafe_id,id),UNIQUE(cafe_id,purchase_id),UNIQUE(cafe_id,finance_id),
 FOREIGN KEY(cafe_id,family_id) REFERENCES public.erp_families(cafe_id,id),FOREIGN KEY(branch_id,cafe_id) REFERENCES public.branches(id,cafe_id),
 FOREIGN KEY(cafe_id,warehouse_id) REFERENCES public.bf_warehouses(cafe_id,id),FOREIGN KEY(cafe_id,purchase_id) REFERENCES public.erp_purchase_documents(cafe_id,id),
 FOREIGN KEY(cafe_id,finance_id) REFERENCES public.bf_documents(cafe_id,id)
);
CREATE INDEX erp_family_consignments_family ON public.erp_family_consignments(cafe_id,family_id,created_at DESC);
CREATE INDEX erp_family_consignments_branch ON public.erp_family_consignments(branch_id,cafe_id);
CREATE INDEX erp_family_consignments_warehouse ON public.erp_family_consignments(cafe_id,warehouse_id);
CREATE INDEX erp_family_consignments_actor ON public.erp_family_consignments(created_by);
CREATE TABLE public.erp_family_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cafe_id uuid NOT NULL,family_id uuid,action text NOT NULL,payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 actor uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(cafe_id,family_id) REFERENCES public.erp_families(cafe_id,id)
);
CREATE INDEX erp_family_events_family ON public.erp_family_events(cafe_id,family_id,created_at DESC);
CREATE INDEX erp_family_events_actor ON public.erp_family_events(actor);
ALTER TABLE public.erp_family_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_family_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_family_consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_family_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_family_settings,public.erp_families,public.erp_family_items,public.erp_family_consignments,public.erp_family_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON public.erp_family_events FOR EACH ROW EXECUTE FUNCTION brand_finance_private.immutable();

CREATE FUNCTION erp_family_private.phone(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT nullif(substring(regexp_replace(regexp_replace(regexp_replace(translate(coalesce(value,''),'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'),'[[:space:]+()-]','','g'),'^00966','966'),'^05','9665') FROM '^9665[0-9]{8}$'),'')
$$;
CREATE FUNCTION erp_family_private.role_for(c uuid,p_write boolean) RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE r text;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'سجل الدخول أولًا' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_family_settings WHERE cafe_id=c AND enabled) THEN RAISE EXCEPTION 'قسم الأسر المنتجة غير مفعل لهذه العلامة' USING ERRCODE='42501';END IF;
 r:=brand_finance_private.role_for(c);
 IF coalesce(r,'') NOT IN('owner','manager','accountant','warehouse','auditor') OR p_write AND r='auditor' THEN RAISE EXCEPTION 'لا تملك صلاحية الأسر المنتجة' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;

-- One snapshot for the management workspace and the family portal. p_family limits it to one family,
-- p_wide false limits receipts to the branches of the signed-in employee.
CREATE FUNCTION erp_family_private.snapshot(c uuid,p_family uuid,p_wide boolean) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH wh AS(
  SELECT w.id,w.name,w.active,(SELECT x::uuid FROM jsonb_array_elements_text(CASE WHEN w.inventory_payload#>>'{permissions,write,mode}'='branches' AND jsonb_typeof(w.inventory_payload#>'{permissions,write,ids}')='array' THEN w.inventory_payload#>'{permissions,write,ids}' ELSE '[]'::jsonb END) x LIMIT 1) branch_id
  FROM public.bf_warehouses w WHERE w.cafe_id=c),
 fam AS(SELECT f.*,p.name,p.phone FROM public.erp_families f JOIN public.bf_parties p ON p.cafe_id=f.cafe_id AND p.id=f.supplier_id WHERE f.cafe_id=c AND (p_family IS NULL OR f.id=p_family)),
 fi AS(
  SELECT i.item_id,i.family_id,b.name,b.barcode,b.sku,b.unit,b.active,coalesce((e.payload->>'buyPrice')::numeric,0) cost,coalesce((e.payload->>'salePrice')::numeric,0) price,coalesce(e.payload->>'flavor','') flavor
  FROM public.erp_family_items i JOIN fam ON fam.id=i.family_id JOIN public.bf_items b ON b.cafe_id=i.cafe_id AND b.id=i.item_id
  LEFT JOIN public.erp_inventory_items e ON e.cafe_id=i.cafe_id AND e.item_id=i.item_id WHERE i.cafe_id=c),
 k AS(
  SELECT k.*,d.total,d.number finance_number,d.created_at received_at,brand_finance_private.document_state(c,d.id) state,p.number purchase_number
  FROM public.erp_family_consignments k JOIN fam ON fam.id=k.family_id JOIN public.bf_documents d ON d.cafe_id=k.cafe_id AND d.id=k.finance_id
  JOIN public.erp_purchase_documents p ON p.cafe_id=k.cafe_id AND p.id=k.purchase_id
  WHERE k.cafe_id=c AND CASE WHEN p_wide THEN true ELSE erp_branch_private.branch_allowed(c,k.branch_id) END),
 agg AS(
  SELECT k.id consignment_id,k.family_id,k.mode,k.finance_id,k.received_at,l.item_id,min(l.name) name,sum(l.quantity*l.stock_unit_factor) qty,sum(l.net+l.tax) amount
  FROM k JOIN public.bf_document_lines l ON l.cafe_id=c AND l.document_id=k.finance_id WHERE l.item_id IS NOT NULL GROUP BY 1,2,3,4,5,6),
 ret AS(
  SELECT d.reference_id finance_id,m.item_id,-sum(m.quantity) qty FROM public.bf_movements m JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id
  WHERE m.cafe_id=c AND d.kind='refund' AND d.reference_id IN(SELECT finance_id FROM k) GROUP BY 1,2),
 sales AS(
  SELECT m.item_id,m.warehouse_id,coalesce(bd.branch_id,w.branch_id) branch_id,d.id document_id,d.number,d.created_at,-m.quantity qty
  FROM public.bf_movements m JOIN fi ON fi.item_id=m.item_id JOIN public.bf_documents d ON d.cafe_id=m.cafe_id AND d.id=m.document_id
  LEFT JOIN public.bf_documents o ON o.cafe_id=d.cafe_id AND o.id=d.reference_id LEFT JOIN public.erp_branch_documents bd ON bd.cafe_id=d.cafe_id AND bd.document_id=d.id
  LEFT JOIN wh w ON w.id=m.warehouse_id WHERE m.cafe_id=c AND (d.kind='sale' OR d.kind='refund' AND o.kind='sale')),
 sold AS(SELECT item_id,sum(qty) qty FROM sales GROUP BY 1),
 net AS(
  SELECT a.*,coalesce(r.qty,0) returned,greatest(a.qty-coalesce(r.qty,0),0) net_qty,CASE WHEN a.qty>0 THEN a.amount/a.qty ELSE 0 END unit_cost
  FROM agg a LEFT JOIN ret r ON r.finance_id=a.finance_id AND r.item_id=a.item_id),
 -- Sold units are matched to receipts oldest first, so every receipt shows what left the shelf and what is still on it.
 alloc AS(
  SELECT n.*,greatest(0,least(n.net_qty,coalesce(s.qty,0)-(sum(n.net_qty) OVER(PARTITION BY n.item_id ORDER BY n.received_at,n.consignment_id)-n.net_qty))) sold_qty
  FROM net n LEFT JOIN sold s ON s.item_id=n.item_id),
 kt AS(
  SELECT k.id,k.family_id,k.mode,k.total,coalesce((k.state->>'outstanding')::numeric,0) outstanding,coalesce((k.state->>'refunded_total')::numeric,0) refunded,
   coalesce(sum(a.qty),0) qty,coalesce(sum(a.returned),0) returned,coalesce(sum(a.sold_qty),0) sold_qty,coalesce(sum(a.sold_qty*a.unit_cost),0) sold_value
  FROM k LEFT JOIN alloc a ON a.consignment_id=k.id GROUP BY k.id,k.family_id,k.mode,k.total,k.state),
 kd AS(
  SELECT kt.*,greatest(kt.total-kt.refunded-kt.outstanding,0) paid,
   CASE WHEN kt.mode='after_sale' THEN round(greatest(least(kt.outstanding,kt.sold_value-greatest(kt.total-kt.refunded-kt.outstanding,0)),0),2) ELSE 0 END due_now FROM kt),
 stock AS(SELECT s.item_id,s.warehouse_id,s.quantity FROM public.bf_stock s JOIN fi ON fi.item_id=s.item_id WHERE s.cafe_id=c AND s.quantity<>0)
 SELECT jsonb_build_object(
  'branches',coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name) ORDER BY b.sort_order,b.name) FROM public.branches b WHERE b.cafe_id=c AND b.active AND b.deleted_at IS NULL),'[]'::jsonb),
  'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'branchId',branch_id) ORDER BY name) FROM wh WHERE active),'[]'::jsonb),
  'families',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'number',f.number,'revision',f.revision,'active',f.active,'supplierId',f.supplier_id,'name',f.name,'phone',f.phone,'profile',f.payload,'createdAt',f.created_at,
    'itemCount',(SELECT count(*) FROM fi WHERE fi.family_id=f.id),
    'received',coalesce(t.qty,0),'returned',coalesce(t.returned,0),'sold',coalesce(t.sold_qty,0),'remaining',coalesce(t.qty-t.returned-t.sold_qty,0),
    'receivedValue',coalesce(t.total,0),'soldValue',round(coalesce(t.sold_value,0),2),'paid',coalesce(t.paid,0),'payable',coalesce(t.outstanding,0),'dueNow',coalesce(t.due_now,0)) ORDER BY f.active DESC,f.name)
   FROM fam f LEFT JOIN(SELECT family_id,sum(qty) qty,sum(returned) returned,sum(sold_qty) sold_qty,sum(total-refunded) total,sum(sold_value) sold_value,sum(paid) paid,sum(outstanding) outstanding,sum(due_now) due_now FROM kd GROUP BY 1) t ON t.family_id=f.id),'[]'::jsonb),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',i.item_id,'familyId',i.family_id,'name',i.name,'barcode',i.barcode,'sku',i.sku,'unit',i.unit,'flavor',i.flavor,'active',i.active,'cost',i.cost,'price',i.price,
    'received',coalesce(x.qty,0),'returned',coalesce(x.returned,0),'sold',coalesce(s.qty,0),
    'stock',coalesce((SELECT jsonb_agg(jsonb_build_object('warehouseId',st.warehouse_id,'quantity',st.quantity)) FROM stock st WHERE st.item_id=i.item_id),'[]'::jsonb),
    'soldByBranch',coalesce((SELECT jsonb_agg(jsonb_build_object('branchId',g.branch_id,'quantity',g.qty)) FROM(SELECT branch_id,sum(qty) qty FROM sales WHERE item_id=i.item_id GROUP BY 1) g),'[]'::jsonb)) ORDER BY i.name)
   FROM fi i LEFT JOIN(SELECT item_id,sum(qty) qty,sum(returned) returned FROM net GROUP BY 1) x ON x.item_id=i.item_id LEFT JOIN sold s ON s.item_id=i.item_id),'[]'::jsonb),
  'consignments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',k.id,'number',k.number,'familyId',k.family_id,'branchId',k.branch_id,'warehouseId',k.warehouse_id,'mode',k.mode,'purchaseId',k.purchase_id,'financeId',k.finance_id,
    'purchaseNumber',k.purchase_number,'returnBy',k.return_by,'note',k.note,'receivedAt',k.received_at,'total',k.total,'refunded',d.refunded,'paid',d.paid,'outstanding',d.outstanding,'dueNow',d.due_now,'refundLines',brand_finance_private.refund_lines(c,k.finance_id,false),
    'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('itemId',a.item_id,'name',a.name,'quantity',a.qty,'returned',a.returned,'sold',a.sold_qty,'remaining',a.net_qty-a.sold_qty,'unitCost',round(a.unit_cost,4)) ORDER BY a.name) FROM alloc a WHERE a.consignment_id=k.id),'[]'::jsonb)) ORDER BY k.received_at DESC,k.id)
   FROM k JOIN kd d ON d.id=k.id),'[]'::jsonb),
  'activity',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.at DESC) FROM(
    SELECT * FROM(
     SELECT 'received' kind,k.received_at at,k.family_id "familyId",k.branch_id "branchId",NULL::uuid "itemId",k.finance_number number,(SELECT sum(qty) FROM agg WHERE consignment_id=k.id) quantity,k.total amount FROM k
     UNION ALL SELECT 'returned',d.created_at,k.family_id,k.branch_id,NULL,d.number,(SELECT -sum(m.quantity) FROM public.bf_movements m WHERE m.cafe_id=c AND m.document_id=d.id),d.total FROM k JOIN public.bf_documents d ON d.cafe_id=c AND d.reference_id=k.finance_id AND d.kind='refund'
     UNION ALL SELECT 'paid',d.created_at,k.family_id,k.branch_id,NULL,d.number,NULL,d.total FROM k JOIN public.bf_documents d ON d.cafe_id=c AND d.reference_id=k.finance_id AND d.kind='settlement'
     UNION ALL SELECT CASE WHEN s.qty<0 THEN 'sale_return' ELSE 'sold' END,s.created_at,fi.family_id,s.branch_id,s.item_id,s.number,s.qty,round(s.qty*fi.price,2) FROM sales s JOIN fi ON fi.item_id=s.item_id
    ) u ORDER BY at DESC LIMIT 200) e),'[]'::jsonb))
$$;

CREATE FUNCTION public.erp_family_read(p_cafe uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;BEGIN
 r:=erp_family_private.role_for(p_cafe,false);
 RETURN erp_family_private.snapshot(p_cafe,NULL,r IN('owner','manager','accountant','auditor'))
  ||jsonb_build_object('role',r,'branchScope',erp_branch_private.scope(p_cafe),'canWrite',r<>'auditor','canPay',r IN('owner','manager','accountant'),
   'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'kind',a.kind) ORDER BY a.is_primary DESC,a.code) FROM public.bf_accounts a WHERE a.cafe_id=p_cafe AND a.kind IN('cash','bank') AND a.active AND NOT a.is_group AND a.deleted_at IS NULL),'[]'::jsonb),
   'supplierRecords',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'revision',s.revision,'payload',s.payload)) FROM public.erp_purchase_suppliers s JOIN public.erp_families f ON f.cafe_id=s.cafe_id AND f.supplier_id=s.id WHERE s.cafe_id=p_cafe),'[]'::jsonb),
   'suppliers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'phone',p.phone) ORDER BY p.name) FROM public.bf_parties p WHERE p.cafe_id=p_cafe AND p.kind='supplier' AND p.active AND NOT EXISTS(SELECT 1 FROM public.erp_families f WHERE f.cafe_id=p_cafe AND f.supplier_id=p.id)),'[]'::jsonb),
   'unlinkedItems',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'barcode',i.barcode) ORDER BY i.name) FROM public.bf_items i JOIN public.erp_inventory_items e ON e.cafe_id=i.cafe_id AND e.item_id=i.id AND e.kind='product' AND e.status='active'
     WHERE i.cafe_id=p_cafe AND i.active AND i.menu_product_id IS NULL AND e.payload->>'sellerKind'='family' AND NOT EXISTS(SELECT 1 FROM public.erp_family_items x WHERE x.cafe_id=p_cafe AND x.item_id=i.id)),'[]'::jsonb));
END $$;

CREATE FUNCTION public.erp_family_execute(p_cafe uuid,p_action text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r text;c uuid:=p_cafe;p jsonb:=p_payload;f public.erp_families;k public.erp_family_consignments;pd public.erp_purchase_documents;doc public.bf_documents;
 profile jsonb;key text;b uuid;w uuid;item uuid;mode text;due date;
BEGIN
 r:=erp_family_private.role_for(c,true);
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>20000 THEN RAISE EXCEPTION 'بيانات العملية غير صالحة' USING ERRCODE='22023';END IF;
 IF p_action='family' THEN
  profile:=coalesce(p->'profile','{}'::jsonb);
  IF jsonb_typeof(profile)<>'object' OR profile-'ownerName'-'phone'-'nationalId'-'licenseNumber'-'licenseExpiry'-'city'-'iban'-'bankName'-'defaultMode'-'note'<>'{}'::jsonb
   OR EXISTS(SELECT 1 FROM jsonb_each(profile) e WHERE jsonb_typeof(e.value)<>'string' OR length(e.value#>>'{}')>(CASE WHEN e.key='note' THEN 1000 ELSE 160 END))
   OR coalesce(profile->>'defaultMode','after_sale') NOT IN('cash','after_sale')
   OR coalesce(profile->>'licenseExpiry','')<>'' AND profile->>'licenseExpiry' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR jsonb_typeof(p->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'راجع بيانات الأسرة المنتجة' USING ERRCODE='22023';END IF;
  key:=erp_family_private.phone(profile->>'phone');
  IF coalesce(profile->>'phone','')<>'' AND key IS NULL THEN RAISE EXCEPTION 'رقم جوال الأسرة يجب أن يكون سعوديًا يبدأ بـ 05' USING ERRCODE='22023';END IF;
  IF key IS NOT NULL AND EXISTS(SELECT 1 FROM public.erp_families x WHERE x.cafe_id=c AND x.phone_key=key AND x.id IS DISTINCT FROM nullif(p->>'id','')::uuid) THEN RAISE EXCEPTION 'رقم الجوال مسجل لأسرة أخرى' USING ERRCODE='23505';END IF;
  IF nullif(p->>'id','') IS NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.bf_parties s WHERE s.cafe_id=c AND s.id=(p->>'supplierId')::uuid AND s.kind='supplier' AND s.active) THEN RAISE EXCEPTION 'حساب المورد المرتبط بالأسرة غير موجود' USING ERRCODE='22023';END IF;
   SELECT * INTO f FROM public.erp_families WHERE cafe_id=c AND supplier_id=(p->>'supplierId')::uuid;
   IF FOUND THEN RETURN jsonb_build_object('id',f.id,'revision',f.revision,'existing',true);END IF;
   INSERT INTO public.erp_families(cafe_id,supplier_id,active,payload,phone_key,created_by) VALUES(c,(p->>'supplierId')::uuid,(p->>'active')::boolean,profile,key,auth.uid()) RETURNING * INTO f;
   INSERT INTO public.erp_family_events(cafe_id,family_id,action,payload,actor) VALUES(c,f.id,'family_created',profile,auth.uid());
  ELSE
   SELECT * INTO f FROM public.erp_families WHERE cafe_id=c AND id=(p->>'id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'الأسرة غير موجودة' USING ERRCODE='22023';END IF;
   IF f.revision IS DISTINCT FROM (p->>'revision')::integer THEN RAISE EXCEPTION 'تغيرت بيانات الأسرة أعد تحميلها' USING ERRCODE='40001';END IF;
   UPDATE public.erp_families SET active=(p->>'active')::boolean,payload=profile,phone_key=key,revision=revision+1,updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
   INSERT INTO public.erp_family_events(cafe_id,family_id,action,payload,actor) VALUES(c,f.id,'family_updated',profile||jsonb_build_object('active',f.active),auth.uid());
  END IF;
  RETURN jsonb_build_object('id',f.id,'revision',f.revision);
 END IF;
 SELECT * INTO f FROM public.erp_families WHERE cafe_id=c AND id=(p->>'familyId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'الأسرة غير موجودة' USING ERRCODE='22023';END IF;
 IF p_action='item' THEN
  item:=(p->>'itemId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.bf_items i JOIN public.erp_inventory_items e ON e.cafe_id=i.cafe_id AND e.item_id=i.id WHERE i.cafe_id=c AND i.id=item AND i.active AND i.menu_product_id IS NULL AND e.kind='product') THEN RAISE EXCEPTION 'اختر صنفًا مخزنيًا فعالًا من أصناف العلامة' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM public.erp_family_items x WHERE x.cafe_id=c AND x.item_id=item AND x.family_id<>f.id) THEN RAISE EXCEPTION 'الصنف مسجل لأسرة أخرى' USING ERRCODE='23505';END IF;
  INSERT INTO public.erp_family_items(cafe_id,item_id,family_id,created_by) VALUES(c,item,f.id,auth.uid()) ON CONFLICT DO NOTHING;
  IF FOUND THEN INSERT INTO public.erp_family_events(cafe_id,family_id,action,payload,actor) VALUES(c,f.id,'item_linked',jsonb_build_object('itemId',item),auth.uid());END IF;
  RETURN jsonb_build_object('id',item,'revision',f.revision);
 END IF;
 IF p_action='unlink_item' THEN
  item:=(p->>'itemId')::uuid;
  IF EXISTS(SELECT 1 FROM public.erp_family_consignments x JOIN public.bf_document_lines l ON l.cafe_id=x.cafe_id AND l.document_id=x.finance_id WHERE x.cafe_id=c AND x.family_id=f.id AND l.item_id=item) THEN RAISE EXCEPTION 'الصنف له استلامات مسجلة ولا يمكن فصله عن الأسرة' USING ERRCODE='23503';END IF;
  DELETE FROM public.erp_family_items WHERE cafe_id=c AND item_id=item AND family_id=f.id;
  IF FOUND THEN INSERT INTO public.erp_family_events(cafe_id,family_id,action,payload,actor) VALUES(c,f.id,'item_unlinked',jsonb_build_object('itemId',item),auth.uid());END IF;
  RETURN jsonb_build_object('id',item,'revision',f.revision);
 END IF;
 IF p_action='consignment' THEN
  IF NOT f.active THEN RAISE EXCEPTION 'الأسرة موقوفة فعلها قبل تسجيل استلام جديد' USING ERRCODE='22023';END IF;
  mode:=p->>'mode';b:=(p->>'branchId')::uuid;due:=nullif(p->>'returnBy','')::date;
  IF coalesce(mode,'') NOT IN('cash','after_sale') OR length(coalesce(p->>'note',''))>1000 THEN RAISE EXCEPTION 'راجع طريقة التسوية وملاحظة الاستلام' USING ERRCODE='22023';END IF;
  SELECT * INTO k FROM public.erp_family_consignments WHERE cafe_id=c AND purchase_id=(p->>'purchaseId')::uuid;
  IF FOUND THEN IF k.family_id<>f.id THEN RAISE EXCEPTION 'فاتورة الاستلام مسجلة لأسرة أخرى' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('id',k.id,'revision',1,'existing',true);END IF;
  IF NOT EXISTS(SELECT 1 FROM public.branches x WHERE x.cafe_id=c AND x.id=b AND x.active AND x.deleted_at IS NULL) OR r NOT IN('owner','manager') AND NOT erp_branch_private.branch_allowed(c,b) THEN RAISE EXCEPTION 'اختر فرعًا مسموحًا لك' USING ERRCODE='42501';END IF;
  SELECT * INTO pd FROM public.erp_purchase_documents WHERE cafe_id=c AND id=(p->>'purchaseId')::uuid FOR SHARE;
  IF NOT FOUND OR pd.kind<>'invoice' OR pd.status<>'posted' OR pd.finance_id IS NULL OR pd.supplier_id IS DISTINCT FROM f.supplier_id THEN RAISE EXCEPTION 'فاتورة الاستلام غير مرحلة أو لا تخص هذه الأسرة' USING ERRCODE='22023';END IF;
  w:=nullif(pd.payload->>'warehouseId','')::uuid;
  IF w IS NULL OR NOT EXISTS(SELECT 1 FROM public.bf_warehouses x WHERE x.cafe_id=c AND x.id=w) THEN RAISE EXCEPTION 'فاتورة الاستلام بدون مستودع' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM public.bf_document_lines l WHERE l.cafe_id=c AND l.document_id=pd.finance_id AND (l.item_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.erp_family_items x WHERE x.cafe_id=c AND x.family_id=f.id AND x.item_id=l.item_id))) THEN RAISE EXCEPTION 'كل أصناف الاستلام يجب أن تكون من أصناف هذه الأسرة' USING ERRCODE='22023';END IF;
  SELECT * INTO doc FROM public.bf_documents WHERE cafe_id=c AND id=pd.finance_id;
  IF mode='cash' AND doc.paid<doc.total OR mode='after_sale' AND doc.paid<>0 THEN RAISE EXCEPTION 'المبلغ المدفوع في الفاتورة لا يطابق طريقة التسوية المختارة' USING ERRCODE='22023';END IF;
  INSERT INTO public.erp_family_consignments(cafe_id,family_id,branch_id,warehouse_id,mode,purchase_id,finance_id,return_by,note,created_by)
  VALUES(c,f.id,b,w,mode,pd.id,pd.finance_id,due,coalesce(p->>'note',''),auth.uid()) RETURNING * INTO k;
  INSERT INTO public.erp_family_events(cafe_id,family_id,action,payload,actor) VALUES(c,f.id,'consignment',jsonb_build_object('id',k.id,'branchId',b,'warehouseId',w,'mode',mode,'financeId',pd.finance_id,'total',doc.total),auth.uid());
  RETURN jsonb_build_object('id',k.id,'revision',1);
 END IF;
 RAISE EXCEPTION 'عملية غير معروفة' USING ERRCODE='22023';
END $$;

-- Family portal: called by the server only, after it validated the signed-in phone session.
CREATE FUNCTION public.erp_family_portal(p_slug text,p_user uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.cafes;contact text;f public.erp_families;BEGIN
 SELECT erp_family_private.phone(phone) INTO contact FROM auth.users WHERE id=p_user AND phone_confirmed_at IS NOT NULL AND deleted_at IS NULL;
 IF contact IS NULL THEN RAISE EXCEPTION 'FAMILY_FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT b.* INTO c FROM public.cafes b JOIN public.erp_family_settings s ON s.cafe_id=b.id AND s.enabled WHERE b.slug=p_slug AND b.deleted_at IS NULL AND b.status IN('active','published') AND platform_access_private.service_enabled(b.id,'finance');
 IF c.id IS NULL THEN RAISE EXCEPTION 'FAMILY_UNAVAILABLE';END IF;
 SELECT * INTO f FROM public.erp_families WHERE cafe_id=c.id AND phone_key=contact AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_NOT_FOUND';END IF;
 RETURN erp_family_private.snapshot(c.id,f.id,true)||jsonb_build_object('brand',jsonb_build_object('name',c.name,'slug',c.slug));
END $$;

-- Checked by the server before a verification code is sent, so codes only go to registered family phones.
CREATE FUNCTION public.erp_family_portal_phone(p_slug text,p_phone text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.cafes b JOIN public.erp_family_settings s ON s.cafe_id=b.id AND s.enabled JOIN public.erp_families f ON f.cafe_id=b.id AND f.active
  WHERE b.slug=p_slug AND b.deleted_at IS NULL AND b.status IN('active','published') AND f.phone_key=erp_family_private.phone(p_phone))
$$;
REVOKE ALL ON FUNCTION public.erp_family_portal_phone(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_family_portal_phone(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.erp_family_read(uuid),public.erp_family_execute(uuid,text,jsonb),public.erp_family_portal(text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.erp_family_read(uuid),public.erp_family_execute(uuid,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_family_portal(text,uuid) TO service_role;
-- User mandate 2026-11-15: the section is switched on for the Aldeem sweets chain only.
INSERT INTO public.erp_family_settings(cafe_id) SELECT id FROM public.cafes WHERE slug='khayal-aldeem';
COMMIT;
