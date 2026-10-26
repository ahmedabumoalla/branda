import {readFile} from 'node:fs/promises';
const baseline=await readFile('scripts/check-finance-cash-handovers-db.mjs','utf8');
const tests=String.raw`
 {
 await login(owner);
 await db.exec(await readFile('supabase/migrations/20261026213000_brand_finance_shift_supervision.sql','utf8'));
 const beforeMigration=await fingerprint();
 await db.exec(await readFile('supabase/migrations/20261027023500_brand_finance_pos_shift_report.sql','utf8'));
 eq(await fingerprint(),beforeMigration,'migration changes no financial records');
 const subject=await scalar("INSERT INTO bf_shifts(cafe_id,user_id,account_id,status,opening_cash,expected_cash,counted_cash,variance,opened_at,closed_at) VALUES($1,$2,$3,'closed',0,50,49,-1,now()-interval '2 hours',now()) RETURNING id",[cafe,staff,drawer]);
 await db.query("INSERT INTO bf_documents(cafe_id,kind,shift_id,account_id,total,paid,created_by) SELECT $1,'sale',$2,$3,0.1,0.1,$4 FROM generate_series(1,501)",[cafe,subject,drawer,staff]);
 const sale=await scalar('SELECT id FROM bf_documents WHERE shift_id=$1 LIMIT 1',[subject]);
 await db.query("INSERT INTO bf_documents(cafe_id,kind,reference_id,account_id,total,paid,created_by) VALUES($1,'refund',$2,$3,0.03,0.03,$5),($1,'settlement',$2,$4,2,0,$5)",[cafe,sale,drawer,bank,owner]);
 const report=(id=subject,tenant=cafe)=>scalar('SELECT brand_finance_pos_shift_report($1,$2)',[tenant,id]);
 const r=await report();
 eq([r.invoiceCount,r.salesTotal,r.refundsTotal,r.netSales],[501,50.1,0.03,50.07],'complete 501 sales and later refunds');
 eq(r.payments,[{kind:'bank',collected:2,refunded:0},{kind:'cash',collected:50.1,refunded:0.03}],'subsequent collections and refunds');
 eq([r.shift.expected_cash,r.shift.counted_cash,r.shift.variance],[50,49,-1],'closing values frozen');
 await login(staff);eq((await report()).shift.id,subject,'cashier own report');
 await fail(()=>report(oldShift),'cashier cannot read another employee');
 await login(customerUser);eq((await report()).shift.id,subject,'manager permitted');
 await login(owner);await fail(()=>report(subject,other),'cross tenant denied');await fail(()=>report(crypto.randomUUID()),'missing shift denied');
 await db.query("UPDATE bf_shifts SET status='handover' WHERE id=$1",[subject]);await fail(()=>report(),'unclosed handover denied');await db.query("UPDATE bf_shifts SET status='closed' WHERE id=$1",[subject]);
 await login(outsider);await fail(()=>report(),'outsider denied');await login(null);await fail(()=>report(),'anonymous denied');
 await login(staff);await db.query('UPDATE bf_staff SET active=false WHERE cafe_id=$1 AND user_id=$2',[cafe,staff]);await fail(()=>report(),'inactive cashier denied');await db.query('UPDATE bf_staff SET active=true WHERE cafe_id=$1 AND user_id=$2',[cafe,staff]);
 await login(owner);await db.query('UPDATE cafes SET enabled=false WHERE id=$1',[cafe]);await fail(()=>report(),'disabled brand denied');await db.query('UPDATE cafes SET enabled=true WHERE id=$1',[cafe]);
 const before=await fingerprint();await report();eq(await fingerprint(),before,'report read only');
 for(const [role,expected] of [['anon',false],['authenticated',true],['service_role',false]])eq(await scalar("SELECT has_function_privilege($1,'public.brand_finance_pos_shift_report(uuid,uuid)','EXECUTE')",[role]),expected,role+' grant');
 console.log('POS report SQL: '+checks+' checks passed');
 }
`;
const anchor=' console.log(`Cash handover SQL: ${checks} checks passed`);';
if(!baseline.includes(anchor))throw Error('Fixture anchor missing');
await import('data:text/javascript;base64,'+Buffer.from(baseline.replace(anchor,tests)).toString('base64'));
