-- Demo data for the Aldeem sweets chain, requested by the platform owner on 2026-11-15 to show the system working:
-- 5 branches with a warehouse each, an organization structure, 20 employees, 5 productive families with their
-- items, receipts in both settlement modes, cashier sales in three branches, one return and one family payout.
-- Every record is created through the same database commands the screens call, acting as the brand owner
-- account, so all validations, stock movements and ledger entries are the real ones.
-- Each created record is listed in public.erp_enterprise_demo so the demo can be identified and removed later.
-- Run once. It refuses to run a second time.
BEGIN;
CREATE TABLE IF NOT EXISTS public.erp_enterprise_demo(cafe_id uuid NOT NULL REFERENCES public.cafes(id),kind text NOT NULL,record_id uuid NOT NULL,label text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(cafe_id,kind,record_id));
ALTER TABLE public.erp_enterprise_demo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_enterprise_demo FROM PUBLIC,anon,authenticated,service_role;

DO $seed$
DECLARE
 c uuid; owner uuid; main_branch uuid; cash uuid; bank uuid; drawer uuid; r jsonb; rev integer; today date:=(now() AT TIME ZONE 'Asia/Riyadh')::date;
 branch_ids uuid[]:='{}'; wh_ids uuid[]:='{}'; b uuid; w uuid; i integer; j integer; n text; x record;
 dep jsonb:='{}'; des jsonb:='{}'; lvl jsonb:='{}'; unit_id uuid;
 sup uuid; fam uuid; item uuid; product uuid; prod jsonb; fam_ids uuid[]:='{}'; sup_ids uuid[]:='{}';
 pid uuid; lid uuid; lines jsonb; total numeric; fin uuid; cons uuid; shift uuid; expected numeric; scope jsonb; snap jsonb; line jsonb;
 empty_address jsonb:=jsonb_build_object('building','','street','','additional','','district','','city','','postal','','short','');
