'use strict';
const fs=require('node:fs'),crypto=require('node:crypto');
const file='supabase/migrations/20261113173435_erp_customer_forms.sql';
const source=fs.readFileSync(file,'utf8'),cases=fs.readFileSync('scripts/customer-forms-live-cases.sql','utf8');
if(!/^BEGIN;/m.test(source)||!/COMMIT;\s*$/.test(source)||!/ROLLBACK;\s*$/.test(cases))throw Error('Transaction boundaries missing');
fs.writeFileSync('output/erp-database/customer-forms-live-probe.sql',source.replace(/COMMIT;\s*$/,'')+'\n'+cases);
console.log(JSON.stringify({file,md5:crypto.createHash('md5').update(source).digest('hex')}));
