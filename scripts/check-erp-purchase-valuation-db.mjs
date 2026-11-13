import{readFile,writeFile,mkdir}from'node:fs/promises';import{spawnSync}from'node:child_process';
const source=await readFile('scripts/check-erp-purchases-db.mjs','utf8'),migration='supabase/migrations/20261113131100_erp_purchase_valuation_audit.sql';
const tests=String.raw`
await db.exec('reset role');
eq(Number(await scalar('select count(*)from erp_purchase_value_changes'))>0,true,'valuation operations audited');
eq(Number(await scalar("select count(*)from erp_purchase_value_changes where distribution?'warehouses'"))>0,true,'warehouse distributions persisted');
eq(Number(await scalar("select count(*)from erp_purchase_value_changes v where distribution?'warehouses' and (distribution->>'inventory')::numeric<>(select coalesce(sum((x->>'amount')::numeric),0)from jsonb_array_elements(v.distribution->'warehouses')x)")),0,'warehouse totals exact');
eq(Number(await scalar("select count(*)from erp_purchase_value_changes where distribution->>'pending'='true'"))>0,true,'pending capitalization distinguishable');
eq(Number(await scalar("select count(*)from erp_purchase_value_changes where amount<0"))>0,true,'debit value reduction audited');
await fail(()=>db.exec('update erp_purchase_value_changes set amount=amount'),'audit immutable');
await fail(()=>db.exec('delete from erp_purchase_value_changes'),'audit retained');
await db.exec('set role authenticated');await fail(()=>db.exec('select * from erp_purchase_value_changes'),'audit private');
`;
if(!source.includes('await db.exec(sql);'))throw Error('Fixture changed');
let runner=source.replace('await db.exec(sql);',`await db.exec(sql);const auditSql=await readFile('${migration}','utf8');await db.exec(auditSql);`).replace('const result={passed:true,checks,',tests+`\nconst result={passed:true,checks,valuationMigration:'${migration}',valuationSha256:crypto.createHash('sha256').update(auditSql).digest('hex'),`).replaceAll('output/integrated-system/erp-purchases-db-verification.json','output/integrated-system/erp-purchase-valuation-db-verification.json');
await mkdir('output/purchase-valuation-verification',{recursive:true});await writeFile('output/purchase-valuation-verification/runner.mjs',runner);const r=spawnSync(process.execPath,['output/purchase-valuation-verification/runner.mjs'],{encoding:'utf8',maxBuffer:20e6});console.log(r.stdout);if(r.status){console.error(r.stderr?.slice(-3000));process.exitCode=1;}
