import {readFile} from 'node:fs/promises';
const baseline=await readFile('scripts/check-finance-pos-customer-db.mjs','utf8');
const tests=String.raw`
 {
 const financialBefore=await scalar("SELECT md5(jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM bf_documents d),'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM bf_journal j),'customers',(SELECT jsonb_agg(to_jsonb(s) ORDER BY document_id) FROM bf_sale_customers s))::text)");
 const originalClaim=await scalar("SELECT pg_get_functiondef('public.brand_finance_claim_customer_messages(uuid,integer)'::regprocedure)");
 await db.exec(await readFile('supabase/migrations/20261027110759_finance_invoice_message_status.sql','utf8'));
 const status=ids=>scalar('SELECT brand_finance_invoice_message_statuses($1,$2)',[cafe,ids]);
 await login(staff);
 eq((await status([clean.id]))[0].reason,'no_phone','actual unrequested receipt');
 eq((await status([disabled.id]))[0].reason,'loyalty_unavailable','actual disabled loyalty not queued');
 const ownIds=await scalar("SELECT array_agg(id) FROM bf_documents WHERE cafe_id=$1 AND kind='sale' AND created_by=$2",[cafe,staff]);
 const observed=await status(ownIds);eq(observed.length,ownIds.length,'actual cashier sees own invoice statuses');
 await login(owner);eq((await status(ownIds)).length,ownIds.length,'actual owner status access');
 await login(outsider);await rejects(()=>status(ownIds),'actual cross-brand principal denied');
 await login(staff);await sql('UPDATE bf_staff SET active=false WHERE cafe_id=$1 AND user_id=$2',[cafe,staff]);await rejects(()=>status(ownIds),'revoked staff denied');await sql('UPDATE bf_staff SET active=true WHERE cafe_id=$1 AND user_id=$2',[cafe,staff]);
 await db.exec('SET ROLE anon');await rejects(()=>status(ownIds),'anonymous RPC execute denied');await db.exec('RESET ROLE');
 eq(await scalar("SELECT pg_get_functiondef('public.brand_finance_claim_customer_messages(uuid,integer)'::regprocedure)"),originalClaim,'dispatch function untouched');
 eq(await scalar("SELECT md5(jsonb_build_object('documents',(SELECT jsonb_agg(to_jsonb(d) ORDER BY id) FROM bf_documents d),'journal',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM bf_journal j),'customers',(SELECT jsonb_agg(to_jsonb(s) ORDER BY document_id) FROM bf_sale_customers s))::text)"),financialBefore,'status migration/read never changes financial/customer records');
 console.log(JSON.stringify({ok:true,checks,engine:'PGlite',scope:'actual POS/loyalty schema plus authorized invoice message status'}));
 }
`;
const anchor=" console.log(JSON.stringify({ok:true,checks,engine:'PGlite',scope:'atomic POS sale customer, loyalty, enrollment, shared pager and dispatch'}));";
if(!baseline.includes(anchor))throw Error('Customer baseline anchor missing');
await import('data:text/javascript;base64,'+Buffer.from(baseline.replace(anchor,()=>tests)).toString('base64'));
