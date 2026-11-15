'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const source='supabase/migrations/20261113171648_erp_manufacturing_forms.sql';
const sql=fs.readFileSync(source,'utf8');
const cases=fs.readFileSync('scripts/manufacturing-forms-live-cases.sql','utf8');
if(!/^BEGIN;/m.test(sql)||!/^COMMIT;\s*$/m.test(sql)||!/^ROLLBACK;\s*$/m.test(cases))throw Error('Transaction boundaries missing');
fs.mkdirSync('output/erp-database',{recursive:true});
fs.writeFileSync('output/erp-database/manufacturing-forms-live-probe.sql',sql.replace(/COMMIT;\s*$/,'')+'\n'+cases);
console.log(JSON.stringify({source,md5:crypto.createHash('md5').update(sql).digest('hex')}));