BEGIN
 SELECT id,owner_user_id INTO c,owner FROM public.cafes WHERE slug='khayal-aldeem';
 IF c IS NULL OR owner IS NULL THEN RAISE EXCEPTION 'Aldeem account not found';END IF;
 IF EXISTS(SELECT 1 FROM public.erp_enterprise_demo WHERE cafe_id=c) THEN RAISE EXCEPTION 'Demo data already exists for this account';END IF;
 PERFORM set_config('request.jwt.claims',json_build_object('sub',owner,'role','authenticated')::text,true);
 SELECT id INTO main_branch FROM public.branches WHERE cafe_id=c AND is_primary AND deleted_at IS NULL;
 SELECT id INTO cash FROM public.bf_accounts WHERE cafe_id=c AND code='1000';
 SELECT id INTO bank FROM public.bf_accounts WHERE cafe_id=c AND code='1010';
 SELECT id INTO drawer FROM public.bf_accounts WHERE cafe_id=c AND is_cashier_drawer AND active ORDER BY code LIMIT 1;
 IF main_branch IS NULL OR cash IS NULL OR bank IS NULL OR drawer IS NULL THEN RAISE EXCEPTION 'Aldeem base accounts or main branch are missing';END IF;

 -- A separate demo bank account funds the demo payments, so the real treasury and bank balances stay untouched
 r:=public.brand_finance_treasury_execute(c,'account_save',jsonb_build_object('kind','bank','name','حساب بنكي تجريبي','note','بيانات تجريبية','openingAmount',50000,'iban','','bankName',''),gen_random_uuid());
 bank:=(r->>'id')::uuid;
 IF bank IS NULL THEN RAISE EXCEPTION 'Demo bank account was not created: %',r;END IF;
 INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'account',bank,'حساب بنكي تجريبي');

 -- 1. Branches: the existing main branch plus four
 branch_ids:=ARRAY[main_branch];
 FOR x IN SELECT * FROM (VALUES('فرع العليا','الرياض','حي العليا طريق الملك فهد','0112000001'),('فرع النخيل','الرياض','حي النخيل طريق الإمام سعود','0112000002'),('فرع الروضة','جدة','حي الروضة شارع صاري','0122000003'),('فرع الشاطئ','الدمام','حي الشاطئ طريق الخليج','0132000004')) v(name,city,address,phone) LOOP
  b:=gen_random_uuid();
  PERFORM public.erp_branches_write(c,'save',jsonb_build_object('id',b,'revision',0,'name',x.name,'address',x.address,'city',x.city,'phone',x.phone,'hours','يوميًا من 9 صباحًا حتى 12 منتصف الليل','lat',NULL,'lng',NULL,'active',true,'code','','email','','taxNumber','','registration','','note','بيانات تجريبية'),gen_random_uuid());
  INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'branch',b,x.name);
  branch_ids:=branch_ids||b;
 END LOOP;
 SELECT revision INTO rev FROM public.erp_branch_settings WHERE cafe_id=c;
 -- Customers, products and suppliers are one list for the chain; every document stays with the branch that made it
 PERFORM public.erp_branches_write(c,'settings',jsonb_build_object('revision',coalesce(rev,0),'mainBranchId',main_branch,'shareCustomers',true,'shareProducts',true,'shareSuppliers',true,'shareCostCenters',true,'shareUnitTemplates',true,'specifyAccounts',false),gen_random_uuid());

 -- 2. One warehouse per branch, open to the employees of that branch
 FOR i IN 1..array_length(branch_ids,1) LOOP
  b:=branch_ids[i];SELECT name INTO n FROM public.branches WHERE id=b;
  w:=gen_random_uuid();
  PERFORM public.erp_inventory_write(c,jsonb_build_object('requestId',gen_random_uuid(),'action','warehouse','id',NULL,'revision',0,'payload',jsonb_build_object('id',w,'name','مستودع '||n,'active',true,'isDefault',false,
   'permissions',jsonb_build_object('read',jsonb_build_object('mode','branches','ids',jsonb_build_array(b)),'write',jsonb_build_object('mode','branches','ids',jsonb_build_array(b)),'edit',jsonb_build_object('mode','branches','ids',jsonb_build_array(b))))));
  SELECT id INTO w FROM public.bf_warehouses WHERE cafe_id=c AND name='مستودع '||n;
  INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'warehouse',w,'مستودع '||n);
  wh_ids:=wh_ids||w;
 END LOOP;

 -- 3. Organization: departments, designations, levels
 FOR x IN SELECT * FROM (VALUES('department','الإدارة العامة',NULL),('department','المبيعات والفروع',NULL),('department','المعمل والإنتاج',NULL),('department','المستودعات والإمداد',NULL),('department','المالية والمحاسبة',NULL),
   ('level','إدارة عليا',NULL),('level','إدارة وسطى',NULL),('level','تنفيذي',NULL),
   ('designation','المدير العام','الإدارة العامة'),('designation','مدير فرع','المبيعات والفروع'),('designation','كاشير','المبيعات والفروع'),('designation','شيف حلويات','المعمل والإنتاج'),('designation','مساعد معمل','المعمل والإنتاج'),
   ('designation','مشرف جودة وسلامة غذاء','المعمل والإنتاج'),('designation','أمين مستودع','المستودعات والإمداد'),('designation','سائق توزيع','المستودعات والإمداد'),('designation','محاسب','المالية والمحاسبة')) v(kind,name,parent) LOOP
  unit_id:=gen_random_uuid();
  PERFORM public.erp_organization_write(c,'save',jsonb_build_object('id',NULL,'kind',x.kind,'name',x.name,'abbreviation','','description','بيانات تجريبية','active',true,'parentId',CASE WHEN x.parent IS NULL THEN NULL ELSE dep->>x.parent END,'managerIds','[]'::jsonb,'revision',0),gen_random_uuid());
  SELECT id INTO unit_id FROM public.erp_org_units WHERE cafe_id=c AND kind=x.kind AND name=x.name;
  INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'org_unit',unit_id,x.name);
  IF x.kind='department' THEN dep:=dep||jsonb_build_object(x.name,unit_id);ELSIF x.kind='designation' THEN des:=des||jsonb_build_object(x.name,unit_id);ELSE lvl:=lvl||jsonb_build_object(x.name,unit_id);END IF;
 END LOOP;

 -- 4. Twenty employees spread over the branches (records only: sign-in accounts are created by the owner)
 i:=0;
 FOR x IN SELECT * FROM (VALUES
  ('سلطان','الديم','المدير العام','الإدارة العامة','إدارة عليا',1),('هند','العتيبي','محاسب','المالية والمحاسبة','إدارة وسطى',1),('ماجد','الحربي','محاسب','المالية والمحاسبة','تنفيذي',1),
  ('نوف','القحطاني','شيف حلويات','المعمل والإنتاج','إدارة وسطى',1),('رامي','الزهراني','مساعد معمل','المعمل والإنتاج','تنفيذي',1),('لمى','الشهري','مشرف جودة وسلامة غذاء','المعمل والإنتاج','إدارة وسطى',1),
  ('فهد','الدوسري','أمين مستودع','المستودعات والإمداد','تنفيذي',1),('عادل','المطيري','سائق توزيع','المستودعات والإمداد','تنفيذي',1),
  ('خالد','السبيعي','مدير فرع','المبيعات والفروع','إدارة وسطى',1),('ريم','الغامدي','كاشير','المبيعات والفروع','تنفيذي',1),
  ('عبدالله','العنزي','مدير فرع','المبيعات والفروع','إدارة وسطى',2),('سارة','الشمري','كاشير','المبيعات والفروع','تنفيذي',2),('يوسف','البقمي','كاشير','المبيعات والفروع','تنفيذي',2),
  ('تركي','الرشيدي','مدير فرع','المبيعات والفروع','إدارة وسطى',3),('دانة','السلمي','كاشير','المبيعات والفروع','تنفيذي',3),
  ('أحمد','باوزير','مدير فرع','المبيعات والفروع','إدارة وسطى',4),('جود','الجهني','كاشير','المبيعات والفروع','تنفيذي',4),('حسن','بخاري','أمين مستودع','المستودعات والإمداد','تنفيذي',4),
  ('ناصر','الخالدي','مدير فرع','المبيعات والفروع','إدارة وسطى',5),('شهد','الهاجري','كاشير','المبيعات والفروع','تنفيذي',5)) v(first,last,title,department,level,branch) LOOP
  i:=i+1;unit_id:=gen_random_uuid();
  r:=public.erp_hr_write(c,'save_employee',jsonb_build_object('id',NULL,'revision',0,'code','','firstName',x.first,'middleName','','lastName',x.last,'active',true,'userId',NULL,'language','ar','email','','personalEmail','',
   'mobile','05500010'||lpad(i::text,2,'0'),'phone','','note','موظف تجريبي','birthDate',NULL,'gender','','country','SA','citizenship','','officialId','','address',empty_address,'permanentAddress',empty_address,
   'joinDate',(today-(i*17))::text,'endDate',NULL,'branchId',branch_ids[x.branch],'departmentId',dep->>x.department,'designationId',des->>x.title,'levelId',lvl->>x.level,'typeId',NULL,'managerId',NULL,'fiscalMonth',NULL,'fiscalDay',NULL),gen_random_uuid());
  INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'employee',(r->>'id')::uuid,x.first||' '||x.last);
 END LOOP;

 -- 5. Five productive families, two items each, listed in the cashier
 i:=0;
 FOR x IN SELECT * FROM (VALUES
  ('أسرة أم خالد للمعمول','أم خالد','الرياض','after_sale','معمول تمر فاخر','تمر',6.00,10.00,'معمول فستق','فستق',8.00,13.00),
  ('مطبخ أم نورة للحلويات الشعبية','أم نورة','الرياض','after_sale','لقيمات بالدبس','دبس',9.00,15.00,'بسبوسة بالقشطة','قشطة',11.00,18.00),
  ('أسرة الجوهرة للمخبوزات','الجوهرة','جدة','cash','كعك العيد','سمسم',5.00,9.00,'خبز تميس بالجبن','جبن',4.00,7.00),
  ('بيت التمور أم سارة','أم سارة','الدمام','after_sale','تمر محشي لوز','لوز',14.00,22.00,'دبس تمر طبيعي','طبيعي',16.00,25.00),
  ('أسرة أم ريان للكليجا','أم ريان','الرياض','cash','كليجا القصيم','هيل',7.00,12.00,'كليجا بالتمر','تمر',7.50,12.50)) v(name,owner_name,city,mode,item1,flavor1,buy1,sale1,item2,flavor2,buy2,sale2) LOOP
  i:=i+1;sup:=gen_random_uuid();n:='05500020'||lpad(i::text,2,'0');
  PERFORM public.erp_purchases_write(c,'supplier',jsonb_build_object('id',sup,'revision',0,'name',x.name,'phone',n,'email','','taxNumber','','active',true,'firstName','','lastName','','mobile',n,'commercialRegistration','','number','','currency','SAR',
   'address',jsonb_build_object('building','','street','','additional','','district','','city',x.city,'postal','','short','','country',''),'contacts','[]'::jsonb,'addresses','[]'::jsonb,'note','بيانات تجريبية','openingBalance',0,'openingDate',today::text),gen_random_uuid());
  r:=public.erp_family_execute(c,'family',jsonb_build_object('supplierId',sup,'active',true,'profile',jsonb_build_object('ownerName',x.owner_name,'phone',n,'nationalId','','licenseNumber','FL-2026-'||lpad(i::text,4,'0'),'licenseExpiry',(today+300)::text,'city',x.city,'iban','','bankName','','defaultMode',x.mode,'note','بيانات تجريبية')));
  fam:=(r->>'id')::uuid;fam_ids:=fam_ids||fam;sup_ids:=sup_ids||sup;
  INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'supplier',sup,x.name),(c,'family',fam,x.name);
  FOR j IN 1..2 LOOP
   prod:=public.erp_purchase_product_create(c,jsonb_build_object('name',CASE j WHEN 1 THEN x.item1 ELSE x.item2 END,'category','الأسر المنتجة','brand','','seller',x.name,'sellerKind','family','flavor',CASE j WHEN 1 THEN x.flavor1 ELSE x.flavor2 END,'barcode','','unitId','','trackStock',true,'minQuantity',5,
    'buyPrice',CASE j WHEN 1 THEN x.buy1 ELSE x.buy2 END,'salePrice',CASE j WHEN 1 THEN x.sale1 ELSE x.sale2 END,'margin',CASE j WHEN 1 THEN x.sale1-x.buy1 ELSE x.sale2-x.buy2 END,'marginType','amount','components','[]'::jsonb,'imagePath',NULL),gen_random_uuid(),NULL);
   item:=(prod->'item'->>'id')::uuid;
   PERFORM public.erp_family_execute(c,'item',jsonb_build_object('familyId',fam,'itemId',item));
   -- Listed for the cashier the same way the "show in menu" switch does it: one sale deducts one unit of the item
   product:=gen_random_uuid();
   INSERT INTO public.menu_products(id,cafe_id,name,description,price,available,created_by,updated_by) VALUES(product,c,prod->'item'->>'name','',CASE j WHEN 1 THEN x.sale1 ELSE x.sale2 END,true,owner,owner);
   INSERT INTO public.bf_item_product_links(cafe_id,item_id,product_id,quantity) VALUES(c,item,product,1);
   INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'item',item,prod->'item'->>'name'),(c,'menu_product',product,prod->'item'->>'name');
  END LOOP;
 END LOOP;

 -- 6. Receipts: every family delivers to two branches
 FOR i IN 1..5 LOOP
  FOR j IN 0..1 LOOP
   fam:=fam_ids[i];sup:=sup_ids[i];b:=branch_ids[1+((i+j*2-1)%5)];w:=wh_ids[1+((i+j*2-1)%5)];
   pid:=gen_random_uuid();lines:='[]'::jsonb;total:=0;
   FOR x IN SELECT fi.item_id,bi.name,bi.unit,(e.payload->>'buyPrice')::numeric cost FROM public.erp_family_items fi JOIN public.bf_items bi ON bi.id=fi.item_id JOIN public.erp_inventory_items e ON e.cafe_id=fi.cafe_id AND e.item_id=fi.item_id WHERE fi.cafe_id=c AND fi.family_id=fam ORDER BY bi.name LOOP
    lines:=lines||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'itemId',x.item_id,'description',x.name,'unit',x.unit,'quantity',24+i*4+j*6,'price',x.cost,'discount',0,'discountType','amount','taxRate',0,'costCenterId',NULL));
    total:=total+round((24+i*4+j*6)*x.cost,2);
   END LOOP;
   SELECT payload->>'defaultMode' INTO n FROM public.erp_families WHERE id=fam;
   PERFORM public.erp_purchases_write(c,'save',jsonb_build_object('id',pid,'revision',0,'kind','invoice','title','استلام من الأسرة المنتجة','number','','date',(today-(6-i)-j)::text,'dueDate',NULL,'supplierId',sup,'supplierIds','[]'::jsonb,'warehouseId',w,'sourceId',NULL,
    'currency','SAR','exchangeRate',1,'taxInclusive',true,'discount',0,'discountType','amount','shipping',0,'adjustment',0,'adjustmentAccountId',NULL,'paid',CASE WHEN n='cash' THEN total ELSE 0 END,'accountId',CASE WHEN n='cash' THEN bank ELSE NULL END,
    'received',true,'note','استلام تجريبي','terms','','lines',lines,'customValues','{}'::jsonb,'customStatus',''),gen_random_uuid());
   r:=public.erp_purchases_write(c,'post',jsonb_build_object('id',pid,'revision',1,'expectedTotal',total),gen_random_uuid());
   fin:=(r->>'financeId')::uuid;
   r:=public.erp_family_execute(c,'consignment',jsonb_build_object('familyId',fam,'purchaseId',pid,'branchId',b,'mode',n,'returnBy',CASE WHEN n='after_sale' THEN (today+21)::text ELSE '' END,'note','استلام تجريبي'));
   INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'purchase',pid,'استلام أسرة'),(c,'document',fin,'فاتورة استلام'),(c,'consignment',(r->>'id')::uuid,'استلام أسرة');
  END LOOP;
 END LOOP;

 -- 7. Cashier sales of family items in three branches, each in its own shift on the branch drawer
 FOR i IN 1..3 LOOP
  b:=branch_ids[i];w:=wh_ids[i];
  SELECT revision INTO rev FROM public.erp_branch_scopes WHERE cafe_id=c AND user_id=owner;
  PERFORM public.erp_branches_write(c,'select',jsonb_build_object('id',b,'revision',coalesce(rev,0)),gen_random_uuid());
  shift:=gen_random_uuid();
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=c AND account_id=drawer;
  r:=public.brand_finance_execute(c,'shift_open',jsonb_build_object('id',shift,'accountId',drawer,'openingCash',expected),gen_random_uuid());
  shift:=coalesce((r->>'id')::uuid,shift);
  INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'shift',shift,'وردية تجريبية');
  FOR x IN SELECT l.product_id,mp.price,s.quantity FROM public.bf_stock s JOIN public.erp_family_items fi ON fi.cafe_id=s.cafe_id AND fi.item_id=s.item_id JOIN public.bf_item_product_links l ON l.cafe_id=s.cafe_id AND l.item_id=s.item_id JOIN public.menu_products mp ON mp.id=l.product_id
   WHERE s.cafe_id=c AND s.warehouse_id=w AND s.quantity>=12 ORDER BY mp.name LOOP
   FOR j IN 1..2 LOOP
    r:=public.brand_finance_execute(c,'sale',jsonb_build_object('note','','lines',jsonb_build_array(jsonb_build_object('quantity',2+j+i,'productId',x.product_id,'expectedUnitPrice',x.price)),'shiftId',shift,'discount',0,'accountId',drawer,'warehouseId',w,'expectedTotal',round((2+j+i)*x.price,2)),gen_random_uuid());
    INSERT INTO public.erp_enterprise_demo(cafe_id,kind,record_id,label) VALUES(c,'document',(r->>'id')::uuid,'فاتورة بيع تجريبية');
   END LOOP;
  END LOOP;
  SELECT coalesce(sum(debit-credit),0) INTO expected FROM public.bf_journal WHERE cafe_id=c AND account_id=drawer;
  PERFORM public.brand_finance_execute(c,'shift_close',jsonb_build_object('shiftId',shift,'countedCash',expected,'note','إقفال وردية تجريبية'),gen_random_uuid());
 END LOOP;
 SELECT revision INTO rev FROM public.erp_branch_scopes WHERE cafe_id=c AND user_id=owner;
 PERFORM public.erp_branches_write(c,'select',jsonb_build_object('id',NULL,'revision',coalesce(rev,0)),gen_random_uuid());

 -- 8. One return to a family and one payout for what was sold
 PERFORM set_config('erp.branch_expected',erp_branch_private.scope(c)::text,true);
 snap:=public.erp_family_read(c);
 SELECT value INTO r FROM jsonb_array_elements(snap->'consignments') WHERE value->>'mode'='after_sale' AND EXISTS(SELECT 1 FROM jsonb_array_elements(value->'lines') l WHERE (l->>'remaining')::numeric>=5) ORDER BY value->>'receivedAt' LIMIT 1;
 IF r IS NOT NULL THEN
  SELECT value INTO line FROM jsonb_array_elements(r->'refundLines') LIMIT 1;
  PERFORM public.erp_purchases_write(c,'return',jsonb_build_object('invoiceId',r->>'financeId','accountId',NULL,'expectedTotal',round(4*(line->>'net')::numeric/(line->>'quantity')::numeric,2),'lines',jsonb_build_array(jsonb_build_object('lineId',line->>'id','quantity',4,'expectedReturnedQuantity',0)),'note','إرجاع تجريبي لانتهاء مدة العرض'),gen_random_uuid());
 END IF;
 snap:=public.erp_family_read(c);
 SELECT value INTO r FROM jsonb_array_elements(snap->'consignments') WHERE (value->>'dueNow')::numeric>0 ORDER BY (value->>'dueNow')::numeric DESC LIMIT 1;
 IF r IS NOT NULL THEN
  PERFORM public.erp_purchases_write(c,'payment',jsonb_build_object('supplierId',(SELECT supplier_id FROM public.erp_families WHERE id=(r->>'familyId')::uuid),'invoiceId',r->>'financeId','accountId',bank,'amount',(r->>'dueNow')::numeric,'date',today::text,'note','دفعة تجريبية عن المباع'),gen_random_uuid());
 END IF;
END $seed$;

SELECT jsonb_build_object('manifest',(SELECT jsonb_object_agg(kind,n) FROM(SELECT kind,count(*) n FROM public.erp_enterprise_demo GROUP BY 1) m),'branchDocs',(SELECT jsonb_object_agg(coalesce(b.name,'none'),x.n) FROM(SELECT bd.branch_id,count(*) n FROM public.bf_documents d LEFT JOIN public.erp_branch_documents bd ON bd.document_id=d.id WHERE d.cafe_id=(SELECT id FROM public.cafes WHERE slug='khayal-aldeem') GROUP BY 1) x LEFT JOIN public.branches b ON b.id=x.branch_id),'accounts',(SELECT jsonb_object_agg(a.name,(SELECT coalesce(sum(debit-credit),0) FROM public.bf_journal j WHERE j.account_id=a.id)) FROM public.bf_accounts a WHERE a.cafe_id=(SELECT id FROM public.cafes WHERE slug='khayal-aldeem') AND a.kind IN('cash','bank','pos')))::text AS summary;
COMMIT;
