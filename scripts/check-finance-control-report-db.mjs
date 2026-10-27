import { readFile } from 'node:fs/promises';
let baseline=await readFile('scripts/check-finance-period-close-db.mjs','utf8');
const roleLoad="await db.exec(await readFile('supabase/migrations/20261027040000_brand_finance_job_roles.sql','utf8'));";
if(!baseline.includes(roleLoad))throw Error('Period fixture role anchor missing');
baseline=baseline.replace(roleLoad,"await db.exec(await readFile('supabase/migrations/20261026213943_brand_finance_negative_stock_sales.sql','utf8'));\n "+roleLoad);
const tests=String.raw`
 {
 const before=await fingerprint();
 await db.exec(await readFile('supabase/migrations/20261027040200_brand_finance_control_reports.sql','utf8'));
 eq(await fingerprint(),before,'reports migration does not alter financial records');
 await login(owner);const reportCafe=crypto.randomUUID();
 await db.query("INSERT INTO cafes(id,slug,name,owner_user_id) VALUES($1,'report-controls','Report controls',$2)",[reportCafe,owner]);
 const snapshot=await scalar('SELECT brand_finance_snapshot($1)',[reportCafe]);
 const acct=code=>snapshot.accounts.find(a=>a.code===code).id;
 const report=()=>scalar('SELECT brand_finance_control_report($1)',[reportCafe]);
 const fetch=(from=null,to=null,query='',asOf=null,time=null,id=null,scope=reportCafe)=>scalar('SELECT brand_finance_journal_export($1,$2,$3,$4,$5,$6,$7)',[scope,from,to,query,asOf,time,id]);
 eq([(await report()).debit,(await report()).costLines],[0,0],'empty ledger zero');
 await db.query("WITH docs AS (INSERT INTO bf_documents(cafe_id,kind,note,created_by,created_at) SELECT $1,'journal','Bulk export',$2,'2026-01-15T12:00:00Z' FROM generate_series(1,301) RETURNING id,cafe_id,created_at) INSERT INTO bf_journal(cafe_id,document_id,account_id,debit,credit,memo,created_at) SELECT cafe_id,id,$3::uuid,10,0,'Bulk export',created_at FROM docs UNION ALL SELECT cafe_id,id,$4::uuid,0,10,'Bulk export',created_at FROM docs",[reportCafe,owner,acct('1000'),acct('4000')]);
 const first=await fetch();eq([first.rows.length,first.total,first.debit,first.credit],[500,602,3010,3010],'server aggregate and first page beyond500');
 const second=await fetch(null,null,'',first.asOf,first.next.time,first.next.id);
 eq([second.rows.length,second.total,second.asOf],[102,602,first.asOf],'stable second page');
 eq(new Set([...first.rows,...second.rows].map(r=>r.id)).size,602,'same-timestamp UUID cursor omits no rows');
 const finished=await fetch(null,null,'',first.asOf,second.next.time,second.next.id);eq(finished.rows.length,0,'cursor exhausted');
 const numberQuery=await fetch(null,null,String(first.rows[0].document_number));eq(numberQuery.rows.some(r=>r.document_id===first.rows[0].document_id),true,'document number searchable');
 const makeDoc=async(kind='journal',reference=null,at='2026-01-01T12:00:00Z')=>scalar('INSERT INTO bf_documents(cafe_id,kind,reference_id,created_by,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[reportCafe,kind,reference,owner,at]);
 const post=async(at,amount,debit,credit,memo='Boundary')=>{const id=await makeDoc('journal',null,at);await db.query('INSERT INTO bf_journal(cafe_id,document_id,account_id,debit,credit,memo,created_at) VALUES($1,$2,$3,$5,0,$6,$7),($1,$2,$4,0,$5,$6,$7)',[reportCafe,id,debit,credit,amount,memo,at]);return id;};
 for(const at of ['2026-01-31T20:59:59Z','2026-01-31T21:00:00Z','2026-02-01T20:59:59Z','2026-02-01T21:00:00Z'])await post(at,7,acct('1000'),acct('4000'));
 const datePage=await fetch('2026-02-01','2026-02-01');eq([datePage.total,datePage.debit,datePage.credit],[4,14,14],'Riyadh inclusive local day and exclusive following midnight');
 eq((await fetch('2026-02-01','2026-02-01','Boundary')).total,4,'query plus date filters');
 eq((await fetch(null,null,'no match')).total,0,'empty search');
 await fail(()=>fetch('2026-02-02','2026-02-01'),'inverted date range denied');
 await fail(()=>fetch(null,null,'x'.repeat(121)),'query bound');
 await fail(()=>fetch(null,null,'','2999-01-01T00:00:00Z'),'future snapshot denied');
 await fail(()=>fetch(null,null,'',null,first.next.time,null),'partial cursor denied');
 const frozen=await fetch();await post(new Date(Date.now()+10).toISOString(),3,acct('1000'),acct('4000'),'After snapshot');
 eq((await fetch(null,null,'',frozen.asOf)).total,frozen.total,'new posting beyond snapshot excluded');
 await post('2026-01-01T12:00:00Z',10,acct('5000'),acct('1000'),'Cost');
 await post('2026-01-01T12:00:00Z',3,acct('5100'),acct('1000'),'Expense');
 const inventoryAccount=snapshot.accounts.find(a=>a.kind==='inventory').id;
 await post('2026-01-01T12:00:00Z',20,inventoryAccount,acct('1000'),'Stock');
 const input=snapshot.accounts.find(a=>a.kind==='vat_input').id,output=snapshot.accounts.find(a=>a.kind==='vat_output').id;
 await post('2026-01-01T12:00:00Z',5,input,acct('1000'),'InputVAT');await post('2026-01-01T12:00:00Z',2,acct('1000'),output,'OutputVAT');
 const item=await scalar("INSERT INTO bf_items(cafe_id,name,sku) VALUES($1,'Cost quality','QUALITY') RETURNING id",[reportCafe]);
 await db.query('INSERT INTO bf_stock(cafe_id,warehouse_id,item_id,quantity,average_cost,value,cost_known) VALUES($1,$2,$3,4,5,20,true)',[reportCafe,snapshot.warehouses[0].id,item]);
 // Direct immutable fixture inserts isolate provenance taxonomy from posting-cost calculation
 const addLine=async(document,status,cost)=>db.query("INSERT INTO bf_document_lines(cafe_id,document_id,item_id,name,quantity,unit_price,net,cost,cost_status) VALUES($1,$2,$3,'Quality',1,20,20,$4,$5)",[reportCafe,document,item,cost,status]);
 // Existing BEFORE INSERT cost derivation is tested elsewhere; fixture override is scoped here
 await db.exec('ALTER TABLE bf_document_lines DISABLE TRIGGER bf_line_cost_status');
 const sale=await makeDoc('sale');
 for(const [status,cost] of [['known',0],['known',8],['estimated',5],['unknown',0],['untracked',0],['legacy',6],['legacy',0]])await addLine(sale,status,cost);
 const saleRefund=await makeDoc('refund',sale);await addLine(saleRefund,'known',0);
 const purchase=await makeDoc('purchase');await addLine(purchase,'unknown',0);const purchaseRefund=await makeDoc('refund',purchase);await addLine(purchaseRefund,'unknown',0);
 await db.exec('ALTER TABLE bf_document_lines ENABLE TRIGGER bf_line_cost_status');
 const quality=await report();eq([quality.costLines,quality.unknownCostLines,quality.estimatedCostLines,quality.legacyCostLines],[8,3,1,2],'known zero is known; unknown/untracked/legacy zero uncertain; purchase returns excluded');
 eq([quality.inventoryLedger,quality.inventoryStock,quality.cost,quality.otherExpenses,quality.vatInput,quality.vatOutput],[20,20,10,3,5,2],'ledger accounting classifications');
 eq(quality.bookProfit,quality.revenue-13,'book profit reflects COGS and other expense');eq(quality.debit,quality.credit,'all financial control totals balanced');
 eq(Number(await scalar('SELECT coalesce(sum(debit),0) FROM bf_journal WHERE cafe_id=$1',[reportCafe])),quality.debit,'full ledger total authoritative');
 for(const job of ['manager','accountant','auditor','warehouse','cashier']){
  await login(owner);await run('staff',{email:'staff@example.test',name:'Report role',role:job,active:true},crypto.randomUUID(),reportCafe);await login(staff);
  if(['manager','accountant','auditor'].includes(job)){eq((await report()).debit,quality.debit,job+' report allowed');eq((await fetch()).total>602,true,job+' full export allowed');}
  else{await fail(()=>report(),job+' report denied');await fail(()=>fetch(),job+' export denied');}
 }
 await login(outsider);await fail(()=>report(),'cross-tenant control report denied');await fail(()=>fetch(),'cross-tenant export denied');
 await login(null);await fail(()=>report(),'anonymous control report denied');await fail(()=>fetch(),'anonymous export denied');
 await login(owner);await db.exec('SET ROLE authenticated');eq((await report()).bookProfit,quality.bookProfit,'authenticated role read');await db.exec('RESET ROLE');
 for(const role of ['anon','service_role'])for(const fn of ['public.brand_finance_control_report(uuid)','public.brand_finance_journal_export(uuid,date,date,text,timestamptz,timestamptz,uuid)'])eq(await scalar('SELECT has_function_privilege($1,$2,\'EXECUTE\')',[role,fn]),false,'restricted RPC grant '+role);
 const prior=await fingerprint();await report();await fetch();eq(await fingerprint(),prior,'report and export read only');
 console.log('Financial controls SQL: '+checks+' checks passed including period/supplier/custody baseline');
 }
`;
const anchor="console.log('Period closing SQL: '+checks+' checks passed including supplier/custody baseline');";
if(!baseline.includes(anchor))throw Error('Period fixture test anchor missing');
await import('data:text/javascript;base64,'+Buffer.from(baseline.replace(anchor,()=>tests)).toString('base64'));
