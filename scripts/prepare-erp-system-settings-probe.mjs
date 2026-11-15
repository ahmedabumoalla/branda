import fs from 'node:fs';
const migrations=['20261113133256_erp_system_settings','20261113134936_erp_system_numbering','20261113135908_erp_system_payment_receipts','20261113140212_erp_system_oauth','20261113142014_erp_system_product_defaults','20261113143019_erp_system_backup'];
let sql="BEGIN;\nSET LOCAL statement_timeout='90s';\n";
for(const name of migrations)sql+=fs.readFileSync('supabase/migrations/'+name+'.sql','utf8').replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'')+'\n';
for(const name of ['core','oauth','payment','products'])sql+=fs.readFileSync(`output/erp-database/settings-${name}-probe-body.sql`,'utf8').replace(/SELECT jsonb_agg[\s\S]*$/,'')+'\n';
sql+="SELECT jsonb_agg(jsonb_build_object('check',name,'passed',passed) ORDER BY name) checks,count(*) count FROM settings_probe_evidence;\nROLLBACK;";
fs.writeFileSync('output/erp-database/settings-all-live-probe.sql',sql);
console.log('Prepared six migrations and rollback assertions; no database call made');
