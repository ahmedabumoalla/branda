import { readFile } from 'node:fs/promises';
const source = await readFile('scripts/check-finance-supplier-payout-db.mjs', 'utf8');
const tests = String.raw`
 {
 // Replace the baseline's empty attachment stub with the real deployed schema.
 await db.exec('DROP TABLE public.bf_treasury_attachments');
 await db.exec(await readFile('supabase/migrations/20261025161825_brand_finance_treasury_attachments.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261025170503_brand_finance_treasury_attachment_capacity.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261026213943_brand_finance_negative_stock_sales.sql','utf8'));
 await db.exec(await readFile('supabase/migrations/20261026213958_brand_finance_shift_analytics.sql','utf8'));
 // Real endpoint bodies from deployed migrations, with placeholder composite
 // types only: these tests must reject before entering POS/identity business code.
 await db.exec('CREATE TABLE IF NOT EXISTS public.pager_orders(id uuid); CREATE TABLE IF NOT EXISTS public.loyalty_cards(id uuid)');
 const extraEndpoints=[
  ['20261024074929_brand_finance_sales_cashier_phone','brand_finance_add_sales_cashier','uuid,uuid,text'],
  ['20261024082633_brand_finance_existing_sales_cashier','brand_finance_link_sales_cashier','uuid,text,text'],
  ['20261025201442_brand_finance_pos_customer','brand_finance_pos_customer','uuid,text'],
  ['20261025201442_brand_finance_pos_customer','brand_finance_pos_pager_page','uuid,integer,text,text'],
  ['20261025201442_brand_finance_pos_customer','brand_finance_pos_pager_transition','uuid,uuid,text'],
 ];
 for(const [file,name,args] of extraEndpoints){
  const sql=await readFile('supabase/migrations/'+file+'.sql','utf8');
  const start=sql.indexOf('CREATE FUNCTION public.'+name+'('),end=sql.indexOf('END '+'$'.repeat(2)+';',start);
  if(start<0||end<start)throw Error('Endpoint fixture not found: '+name);
  await db.exec(sql.slice(start,end+7));
  await db.exec('REVOKE ALL ON FUNCTION public.'+name+'('+args+') FROM PUBLIC,anon,service_role; GRANT EXECUTE ON FUNCTION public.'+name+'('+args+') TO authenticated');
 }
 const financialBefore=await fingerprint();
 await db.exec(await readFile('supabase/migrations/20261027040000_brand_finance_job_roles.sql','utf8'));
 eq(await fingerprint(),financialBefore,'roles migration preserves existing posted values');
 const roles=['accountant','warehouse','auditor'];
 const ids={};
 for(const role of roles){
  const id=crypto.randomUUID();ids[role]=id;
  await db.query('INSERT INTO auth.users(id,email) VALUES($1,$2)',[id,role+'@test.example']);
  await db.query('INSERT INTO profiles(id) VALUES($1)',[id]);
  await login(owner);await run('staff',{email:role+'@test.example',name:role,role,active:true});
 }
 const snapshot=()=>scalar('SELECT brand_finance_snapshot($1)',[cafe]);
 const forbidden={
  accountant:['sale','shift_open','shift_close','shift_handover','shift_accept','supplier_payout','stock_adjust','stock_transfer','item','warehouse','settings','staff','refund_approve','refund_reject'],
  warehouse:['sale','shift_open','purchase','party','account','treasury','settlement','journal','refund','refund_approve','refund_reject','settings','staff','supplier_payout'],
  auditor:['sale','purchase','party','account','treasury','settlement','journal','refund','item','warehouse','stock_adjust','stock_transfer','settings','staff','supplier_payout','shift_open','shift_close','shift_handover','shift_accept'],
 };
 const deny=async(fn,label)=>{try{await fn();throw Error('unexpected success: '+label)}catch(e){eq(e.code,'42501',label)}};
 for(const role of roles){
  await login(ids[role]);
  eq((await snapshot()).role,role,role+' stays its own role');
  eq((await snapshot()).canAdminister,false,role+' not owner');
  for(const op of forbidden[role])await deny(()=>run(op,{}),role+' blocked '+op);
  await deny(()=>run('unknown',{}),role+' unknown op denied');
  await deny(()=>scalar('SELECT brand_finance_snapshot($1)',[other]),role+' cross tenant denied');
  await deny(()=>scalar('SELECT brand_finance_supervise_shift($1,$2,$3,$4,$5)',[cafe,subject,'resume','test reason',crypto.randomUUID()]),role+' supervision blocked');
  await deny(()=>scalar('SELECT brand_finance_prepare_shift_attachment($1,$2,$3,$4,$5)',[cafe,subject,'x.pdf','application/pdf',10]),role+' shift attachment blocked');
  await deny(()=>scalar('SELECT brand_finance_shift_heartbeat($1,$2,$3,$4,$5)',[cafe,subject,crypto.randomUUID(),0,0]),role+' heartbeat blocked');
  await deny(()=>scalar('SELECT brand_finance_add_sales_cashier($1,$2,$3)',[cafe,staff,'Attempt']),role+' direct cashier provisioning blocked');
  await deny(()=>scalar('SELECT brand_finance_link_sales_cashier($1,$2,$3)',[cafe,'966500000001','Attempt']),role+' direct cashier link blocked');
  await deny(()=>scalar('SELECT brand_finance_pos_customer($1,$2)',[cafe,'966500000001']),role+' POS lookup blocked');
  await deny(()=>scalar('SELECT brand_finance_pos_pager_page($1)',[cafe]),role+' POS pager page blocked');
  await deny(()=>scalar('SELECT brand_finance_pos_pager_transition($1,$2,$3)',[cafe,crypto.randomUUID(),'completed']),role+' POS pager mutation blocked');
  await deny(()=>scalar('SELECT brand_finance_settle_cash_difference($1,$2,$3,$4,$5,$6)',[cafe,crypto.randomUUID(),'waive',null,'Review',crypto.randomUUID()]),role+' owner-only variance settlement blocked');
 }
 await login(ids.auditor);
 const prior=await fingerprint();
 eq((await snapshot()).staff.length,0,'auditor staff identities omitted');
 await scalar('SELECT brand_finance_treasury_snapshot($1)',[cafe]);
 await scalar('SELECT brand_finance_treasury_statement($1,$2)',[cafe,bank]);
 await scalar('SELECT brand_finance_terminal_fee_history($1)',[cafe]);
 await scalar('SELECT brand_finance_shift_monitor($1)',[cafe]);
 await scalar('SELECT brand_finance_shift_analytics($1,$2)',[cafe,subject]);
 await scalar('SELECT brand_finance_pos_shift_report($1,$2)',[cafe,subject]);
 eq((await scalar('SELECT brand_finance_shift_attachment($1,$2)',[cafe,attachment.id])).id,attachment.id,'auditor can review committed payout evidence');
 await deny(()=>scalar('SELECT brand_finance_shift_attachment($1,$2,true)',[cafe,attachment.id]),'auditor cannot finalize evidence');
 eq((await list()).canReceive,false,'auditor cannot receive cash');
 await scalar('SELECT brand_finance_cash_differences($1)',[cafe]);
 eq(await fingerprint(),prior,'auditor report reads never change financial records');
 await deny(()=>treasury('voucher',{}),'auditor treasury denied');
 await deny(()=>scalar('SELECT brand_finance_receive_shift_cash($1,$2,$3,$4,$5)',[cafe,crypto.randomUUID(),bank,'',crypto.randomUUID()]),'auditor cash receipt denied');
 await deny(()=>scalar('SELECT brand_finance_save_customer($1,$2,$3)',[cafe,{},crypto.randomUUID()]),'auditor customer mutation denied');
 for(const action of ['prepare','finalize','stale','delete','unknown'])await deny(()=>scalar('SELECT brand_finance_treasury_attachment($1,$2,$3)',[cafe,funding,action]),'auditor attachment mutation '+action+' denied');
 eq(await scalar('SELECT brand_finance_treasury_attachment($1,$2)',[cafe,funding]),[],'auditor may list supporting evidence');
 await login(ids.warehouse);
 const w=await snapshot();
 for(const key of ['accounts','parties','documents','journal','trialBalance','shifts','staff'])eq(w[key].length,0,'warehouse no '+key);
 await scalar('SELECT brand_finance_history($1,$2)',[cafe,'movements']);
 await deny(()=>scalar('SELECT brand_finance_history($1,$2)',[cafe,'journal']),'warehouse no journal');
 await deny(()=>scalar('SELECT brand_finance_treasury_snapshot($1)',[cafe]),'warehouse no treasury');
 const newWarehouse=await run('warehouse',{name:'Role warehouse'});eq(typeof newWarehouse.id,'string','warehouse can create warehouse');
 const newItem=await run('item',{name:'Role item',sku:'ROLE',unit:'unit',minQuantity:1});eq(typeof newItem.id,'string','warehouse can create inventory item');
 await run('stock_adjust',{itemId:newItem.id,warehouseId:newWarehouse.id,quantity:5,unitCost:2,note:'Counted inventory'});
 eq(Number(await scalar('SELECT quantity FROM bf_stock WHERE item_id=$1 AND warehouse_id=$2',[newItem.id,newWarehouse.id])),5,'warehouse physical count posts stock');
 await login(ids.accountant);
 const supplier=await run('party',{kind:'supplier',name:'Role supplier'});eq(typeof supplier.id,'string','accountant supplier management');
 const newAccount=await run('account',{name:'Role account',kind:'bank'});eq(typeof newAccount.id,'string','accountant account management');
 await treasury('opening',{accountId:newAccount.id,amount:20});
 eq(await balance(newAccount.id),20,'accountant treasury posting');
 eq((await list()).canReceive,true,'accountant can receive shift cash');
 eq((await scalar('SELECT brand_finance_cash_differences($1)',[cafe])).canSettle,false,'accountant cannot settle owner-only variances');
 const attachmentId=crypto.randomUUID();
 eq((await scalar('SELECT brand_finance_treasury_attachment($1,$2,$3,$4,$5,$6)',[cafe,funding,'prepare',attachmentId,'support.pdf',10])).id,attachmentId,'accountant can prepare evidence');
 await deny(()=>run('staff',{userId:ids.auditor,role:'manager',name:'Escalation',active:true}),'accountant cannot elevate staff');
 await login(owner);await db.query("UPDATE bf_shifts SET status='open',closed_at=NULL WHERE id=$1",[subject]);
 await login(staff);
 eq((await snapshot()).staff.some(s=>roles.includes(s.role)),false,'cashier handover candidates exclude dashboard-only staff');
 await fail(()=>run('shift_handover',{shiftId:subject,countedCash:0,toUserId:ids.auditor}),'cannot strand live shift with read-only recipient');
 await login(owner);
 await fail(()=>run('staff',{userId:staff,role:'auditor',name:'Cashier',active:true}),'cannot change role with open custody');
 await db.query("UPDATE bf_shifts SET status='closed',closed_at=now() WHERE id=$1",[subject]);
 await login(ids.auditor);await db.query('UPDATE bf_staff SET active=false WHERE user_id=$1',[ids.auditor]);await deny(()=>snapshot(),'inactive auditor denied');
 await login(null);await deny(()=>snapshot(),'anonymous denied');
 for(const name of ['operation_allowed(text,text)','assert_job_access(uuid,text,text)','snapshot_before_job_roles(uuid)'])eq(await scalar("SELECT has_function_privilege('authenticated',$1,'EXECUTE')",['brand_finance_private.'+name]),false,'private '+name+' inaccessible');
 const guards=(await db.query("SELECT p.proname,pg_get_functiondef(p.oid) AS body FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'brand_finance_%' AND 'p_cafe_id'=ANY(p.proargnames) AND has_function_privilege('authenticated',p.oid,'EXECUTE')")).rows;
 eq(guards.length,26,'all 26 production tenant endpoints covered');
 for(const f of guards)eq(f.body.includes('assert_job_access')||f.proname==='brand_finance_snapshot',true,'explicit endpoint gate '+f.proname);
 eq(Number(await scalar('SELECT count(*) FROM (SELECT document_id FROM bf_journal GROUP BY document_id HAVING sum(debit)<>sum(credit)) q')),0,'all role postings balanced');
 if(process.env.FINANCE_ROLE_INTEGRATION==='1'){
  for(const name of ['20261027040100_brand_finance_period_close_preflight','20261027040200_brand_finance_control_reports'])await db.exec(await readFile('supabase/migrations/'+name+'.sql','utf8'));
  await db.query('UPDATE bf_staff SET active=true WHERE user_id=$1',[ids.auditor]);
  for(const role of roles){
   await login(ids[role]);
   if(role==='warehouse'){
    await deny(()=>scalar('SELECT brand_finance_control_report($1)',[cafe]),'warehouse controls denied');
    await deny(()=>scalar('SELECT brand_finance_period_closures($1)',[cafe]),'warehouse period audit denied');
   }else{
    eq(typeof(await scalar('SELECT brand_finance_control_report($1)',[cafe])).generatedAt,'string',role+' financial control report');
    await scalar('SELECT brand_finance_period_closures($1)',[cafe]);
   }
  }
 }
 console.log('Job roles SQL: '+checks+' checks passed');
 }
`;
const anchor = " console.log('Supplier payout SQL: '+checks+' checks passed');";
if (!source.includes(anchor)) throw Error('Supplier fixture anchor missing');
await import('data:text/javascript;base64,' + Buffer.from(source.replace(anchor, () => tests).replace('baseline.replace(anchor,tests)', 'baseline.replace(anchor,()=>tests)')).toString('base64'));
